import blessed from "blessed";

import type { ThinkingBlock } from "../session/session-store.js";
import {
  extractThinkingBlocks,
  formatThinkingBlock,
  formatThinkingBlockPlain,
} from "./thinking-block.js";
import { markdownToBlessed } from "../renderer/markdown.js";
import { escapeBlessed } from "../renderer/markdown.js";
import { renderUserMessageBox, renderUserMessageBoxPlain } from "../renderer/markdown.js";
import { formatToolResults, formatToolResultsPlain } from "./tool-box.js";
import type { ToolResult, TerminalSession } from "../session/session-store.js";
import { framePanel, wrapWelcomeBannerBlessed } from "../renderer/plain-text.js";
import { isBlessedMouseEnabled } from "../tty.js";
import { TAG, THEME } from "../theme.js";
import { centerHeroVertically } from "./jexxxus-hero.js";

function highlightSearch(text: string, query: string): string {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return `${before}{yellow-fg}{bold}${match}{/bold}{/yellow-fg}${after}`;
}

export interface MessageBlock {
  type: "hero" | "welcome" | "user" | "assistant" | "tool" | "error" | "system";
  content: string;
  /** Blessed-rendered hero (standstill logo). */
  blessedContent?: string;
  thinkingBlocks?: ThinkingBlock[];
  assistantRaw?: string;
  toolEntries?: ToolResult[];
}

export interface ScrollState {
  pinnedToBottom: boolean;
  /** 0 = top, 100 = bottom */
  percent: number;
}

export interface MessageBoxHandle {
  element: blessed.Widgets.BoxElement;
  showHero: (plain: string, blessed: string) => void;
  dismissHero: () => boolean;
  hasHero: () => boolean;
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
  getScrollState: () => ScrollState;
  isPinnedToBottom: () => boolean;
  getThinkingBlocks: () => ThinkingBlock[];
  toggleFocusedThinking: () => void;
  toggleAllThinking: () => void;
  getLastAssistantPlainText: () => string | null;
  getPlainText: () => string;
  popLastExchange: () => void;
  cancelInFlightAssistant: () => void;
  setSearchQuery: (query: string) => void;
  replaySession: (session: TerminalSession) => void;
  clearChat: () => void;
  rebuild: () => void;
}

export interface MessageBoxOptions {
  onUpdate?: () => void;
  onScrollChange?: (state: ScrollState) => void;
}

const SCROLL_PIN_THRESHOLD = 3;

