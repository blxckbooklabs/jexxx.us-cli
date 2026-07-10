import { marked, type Token, type Tokens } from "marked";

import { normalizeAgentMarkup, trimPartialClosingFences } from "./markdown-ansi.js";
import { TAG } from "../theme.js";

/** Pink streaming cursor for blessed TUI (ANSI breaks blessed wrap). */
export const BLESSED_STREAM_CURSOR = `${TAG.pink}{bold}▌{/bold}${TAG.pinkEnd}`;

/**
 * Variation Selector-15/16 (U+FE0E/U+FE0F) force text/emoji presentation on
 * the preceding glyph. Blessed's column-width math doesn't account for them,
 * so a base+VS16 pair (🛠️, 🗝️, 📖 followed by VS16, etc.) throws off its
 * internal cell-offset tracking on that terminal row — producing scattered,
 * overlapping characters from adjacent lines on redraw. Stripping the
 * selector keeps the base emoji glyph but restores predictable width.
 */
function stripVariationSelectors(text: string): string {
  return text.replace(/[︎️]/g, "");
}

/** Escape blessed tag delimiters in plain text segments. */
export function escapeBlessed(text: string): string {
  return stripVariationSelectors(text).replace(/[{}]/g, (ch) => (ch === "{" ? "{open}" : "{close}"));
}

/** Short kingdom/garden href for TUI — avoids mid-slug line wraps on long URLs. */
export function formatHrefForDisplay(href: string): string {
  if (href.length <= 56) return href;
  try {
    const u = new URL(href);
    const parts = u.pathname.split("/").filter(Boolean);
    const tail = parts.slice(-2).join("/") || (parts.at(-1) ?? u.hostname);
    return `${u.hostname}/…/${tail}`;
  } catch {
    return `${href.slice(0, 52)}…`;
  }
}

