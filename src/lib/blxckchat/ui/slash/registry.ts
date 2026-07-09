export interface SlashCommandDef {
  name: string;
  aliases?: string[];
  description: string;
  argumentHint?: string;
}

export const BUILTIN_SLASH_COMMANDS: readonly SlashCommandDef[] = [
  { name: "help", aliases: ["?"], description: "Show slash commands and shortcuts" },
  {
    name: "connect",
    aliases: ["login", "providers"],
    description: "Add provider & API key (BYOK) — browse catalog",
    argumentHint: "<provider-id>",
  },
  { name: "model", aliases: ["models", "mo"], description: "Open model picker or switch model", argumentHint: "<provider/model>" },
  {
    name: "provider",
    description: "Switch saved profile (use /connect to add providers)",
    argumentHint: "<name>",
  },
  { name: "session", aliases: ["status"], description: "Show session stats and active provider" },
  { name: "copy", description: "Copy full TUI snapshot to clipboard" },
  { name: "save", aliases: ["export"], description: "Export session to JSON" },
  { name: "reset", aliases: ["clear", "new"], description: "Clear conversation history" },
  { name: "exit", aliases: ["quit", "q"], description: "Exit BLXCKCHAT" },
] as const;

const ALIAS_MAP = new Map<string, string>();
for (const cmd of BUILTIN_SLASH_COMMANDS) {
  ALIAS_MAP.set(cmd.name, cmd.name);
  for (const alias of cmd.aliases ?? []) {
    ALIAS_MAP.set(alias, cmd.name);
  }
}

export function resolveSlashCommandName(token: string): string | null {
  const normalized = token.toLowerCase().replace(/^\//, "");
  return ALIAS_MAP.get(normalized) ?? null;
}

/** True when the typed token is an exact command name or alias (e.g. "providers" → connect). */
export function resolveExactCommandToken(token: string): string | null {
  const normalized = token.toLowerCase().replace(/^\//, "").trim();
  if (!normalized) return null;
  for (const cmd of BUILTIN_SLASH_COMMANDS) {
    if (cmd.name === normalized) return cmd.name;
    for (const alias of cmd.aliases ?? []) {
      if (alias === normalized) return cmd.name;
    }
  }
  return null;
}

export function getSlashCommand(name: string): SlashCommandDef | undefined {
  const resolved = resolveSlashCommandName(name);
  return BUILTIN_SLASH_COMMANDS.find((c) => c.name === resolved);
}

export function formatSlashHelp(): string {
  const lines = ["Slash commands:"];
  for (const cmd of BUILTIN_SLASH_COMMANDS) {
    const aliases =
      cmd.aliases && cmd.aliases.length > 0
        ? ` (/${cmd.aliases.join(", /")})`
        : "";
    const hint = cmd.argumentHint ? ` ${cmd.argumentHint}` : "";
    lines.push(`  /${cmd.name}${hint}${aliases} — ${cmd.description}`);
  }
  lines.push("");
  lines.push("/connect (or /providers) — add API keys · /provider — switch saved profile");
  lines.push("Type / to see suggestions · Tab/Enter to accept · ↑↓ to browse");
  lines.push("? for full hotkeys · Ctrl+C/D exit · Esc closes popups");
  return lines.join("\n");
}