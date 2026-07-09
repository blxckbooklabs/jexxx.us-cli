import {
  getProviderByName,
  loadCredentials,
  listProvidersRedacted,
  upsertProvider,
  type StoredProviderConfig,
} from "../../config.js";
import { getCatalogEntry } from "../../providers/catalog.js";
import { resolveProvider } from "../../providers/registry.js";
import type { Provider } from "../../providers/types.js";
import { findModelMatch, listModelOptions } from "../../providers/models.js";
import type { TerminalSession } from "../session/session-store.js";
import { exportSessionToFile } from "../session/session-store.js";
import {
  activateDivinityPersona,
  clearActiveDivinity,
  formatDivinityActivationMessage,
  formatDivinityClearedMessage,
} from "../../divinities/session.js";
import {
  findDivinityPersona,
  listDivinityPersonas,
} from "../../divinities/source.js";
import {
  formatSlashHelp,
  resolveSlashCommandName,
} from "./registry.js";
import { loadCredentials as loadAuthCredentials } from "../../../auth.js";
import { formatHeroHint, formatHeroSubtitle } from "../components/jexxxus-hero.js";
import { buildChromeDigestPlain } from "../renderer/plain-text.js";
import { copyToClipboard, writeChromeDigest } from "../session/tui-snapshot.js";

export interface SlashHandlerState {
  session: TerminalSession;
  activeConfig: StoredProviderConfig;
  toolCount: number;
  setActiveConfig: (config: StoredProviderConfig, provider: Provider) => void;
  copySnapshot: () => Promise<{ path: string; copied: boolean }>;
  copyChromeDigest?: () => Promise<{ path: string; copied: boolean }>;
  openModelPicker?: () => void | Promise<void>;
  openProviderPicker?: () => void | Promise<void>;
  openDivinityPicker?: () => void | Promise<void>;
  setupProvider?: (catalogId: string) => Promise<void>;
  onDivinityActivated?: () => void;
}

export interface SlashResult {
  handled: boolean;
  messages: string[];
  exit?: boolean;
  deferInputFocus?: boolean;
}

function findProviderConfig(name: string): StoredProviderConfig | null {
  const file = loadCredentials();
  return (
    file.providers.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null
  );
}

export function parseSlashInput(line: string): {
  command: string | null;
  args: string;
} {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) {
    return { command: null, args: "" };
  }
  const body = trimmed.slice(1);
  const space = body.indexOf(" ");
  if (space === -1) {
    return { command: resolveSlashCommandName(body), args: "" };
  }
  return {
    command: resolveSlashCommandName(body.slice(0, space)),
    args: body.slice(space + 1).trim(),
  };
}

export function isSlashCommand(line: string): boolean {
  return parseSlashInput(line).command !== null;
}

async function handleModel(
  args: string,
  state: SlashHandlerState,
): Promise<SlashResult> {
  const options = await listModelOptions(state.activeConfig);
  const lines: string[] = [];

  if (!args) {
    if (state.openModelPicker) {
      await state.openModelPicker();
      return { handled: true, messages: [], deferInputFocus: true };
    }
    lines.push(
      `Current model: ${state.activeConfig.provider}/${state.activeConfig.model}`,
      "",
      "Available models (use /model <name>):",
    );
    for (const opt of options.slice(0, 20)) {
      const marker =
        opt.id === state.activeConfig.model &&
        opt.provider === state.activeConfig.provider
          ? "▸ "
          : "  ";
      lines.push(`${marker}${opt.label}`);
    }
    if (options.length > 20) {
      lines.push(
        `  … and ${options.length - 20} more (type to filter with /model <term>)`,
      );
    }
    return { handled: true, messages: lines };
  }

  const match = findModelMatch(args, options);
  if (!match) {
    return {
      handled: true,
      messages: [
        `No model match for "${args}".`,
        "Try /model to list options, or /model provider/model-id",
      ],
    };
  }

  const updated: StoredProviderConfig = {
    ...state.activeConfig,
    model: match.id,
    provider: match.provider,
  };
  upsertProvider(updated);
  const provider = resolveProvider(updated);
  state.setActiveConfig(updated, provider);
  lines.push(`Model set to ${updated.provider}/${updated.model}`);
  return { handled: true, messages: lines };
}

async function handleProvider(
  args: string,
  state: SlashHandlerState,
): Promise<SlashResult> {
  const providers = listProvidersRedacted();
  const lines: string[] = [];

  if (!args) {
    if (state.openProviderPicker) {
      state.openProviderPicker();
      return { handled: true, messages: [], deferInputFocus: true };
    }
    lines.push("Use /provider to open picker — saved profiles + catalog (API key flow)");
    for (const p of providers) {
      const active = p.name === state.activeConfig.name ? "▸ " : "  ";
      const def = p.isDefault ? " (default)" : "";
      lines.push(`${active}${p.name}: ${p.provider}/${p.model}${def}`);
    }
    return { handled: true, messages: lines };
  }

  const catalogId = args.trim().toLowerCase();
  const catalogEntry = getCatalogEntry(catalogId);
  if (catalogEntry && state.setupProvider) {
    await state.setupProvider(catalogId);
    return { handled: true, messages: [], deferInputFocus: true };
  }

  const resolved = findProviderConfig(args) ?? getProviderByName(args);
  if (!resolved) {
    return {
      handled: true,
      messages: [
        `Unknown profile "${args}".`,
        "Use /provider to browse catalog, or /provider <catalog-id> (e.g. google, openai).",
      ],
    };
  }

  const provider = resolveProvider(resolved);
  state.setActiveConfig(resolved, provider);
  lines.push(
    `Switched to "${resolved.name}" (${resolved.provider}/${resolved.model})`,
  );
  return { handled: true, messages: lines };
}