function renderListItem(tokens: Token[]): string {
  const parts: string[] = [];
  for (const token of tokens) {
    if (token.type === "paragraph") {
      parts.push(renderInline((token as Tokens.Paragraph).tokens));
    } else if (token.type === "text") {
      const t = token as Tokens.Text;
      parts.push(t.tokens ? renderInline(t.tokens) : escapeBlessed(t.text));
    } else if (token.type === "list") {
      parts.push(`\n${renderBlock(token).trimEnd()}`);
    } else {
      const block = renderBlock(token).trim();
      if (block) parts.push(block);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function renderInline(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens.map(renderToken).join("");
}

function renderToken(token: Token): string {
  switch (token.type) {
    case "text":
      return escapeBlessed((token as Tokens.Text).text);
    case "strong":
      return `{bold}${renderInline((token as Tokens.Strong).tokens)}{/bold}`;
    case "em":
      return `{underline}${renderInline((token as Tokens.Em).tokens)}{/underline}`;
    case "codespan":
      return `{gray-fg}${escapeBlessed((token as Tokens.Codespan).text)}{/gray-fg}`;
    case "link": {
      const t = token as Tokens.Link;
      const label = renderInline(t.tokens).trim();
      const compact = formatHrefForDisplay(t.href);
      if (label && label !== t.href && /\.jexxx\.us\//i.test(t.href)) {
        return `{underline}${label}{/underline} {gray-fg}(${escapeBlessed(compact)}){/gray-fg}`;
      }
      return `${label} {gray-fg}[${escapeBlessed(compact)}]{/gray-fg}`;
    }
    case "br":
      return "\n";
    default:
      return escapeBlessed("raw" in token ? String((token as { raw: string }).raw) : "");
  }
}

function renderBlock(token: Token): string {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading;
      const tag = t.depth <= 2 ? "bold" : "underline";
      return `{${tag}}${renderInline(t.tokens)}{/${tag}}\n\n`;
    }
    case "paragraph": {
      const t = token as Tokens.Paragraph;
      return `${renderInline(t.tokens)}\n\n`;
    }
    case "code": {
      const t = token as Tokens.Code;
      const bordered = t.text
        .split("\n")
        .map((line) => `│ {gray-fg}${escapeBlessed(line)}{/gray-fg}`)
        .join("\n");
      const width = Math.min(40, Math.max(10, t.text.split("\n")[0]?.length ?? 10));
      return `┌${"─".repeat(width)}┐\n${bordered}\n└${"─".repeat(width)}┘\n\n`;
    }
    case "blockquote": {
      const t = token as Tokens.Blockquote;
      return `{gray-fg}▎ ${renderBlocks(t.tokens).trim()}{/gray-fg}\n\n`;
    }
    case "list": {
      const t = token as Tokens.List;
      return t.items
        .map((item) => {
          const body = renderListItem(item.tokens);
          if (!body) return "";
          return `  {gray-fg}•{/gray-fg} ${body}\n`;
        })
        .join("");
    }
    case "hr":
      return `{gray-fg}${"─".repeat(40)}{/gray-fg}\n\n`;
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
 * Convert markdown to blessed-compatible tagged text (no HTML).
 * Code blocks render in a gray bordered box; links show as `label [url]`.
 *
 * Defensively bounded against pathological input: a broken/looping model
 * turn (free-tier/quantized models are the usual culprit) can emit
 * thousands of nested list levels instead of terminating normally.
 * `marked.lexer()`'s recursive-descent list parser has no depth limit of
 * its own — verified directly: a 5,000-level nested list blows the V8
 * stack/heap before our own renderer even runs. A few hundred levels is
 * enough to hit "Maximum call stack size exceeded" well before any memory
 * limit. There is no legitimate reply that needs anywhere near this much
 * nesting, so this is pure defense against a broken generation, not a
 * feature limit.
 */
const MAX_MARKDOWN_INPUT_CHARS = 200_000;

export function markdownToBlessed(markdown: string): string {
  const normalized = normalizeAgentMarkup(markdown.trim());
  if (!normalized) return "";

  const capped =
    normalized.length > MAX_MARKDOWN_INPUT_CHARS
      ? `${normalized.slice(0, MAX_MARKDOWN_INPUT_CHARS)}\n\n[response truncated — unusually long output]`
      : normalized;

  let body: string;
  try {
    const tokens = marked.lexer(capped, { gfm: true, breaks: true });
    trimPartialClosingFences(tokens);
    body = renderBlocks(tokens).trimEnd();
  } catch {
    // Malformed/pathologically-nested markdown crashed the parser or
    // renderer (RangeError from stack overflow, or anything else) — fall
    // back to plain escaped text rather than losing the whole turn.
    body = escapeBlessed(capped);
  }
  if (!body) return "";

  return body
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join("\n");
}

/** Render a user message — Pi-style compact pill (plain text). */
export function renderUserMessageBoxPlain(text: string): string {
  const inner = text.replace(/\n/g, "\n│ ");
  const width = Math.min(68, Math.max(inner.length + 14, 28));
  const border = "─".repeat(width - 2);
  return [
    `╭─ you ${"─".repeat(Math.max(0, width - 8))}╮`,
    `│ ${inner}`,
    `╰${border}╯`,
    "",
  ].join("\n");
}

/** Render a user message — pink retro TV pill. */
export function renderUserMessageBox(text: string): string {
  const inner = escapeBlessed(text.replace(/\n/g, "\n{#ec4899-fg}│{/} "));
  const width = Math.min(68, Math.max(text.length + 14, 28));
  const topRule = "─".repeat(Math.max(0, width - 8));
  const bottom = "─".repeat(width - 2);
  return [
    `{#ec4899-fg}╭─ {bold}you{/bold} ${topRule}╮{/}`,
    `{#ec4899-fg}│{/} ${inner}`,
    `{#ec4899-fg}╰${bottom}╯{/}`,
    "",
  ].join("\n");
}