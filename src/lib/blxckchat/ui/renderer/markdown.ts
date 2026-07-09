import { marked, type Token, type Tokens } from "marked";

/** Escape blessed tag delimiters in plain text segments. */
export function escapeBlessed(text: string): string {
  return text.replace(/\{/g, "{open}").replace(/@/g, "@");
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
      return `{italic}${renderInline((token as Tokens.Em).tokens)}{/italic}`;
    case "codespan":
      return `{gray-fg}${escapeBlessed((token as Tokens.Codespan).text)}{/gray-fg}`;
    case "link": {
      const t = token as Tokens.Link;
      const label = renderInline(t.tokens);
      return `${label} {gray-fg}[${escapeBlessed(t.href)}]{/gray-fg}`;
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
        .map((item) => `  • ${renderBlocks(item.tokens).trim()}\n`)
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
 */
export function markdownToBlessed(markdown: string): string {
  const tokens = marked.lexer(markdown, { gfm: true, breaks: true });
  return renderBlocks(tokens).trimEnd();
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