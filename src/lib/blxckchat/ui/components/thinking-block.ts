import { randomUUID } from "node:crypto";

import type { ThinkingBlock } from "../session/session-store.js";
import { escapeBlessed } from "../renderer/markdown.js";

const THINKING_PATTERNS: RegExp[] = [
  /<think>([\s\S]*?)<\/think>/gi,
  /\[thinking\]([\s\S]*?)\[\/thinking\]/gi,
  /```thinking\n([\s\S]*?)```/gi,
];

export interface ParsedThinking {
  visibleContent: string;
  blocks: ThinkingBlock[];
}

/** Extract thinking sections from assistant content. */
export function extractThinkingBlocks(content: string): ParsedThinking {
  const blocks: ThinkingBlock[] = [];
  let visible = content;

  for (const pattern of THINKING_PATTERNS) {
    visible = visible.replace(pattern, (_match, inner: string) => {
      blocks.push({
        id: randomUUID(),
        content: inner.trim(),
        collapsed: true,
      });
      return "";
    });
  }

  return {
    visibleContent: visible.trim(),
    blocks,
  };
}

export function formatThinkingBlockPlain(block: ThinkingBlock): string {
  const indicator = block.collapsed ? "▶" : "▼";
  const label = `[${indicator} Thinking]`;
  if (block.collapsed) {
    const preview =
      block.content.length > 80
        ? `${block.content.slice(0, 77)}…`
        : block.content;
    return `${label} (${block.content.length} chars) ${preview}\n`;
  }
  const body = block.content
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `${label}\n${body}\n`;
}

export function formatThinkingBlock(block: ThinkingBlock): string {
  const indicator = block.collapsed ? "▶" : "▼";
  const label = `{gray-fg}[${indicator} Thinking]{/gray-fg}`;
  if (block.collapsed) {
    const preview =
      block.content.length > 80
        ? `${block.content.slice(0, 77)}…`
        : block.content;
    return `${label} {gray-fg}(${block.content.length} chars) ${escapeBlessed(preview)}{/gray-fg}\n`;
  }
  const body = block.content
    .split("\n")
    .map((line) => `  {gray-fg}${escapeBlessed(line)}{/gray-fg}`)
    .join("\n");
  return `${label}\n${body}\n`;
}

export function toggleThinkingBlock(block: ThinkingBlock): void {
  block.collapsed = !block.collapsed;
}