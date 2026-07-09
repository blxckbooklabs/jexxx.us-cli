import { glitchNoise } from "../theme.js";

/** Strip blessed inline tags, restoring {open} escapes. */
export function stripBlessedTags(text: string): string {
  return text.replace(/\{open\}/g, "{").replace(/\{[^}]*\}/g, "");
}

/** Compact welcome card shown after the JEXXXUS splash animation. */
export function buildWelcomeBannerPlain(authEmail: string, toolCount: number): string {
  const email =
    authEmail.length > 28 ? `${authEmail.slice(0, 25)}…` : authEmail || "operator";
  const width = 44;
  const innerW = width - 2;
  const inner = [
    "  Kingdom feed online",
    "",
    `  ${email}  ·  ${toolCount} tools`,
    "",
    "  › message below  ·  /help  ·  ? hotkeys",
    `  ${glitchNoise(innerW - 2, 5)}`,
  ];
  const lines = [
    `╭${"─".repeat(innerW)}╮`,
    ...inner.map((line) => {
      const padded = line.padEnd(innerW);
      return `│${padded}│`;
    }),
    `╰${"─".repeat(innerW)}╯`,
  ];
  return lines.join("\n");
}

export function wrapWelcomeBannerBlessed(plain: string): string {
  return `{#ec4899-fg}${plain.replace(/\n/g, "{/}\n{#ec4899-fg}")}{/}`;
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