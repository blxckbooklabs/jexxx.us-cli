import { randomUUID } from "node:crypto";

import { AgentAbortedError, runAgent } from "../agent-loop.js";
import type { Provider } from "../providers/types.js";
import type { BlxckchatTool } from "../tools/types.js";
import type { StoredProviderConfig } from "../config.js";
import { saveLastUsedProvider, upsertProvider } from "../config.js";
import { loadCredentials } from "../../auth.js";
import {
  formatCredentialsDisplayName,
  formatCredentialsShortLabel,
} from "../../operator-identity.js";
import { resolveProvider } from "../providers/registry.js";
import { cycleModelOption, listModelOptions } from "../providers/models.js";

import {
  formatHeroHint,
  formatHeroSubtitle,
  renderJexxxusHeroPlain,
  type JexxxusHeroMeta,
} from "./components/jexxxus-hero.js";
import { THEME } from "./theme.js";
import {
  createSession,
  addUserMessage,
  addAssistantMessage,
  addToolResult,
  updateToolResult,
  type TerminalSession,
  type ToolStatus,
} from "./session/session-store.js";
import {
  autosaveSession,
  loadAutosaveSession,
  shouldAutosave,
} from "./session/autosave.js";
import { branchUndo } from "./session/branch.js";
import { StreamBuffer } from "./renderer/streaming.js";
import {
  StreamThinkingParser,
  formatLiveStreamDisplay,
  formatThinkingWaitState,
} from "./renderer/stream-thinking.js";
import { extractThinkingBlocks } from "./components/thinking-block.js";
import {
  buildChromeDigestPlain,
  buildTuISnapshotWithChrome,
  type ChromeDigestInput,
} from "./renderer/plain-text.js";
import {
  copyToClipboard,
  getChromeDigestPath,
  getSnapshotPath,
  writeChromeDigest,
  writeSnapshot,
} from "./session/tui-snapshot.js";
import { coerceSlashLine } from "./slash/coerce.js";
import {
  dispatchSlashCommand,
  isSlashCommand,
  parseSlashInput,
} from "./slash/handler.js";
import { writeTerminalResetSequences } from "./tty.js";
import { getDivinityPersonaById } from "../divinities/source.js";
import { MessageQueue } from "./message-queue.js";
import { logCrash } from "../crash-log.js";
import { openExternalEditor } from "./external-editor.js";
import type { DyeActionCallbacks } from "./dye/dye-types.js";
import type { PickerItemDef } from "./dye/dye-types.js";
import { createDyeTui } from "./dye/dye-adapter.js";

export interface TerminalChatOptions {
  providerLabel?: string;
  toolCount?: number;
  storedConfig: StoredProviderConfig;
  resume?: boolean;
}

