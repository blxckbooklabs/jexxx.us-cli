import { randomUUID } from "node:crypto";
import type {
  MessageBlock,
  ScrollState,
  ToastState,
  ConfirmDialogState,
  JexxxusHeroMeta,
} from "./dye-types.js";
import type {
  ThinkingBlock,
  ToolResult,
  TerminalSession,
} from "../session/session-store.js";
import { extractThinkingBlocks } from "../components/thinking-block.js";
import { markdownToBlessed } from "../renderer/markdown.js";
import { renderUserMessageBox } from "../renderer/markdown.js";

type Listener = () => void;

export class MessageStore {
  private listeners = new Set<Listener>();
  blocks: MessageBlock[] = [];
  searchQuery = "";
  pinnedToBottom = true;
  statusMessage = "? hotkeys · / commands · esc abort";
  subtitle = "Welcome to the kingdom.";
  inputValue = "";
  isProcessing = false;
  focusedThinkingIndex: number | null = null;
  glitchSeed = 0;
  toast: ToastState | null = null;
  confirmDialog: ConfirmDialogState | null = null;
  searchVisible = false;
  hotkeysVisible = false;
  heroMeta: JexxxusHeroMeta | null = null;
  scrollOffset = 0;
  private _version = 0;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  notify(): void {
    this._version++;
    for (const l of this.listeners) l();
  }

  getSnapshot(): number {
    return this._version;
  }

  // --- Message box API ---

  showHero(plain: string, meta?: JexxxusHeroMeta): void {
    this.blocks.push({ type: "hero", content: plain });
    if (meta) this.heroMeta = meta;
    this.pinnedToBottom = true;
    this.notify();
  }

  dismissHero(): boolean {
    const idx = this.blocks.findIndex((b) => b.type === "hero");
    if (idx < 0) return false;
    this.blocks.splice(idx, 1);
    this.notify();
    return true;
  }

  hasHero(): boolean {
    return this.blocks.some((b) => b.type === "hero");
  }

  appendUser(text: string): void {
    this.dismissHero();
    this.blocks.push({ type: "user", content: text });
    this.pinnedToBottom = true;
    this.notify();
  }

  appendAssistantStart(): number {
    this.blocks.push({
      type: "assistant",
      content: "",
      assistantRaw: "",
      streamThinkingRaw: "",
      isStreaming: true,
      thinkingBlocks: [],
    });
    this.notify();
    return this.blocks.length - 1;
  }

  updateAssistantStream(
    blockIndex: number,
    partial: string,
    rawPlain?: string,
    rawThinking?: string,
  ): void {
    const block = this.blocks[blockIndex];
    if (block?.type === "assistant") {
      block.content = partial;
      if (rawPlain !== undefined) block.assistantRaw = rawPlain;
      if (rawThinking !== undefined) block.streamThinkingRaw = rawThinking;
      block.isStreaming = true;
      this.pinnedToBottom = true;
      this.notify();
    }
  }

  finalizeAssistant(
    blockIndex: number,
    content: string,
    thinkingBlocks: ThinkingBlock[],
  ): void {
    const block = this.blocks[blockIndex];
    if (block?.type === "assistant") {
      block.assistantRaw = content;
      block.content = markdownToBlessed(content);
      block.thinkingBlocks = thinkingBlocks;
      block.streamThinkingRaw = "";
      block.isStreaming = false;
      this.pinnedToBottom = true;
      this.notify();
    }
  }

  appendTools(tools: ToolResult[]): void {
    if (tools.length === 0) return;
    this.blocks.push({
      type: "tool",
      content: tools.map((t) => `${t.toolName}: ${t.result}`).join("\n"),
      toolEntries: tools,
    });
    this.notify();
  }

  appendError(message: string): void {
    this.blocks.push({ type: "error", content: message });
    this.notify();
  }

  appendSystem(message: string): void {
    this.blocks.push({ type: "system", content: message });
    this.notify();
  }

  popLastExchange(): void {
    while (this.blocks.length > 0) {
      const last = this.blocks[this.blocks.length - 1];
      if (!last) break;
      this.blocks.pop();
      if (last.type === "user") break;
    }
    this.notify();
  }

  cancelInFlightAssistant(): void {
    if (this.blocks[this.blocks.length - 1]?.type === "assistant") {
      this.blocks.pop();
      this.notify();
    }
  }

  clearChat(): void {
    this.blocks.length = 0;
    this.focusedThinkingIndex = null;
    this.searchQuery = "";
    this.pinnedToBottom = true;
    this.notify();
  }

