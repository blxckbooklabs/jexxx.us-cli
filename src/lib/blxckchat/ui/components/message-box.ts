import blessed from "blessed";

import type { ThinkingBlock } from "../session/session-store.js";
import { formatThinkingBlock, formatThinkingBlockPlain } from "./thinking-block.js";
import { markdownToBlessed } from "../renderer/markdown.js";
import { renderUserMessageBox, renderUserMessageBoxPlain } from "../renderer/markdown.js";
import { formatToolResults, formatToolResultsPlain } from "./tool-box.js";
import type { ToolResult } from "../session/session-store.js";
import { wrapWelcomeBannerBlessed } from "../renderer/plain-text.js";

export interface MessageBlock {
  type: "welcome" | "user" | "assistant" | "tool" | "error" | "system";
  content: string;
  thinkingBlocks?: ThinkingBlock[];
  /** Raw assistant text for plain-text snapshot (pre-markdown). */
  assistantRaw?: string;
  toolEntries?: ToolResult[];
}

export interface MessageBoxHandle {
  element: blessed.Widgets.BoxElement;
  appendWelcome: (plainContent: string) => void;
  appendUser: (text: string) => void;
  appendAssistantStart: () => number;
  updateAssistantStream: (blockIndex: number, partial: string, rawPlain?: string) => void;
  finalizeAssistant: (
    blockIndex: number,
    content: string,
    thinkingBlocks: ThinkingBlock[],
  ) => void;
  appendTools: (tools: ToolResult[]) => void;
  appendError: (message: string) => void;
  appendSystem: (message: string) => void;
  scrollUp: () => void;
  scrollDown: () => void;
  scrollPageUp: () => void;
  scrollPageDown: () => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  getThinkingBlocks: () => ThinkingBlock[];
  toggleFocusedThinking: () => void;
  toggleAllThinking: () => void;
  getLastAssistantPlainText: () => string | null;
  getPlainText: () => string;
  rebuild: () => void;
}

export interface MessageBoxOptions {
  onUpdate?: () => void;
}