export async function startTerminalChat(
  provider: Provider,
  tools: BlxckchatTool[],
  options: TerminalChatOptions,
): Promise<void> {
  const creds = loadCredentials({ quiet: true });
  const authLabel = creds
    ? formatCredentialsShortLabel(creds)
    : "not authenticated";
  const toolCount = options.toolCount ?? tools.length;

  const session: TerminalSession = options.resume
    ? (loadAutosaveSession() ?? createSession())
    : createSession();

  let activeConfig: StoredProviderConfig = { ...options.storedConfig };
  let activeProvider: Provider = provider;

  let isProcessing = false;
  let abortController: AbortController | null = null;

  let cachedModelOptions = await listModelOptions(activeConfig);

  const exportSession = async (): Promise<string | null> => {
    try {
      const { join } = await import("node:path");
      const { homedir } = await import("node:os");
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const dir = join(homedir(), ".jexxxus");
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, `session-export-${Date.now()}.json`);
      const data = JSON.stringify(
        {
          messages: session.messages,
          conversationHistory: session.conversationHistory,
          toolResults: session.toolResults,
          thinkingBlocks: session.thinkingBlocks,
          activeDivinity: session.activeDivinity,
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      );
      writeFileSync(filePath, data, "utf-8");
      tui.statusBar.setMessage(`Session exported → ${filePath}`);
      return filePath;
    } catch {
      tui.statusBar.setMessage("Export failed");
      return null;
    }
  };

  const newSession = (): void => {
    session.messages = [];
    session.conversationHistory = [];
    session.toolResults = [];
    session.thinkingBlocks = [];
    session.activeDivinity = null;
    tui.messageBox.clearChat();
    showIdleHero();
    tui.statusBar.setMessage("New session — type a message to begin");
  };

  const messageQueue = new MessageQueue();

  let heroMeta: JexxxusHeroMeta = {
    authLabel,
    toolCount,
    providerLabel:
      options.providerLabel ?? `${activeConfig.provider}/${activeConfig.model}`,
  };

  const showIdleHero = (): void => {
    const width = process.stdout.columns ?? 80;
    tui.messageBox.showHero(
      renderJexxxusHeroPlain(Math.max(40, width - 4), heroMeta),
      heroMeta,
    );
  };

  const refreshAuthChrome = (): void => {
    const liveCreds = loadCredentials({ quiet: true });
    const liveAuth = liveCreds
      ? formatCredentialsShortLabel(liveCreds)
      : "not authenticated";
    heroMeta = { ...heroMeta, authLabel: liveAuth };
    if (tui.messageBox.hasHero()) {
      tui.messageBox.dismissHero();
      showIdleHero();
    }
    syncSnapshot();
  };

  const authActions = createAuthTuiActionsNoScreen({
    onAuthChanged: refreshAuthChrome,
  });

  const runSlash = async (command: string): Promise<void> => {
    const parsed = parseSlashInput(command);
    const result = await dispatchSlashCommand(command, {
      session,
      activeConfig,
      toolCount,
      setActiveConfig,
      copySnapshot,
      copyChromeDigest,
      authActions,
      openModelPicker: () => void openModelPicker(),
      openProviderPicker: () => void openProviderPicker(),
      openDivinityPicker: () => void openDivinityPicker(),
      openAuthPicker: () => void openAuthPicker(),
      setupProvider: (catalogId) => openProviderPicker(catalogId),
      onDivinityActivated: onDivinityChatCleared,
    });
    if (parsed.command === "reset") {
      tui.messageBox.clearChat();
      showIdleHero();
      tui.statusBar.setMessage("Session reset — type a message to begin");
      return;
    }
    for (const msg of result.messages) {
      tui.messageBox.appendSystem(msg);
    }
    if (result.exit) {
      requestExit();
      return;
    }
  };

  const cycleModel = async (direction: 1 | -1): Promise<void> => {
    const next = cycleModelOption(cachedModelOptions, activeConfig, direction);
    if (!next) {
      tui.statusBar.setMessage("No models available to cycle");
      return;
    }
    const updated: StoredProviderConfig = {
      ...activeConfig,
      model: next.id,
      provider: next.provider,
    };
    upsertProvider(updated);
    setActiveConfig(updated, resolveProvider(updated));
    tui.messageBox.appendSystem(`Model → ${updated.provider}/${updated.model}`);
    tui.statusBar.setMessage(`${updated.provider}/${updated.model}`);
  };

  const copyLastReply = async (): Promise<void> => {
    const text = tui.messageBox.getLastAssistantPlainText();
    if (!text?.trim()) {
      tui.statusBar.setMessage("No assistant reply to copy");
      return;
    }
    const copied = await copyToClipboard(text);
    tui.statusBar.setMessage(
      copied ? "Last reply copied" : "Copy failed — see TUI snapshot",
    );
  };

  const collectChromeDigestInput = (): ChromeDigestInput => {
    const liveCreds = loadCredentials({ quiet: true });
    const liveAuth = liveCreds
      ? formatCredentialsDisplayName(liveCreds)
      : "not authenticated";
    const providerLabel = tui.topBar.getSubtitle();
    const meta: JexxxusHeroMeta = {
      authLabel: liveCreds
        ? formatCredentialsShortLabel(liveCreds)
        : "not authenticated",
      toolCount,
      providerLabel,
    };
    return {
      topBarModel: providerLabel,
      authEmail: liveAuth,
      toolCount,
      heroSubtitle: formatHeroSubtitle(meta),
      heroHint: formatHeroHint(),
      statusBar: tui.statusBar.getMessage(),
      inputValue: tui.inputBox.getValue(),
      divinity: session.activeDivinity?.name ?? null,
    };
  };

  const buildSnapshotParts = () => ({
    width: process.stdout.columns ?? 80,
    topBar: tui.store.subtitle,
    messages: tui.store.blocks.map((b) => b.content).join("\n"),
    statusBar: tui.store.statusMessage,
    input: tui.store.inputValue,
  });

  const syncSnapshot = (): void => {
    const chrome = buildChromeDigestPlain(collectChromeDigestInput());
    writeChromeDigest(chrome);
    writeSnapshot(buildTuISnapshotWithChrome(chrome, buildSnapshotParts()));
  };

  const copyChromeDigest = async (): Promise<{
    path: string;
    copied: boolean;
  }> => {
    const chrome = buildChromeDigestPlain(collectChromeDigestInput());
    const path = writeChromeDigest(chrome);
    const copied = await copyToClipboard(chrome);
    return { path, copied };
  };

  const copySnapshot = async (): Promise<{ path: string; copied: boolean }> => {
    const chrome = buildChromeDigestPlain(collectChromeDigestInput());
    const snapshot = buildTuISnapshotWithChrome(chrome, buildSnapshotParts());
    const path = writeSnapshot(snapshot);
    const copied = await copyToClipboard(snapshot);
    return { path, copied };
  };

  const setActiveConfig = (
    config: StoredProviderConfig,
    nextProvider: Provider,
  ): void => {
    activeConfig = config;
    activeProvider = nextProvider;
    tui.topBar.setSubtitle(`${config.provider}/${config.model}`);
    saveLastUsedProvider(config);
    void listModelOptions(activeConfig).then((opts) => {
      cachedModelOptions = opts;
    });
  };

  const openModelPicker = async (): Promise<void> => {
    const options = await listModelOptions(activeConfig);
    const items: PickerItemDef[] = options.map((opt) => {
      const activeMarker =
        opt.id === activeConfig.model && opt.provider === activeConfig.provider
          ? "▸ "
          : "";
      return {
        id: `${opt.provider}/${opt.id}`,
        label: `${activeMarker}${opt.label}`,
        description: opt.source,
      };
    });
    const activeIdx = options.findIndex(
      (o) =>
        o.id === activeConfig.model && o.provider === activeConfig.provider,
    );
    if (!tui.overlay) return;
    const picked = await tui.overlay.showPicker(items, {
      title: "░ models ░",
      selectedIndex: activeIdx >= 0 ? activeIdx : 0,
    });
    if (!picked) return;
    const slash = picked.id.indexOf("/");
    if (slash === -1) return;
    const providerName = picked.id.slice(0, slash);
    const modelName = picked.id.slice(slash + 1);
    const updated: StoredProviderConfig = {
      ...activeConfig,
      provider: providerName,
      model: modelName,
    };
    upsertProvider(updated);
    setActiveConfig(updated, resolveProvider(updated));
    tui.messageBox.appendSystem(`Model → ${providerName}/${modelName}`);
    tui.statusBar.setMessage(`${providerName}/${modelName}`);
  };

  const openProviderPicker = async (catalogId?: string): Promise<void> => {
    const { listProvidersRedacted, getProviderByName } =
      await import("../config.js");
    const { getCatalogEntry, listCatalogEntries } =
      await import("../providers/catalog.js");

    if (catalogId) {
      const entry = getCatalogEntry(catalogId);
      if (!entry) {
        tui.messageBox.appendError(`Unknown provider: ${catalogId}`);
        return;
      }
      await runProviderSetupFlow(entry);
      return;
    }

    const items: PickerItemDef[] = [];
    const activeName = activeConfig.name;

    for (const p of listProvidersRedacted()) {
      const markers = [
        p.name === activeName ? "▸ active" : "",
        p.isDefault ? "default" : "",
        p.hasKey ? "" : "no key",
      ]
        .filter(Boolean)
        .join(" · ");
      items.push({
        id: `saved:${p.name}`,
        label: p.name,
        description: `${p.label} · ${p.provider}/${p.model}${markers ? ` · ${markers}` : ""}`,
      });
    }

    for (const entry of listCatalogEntries()) {
      items.push({
        id: `catalog:${entry.id}`,
        label: `+ ${entry.label}`,
        description: entry.hint ?? `Add API key · ${entry.id}`,
      });
    }

    if (!tui.overlay) return;
    const picked = await tui.overlay.showPicker(items, {
      title: "░ providers ░",
    });
    if (!picked) {
      tui.messageBox.appendSystem("Provider picker closed");
      return;
    }

    if (picked.id.startsWith("catalog:")) {
      const cid = picked.id.slice(8);
      const entry = getCatalogEntry(cid);
      if (!entry) {
        tui.messageBox.appendError(`Unknown provider: ${cid}`);
        return;
      }
      await runProviderSetupFlow(entry);
      return;
    }

    if (picked.id.startsWith("saved:")) {
      const name = picked.id.slice(6);
      const resolved = getProviderByName(name);
      if (!resolved) {
        tui.messageBox.appendError(`Unknown profile "${name}"`);
        return;
      }
      setActiveConfig(resolved, resolveProvider(resolved));
      tui.messageBox.appendSystem(
        `Switched to "${resolved.name}" (${resolved.provider}/${resolved.model})`,
      );
    }
  };

  const runProviderSetupFlow = async (
    entry: import("../providers/catalog.js").ProviderCatalogEntry,
  ): Promise<void> => {
    if (!tui.overlay) return;
    const { defaultModelFor, resolveBaseUrl, resolveEnvApiKey } =
      await import("../providers/catalog.js");
    const {
      listProvidersRedacted,
      getProviderByName,
      upsertProvider: upsertP,
      buildProviderConfig,
    } = await import("../config.js");
    const { listModelsForProvider } = await import("../providers/models.js");
    const { resolveProvider: resolveP } =
      await import("../providers/registry.js");

    let apiKey: string | undefined;
    let baseUrl: string | undefined;

    try {
      if (entry.requiresApiKey) {
        const envKey = resolveEnvApiKey(entry);
        const keyHint = envKey
          ? `Env ${entry.envKeys?.[0] ?? "key"} detected — leave blank to use it`
          : entry.hint;
        const keyResult = await tui.overlay.showPrompt({
          title: `░ ${entry.label} API key ░`,
          label: "API key",
          secret: true,
          ...(keyHint !== undefined ? { hint: keyHint } : {}),
        });
        if (keyResult === null) {
          tui.messageBox.appendSystem("Provider setup cancelled");
          return;
        }
        if (keyResult) apiKey = keyResult;
        else if (envKey) apiKey = envKey;
        else {
          tui.messageBox.appendError(`API key required for ${entry.label}`);
          return;
        }
      }

      if (entry.requiresBaseUrl) {
        const urlResult = await tui.overlay.showPrompt({
          title: `░ ${entry.label} base URL ░`,
          label: "Base URL",
          defaultValue: entry.baseUrl ?? "",
          ...(entry.hint !== undefined ? { hint: entry.hint } : {}),
        });
        if (urlResult === null) {
          tui.messageBox.appendSystem("Provider setup cancelled");
          return;
        }
        baseUrl = urlResult || entry.baseUrl;
        if (!baseUrl?.trim()) {
          tui.messageBox.appendError("Base URL is required");
          return;
        }
      } else if (entry.baseUrl) {
        baseUrl = entry.baseUrl;
      }

      let model = defaultModelFor(entry);
      const resolvedBaseUrl = resolveBaseUrl(entry, baseUrl);

      const modelIds = await listModelsForProvider(entry.id, {
        ...(apiKey ? { apiKey } : {}),
        ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}),
      });

      const modelItems: PickerItemDef[] = [
        ...modelIds.map((id: string) => ({
          id,
          label: id,
          description: isFreeTierZenModel(entry.id, id)
            ? "free tier"
            : entry.suggestedModels.includes(id)
              ? "suggested"
              : "gateway",
        })),
        {
          id: "__custom__",
          label: "Custom model id…",
          description: "type your own",
        },
      ];

      const modelPicked = await tui.overlay.showPicker(modelItems, {
        title: `░ ${entry.label} model ░`,
      });
      if (!modelPicked) {
        tui.messageBox.appendSystem("Provider setup cancelled");
        return;
      }
      if (modelPicked.id === "__custom__") {
        const custom = await tui.overlay.showPrompt({
          title: "░ custom model ░",
          label: "Model id",
          defaultValue: defaultModelFor(entry),
        });
        if (custom === null) {
          tui.messageBox.appendSystem("Provider setup cancelled");
          return;
        }
        if (custom) model = custom;
      } else {
        model = modelPicked.id;
      }

      const existing = listProvidersRedacted().find(
        (p: { provider: string }) => p.provider === entry.id,
      );
      const nameResult = await tui.overlay.showPrompt({
        title: "░ profile name ░",
        label: "Name",
        defaultValue: existing?.name ?? entry.id,
        hint: "Saved as /provider <name>",
      });
      if (nameResult === null) {
        tui.messageBox.appendSystem("Provider setup cancelled");
        return;
      }

      const defaultResult = await tui.overlay.showPrompt({
        title: "░ set default? ░",
        label: "Default (y/n)",
        hint: "y = always start TUI with this profile · n = remember for this session only",
        defaultValue: "n",
      });
      if (defaultResult === null) {
        tui.messageBox.appendSystem("Provider setup cancelled");
        return;
      }

      const built = buildProviderConfig({
        catalogId: entry.id,
        model,
        name: nameResult || entry.id,
        isDefault: Boolean(defaultResult?.toLowerCase().startsWith("y")),
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      });
      upsertP(built);
      setActiveConfig(built, resolveP(built));
      tui.messageBox.appendSystem(
        `Provider ready: "${built.name}" (${built.provider}/${built.model})`,
      );
    } catch (err) {
      tui.messageBox.appendError(
        err instanceof Error ? err.message : "Provider setup failed",
      );
    }
  };

  const openDivinityPicker = async (): Promise<void> => {
    const { listDivinityPersonas, getDivinitiesSearchPaths } =
      await import("../divinities/source.js");
    const { activateDivinityPersona, formatDivinityActivationMessage } =
      await import("../divinities/session.js");

    const personas = listDivinityPersonas();
    if (personas.length === 0) {
      const checked = getDivinitiesSearchPaths()
        .map((base: string) => base + "/Personas")
        .join("\n  ");
      tui.messageBox.appendSystem(
        [
          "No Divinities found (missing Personas/ under any search path).",
          "Set JEXXXUS_OBSIDIAN_PERSONAS_PATH to jexxx.us-obsidian/Divinities, or clone the monorepo with jexxx.us-obsidian alongside jexxx.us-cli.",
          checked ? `Checked:\n  ${checked}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return;
    }

    if (!tui.overlay) return;
    const activeId = session.activeDivinity?.id ?? null;
    const clearRow: PickerItemDef = {
      id: "__clear__",
      label: "  Return to BLXCKCHAT (clear persona)",
      description: "Default agent · no divinity overlay",
    };
    const items: PickerItemDef[] = [
      clearRow,
      ...personas.map(
        (p: { id: string; name: string; role?: string; pillar?: string }) => {
          const marker = p.id === activeId ? "▸ " : "  ";
          const desc = [p.role, p.pillar].filter(Boolean).join(" · ");
          return {
            id: p.id,
            label: `${marker}${p.name}`,
            description: desc || "",
          };
        },
      ),
    ];
    const activeIdx = items.findIndex(
      (i) => i.id === (activeId ?? "__clear__"),
    );

    const picked = await tui.overlay.showPicker(items, {
      title: "░ divinities ░",
      selectedIndex: activeIdx >= 0 ? activeIdx : 0,
    });
    if (!picked) return;

    if (picked.id === "__clear__") {
      session.activeDivinity = null;
      session.conversationHistory = [];
      session.messages = [];
      session.toolResults = [];
      session.thinkingBlocks = [];
      onDivinityChatCleared();
      tui.messageBox.appendSystem(
        "Divinity cleared — BLXCKCHAT default agent restored.",
      );
      return;
    }

    const persona = personas.find((p: { id: string }) => p.id === picked.id);
    if (!persona) return;
    activateDivinityPersona(session, persona);
    onDivinityChatCleared();
    tui.messageBox.appendSystem(formatDivinityActivationMessage(persona));
  };

  const openAuthPicker = async (): Promise<void> => {
    const {
      loadCredentials: loadCreds,
      getTokenExpiryMinutes,
      deleteCredentials,
    } = await import("../../auth.js");

    const creds = loadCreds({ quiet: true });
    const items: PickerItemDef[] = [];
    let statusHeader = "";

    if (!creds) {
      statusHeader =
        "JEXXXUS account: not signed in\nProvider profile is separate from account auth";
      items.push({
        id: "login",
        label: "Sign in",
        description: "Device authorization — same as jexxxus auth login",
      });
      items.push({
        id: "continue",
        label: "Continue without account",
        description: "Keep chatting with your provider profile only",
      });
    } else {
      const expiry = getTokenExpiryMinutes(creds);
      const expiryStr =
        expiry < 0 ? "EXPIRED" : `${Math.floor(expiry)}m remaining`;
      statusHeader = `Signed in as: ${creds.email}\nToken: ${expiryStr} · User ${creds.userId.slice(0, 8)}…`;
      items.push({
        id: "continue",
        label: "Continue",
        description: "Return to chat with current session",
      });
      items.push({
        id: "logout",
        label: "Sign out",
        description: "Revoke CLI access and delete stored credentials",
      });
    }

    if (!tui.overlay) return;
    const picked = await tui.overlay.showPicker(items, {
      title: "░ JEXXXUS account ░",
      hideFilter: true,
      statusHeader,
    });
    if (!picked) return;

    if (picked.id === "continue") return;
    if (picked.id === "login") {
      try {
        const deviceLogin = tui.overlay.startDeviceLogin;
        const newCreds = await deviceLogin();
        const { saveCredentials } = await import("../../auth.js");
        saveCredentials(newCreds);
        refreshAuthChrome();
        tui.messageBox.appendSystem(`Signed in as ${newCreds.email}`);
      } catch (err) {
        if (err instanceof Error && err.message === "cancelled") {
          tui.messageBox.appendSystem("Login cancelled.");
        } else {
          tui.messageBox.appendError(
            `Login failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return;
    }
    if (picked.id === "logout") {
      deleteCredentials();
      refreshAuthChrome();
      tui.messageBox.appendSystem(
        "Signed out. Run /auth login to connect secure.jexxx.us again.",
      );
    }
  };

  const onDivinityChatCleared = (): void => {
    tui.messageBox.clearChat();
    showIdleHero();
  };

  const showCopiedToast = (): void => {
    tui.store.showToast("Copied to clipboard");
  };

  const showCopyFailedToast = (): void => {
    tui.store.showToast("Copy failed — see ~/.jexxxus snapshot", "error");
  };

  const abortInFlight = (): void => {
    abortController?.abort();
  };

  const handleEscapeLayer = (): void => {
    if (isProcessing) {
      abortInFlight();
      return;
    }
  };

  const persistSessionState = (): void => {
    saveLastUsedProvider(activeConfig);
    if (session.messages.length > 0) {
      autosaveSession(session);
    }
  };

  const requestExit = (): void => {
    persistSessionState();
    writeTerminalResetSequences();
    process.exit(0);
  };

  const updateScrollStatus = (): void => {
    const { pinnedToBottom, percent } = tui.messageBox.getScrollState();
    if (pinnedToBottom) {
      tui.statusBar.setMessage(
        "Shift+↑↓ scroll · Ctrl+B history · / commands · Ctrl+Shift+Y chrome · ? hotkeys",
      );
    } else {
      tui.statusBar.setMessage(
        `History ${percent}% · End jump latest · Ctrl+B scroll · ? hotkeys`,
      );
    }
  };

  const runTurn = async (trimmed: string): Promise<void> => {
    isProcessing = true;
    abortController = new AbortController();
    tui.statusBar.setMessage("Thinking...");
    addUserMessage(session, trimmed);
    tui.messageBox.appendUser(trimmed);

    const assistantBlockIndex = tui.messageBox.appendAssistantStart();
    tui.messageBox.updateAssistantStream(
      assistantBlockIndex,
      formatThinkingWaitState(),
      "",
      "",
    );
    const streamBuffer = new StreamBuffer();
    const thinkingParser = new StreamThinkingParser();

    const pushStreamToUi = (): void => {
      const state = thinkingParser.getState();
      tui.messageBox.updateAssistantStream(
        assistantBlockIndex,
        formatLiveStreamDisplay(state),
        state.visible,
        state.thinking,
      );
    };

    const showToolPending = (toolName: string): void => {
      addToolResult(session, toolName, "Running...", "pending");
      tui.statusBar.setMessage(`⏳ Running tool: ${toolName}...`);
    };

    const showToolComplete = (
      toolName: string,
      result: string,
      status: ToolStatus,
    ): void => {
      const entry = updateToolResult(session, toolName, result, status);
      if (entry) {
        tui.messageBox.appendTools([entry]);
      }
      tui.statusBar.setMessage("Ready — ? for hotkeys · / for commands");
    };

    const activeDivinity = session.activeDivinity;
    const personaRecord = activeDivinity
      ? getDivinityPersonaById(activeDivinity.id)
      : null;
    const persona =
      personaRecord && activeDivinity
        ? {
            name: activeDivinity.name,
            systemPrompt: personaRecord.systemPrompt,
          }
        : undefined;

    try {
      const { response, history } = await runAgent(
        activeProvider,
        tools,
        trimmed,
        session.conversationHistory,
        {
          ...(persona ? { persona } : {}),
          signal: abortController.signal,
          onStreamReset: () => {
            streamBuffer.reset();
            thinkingParser.reset();
            tui.messageBox.updateAssistantStream(
              assistantBlockIndex,
              formatThinkingWaitState(),
              "",
              "",
            );
          },
          onThinkingStream: (chunk) => {
            thinkingParser.appendThinking(chunk);
            pushStreamToUi();
          },
          onStream: (chunk) => {
            streamBuffer.append(chunk);
            thinkingParser.append(chunk);
            pushStreamToUi();
          },
          onToolStart: showToolPending,
          onToolComplete: showToolComplete,
          onSynthesisRetry: () => {
            streamBuffer.reset();
            thinkingParser.reset();
            tui.messageBox.updateAssistantStream(
              assistantBlockIndex,
              formatThinkingWaitState(),
              "",
              "",
            );
          },
          confirmToolCall: (toolName, args) =>
            tui.callbacks.onConfirmTool(toolName, args),
        },
      );

      session.conversationHistory = history;

      thinkingParser.flush();
      const parsed = extractThinkingBlocks(
        response || streamBuffer.getContent(),
      );
      const apiThinking = thinkingParser.getState().thinking.trim();
      const mergedBlocks = [...parsed.blocks];
      if (apiThinking && !mergedBlocks.some((b) => b.content === apiThinking)) {
        mergedBlocks.unshift({
          id: randomUUID(),
          content: apiThinking,
          collapsed: true,
        });
      }
      session.thinkingBlocks.push(...mergedBlocks);

      const visible =
        parsed.visibleContent || response || streamBuffer.getContent();
      addAssistantMessage(session, visible);
      tui.messageBox.finalizeAssistant(
        assistantBlockIndex,
        visible,
        mergedBlocks,
      );
      maybeAutosave();
    } catch (err) {
      if (err instanceof AgentAbortedError) {
        tui.messageBox.cancelInFlightAssistant();
        tui.messageBox.appendSystem("Turn aborted.");
        tui.statusBar.setMessage("Aborted — ready");
      } else {
        const msg = err instanceof Error ? err.message : "Unknown error";
        logCrash(
          `runAgent turn (provider: ${activeConfig.provider}/${activeConfig.model})`,
          err,
        );
        tui.messageBox.cancelInFlightAssistant();
        tui.messageBox.appendError(
          `[ERROR] ${msg} — full trace: ~/.jexxxus/crash.log`,
        );
        tui.statusBar.setMessage(`Error: ${msg}`);
      }
    } finally {
      abortController = null;
      isProcessing = false;

      const queued = messageQueue.dequeue();
      if (queued) {
        tui.statusBar.setMessage(
          messageQueue.length > 0
            ? `Processing queued (${messageQueue.length} remaining)...`
            : "Processing queued message...",
        );
        void runTurn(queued);
        return;
      }
      tui.statusBar.setMessage("Ready — ? for hotkeys · / for commands");
    }
  };

  const handleSubmit = async (line: string): Promise<void> => {
    if (isProcessing) return;

    const trimmed = line.trim();
    if (!trimmed) return;

    const slashLine = coerceSlashLine(trimmed);
    if (isSlashCommand(slashLine)) {
      await runSlash(slashLine);
      tui.statusBar.setMessage("Ready — ? for hotkeys · / for commands");
      return;
    }

    await runTurn(trimmed);
  };

  const handleEscapeCb = (): void => {
    handleEscapeLayer();
  };

  const handleAbort = (): void => {
    abortInFlight();
  };

  const maybeAutosave = (): void => {
    if (shouldAutosave(session.messages.length)) {
      const path = autosaveSession(session);
      tui.statusBar.setMessage(`Autosaved → ${path}`);
    }
  };

  const runBranchUndo = (): void => {
    if (isProcessing) return;
    if (branchUndo(session)) {
      tui.messageBox.popLastExchange();
      tui.statusBar.setMessage("Branch undo — last exchange removed");
      syncSnapshot();
    } else {
      tui.statusBar.setMessage("Nothing to undo");
    }
  };

  const callbacks: DyeActionCallbacks = {
    onSubmit: handleSubmit,
    onEscape: handleEscapeCb,
    onAbort: handleAbort,
    onExit: requestExit,
    onConfirmTool: async () => true,
    onExportSession: () => exportSession(),
    onNewSession: newSession,
    onToggleHotkeys: () => tui.store.setHotkeysVisible(true),
    onOpenSearch: () => tui.store.setSearchVisible(true),
    onCycleModelNext: () => void cycleModel(1),
    onCycleModelPrev: () => void cycleModel(-1),
    onBranchUndo: runBranchUndo,
    onCopySnapshot: () =>
      void copySnapshot().then(({ path, copied }) => {
        tui.statusBar.setMessage(copied ? "TUI copied" : `Snapshot: ${path}`);
      }),
    onCopyChrome: () =>
      void copyChromeDigest().then(({ path, copied }) => {
        tui.statusBar.setMessage(
          copied ? "Chrome copied" : `Chrome digest: ${path}`,
        );
      }),
    onCopyLastReply: () => void copyLastReply(),
    onToggleThinking: () => tui.messageBox.toggleAllThinking(),
    onScrollUp: () => {},
    onScrollDown: () => {},
    onScrollPageUp: () => {},
    onScrollPageDown: () => {},
    onScrollHalfUp: () => {},
    onScrollHalfDown: () => {},
    onScrollToTop: () => {},
    onScrollToBottom: () => {},
    onFocusInput: () => {},
    onOpenSlashPopup: () => {},
    onOpenExternalEditor: async (initial: string) =>
      openExternalEditor(initial),
    onOpenModelPicker: () => void openModelPicker(),
    onOpenProviderPicker: () => void openProviderPicker(),
    onOpenDivinityPicker: () => void openDivinityPicker(),
    onOpenAuthPicker: () => void openAuthPicker(),
  };

  const tui = createDyeTui({
    callbacks,
    subtitle:
      options.providerLabel ?? `${activeConfig.provider}/${activeConfig.model}`,
  });

  await tui.ready();

  tui.topBar.setSubtitle(
    options.providerLabel ?? `${activeConfig.provider}/${activeConfig.model}`,
  );

  if (options.resume && session.messages.length > 0) {
    tui.messageBox.replaySession(session);
    tui.messageBox.appendSystem(
      `Resumed autosave (${session.messages.length} messages, ${session.conversationHistory.length} history turns).`,
    );
  } else {
    showIdleHero();
  }

  syncSnapshot();

  const glitchTimer = setInterval(() => {
    tui.topBar.tickGlitch();
    tui.store.notify();
  }, 2800);

  await tui.waitUntilExit();
  clearInterval(glitchTimer);
}

function isFreeTierZenModel(catalogId: string, modelId: string): boolean {
  if (catalogId !== "opencode-zen") return false;
  const lower = modelId.toLowerCase();
  return lower.includes("-free") || lower === "big-pickle";
}

function createAuthTuiActionsNoScreen(options: {
  onAuthChanged: () => void;
}): import("./auth-tui.js").AuthTuiActions {
  return {
    async status() {
      const { formatAuthStatusLines, loadCredentials: lc } =
        await import("../../auth.js");
      return formatAuthStatusLines(lc({ quiet: true }));
    },
    async login() {
      return ["Login via TUI overlay (/auth or Ctrl+A)"];
    },
    async logout() {
      const { loadCredentials: lc, deleteCredentials: dc } =
        await import("../../auth.js");
      const creds = lc({ quiet: true });
      if (!creds) return ["Not signed in to JEXXXUS."];
      dc();
      options.onAuthChanged();
      return ["Signed out. Run /auth login to connect secure.jexxx.us again."];
    },
    async refresh() {
      const {
        refreshAccessTokenViaServer,
        loadCredentials: lc,
        saveCredentials: sc,
      } = await import("../../auth.js");
      const creds = lc({ quiet: true });
      if (!creds) return ["Not signed in. Use /auth login first."];
      try {
        const refreshed = await refreshAccessTokenViaServer(creds.refreshToken);
        sc(refreshed);
        options.onAuthChanged();
        return [`Token refreshed for ${refreshed.email}.`];
      } catch (err) {
        return [
          `Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
          "Try /auth login.",
        ];
      }
    },
  };
}
