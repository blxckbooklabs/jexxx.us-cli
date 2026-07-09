import chalk from "chalk";
import { marked, type Token, type Tokens } from "marked";

import { THEME } from "../theme.js";

/** Always emit ANSI — TUI and tests need stable styling codes for blessed wrap. */
const c = new chalk.Instance({ level: 3 });

const pink = c.hex(THEME.pink);
const muted = c.hex(THEME.textMuted);
const dim = c.hex(THEME.textDim);
/** Pink streaming cursor (ANSI — blessed wrap counts visible width correctly). */
export const STREAM_CURSOR = pink.bold("▌");

/** Strip ANSI escape sequences for plain-text comparisons. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Models sometimes echo blessed tag syntax. Normalize to markdown before parse.
 */
export function normalizeAgentMarkup(text: string): string {
  return text
    .replace(/\{italic\}/gi, "_")
    .replace(/\{\/italic\}/gi, "_")
    .replace(/\{bold\}/gi, "**")
    .replace(/\{\/bold\}/gi, "**")
    .replace(/\{underline\}/gi, "")
    .replace(/\{\/underline\}/gi, "")
    .replace(/\{#[0-9a-fA-F]{3,8}-fg\}/g, "")
    .replace(/\{gray-fg\}/gi, "")
    .replace(/\{\/\}/g, "");
}

/** Pi-style: trim partial closing fences so streamed code blocks do not flicker. */
export function trimPartialClosingFences(tokens: readonly Token[]): void {
  const token = tokens[tokens.length - 1];
  if (!token) return;

  if (token.type === "list") {
    const items = (token as Tokens.List).items;
    trimPartialClosingFences(items[items.length - 1]?.tokens ?? []);
    return;
  }
  if (token.type === "blockquote") {
    trimPartialClosingFences((token as Tokens.Blockquote).tokens ?? []);
    return;
  }
  if (token.type !== "code") return;

  const code = token as Tokens.Code;
  const marker = /^(`{3,}|~{3,})/.exec(code.raw)?.[1];
  const lastLine = code.raw.split("\n").pop();
  if (!marker || !lastLine || lastLine.length >= marker.length) return;
  if (lastLine !== marker[0]?.repeat(lastLine.length)) return;

  code.text = code.text.slice(0, -lastLine.length).replace(/\n$/, "");
}

function renderInline(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens.map(renderToken).join("");
}

function renderToken(token: Token): string {
  switch (token.type) {
    case "text":
      return (token as Tokens.Text).text;
    case "strong":
      return c.bold(renderInline((token as Tokens.Strong).tokens));
    case "em":
      return c.italic(renderInline((token as Tokens.Em).tokens));
    case "codespan":
      return muted((token as Tokens.Codespan).text);
    case "link": {
      const t = token as Tokens.Link;
      const label = renderInline(t.tokens);
      return `${label} ${dim(`[${t.href}]`)}`;
    }
    case "br":
      return "\n";
    default:
      return "raw" in token ? String((token as { raw: string }).raw) : "";
  }
}

function renderListItem(tokens: Token[]): string {
  const parts: string[] = [];
  for (const token of tokens) {
    if (token.type === "paragraph") {
      parts.push(renderInline((token as Tokens.Paragraph).tokens));
    } else if (token.type === "text") {
      const t = token as Tokens.Text;
      parts.push(t.tokens ? renderInline(t.tokens) : t.text);
    } else if (token.type === "list") {
      parts.push(`\n${renderBlock(token).trimEnd()}`);
    } else {
      const block = renderBlock(token).trim();
      if (block) parts.push(block);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function renderBlock(token: Token): string {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading;
      const body = renderInline(t.tokens);
      return t.depth <= 2 ? `${c.bold(body)}\n\n` : `${c.bold.underline(body)}\n\n`;
    }
    case "paragraph": {
      const t = token as Tokens.Paragraph;
      return `${renderInline(t.tokens)}\n\n`;
    }
    case "code": {
      const t = token as Tokens.Code;
      const lines = t.text.split("\n");
      const width = Math.min(56, Math.max(10, lines[0]?.length ?? 10));
      const top = dim(`┌${"─".repeat(width)}┐`);
      const body = lines.map((line) => dim(`│ ${line}`)).join("\n");
      const bottom = dim(`└${"─".repeat(width)}┘`);
      return `${top}\n${body}\n${bottom}\n\n`;
    }
    case "blockquote": {
      const t = token as Tokens.Blockquote;
      const inner = renderBlocks(t.tokens).trim().replace(/\n/g, "\n  ");
      return `${dim("▎")} ${muted(inner)}\n\n`;
    }
    case "list": {
      const t = token as Tokens.List;
      return t.items
        .map((item) => {
          const body = renderListItem(item.tokens);
          if (!body) return "";
          return `  ${muted("•")} ${body}\n`;
        })
        .join("");
    }
    case "hr":
      return `${dim("─".repeat(40))}\n\n`;
    case "space":
      return "\n";
    default:
      return "";
  }
}

function renderBlocks(tokens: Token[]): string {
  return tokens.map(renderBlock).join("");
}

/**
 * Convert markdown to ANSI-styled terminal text (Pi / OpenCode pattern).
 * Blessed's built-in wrap skips ANSI codes for width — prose stays readable.
 */
export function markdownToAnsi(markdown: string): string {
  const normalized = normalizeAgentMarkup(markdown.trim());
  if (!normalized) return "";

  const tokens = marked.lexer(normalized, { gfm: true, breaks: true });
  trimPartialClosingFences(tokens);
  const body = renderBlocks(tokens).trimEnd();
  if (!body) return "";

  return body
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join("\n");
}