export function createMessageBox(
  screen: blessed.Widgets.Screen,
  options: MessageBoxOptions = {},
): MessageBoxHandle {
  const blocks: MessageBlock[] = [];
  let focusedThinkingIndex: number | null = null;

  const box = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: "100%",
    bottom: 3,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: " ",
      style: { bg: "#ec4899" },
    },
    keys: true,
    mouse: true,
    vi: true,
    style: {
      fg: "white",
      bg: "#0d0d0d",
    },
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
  });

  const allThinkingBlocks = (): ThinkingBlock[] =>
    blocks.flatMap((b) => b.thinkingBlocks ?? []);

  const renderBlessedContent = (): string => {
    const parts: string[] = [];
    let thinkIdx = 0;

    for (const block of blocks) {
      switch (block.type) {
        case "welcome":
          parts.push(wrapWelcomeBannerBlessed(block.content));
          break;
        case "user":
          parts.push(renderUserMessageBox(block.content));
          break;
        case "assistant": {
          parts.push("{bold}Assistant:{/bold}\n");
          if (block.thinkingBlocks) {
            for (const tb of block.thinkingBlocks) {
              const marker =
                thinkIdx === focusedThinkingIndex ? "{#ec4899-fg}▸{/} " : "";
              parts.push(marker + formatThinkingBlock(tb));
              thinkIdx++;
            }
          }
          parts.push(block.content);
          parts.push("\n");
          break;
        }
        case "tool":
          parts.push(block.content);
          break;
        case "error":
          parts.push(`{red-fg}${block.content}{/red-fg}\n`);
          break;
        case "system":
          parts.push(`{gray-fg}${block.content}{/gray-fg}\n`);
          break;
      }
    }
    return parts.join("\n");
  };

  const renderPlainContent = (): string => {
    const parts: string[] = [];

    for (const block of blocks) {
      switch (block.type) {
        case "welcome":
          parts.push(block.content);
          break;
        case "user":
          parts.push(renderUserMessageBoxPlain(block.content));
          break;
        case "assistant": {
          parts.push("Assistant:");
          if (block.thinkingBlocks) {
            for (const tb of block.thinkingBlocks) {
              parts.push(formatThinkingBlockPlain(tb));
            }
          }
          parts.push(block.assistantRaw ?? block.content);
          parts.push("");
          break;
        }
        case "tool":
          if (block.toolEntries) {
            parts.push(formatToolResultsPlain(block.toolEntries));
          } else {
            parts.push(block.content);
          }
          break;
        case "error":
          parts.push(block.content);
          break;
        case "system":
          parts.push(block.content);
          break;
      }
    }
    return parts.join("\n");
  };

  const notify = (): void => {
    options.onUpdate?.();
  };

  const rebuild = (): void => {
    box.setContent(renderBlessedContent());
    box.setScrollPerc(100);
    screen.render();
    notify();
  };

  return {
    element: box,
    appendWelcome(plainContent: string) {
      blocks.push({ type: "welcome", content: plainContent });
      rebuild();
    },
    appendUser(text: string) {
      blocks.push({ type: "user", content: text });
      rebuild();
    },
    appendAssistantStart() {
      blocks.push({ type: "assistant", content: "", assistantRaw: "", thinkingBlocks: [] });
      return blocks.length - 1;
    },
    updateAssistantStream(blockIndex: number, partial: string, rawPlain?: string) {
      const block = blocks[blockIndex];
      if (block?.type === "assistant") {
        block.content = partial;
        block.assistantRaw = rawPlain ?? partial;
        box.setContent(renderBlessedContent());
        box.setScrollPerc(100);
        screen.render();
        notify();
      }
    },
    finalizeAssistant(blockIndex: number, content: string, thinkingBlocks: ThinkingBlock[]) {
      const block = blocks[blockIndex];
      if (block?.type === "assistant") {
        block.assistantRaw = content;
        block.content = markdownToBlessed(content);
        block.thinkingBlocks = thinkingBlocks;
        rebuild();
      }
    },
    appendTools(tools: ToolResult[]) {
      if (tools.length === 0) return;
      blocks.push({
        type: "tool",
        content: formatToolResults(tools),
        toolEntries: tools,
      });
      rebuild();
    },
    appendError(message: string) {
      blocks.push({ type: "error", content: message });
      rebuild();
    },
    appendSystem(message: string) {
      blocks.push({ type: "system", content: message });
      rebuild();
    },
    scrollUp() {
      box.scroll(-3);
      screen.render();
    },
    scrollDown() {
      box.scroll(3);
      screen.render();
    },
    scrollPageUp() {
      const page = Math.max(5, ((box.height as number) || 12) - 2);
      box.scroll(-page);
      screen.render();
    },
    scrollPageDown() {
      const page = Math.max(5, ((box.height as number) || 12) - 2);
      box.scroll(page);
      screen.render();
    },
    scrollToTop() {
      box.setScroll(0);
      screen.render();
    },
    scrollToBottom() {
      box.setScrollPerc(100);
      screen.render();
    },
    getThinkingBlocks() {
      return allThinkingBlocks();
    },
    toggleFocusedThinking() {
      const tbs = allThinkingBlocks();
      if (tbs.length === 0) return;
      if (focusedThinkingIndex === null) {
        focusedThinkingIndex = 0;
      } else {
        const tb = tbs[focusedThinkingIndex];
        if (tb) {
          tb.collapsed = !tb.collapsed;
        }
      }
      rebuild();
    },
    toggleAllThinking() {
      const tbs = allThinkingBlocks();
      if (tbs.length === 0) return;
      const anyExpanded = tbs.some((tb) => !tb.collapsed);
      for (const tb of tbs) {
        tb.collapsed = anyExpanded;
      }
      rebuild();
    },
    getLastAssistantPlainText() {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        if (block?.type === "assistant") {
          return block.assistantRaw ?? block.content;
        }
      }
      return null;
    },
    getPlainText() {
      return renderPlainContent();
    },
    rebuild,
  };
}