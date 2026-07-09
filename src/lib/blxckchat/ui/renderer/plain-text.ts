/** Strip blessed inline tags, restoring {open} escapes. */
export function stripBlessedTags(text: string): string {
  return text.replace(/\{open\}/g, "{").replace(/\{[^}]*\}/g, "");
}

export function buildWelcomeBannerPlain(authEmail: string, toolCount: number): string {
  const email =
    authEmail.length > 18 ? `${authEmail.slice(0, 15)}...` : authEmail || "operator";
  const inner = [
    "  Welcome to the kingdom.",
    "",
    `  You are authenticated as ${email}`,
    `  BLXCKCHAT loaded with ${toolCount} tools.`,
    "",
    "  Type a message to begin, or",
    "  /help for commands.",
  ];
  const width = 42;
  const lines = [
    `╔${"═".repeat(width - 2)}╗`,
    ...inner.map((line) => {
      const padded = line.padEnd(width - 4);
      return `║${padded}║`;
    }),
    `╚${"═".repeat(width - 2)}╝`,
  ];
  return lines.join("\n");
}

export function wrapWelcomeBannerBlessed(plain: string): string {
  return `{#ec4899-fg}${plain}{/}`;
}

export interface TuISnapshotParts {
  width: number;
  topBar: string;
  messages: string;
  statusBar: string;
  input: string;
}

/** Assemble the full TUI as plain, copy-paste-friendly text. */
export function buildTuISnapshot(parts: TuISnapshotParts): string {
  const width = Math.max(40, parts.width);
  const rule = "─".repeat(width);
  return [parts.topBar, rule, parts.messages, rule, parts.statusBar, parts.input]
    .filter((section) => section.length > 0)
    .join("\n");
}