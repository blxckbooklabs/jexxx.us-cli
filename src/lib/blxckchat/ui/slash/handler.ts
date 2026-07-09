import {
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
  formatSlashHelp,
  resolveSlashCommandName,
} from "./registry.js";

export interface SlashHandlerState {
  session: TerminalSession;
  activeConfig: StoredProviderConfig;
  toolCount: number;
  setActiveConfig: (config: StoredProviderConfig, provider: Provider) => void;
  copySnapshot: () => Promise<{ path: string; copied: boolean }>;
  openModelPicker?: () => void | Promise<void>;
  openConnect?: (catalogId?: string) => void | Promise<void>;
  openProviderPicker?: () => void | Promise<void>;
}

export interface SlashResult {
  handled: boolean;
  messages: string[];
  exit?: boolean;
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
      return { handled: true, messages: [] };
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

function handleProvider(args: string, state: SlashHandlerState): SlashResult {
  const providers = listProvidersRedacted();
  const lines: string[] = [];

  if (!args) {
    if (state.openProviderPicker) {
      state.openProviderPicker();
      return { handled: true, messages: [] };
    }
    lines.push("Saved profiles (use /provider <name>). Add new: /connect or /providers");
    for (const p of providers) {
      const active = p.name === state.activeConfig.name ? "▸ " : "  ";
      const def = p.isDefault ? " (default)" : "";
      lines.push(`${active}${p.name}: ${p.provider}/${p.model}${def}`);
    }
    return { handled: true, messages: lines };
  }

  const resolved = findProviderConfig(args);
  if (!resolved) {
    return {
      handled: true,
      messages: [`Unknown provider config "${args}". Use /provider to list.`],
    };
  }

  const provider = resolveProvider(resolved);
  state.setActiveConfig(resolved, provider);
  lines.push(
    `Switched to provider "${resolved.name}" (${resolved.provider}/${resolved.model})`,
  );
  return { handled: true, messages: lines };
}

async function handleConnect(
  args: string,
  state: SlashHandlerState,
): Promise<SlashResult> {
  if (!args) {
    if (state.openConnect) {
      await state.openConnect();
      return { handled: true, messages: [] };
    }
    const lines = [
      "Add an inference provider (BYOK) — same as OpenCode /connect:",
      "  /connect or /providers  — open catalog picker + API key flow",
      "  /connect <id>           — quick-connect one provider",
      "",
      "Not the same as /provider (switch saved profiles only).",
      "",
      "Catalog: opencode-zen, anthropic, openai, google, openrouter, ollama,",
      "  ollama-cloud, llamacpp, groq, deepseek, mistral, xai, …",
    ];
    return { handled: true, messages: lines };
  }

  const catalogId = args.trim().toLowerCase();
  const entry = getCatalogEntry(catalogId);
  if (!entry) {
    return {
      handled: true,
      messages: [`Unknown provider "${args}". Use /connect to browse the catalog.`],
    };
  }

  if (state.openConnect) {
    await state.openConnect(catalogId);
    return { handled: true, messages: [] };
  }

  return {
    handled: true,
    messages: [
      `Provider "${entry.label}" requires TUI connect flow.`,
      "Run BLXCKCHAT interactively and use /connect.",
    ],
  };
}

function handleSession(state: SlashHandlerState): SlashResult {
  const { session, activeConfig, toolCount } = state;
  return {
    handled: true,
    messages: [
      `Provider: ${activeConfig.name} (${activeConfig.provider}/${activeConfig.model})`,
      `Messages: ${session.messages.length}`,
      `Tool results: ${session.toolResults.length}`,
      `History turns: ${session.conversationHistory.length}`,
      `Tools loaded: ${toolCount}`,
    ],
  };
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

    case "connect":
      return handleConnect(args, state);

    case "model":
      return handleModel(args, state);

    case "provider":
      return handleProvider(args, state);

    case "session":
      return handleSession(state);

    default:
      return {
        handled: true,
        messages: [`Unknown command "/${command}". Type /help for commands.`],
      };
  }
}