export function createMessageBox(
  screen: blessed.Widgets.Screen,
  options: MessageBoxOptions = {},
): MessageBoxHandle {
  const blocks: MessageBlock[] = [];
  let focusedThinkingIndex: number | null = null;
  let searchQuery = "";
  let pinnedToBottom = true;

  const box = blessed.box({
    parent: screen,
    top: 2,
    left: 1,
    width: "100%-2",
    bottom: 4,
    tags: true,
    scrollable: true,
    alwaysScroll: false,
    scrollbar: {
      ch: "▌",
      style: { bg: THEME.pink },
    },
    keys: true,
    mouse: isBlessedMouseEnabled(),
    vi: false,
    style: {
      fg: THEME.text,
      bg: THEME.bgInset,
    },
    padding: { left: 1, right: 1, top: 0, bottom: 1 },
  });

  const computeScrollPercent = (): number => {
    const { scroll, height, content } = getScrollMetrics();
    const maxScroll = Math.max(0, content - height);
    if (maxScroll <= 0) return 100;
    return Math.round(Math.min(100, Math.max(0, (scroll / maxScroll) * 100)));
  };

  const isNearBottom = (): boolean => {
    const { scroll, height, content } = getScrollMetrics();
    return scroll + height >= content - SCROLL_PIN_THRESHOLD;
  };

  const emitScrollChange = (): void => {
    options.onScrollChange?.({
      pinnedToBottom: pinnedToBottom && isNearBottom(),
      percent: computeScrollPercent(),
    });
  };

  const applyScrollAfterContent = (savedScroll: number): void => {
    if (pinnedToBottom || isNearBottom()) {
      box.setScrollPerc(100);
      pinnedToBottom = true;
    } else {
      box.setScroll(savedScroll);
      pinnedToBottom = false;
    }
    screen.render();
    emitScrollChange();
  };

  const allThinkingBlocks = (): ThinkingBlock[] =>
    blocks.flatMap((b) => b.thinkingBlocks ?? []);

  const renderBlessedContent = (): string => {
    const parts: string[] = [];
    let thinkIdx = 0;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block) continue;
      if (i > 0 && (block.type === "user" || block.type === "welcome")) {
        parts.push(`${TAG.dim}${"·".repeat(12)}${TAG.dimEnd}\n`);
      }
      switch (block.type) {
        case "hero": {
          const body = block.blessedContent ?? block.content;
          const onlyHero = blocks.length === 1;
          const viewH = Math.max(12, ((box.height as number) || 20) - 2);
          parts.push(onlyHero ? centerHeroVertically(body, viewH) : body);
          break;
        }
        case "welcome":
          parts.push(wrapWelcomeBannerBlessed(block.content));
          break;
        case "user":
          parts.push(renderUserMessageBox(block.content));
          break;
        case "assistant": {
          parts.push(
            `${TAG.dim}╭─{/} ${TAG.cyan}blxckchat${TAG.cyanEnd} ${TAG.dim}${"─".repeat(18)}{/}`,
          );
          if (block.thinkingBlocks) {
            for (const tb of block.thinkingBlocks) {
              const marker =
                thinkIdx === focusedThinkingIndex ? `${TAG.pink}▸ ${TAG.pinkEnd}` : "  ";
              parts.push(marker + formatThinkingBlock(tb));
              thinkIdx++;
            }
          }
          parts.push(block.content);
          parts.push(`${TAG.dim}╰${"─".repeat(24)}{/}\n`);
          break;
        }
        case "tool":
          parts.push(block.content);
          break;
        case "error":
          parts.push(
            `${highlightSearch(`${TAG.pink}⚡ ${TAG.pinkEnd}{#f87171-fg}${escapeBlessed(block.content)}{/}`, searchQuery)}\n`,
          );
          break;
        case "system":
          parts.push(
            `${highlightSearch(`${TAG.dim}┌ ${TAG.dimEnd}${TAG.muted}${escapeBlessed(block.content)}${TAG.mutedEnd}${TAG.dim} ┐${TAG.dimEnd}`, searchQuery)}\n`,
          );
          break;
      }
    }
    return parts.join("\n");
  };

  const getScrollMetrics = (): { scroll: number; height: number; content: number } => {
    const scroll = box.getScroll() ?? 0;
    const height = Math.max(1, (box.height as number) || 1);
    const contentLines = Math.max(height, renderBlessedContent().split("\n").length);
    return { scroll, height, content: contentLines };
  };

  const renderPlainContent = (): string => {
    const parts: string[] = [];

    for (const block of blocks) {
      switch (block.type) {
        case "hero":
          parts.push(block.content);
          break;
        case "welcome":
          parts.push(block.content);
          break;
        case "user":
          parts.push(renderUserMessageBoxPlain(block.content));
          break;
        case "assistant": {
          parts.push("blxckchat:");
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

  const refreshContent = (forceBottom = false): void => {
    const savedScroll = box.getScroll() ?? 0;
    box.setContent(renderBlessedContent());
    if (forceBottom) {
      pinnedToBottom = true;
      box.setScrollPerc(100);
    } else {
      applyScrollAfterContent(savedScroll);
    }
    notify();
  };

  const rebuild = (): void => {
    refreshContent(false);
  };

  const markScrolled = (): void => {
    pinnedToBottom = isNearBottom();
    emitScrollChange();
  };

  const isScrollbarColumn = (data: { x: number }): boolean => {
    const left = box.aleft as number;
    const width = box.width as number;
    const iright = (box as { iright?: number }).iright ?? 1;
    const x = data.x - left;
    return x >= width - iright - 1;
  };

  box.on("mousedown", (data: { x: number; y: number }) => {
    if (isScrollbarColumn(data)) {
      pinnedToBottom = false;
    } else {
      box.focus();
    }
    setImmediate(() => {
      markScrolled();
      screen.render();
    });
  });

  box.on("wheeldown", () => {
    box.scroll(3);
    pinnedToBottom = false;
    screen.render();
    markScrolled();
  });

  box.on("wheelup", () => {
    box.scroll(-3);
    pinnedToBottom = isNearBottom();
    screen.render();
    markScrolled();
  });

  const scrollBy = (delta: number): void => {
    box.scroll(delta);
    pinnedToBottom = isNearBottom();
    screen.render();
    markScrolled();
  };

  const dismissHero = (): boolean => {
    const idx = blocks.findIndex((b) => b.type === "hero");
    if (idx < 0) return false;
    blocks.splice(idx, 1);
    return true;
  };

  return {
    element: box,
    showHero(plain: string, blessed: string) {
      blocks.push({ type: "hero", content: plain, blessedContent: blessed });
      pinnedToBottom = true;
      rebuild();
    },
    dismissHero,
    hasHero() {
      return blocks.some((b) => b.type === "hero");
    },
    appendWelcome(plainContent: string) {
      blocks.push({ type: "welcome", content: plainContent });
      rebuild();
    },
    appendUser(text: string) {
      dismissHero();
      blocks.push({ type: "user", content: text });
      refreshContent(true);
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
        const savedScroll = box.getScroll() ?? 0;
        box.setContent(renderBlessedContent());
        if (pinnedToBottom) {
          box.setScrollPerc(100);
        } else {
          box.setScroll(savedScroll);
        }
        screen.render();
        emitScrollChange();
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
      scrollBy(-3);
    },
    scrollDown() {
      scrollBy(3);
    },
    scrollPageUp() {
      const page = Math.max(5, ((box.height as number) || 12) - 2);
      scrollBy(-page);
    },
    scrollPageDown() {
      const page = Math.max(5, ((box.height as number) || 12) - 2);
      scrollBy(page);
    },
    scrollToTop() {
      box.setScroll(0);
      pinnedToBottom = false;
      screen.render();
      emitScrollChange();
    },
    scrollToBottom() {
      box.setScrollPerc(100);
      pinnedToBottom = true;
      screen.render();
      emitScrollChange();
    },
    getScrollState(): ScrollState {
      return {
        pinnedToBottom: pinnedToBottom && isNearBottom(),
        percent: computeScrollPercent(),
      };
    },
    isPinnedToBottom() {
      return pinnedToBottom && isNearBottom();
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
      const content = renderPlainContent();
      if (!content.trim()) {
        return framePanel("", Math.max(40, (screen.width as number) || 80));
      }
      return framePanel(content, Math.max(40, (screen.width as number) || 80));
    },
    popLastExchange() {
      while (blocks.length > 0) {
        const last = blocks[blocks.length - 1];
        if (!last) break;
        blocks.pop();
        if (last.type === "user") break;
      }
      rebuild();
    },
    cancelInFlightAssistant() {
      if (blocks[blocks.length - 1]?.type === "assistant") {
        blocks.pop();
        rebuild();
      }
    },
    setSearchQuery(query: string) {
      searchQuery = query;
      rebuild();
    },
    clearChat() {
      blocks.length = 0;
      focusedThinkingIndex = null;
      searchQuery = "";
      pinnedToBottom = true;
      rebuild();
    },
    replaySession(session: TerminalSession) {
      blocks.length = 0;
      focusedThinkingIndex = null;
      for (const m of session.messages) {
        if (m.role === "user") {
          blocks.push({ type: "user", content: m.content });
        } else if (m.role === "assistant") {
          const parsed = extractThinkingBlocks(m.content);
          blocks.push({
            type: "assistant",
            content: markdownToBlessed(parsed.visibleContent || m.content),
            assistantRaw: parsed.visibleContent || m.content,
            thinkingBlocks: parsed.blocks,
          });
        }
      }
      for (const t of session.toolResults) {
        blocks.push({
          type: "tool",
          content: formatToolResults([t]),
          toolEntries: [t],
        });
      }
      refreshContent(true);
    },
    rebuild,
  };
}