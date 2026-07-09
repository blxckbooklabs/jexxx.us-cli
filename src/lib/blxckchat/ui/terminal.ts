import { randomUUID } from "node:crypto";

import blessed from "blessed";

import { AgentAbortedError, runAgent } from "../agent-loop.js";
import type { Provider } from "../providers/types.js";
import type { BlxckchatTool } from "../tools/types.js";
import type { StoredProviderConfig } from "../config.js";
import { upsertProvider } from "../config.js";
import { loadCredentials } from "../../auth.js";
import {
  formatCredentialsDisplayName,
  formatCredentialsShortLabel,
} from "../../operator-identity.js";
import { resolveProvider } from "../providers/registry.js";
import { cycleModelOption, listModelOptions } from "../providers/models.js";

import { createTopBar } from "./components/top-bar.js";
import { createCrtBackdrop } from "./components/crt-backdrop.js";
import {
  formatHeroHint,
  formatHeroSubtitle,
  renderJexxxusHeroBlessed,
  renderJexxxusHeroPlain,
  type JexxxusHeroMeta,
} from "./components/jexxxus-hero.js";
import { THEME } from "./theme.js";
import { createMessageBox } from "./components/message-box.js";
import { createInputBox } from "./components/input-box.js";
import { bindFocusedKey } from "./editor/focused-key.js";
import { createStatusBar } from "./components/status-bar.js";
import { createSlashPopup } from "./components/slash-popup.js";
import { createSearchOverlay } from "./components/search-overlay.js";
import {
  createSession,
  addUserMessage,
  addAssistantMessage,
  addToolResult,
  updateToolResult,
  type TerminalSession,
  type ToolStatus,
} from "./session/session-store.js";
import { autosaveSession, loadAutosaveSession, shouldAutosave } from "./session/autosave.js";
import { branchUndo } from "./session/branch.js";
import { escapeBlessed } from "./renderer/markdown.js";
import { StreamBuffer } from "./renderer/streaming.js";
import {
  StreamThinkingParser,
  formatLiveStreamDisplay,
  formatThinkingWaitState,
} from "./renderer/stream-thinking.js";
import { extractThinkingBlocks } from "./components/thinking-block.js";
import {
  buildChromeDigestPlain,
  buildTuISnapshot,
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
import { getSlashSuggestions } from "./slash/autocomplete.js";
import { coerceSlashLine } from "./slash/coerce.js";
import { dispatchSlashCommand, isSlashCommand, parseSlashInput } from "./slash/handler.js";

import { bindExitKeys, gracefulTuiExit } from "./exit.js";
import { createHotkeysOverlay } from "./components/hotkeys-overlay.js";
import { createDivinityPickerOverlay } from "./components/divinity-picker-overlay.js";
import { createModelPickerOverlay } from "./components/model-picker-overlay.js";
import { createProviderOverlay } from "./components/provider-overlay.js";
import { getDivinityPersonaById } from "../divinities/source.js";
import { MessageQueue } from "./message-queue.js";
import {
  registerOverlayActiveCheck,
  registerSlashMenuDismiss,
} from "./menu-mutex.js";
import { openExternalEditor } from "./external-editor.js";
import { createAuthPickerOverlay } from "./components/auth-picker-overlay.js";
import { createDeviceLoginOverlay } from "./components/device-login-overlay.js";
import { createToastOverlay } from "./components/toast-overlay.js";
import { createAuthTuiActions } from "./auth-tui.js";
import {
  isBlessedMouseEnabled,
  pauseBlessedForConsole,
  restoreTerminalForReadline,
  suspendBlessedToShell,
} from "./tty.js";

export interface TerminalChatOptions {
  providerLabel?: string;
  toolCount?: number;
  storedConfig: StoredProviderConfig;
  resume?: boolean;
}

function createBlessedConfirm(
  screen: blessed.Widgets.Screen,
  toolName: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  return new Promise((resolve) => {
    const argsPreview = JSON.stringify(args, null, 2).slice(0, 400);
    const modal = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "80%",
      height: 12,
      border: { type: "line" },
      tags: true,
      label: " Confirm Tool ",
      style: {
        fg: THEME.text,
        bg: THEME.bgElevated,
        border: { fg: THEME.pink },
      },
      content: [
        `{#ec4899-fg}░░ tool confirm ░░{/}`,
        `{#ec4899-fg}BLXCKCHAT{/} wants to run {bold}${toolName}{/bold}`,
        "",
        `{gray-fg}${escapeBlessed(argsPreview)}{/gray-fg}`,
        "",
        "{#67e8f9-fg}Y{/} allow  {#f87171-fg}N{/} decline",
      ].join("\n"),
    });

    modal.key(["y", "Y"], () => {
      modal.destroy();
      screen.render();
      resolve(true);
    });

    modal.key(["n", "N", "escape"], () => {
      modal.destroy();
      screen.render();
      resolve(false);
    });

    modal.key(["C-c", "C-d"], () => {
      modal.destroy();
      gracefulTuiExit(screen);
    });

    modal.focus();
    screen.render();
  });
}