function handleSession(state: SlashHandlerState): SlashResult {
  const { session, activeConfig, toolCount } = state;
  const divinity = session.activeDivinity;
  const lines = [
    `Provider: ${activeConfig.name} (${activeConfig.provider}/${activeConfig.model})`,
    `Messages: ${session.messages.length}`,
    `Tool results: ${session.toolResults.length}`,
    `History turns: ${session.conversationHistory.length}`,
    `Tools loaded: ${toolCount}`,
  ];
  if (divinity) {
    const role = divinity.role ? ` · ${divinity.role}` : "";
    const pillar = divinity.pillar ? ` · ${divinity.pillar}` : "";
    lines.push(`Divinity: ${divinity.name}${role}${pillar}`);
  } else {
    lines.push("Divinity: (none — BLXCKCHAT default)");
  }
  return { handled: true, messages: lines };
}

async function handleDivinities(
  args: string,
  state: SlashHandlerState,
): Promise<SlashResult> {
  const trimmed = args.trim().toLowerCase();

  if (!args) {
    if (state.openDivinityPicker) {
      state.openDivinityPicker();
      return { handled: true, messages: [], deferInputFocus: true };
    }
    const personas = listDivinityPersonas();
    if (personas.length === 0) {
      return {
        handled: true,
        messages: [
          "No Divinities vault found.",
          "Set DIVINITIES_VAULT_PATH to jexxx.us-obsidian/Divinities",
        ],
      };
    }
    const lines = [
      `Divinities loaded: ${personas.length} personas`,
      "Use /divinities to open picker, or /divinities <name>",
      "",
    ];
    for (const p of personas.slice(0, 16)) {
      const role = p.role ? ` — ${p.role}` : "";
      lines.push(`  ${p.name}${role}`);
    }
    if (personas.length > 16) {
      lines.push(`  … and ${personas.length - 16} more`);
    }
    return { handled: true, messages: lines };
  }

  if (trimmed === "clear" || trimmed === "off" || trimmed === "none") {
    clearActiveDivinity(state.session);
    state.onDivinityActivated?.();
    return { handled: true, messages: [formatDivinityClearedMessage()] };
  }

  const match = findDivinityPersona(args);
  if (!match) {
    return {
      handled: true,
      messages: [
        `No divinity match for "${args}".`,
        "Try /divinities to browse, or /divinities clear to reset.",
      ],
    };
  }

  activateDivinityPersona(state.session, match);
  state.onDivinityActivated?.();
  return { handled: true, messages: [formatDivinityActivationMessage(match)] };
}

export async function dispatchSlashCommand(
  line: string,
  state: SlashHandlerState,
): Promise<SlashResult> {
  const { command, args } = parseSlashInput(line);
  if (!command) {
    return {
      handled: true,
      messages: [`Unknown command. ${formatSlashHelp()}`],
    };
  }

  switch (command) {
    case "help":
      return { handled: true, messages: [formatSlashHelp()] };

    case "exit":
      return { handled: true, messages: ["Goodbye."], exit: true };

    case "reset":
      state.session.conversationHistory = [];
      state.session.messages = [];
      state.session.toolResults = [];
      state.session.thinkingBlocks = [];
      return { handled: true, messages: ["Conversation history cleared."] };

    case "chrome": {
      if (state.copyChromeDigest) {
        const { path, copied } = await state.copyChromeDigest();
        return {
          handled: true,
          messages: [
            copied
              ? `Chrome digest copied (${path})`
              : `Chrome digest written to ${path}`,
          ],
        };
      }
      const liveAuth = loadAuthCredentials({ quiet: true })?.email ?? "not authenticated";
      const providerLabel = `${state.activeConfig.provider}/${state.activeConfig.model}`;
      const chrome = buildChromeDigestPlain({
        topBarModel: providerLabel,
        authEmail: liveAuth,
        toolCount: state.toolCount,
        heroSubtitle: formatHeroSubtitle({
          authEmail: liveAuth,
          toolCount: state.toolCount,
          providerLabel,
        }),
        heroHint: formatHeroHint(),
        statusBar: "(readline mode)",
        inputValue: "",
        divinity: state.session.activeDivinity?.name ?? null,
      });
      const path = writeChromeDigest(chrome);
      const copied = await copyToClipboard(chrome);
      return {
        handled: true,
        messages: [
          copied ? `Chrome digest copied (${path})` : `Chrome digest written to ${path}`,
          "",
          chrome,
        ],
      };
    }

    case "copy": {
      const { path, copied } = await state.copySnapshot();
      return {
        handled: true,
        messages: [
          copied
            ? `TUI copied to clipboard (${path})`
            : `TUI snapshot written to ${path}`,
        ],
      };
    }

    case "save": {
      const path = exportSessionToFile(state.session);
      return { handled: true, messages: [`Session exported to ${path}`] };
    }

    case "model":
      return handleModel(args, state);

    case "provider":
      return handleProvider(args, state);

    case "session":
      return handleSession(state);

    case "divinities":
      return handleDivinities(args, state);

    default:
      return {
        handled: true,
        messages: [`Unknown command "/${command}". Type /help for commands.`],
      };
  }
}