  replaySession(session: TerminalSession): void {
    this.blocks.length = 0;
    this.focusedThinkingIndex = null;
    for (const m of session.messages) {
      if (m.role === "user") {
        this.blocks.push({ type: "user", content: m.content });
      } else if (m.role === "assistant") {
        const parsed = extractThinkingBlocks(m.content);
        this.blocks.push({
          type: "assistant",
          content: markdownToBlessed(parsed.visibleContent || m.content),
          assistantRaw: parsed.visibleContent || m.content,
          thinkingBlocks: parsed.blocks,
        });
      }
    }
    for (const t of session.toolResults) {
      this.blocks.push({
        type: "tool",
        content: t.result,
        toolEntries: [t],
      });
    }
    this.notify();
  }

  getLastAssistantPlainText(): string | null {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const block = this.blocks[i];
      if (block?.type === "assistant") {
        return block.assistantRaw ?? block.content;
      }
    }
    return null;
  }

  toggleFocusedThinking(): void {
    const tbs = this.allThinkingBlocks();
    if (tbs.length === 0) return;
    if (this.focusedThinkingIndex === null) {
      this.focusedThinkingIndex = 0;
    } else {
      const tb = tbs[this.focusedThinkingIndex];
      if (tb) tb.collapsed = !tb.collapsed;
    }
    this.notify();
  }

  toggleAllThinking(): void {
    const tbs = this.allThinkingBlocks();
    if (tbs.length === 0) return;
    const anyExpanded = tbs.some((tb) => !tb.collapsed);
    for (const tb of tbs) tb.collapsed = anyExpanded;
    this.notify();
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query;
    this.notify();
  }

  setStatusMessage(msg: string): void {
    this.statusMessage = msg;
    this.notify();
  }

  setSubtitle(text: string): void {
    this.subtitle = text;
    this.notify();
  }

  // --- Scroll methods ---
  setScrollOffset(offset: number): void {
    this.scrollOffset = offset;
    this.pinnedToBottom = false;
    this.notify();
  }

  scrollUp(): void {
    this.scrollOffset += 1;
    this.pinnedToBottom = false;
    this.notify();
  }

  scrollDown(): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - 1);
    if (this.scrollOffset === 0) this.pinnedToBottom = true;
    this.notify();
  }

  scrollPageUp(viewportHeight: number): void {
    this.scrollOffset += viewportHeight;
    this.pinnedToBottom = false;
    this.notify();
  }

  scrollPageDown(viewportHeight: number): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - viewportHeight);
    if (this.scrollOffset === 0) this.pinnedToBottom = true;
    this.notify();
  }

  scrollToTop(): void {
    this.scrollOffset = 0;
    this.pinnedToBottom = true;
    this.notify();
  }

  getScrollState(): ScrollState {
    return {
      pinnedToBottom: this.pinnedToBottom,
      percent: this.pinnedToBottom ? 100 : this.scrollOffset > 0 ? 50 : 100,
    };
  }

  tickGlitch(): void {
    this.glitchSeed = (this.glitchSeed + 1) % 9;
    this.notify();
  }

  showToast(msg: string, variant: "info" | "error" = "info"): void {
    this.toast = { message: msg, variant };
    this.notify();
  }

  dismissToast(): void {
    this.toast = null;
    this.notify();
  }

  setConfirmDialog(dialog: ConfirmDialogState | null): void {
    this.confirmDialog = dialog;
    this.notify();
  }

  setSearchVisible(v: boolean): void {
    this.searchVisible = v;
    this.notify();
  }

  setHotkeysVisible(v: boolean): void {
    this.hotkeysVisible = v;
    this.notify();
  }

  getThinkingBlockCount(): number {
    return this.blocks.reduce(
      (sum, b) => sum + (b.thinkingBlocks?.length ?? 0),
      0,
    );
  }

  moveFocusedThinking(delta: 1 | -1): void {
    const tbs = this.allThinkingBlocks();
    if (tbs.length === 0) return;
    if (this.focusedThinkingIndex === null) {
      this.focusedThinkingIndex = delta === 1 ? 0 : tbs.length - 1;
    } else {
      this.focusedThinkingIndex =
        (this.focusedThinkingIndex + delta + tbs.length) % tbs.length;
    }
    this.notify();
  }

  private allThinkingBlocks(): ThinkingBlock[] {
    return this.blocks.flatMap((b) => b.thinkingBlocks ?? []);
  }
}