export async function startTerminalChat(
  provider: Provider,
  tools: BlxckchatTool[],
  options: TerminalChatOptions,
): Promise<void> {
  // Load auth before blessed takes over stdout (console.warn corrupts the TUI).
  const creds = loadCredentials({ quiet: true });
  const authLabel = creds
    ? formatCredentialsShortLabel(creds)
    : "not authenticated";
  const toolCount = options.toolCount ?? tools.length;

  const session: TerminalSession = options.resume
    ? (loadAutosaveSession() ?? createSession())
    : createSession();

  let screenRef: blessed.Widgets.Screen | undefined;
  try {
    const screen = blessed.screen({
      smartCSR: true,
      title: "BLXCKCHAT",
      fullUnicode: true,
      mouse: isBlessedMouseEnabled(),
      terminal: process.env.TERM,
      style: { bg: THEME.bg },
    });
    screenRef = screen;

    const crtBackdrop = createCrtBackdrop(screen, { top: 2, bottom: 4 });

  let activeConfig: StoredProviderConfig = { ...options.storedConfig };
  let activeProvider: Provider = provider;

  let topBar!: ReturnType<typeof createTopBar>;
  let messageBox!: ReturnType<typeof createMessageBox>;
  let statusBar!: ReturnType<typeof createStatusBar>;
  let inputBox!: ReturnType<typeof createInputBox>;
  const slashPopup = createSlashPopup(screen);
  const hotkeysOverlay = createHotkeysOverlay(screen);
  const toastOverlay = createToastOverlay(screen);

  const showCopiedToast = (): void => {
    toastOverlay.show("Copied to clipboard");
  };

  const showCopyFailedToast = (): void => {
    toastOverlay.show("Copy failed — see ~/.jexxxus snapshot", "error");
  };
  const messageQueue = new MessageQueue();

  let modelPickerOverlay!: ReturnType<typeof createModelPickerOverlay>;
  let providerOverlay!: ReturnType<typeof createProviderOverlay>;
  let divinityPickerOverlay!: ReturnType<typeof createDivinityPickerOverlay>;
  let authPickerOverlay!: ReturnType<typeof createAuthPickerOverlay>;
  let deviceLoginOverlay!: ReturnType<typeof createDeviceLoginOverlay>;

  let isProcessing = false;
  let abortController: AbortController | null = null;

  let cachedModelOptions = await listModelOptions(activeConfig);

  let heroMeta: JexxxusHeroMeta = {
    authLabel,
    toolCount,
    providerLabel: options.providerLabel ?? `${activeConfig.provider}/${activeConfig.model}`,
  };

  const showIdleHero = (): void => {
    const heroWidth = Math.max(40, (screen.width as number) - 4);
    messageBox.showHero(
      renderJexxxusHeroPlain(heroWidth, heroMeta),
      renderJexxxusHeroBlessed(heroWidth, heroMeta),
    );
  };

  const refreshAuthChrome = (): void => {
    const liveCreds = loadCredentials({ quiet: true });
    const liveAuth = liveCreds
      ? formatCredentialsShortLabel(liveCreds)
      : "not authenticated";
    heroMeta = { ...heroMeta, authLabel: liveAuth };
    if (messageBox.hasHero()) {
      messageBox.dismissHero();
      showIdleHero();
    }
    syncSnapshot();
  };

  deviceLoginOverlay = createDeviceLoginOverlay(screen, {
    onCopied: showCopiedToast,
    onCopyFailed: showCopyFailedToast,
  });

  const authActions = createAuthTuiActions({
    screen,
    onAuthChanged: refreshAuthChrome,
    deviceLoginOverlay,
  });

  authPickerOverlay = createAuthPickerOverlay(screen, {
    authActions,
    onMessage: (message) => {
      messageBox.appendSystem(message);
      statusBar.setMessage(message.split("\n")[0] ?? message);
    },
    onFocusInput: () => inputBox.focus(),
  });

  const onDivinityChatCleared = (): void => {
    messageBox.clearChat();
    showIdleHero();
  };

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
      openModelPicker: () => modelPickerOverlay.open(),
      openProviderPicker: () => providerOverlay.open(),
      openDivinityPicker: () => divinityPickerOverlay.open(),
      openAuthPicker: () => authPickerOverlay.open(),
      setupProvider: (catalogId) => providerOverlay.setup(catalogId),
      onDivinityActivated: onDivinityChatCleared,
    });
    if (parsed.command === "reset") {
      messageBox.clearChat();
      showIdleHero();
      statusBar.setMessage("Session reset — type a message to begin");
      return;
    }
    for (const msg of result.messages) {
      messageBox.appendSystem(msg);
    }
    if (result.exit) {
      requestExit();
      return;
    }
    if (!result.deferInputFocus) {
      inputBox.focus();
    }
  };

  const cycleModel = async (direction: 1 | -1): Promise<void> => {
    const next = cycleModelOption(cachedModelOptions, activeConfig, direction);
    if (!next) {
      statusBar.setMessage("No models available to cycle");
      return;
    }
    const updated: StoredProviderConfig = {
      ...activeConfig,
      model: next.id,
      provider: next.provider,
    };
    upsertProvider(updated);
    setActiveConfig(updated, resolveProvider(updated));
    messageBox.appendSystem(`Model → ${updated.provider}/${updated.model}`);
    statusBar.setMessage(`${updated.provider}/${updated.model}`);
  };

  const copyLastReply = async (): Promise<void> => {
    const text = messageBox.getLastAssistantPlainText();
    if (!text?.trim()) {
      statusBar.setMessage("No assistant reply to copy");
      return;
    }
    const copied = await copyToClipboard(text);
    statusBar.setMessage(copied ? "Last reply copied" : "Copy failed — see TUI snapshot");
  };

  const canSnapshot = (): boolean =>
    Boolean(topBar && messageBox && statusBar && inputBox);

  const collectChromeDigestInput = (): ChromeDigestInput => {
    const liveCreds = loadCredentials({ quiet: true });
    const liveAuth = liveCreds
      ? formatCredentialsDisplayName(liveCreds)
      : "not authenticated";
    const providerLabel = topBar.getSubtitle();
    const meta: JexxxusHeroMeta = {
      authLabel: liveCreds ? formatCredentialsShortLabel(liveCreds) : "not authenticated",
      toolCount,
      providerLabel,
    };
    return {
      topBarModel: providerLabel,
      authEmail: liveAuth,
      toolCount,
      heroSubtitle: formatHeroSubtitle(meta),
      heroHint: formatHeroHint(),
      statusBar: statusBar.getMessage(),
      inputValue: inputBox.getValue(),
      divinity: session.activeDivinity?.name ?? null,
    };
  };

  const buildSnapshotParts = () => ({
    width: (screen.width as number) || 80,
    topBar: topBar.getPlainText(),
    messages: messageBox.getPlainText(),
    statusBar: statusBar.getPlainText(),
    input: inputBox.getPlainText(),
  });

  const syncSnapshot = (): void => {
    if (!canSnapshot()) return;
    const chrome = buildChromeDigestPlain(collectChromeDigestInput());
    writeChromeDigest(chrome);
    writeSnapshot(buildTuISnapshotWithChrome(chrome, buildSnapshotParts()));
  };

  const copyChromeDigest = async (): Promise<{ path: string; copied: boolean }> => {
    if (!canSnapshot()) {
      return { path: getChromeDigestPath(), copied: false };
    }
    const chrome = buildChromeDigestPlain(collectChromeDigestInput());
    const path = writeChromeDigest(chrome);
    const copied = await copyToClipboard(chrome);
    return { path, copied };
  };

  const copySnapshot = async (): Promise<{ path: string; copied: boolean }> => {
    if (!canSnapshot()) {
      return { path: getSnapshotPath(), copied: false };
    }
    const chrome = buildChromeDigestPlain(collectChromeDigestInput());
    const snapshot = buildTuISnapshotWithChrome(chrome, buildSnapshotParts());
    const path = writeSnapshot(snapshot);
    const copied = await copyToClipboard(snapshot);
    return { path, copied };
  };

  const onSnapshotUpdate = (): void => {
    syncSnapshot();
  };

  const setActiveConfig = (config: StoredProviderConfig, nextProvider: Provider): void => {
    activeConfig = config;
    activeProvider = nextProvider;
    topBar.setSubtitle(`${config.provider}/${config.model}`);
    void listModelOptions(activeConfig).then((opts) => {
      cachedModelOptions = opts;
    });
  };

  modelPickerOverlay = createModelPickerOverlay(screen, {
    getActiveConfig: () => activeConfig,
    setActiveConfig,
    onApplied: (message) => {
      messageBox.appendSystem(message);
      statusBar.setMessage(message);
      inputBox.focus();
    },
  });

  providerOverlay = createProviderOverlay(screen, {
    getActiveConfig: () => activeConfig,
    setActiveConfig,
    onMessage: (message) => {
      messageBox.appendSystem(message);
      statusBar.setMessage(message);
      inputBox.focus();
    },
    onError: (message) => {
      messageBox.appendError(message);
      statusBar.setMessage(message);
      inputBox.focus();
    },
  });

  divinityPickerOverlay = createDivinityPickerOverlay(screen, {
    session,
    getActiveDivinityId: () => session.activeDivinity?.id ?? null,
    onChatCleared: onDivinityChatCleared,
    onActivated: (message) => {
      messageBox.appendSystem(message);
      statusBar.setMessage(message.split("\n")[0] ?? message);
      inputBox.focus();
    },
  });

  const maybeAutosave = (): void => {
    if (shouldAutosave(session.messages.length)) {
      const path = autosaveSession(session);
      statusBar.setMessage(`Autosaved → ${path}`);
    }
  };

  const abortInFlight = (): void => {
    abortController?.abort();
  };

  const runTurn = async (trimmed: string): Promise<void> => {
    isProcessing = true;
    abortController = new AbortController();
    statusBar.setMessage("Thinking...");
    addUserMessage(session, trimmed);
    messageBox.appendUser(trimmed);

    const assistantBlockIndex = messageBox.appendAssistantStart();
    messageBox.updateAssistantStream(
      assistantBlockIndex,
      formatThinkingWaitState(),
      "",
      "",
    );
    const streamBuffer = new StreamBuffer();
    const thinkingParser = new StreamThinkingParser();

    const pushStreamToUi = (): void => {
      const state = thinkingParser.getState();
      messageBox.updateAssistantStream(
        assistantBlockIndex,
        formatLiveStreamDisplay(state),
        state.visible,
        state.thinking,
      );
    };

    const showToolPending = (toolName: string): void => {
      addToolResult(session, toolName, "Running...", "pending");
      statusBar.setMessage(`⏳ Running tool: ${toolName}...`);
    };

    const showToolComplete = (
      toolName: string,
      result: string,
      status: ToolStatus,
    ): void => {
      const entry = updateToolResult(session, toolName, result, status);
      if (entry) {
        messageBox.appendTools([entry]);
      }
      statusBar.setMessage("Ready — ? for hotkeys · / for commands");
    };

    const activeDivinity = session.activeDivinity;
    const personaRecord = activeDivinity
      ? getDivinityPersonaById(activeDivinity.id)
      : null;
    const persona =
      personaRecord && activeDivinity
        ? { name: activeDivinity.name, systemPrompt: personaRecord.systemPrompt }
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
            messageBox.updateAssistantStream(
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
            messageBox.updateAssistantStream(
              assistantBlockIndex,
              formatThinkingWaitState(),
              "",
              "",
            );
          },
          confirmToolCall: (toolName, args) =>
            createBlessedConfirm(screen, toolName, args),
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
      messageBox.finalizeAssistant(
        assistantBlockIndex,
        visible,
        mergedBlocks,
      );
      maybeAutosave();
    } catch (err) {
      if (err instanceof AgentAbortedError) {
        messageBox.cancelInFlightAssistant();
        messageBox.appendSystem("Turn aborted.");
        statusBar.setMessage("Aborted — ready");
      } else {
        const msg = err instanceof Error ? err.message : "Unknown error";
        messageBox.cancelInFlightAssistant();
        messageBox.appendError(`[ERROR] ${msg}`);
        statusBar.setMessage(`Error: ${msg}`);
      }
    } finally {
      abortController = null;
      isProcessing = false;

      const queued = messageQueue.dequeue();
      if (queued) {
        statusBar.setMessage(
          messageQueue.length > 0
            ? `Processing queued (${messageQueue.length} remaining)...`
            : "Processing queued message...",
        );
        void runTurn(queued);
        return;
      }

      inputBox.focus();
    }
  };

  const handleSubmit = async (line: string): Promise<void> => {
    if (isProcessing) return;

    const trimmed = line.trim();
    if (!trimmed) return;

    inputBox.hideSlashPopup();

    const slashLine = coerceSlashLine(trimmed);
    if (isSlashCommand(slashLine)) {
      await runSlash(slashLine);
      if (!providerOverlay.isVisible()) {
        statusBar.setMessage("Ready — ? for hotkeys · / for commands");
      }
      return;
    }

    await runTurn(trimmed);
  };

  const requestExit = (): void => {
    if (session.messages.length > 0) {
      autosaveSession(session);
    }
    gracefulTuiExit(screen);
  };

  const updateScrollStatus = (): void => {
    const { pinnedToBottom, percent } = messageBox.getScrollState();
    if (pinnedToBottom) {
      statusBar.setMessage(
        "Shift+↑↓ scroll · Ctrl+B history · / commands · Ctrl+Shift+Y chrome · ? hotkeys",
      );
    } else {
      statusBar.setMessage(`History ${percent}% · End jump latest · Ctrl+B scroll · ? hotkeys`);
    }
  };

  const focusMessages = (): void => {
    hotkeysOverlay.hide();
    searchOverlay.close();
    messageBox.element.focus();
    updateScrollStatus();
  };

  const bindInputScrollKeys = (): void => {
    const scrollKeys: Array<[string[], () => void]> = [
      [["S-up", "C-up"], () => messageBox.scrollUp()],
      [["S-down", "C-down"], () => messageBox.scrollDown()],
      [["S-pageup"], () => messageBox.scrollPageUp()],
      [["S-pagedown"], () => messageBox.scrollPageDown()],
      [["C-M-u", "M-u"], () => messageBox.scrollHalfPageUp()],
      [["C-M-d", "M-d"], () => messageBox.scrollHalfPageDown()],
    ];
    for (const [keys, fn] of scrollKeys) {
      inputBox.element.key(keys, () => {
        fn();
        updateScrollStatus();
      });
    }
  };

  const searchOverlay = createSearchOverlay(screen, (query) => {
    messageBox.setSearchQuery(query);
    statusBar.setMessage(query ? `Search: "${query}"` : "Search cleared");
    inputBox.focus();
  });

  const openEditorDraft = async (): Promise<void> => {
    if (isProcessing) return;
    const draft = inputBox.getValue();
    const resumeBlessed = pauseBlessedForConsole(screen);
    try {
      const edited = await openExternalEditor(draft);
      if (edited !== null) {
        inputBox.setValue(edited);
        statusBar.setMessage("Draft updated from editor");
      } else if (!process.env.EDITOR?.trim() && !process.env.VISUAL?.trim()) {
        statusBar.setMessage("Set $EDITOR or $VISUAL for external editor");
      }
    } catch {
      statusBar.setMessage("External editor failed");
    } finally {
      resumeBlessed();
      screen.render();
    }
  };

  const suspendTui = (): void => {
    suspendBlessedToShell(screen, () => {
      screen.render();
      inputBox.focus();
    });
  };

  const runBranchUndo = (): void => {
    if (isProcessing) return;
    if (branchUndo(session)) {
      messageBox.popLastExchange();
      statusBar.setMessage("Branch undo — last exchange removed");
      syncSnapshot();
    } else {
      statusBar.setMessage("Nothing to undo");
    }
  };

  topBar = createTopBar(screen, { onUpdate: onSnapshotUpdate });
  messageBox = createMessageBox(screen, {
    onUpdate: onSnapshotUpdate,
    onScrollChange: () => updateScrollStatus(),
    onCopied: showCopiedToast,
    onCopyFailed: showCopyFailedToast,
  });
  statusBar = createStatusBar(screen, { onUpdate: onSnapshotUpdate });

  inputBox = createInputBox(
    screen,
    (line) => {
      void handleSubmit(line);
    },
    {
      onUpdate: onSnapshotUpdate,
      onExit: requestExit,
      onShowHotkeys: () => hotkeysOverlay.toggle(),
      onQueueIfProcessing: () => {
        if (!isProcessing) return false;
        const value = inputBox.getValue().trim();
        if (!value) return false;
        if (messageQueue.enqueue(value)) {
          inputBox.clear();
          statusBar.setMessage(`Queued (${messageQueue.length}) — Tab to queue more`);
          return true;
        }
        return false;
      },
      onOpenExternalEditor: () => void openEditorDraft(),
      onCopied: showCopiedToast,
      onCopyFailed: showCopyFailedToast,
      shortcuts: {
        onSave: () => void runSlash("/save"),
        onCopyTui: async () => {
          const { path, copied } = await copySnapshot();
          statusBar.setMessage(copied ? "TUI copied" : `Snapshot: ${path}`);
        },
        onCopyChrome: async () => {
          const { path, copied } = await copyChromeDigest();
          statusBar.setMessage(
            copied ? "Chrome copied" : `Chrome digest: ${path}`,
          );
        },
        onCopyLastReply: () => void copyLastReply(),
        onModelList: () => void modelPickerOverlay.open(),
        onModelNext: () => void cycleModel(1),
        onModelPrev: () => void cycleModel(-1),
        onToggleAllThinking: () => messageBox.toggleAllThinking(),
        onNewSession: () => void runSlash("/reset"),
        onFocusMessages: focusMessages,
      },
      slashPopup,
      getSlashSuggestions: (value) =>
        getSlashSuggestions(value, {
          activeConfig,
          modelOptions: cachedModelOptions,
        }),
      onSetupProvider: (catalogId) => providerOverlay.setup(catalogId),
    },
  );

  registerSlashMenuDismiss(() => inputBox.hideSlashPopup());
  registerOverlayActiveCheck(
    () =>
      modelPickerOverlay.isVisible() ||
      providerOverlay.isVisible() ||
      divinityPickerOverlay.isVisible() ||
      authPickerOverlay.isVisible() ||
      deviceLoginOverlay.isVisible() ||
      searchOverlay.isVisible() ||
      hotkeysOverlay.isVisible(),
  );

  const handleEscapeLayer = (): boolean => {
    if (isProcessing) {
      abortInFlight();
      return true;
    }
    if (deviceLoginOverlay.isVisible()) {
      deviceLoginOverlay.cancel();
      inputBox.focus();
      return true;
    }
    if (authPickerOverlay.isVisible()) {
      authPickerOverlay.close();
      inputBox.focus();
      return true;
    }
    if (providerOverlay.isVisible()) {
      providerOverlay.close();
      inputBox.focus();
      return true;
    }
    if (divinityPickerOverlay.isVisible()) {
      divinityPickerOverlay.close();
      inputBox.focus();
      return true;
    }
    if (modelPickerOverlay.isVisible()) {
      modelPickerOverlay.close();
      inputBox.focus();
      return true;
    }
    if (searchOverlay.isVisible()) {
      searchOverlay.close();
      messageBox.setSearchQuery("");
      inputBox.focus();
      return true;
    }
    if (hotkeysOverlay.isVisible()) {
      hotkeysOverlay.hide();
      inputBox.focus();
      return true;
    }
    if (slashPopup.isVisible()) {
      inputBox.hideSlashPopup();
      return true;
    }
    return false;
  };

  bindExitKeys(
    screen,
    [screen, inputBox.element, messageBox.element],
    handleEscapeLayer,
  );

  inputBox.element.key(["C-i"], () => {
    inputBox.focus();
    statusBar.setMessage("Input focus — Enter send · / commands · ? hotkeys");
  });

  inputBox.element.key(["C-f"], () => searchOverlay.open());
  inputBox.element.key(["C-z"], () => suspendTui());
  inputBox.element.key(["C-M-z", "M-z"], () => runBranchUndo());

  messageBox.element.key(["pageup"], () => {
    messageBox.scrollPageUp();
    updateScrollStatus();
  });
  messageBox.element.key(["pagedown"], () => {
    messageBox.scrollPageDown();
    updateScrollStatus();
  });
  messageBox.element.key(["C-M-u", "M-u"], () => {
    messageBox.scrollHalfPageUp();
    updateScrollStatus();
  });
  messageBox.element.key(["C-M-d", "M-d"], () => {
    messageBox.scrollHalfPageDown();
    updateScrollStatus();
  });
  messageBox.element.key(["home"], () => {
    messageBox.scrollToTop();
    updateScrollStatus();
  });
  messageBox.element.key(["end"], () => {
    messageBox.scrollToBottom();
    updateScrollStatus();
  });
  bindFocusedKey(screen, messageBox.element, ["up"], () => {
    messageBox.scrollUp();
    updateScrollStatus();
  });
  bindFocusedKey(screen, messageBox.element, ["down"], () => {
    messageBox.scrollDown();
    updateScrollStatus();
  });
  messageBox.element.key(["space"], () => messageBox.toggleFocusedThinking());
  messageBox.element.key(["C-t"], () => messageBox.toggleAllThinking());
  messageBox.element.key(["C-o"], () => void copyLastReply());
  messageBox.element.key(["?"], () => hotkeysOverlay.toggle());
  messageBox.element.key(["C-i"], () => inputBox.focus());
  messageBox.element.key(["C-f"], () => searchOverlay.open());
  messageBox.element.key(["C-z"], () => suspendTui());
  messageBox.element.key(["C-M-z", "M-z"], () => runBranchUndo());

  topBar.setSubtitle(options.providerLabel ?? `${activeConfig.provider}/${activeConfig.model}`);

  if (options.resume && session.messages.length > 0) {
    messageBox.replaySession(session);
    messageBox.appendSystem(
      `Resumed autosave (${session.messages.length} messages, ${session.conversationHistory.length} history turns).`,
    );
    updateScrollStatus();
  } else {
    showIdleHero();
    updateScrollStatus();
  }

  bindInputScrollKeys();
  syncSnapshot();

  inputBox.focus();
  screen.render();

  const glitchTimer = setInterval(() => {
    topBar.tickGlitch();
    crtBackdrop.setGlitchSeed(Date.now() % 9);
  }, 2800);

  screen.on("destroy", () => {
    clearInterval(glitchTimer);
  });

  await new Promise<void>(() => {
    // Keep process alive until exit shortcut
  });
  } catch (err) {
    restoreTerminalForReadline(screenRef);
    throw err;
  }
}