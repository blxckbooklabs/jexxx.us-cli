export interface SlashCommandDef {
  name: string;
  aliases?: string[];
  description: string;
  argumentHint?: string;
}

export const BUILTIN_SLASH_COMMANDS: readonly SlashCommandDef[] = [
  { name: "help", aliases: ["?"], description: "Show slash commands and shortcuts" },
  { name: "model", aliases: ["models", "mo"], description: "List or switch model", argumentHint: "<provider/model>" },
  { name: "provider", aliases: ["providers"], description: "List or switch provider config", argumentHint: "<name>" },
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
  lines.push("Type / to see suggestions · Tab to autocomplete · ↑↓ to browse");
  return lines.join("\n");
}