/** Keyboard shortcuts — aligned with pi / opencode / codex TUI conventions. */
export interface HotkeyDef {
  keys: string;
  action: string;
  source?: "pi" | "opencode" | "codex" | "blxckchat";
}

export const BLXCKCHAT_HOTKEYS: readonly HotkeyDef[] = [
  { keys: "Ctrl+C / Ctrl+D", action: "Exit BLXCKCHAT", source: "codex" },
  { keys: "Esc", action: "Abort turn · close popup · exit", source: "codex" },
  { keys: "?", action: "Show this hotkeys overlay", source: "codex" },
  { keys: "/", action: "Slash command suggestions", source: "pi" },
  { keys: "Tab", action: "Autocomplete slash · queue while busy", source: "pi" },
  { keys: "↑ / ↓", action: "Input history (in transmit box)", source: "pi" },
  { keys: "Shift+↑↓ / Ctrl+↑↓", action: "Scroll chat history from input", source: "blxckchat" },
  { keys: "PgUp / PgDn", action: "Scroll history by page (Ctrl+B focus)", source: "opencode" },
  { keys: "Home / End", action: "Jump to top / latest message", source: "opencode" },
  { keys: "Ctrl+F", action: "Search messages", source: "opencode" },
  { keys: "Ctrl+G", action: "Open draft in $EDITOR", source: "codex" },
  { keys: "Ctrl+Z", action: "Suspend BLXCKCHAT (fg to resume)", source: "pi" },
  { keys: "Ctrl+Alt+Z", action: "Branch undo (remove last exchange)", source: "pi" },
  { keys: "Ctrl+B", action: "Focus message area (scroll mode)", source: "blxckchat" },
  { keys: "Ctrl+I", action: "Focus input", source: "blxckchat" },
  { keys: "Ctrl+L", action: "List models (/model)", source: "pi" },
  { keys: "Ctrl+P", action: "Next model", source: "pi" },
  { keys: "Shift+Ctrl+P", action: "Previous model", source: "pi" },
  { keys: "Ctrl+T", action: "Toggle all thinking blocks", source: "pi" },
  { keys: "Space", action: "Toggle focused thinking block", source: "blxckchat" },
  { keys: "Ctrl+O", action: "Copy last assistant reply", source: "codex" },
  { keys: "Ctrl+Y", action: "Copy full TUI snapshot", source: "blxckchat" },
  { keys: "Ctrl+S", action: "Export session JSON", source: "opencode" },
  { keys: "Ctrl+N", action: "New session (clear history)", source: "opencode" },
  { keys: "Ctrl+U", action: "Clear input line", source: "codex" },
] as const;

export function formatHotkeysOverlay(): string {
  const lines = ["{bold}BLXCKCHAT keyboard shortcuts{/bold}", ""];
  for (const hk of BLXCKCHAT_HOTKEYS) {
    const pad = hk.keys.padEnd(22);
    const tag = hk.source ? ` {gray-fg}(${hk.source}){/gray-fg}` : "";
    lines.push(`  {cyan-fg}${pad}{/cyan-fg} ${hk.action}${tag}`);
  }
  lines.push("");
  lines.push("{gray-fg}Press ? or Esc to close{/gray-fg}");
  return lines.join("\n");
}