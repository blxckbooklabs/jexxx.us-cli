import { BLESSED_STREAM_CURSOR, escapeBlessed } from "./markdown.js";
import { TAG } from "../theme.js";

export interface StreamThinkingState {
  thinking: string;
  visible: string;
  inThinking: boolean;
  hasThinking: boolean;
}

interface ThinkTag {
  open: string;
  close: string;
}

const THINK_TAGS: ThinkTag[] = [
  { open: "<think>", close: "</think>" },
  { open: "[thinking]", close: "[/thinking]" },
  { open: "```thinking\n", close: "\n```" },
];

/** Hold back only when pending ends with a partial opener prefix. */
function partialOpenerHoldback(pending: string): number {
  let hold = 0;
  for (const tag of THINK_TAGS) {
    for (let len = 1; len < tag.open.length; len++) {
      const prefix = tag.open.slice(0, len);
      if (pending.endsWith(prefix)) {
        hold = Math.max(hold, prefix.length);
      }
    }
  }
  return hold;
}

function emptyState(): StreamThinkingState {
  return {
    thinking: "",
    visible: "",
    inThinking: false,
    hasThinking: false,
  };
}

/**
 * Incrementally splits streamed LLM output into thinking vs visible answer
 * (Pi / OpenCode style). Handles partial tags across chunk boundaries.
 */
export class StreamThinkingParser {
  private pending = "";
  private closeTag = "";
  private state = emptyState();

  reset(): void {
    this.pending = "";
    this.closeTag = "";
    this.state = emptyState();
  }

  getState(): StreamThinkingState {
    return {
      ...this.state,
      inThinking: this.closeTag.length > 0 || this.state.inThinking,
    };
  }

  /** Native API reasoning channel (OpenAI reasoning_content, OpenRouter reasoning, etc.). */
  appendThinking(chunk: string): void {
    if (!chunk) return;
    this.state.thinking += chunk;
    this.state.hasThinking = true;
    this.state.inThinking = true;
  }

  /** Main model output — may include <think>…</think> wrappers. */
  append(chunk: string): void {
    if (!chunk) return;
    this.pending += chunk;
    this.drain();
  }

  private drain(): void {
    while (this.pending.length > 0) {
      if (this.closeTag) {
        const closeIdx = this.pending.indexOf(this.closeTag);
        if (closeIdx === -1) {
          const hold = this.closeTag.length - 1;
          const emitLen = Math.max(0, this.pending.length - hold);
          if (emitLen === 0) break;
          this.state.thinking += this.pending.slice(0, emitLen);
          this.state.hasThinking = true;
          this.pending = this.pending.slice(emitLen);
          break;
        }
        this.state.thinking += this.pending.slice(0, closeIdx);
        this.state.hasThinking = true;
        this.pending = this.pending.slice(closeIdx + this.closeTag.length);
        this.closeTag = "";
        this.state.inThinking = false;
        continue;
      }

      let earliest = -1;
      let matched: ThinkTag | null = null;
      for (const tag of THINK_TAGS) {
        const idx = this.pending.indexOf(tag.open);
        if (idx !== -1 && (earliest === -1 || idx < earliest)) {
          earliest = idx;
          matched = tag;
        }
      }

      if (earliest === -1) {
        const hold = partialOpenerHoldback(this.pending);
        const emitLen = this.pending.length - hold;
        if (emitLen <= 0) break;
        this.state.visible += this.pending.slice(0, emitLen);
        this.pending = this.pending.slice(emitLen);
        if (hold > 0) break;
        continue;
      }

      this.state.visible += this.pending.slice(0, earliest);
      this.pending = this.pending.slice(earliest + matched!.open.length);
      this.closeTag = matched!.close;
      this.state.inThinking = true;
    }
  }
}

/** Dim pulsing placeholder before the first streamed token (Pi-style). */
export function formatThinkingWaitState(): string {
  return `  ${TAG.dim}◇ thinking…${TAG.dimEnd}${BLESSED_STREAM_CURSOR}`;
}

function formatThinkingBody(text: string, withCursor: boolean): string {
  if (!text.trim() && !withCursor) {
    return `  ${TAG.muted}(reasoning…)${TAG.mutedEnd}`;
  }
  const lines = text.split("\n").map((line) => {
    const body = line.length > 0 ? escapeBlessed(line) : "";
    return `  ${TAG.muted}${body}${TAG.mutedEnd}`;
  });
  if (withCursor) {
    lines.push(`  ${TAG.muted}${BLESSED_STREAM_CURSOR}${TAG.mutedEnd}`);
  }
  return lines.join("\n");
}

function formatVisibleBody(text: string, withCursor: boolean): string {
  if (!text.trim()) {
    return withCursor ? BLESSED_STREAM_CURSOR : "";
  }
  const body = escapeBlessed(text)
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join("\n");
  return withCursor ? `${body}${BLESSED_STREAM_CURSOR}` : body;
}

/** Live blessed render: expanded thinking block (gray) + visible answer + cursor. */
export function formatLiveStreamDisplay(state: StreamThinkingState): string {
  const parts: string[] = [];
  const showThinking = state.hasThinking || state.inThinking;
  const thinkingDone = showThinking && !state.inThinking && !state.thinking.trim();

  if (showThinking) {
    const label = `${TAG.dim}[▼{/}${TAG.pink} think${TAG.pinkEnd}${TAG.dim}]${TAG.dimEnd}`;
    parts.push(label);
    parts.push(
      formatThinkingBody(
        state.thinking,
        state.inThinking || (!state.visible.trim() && !thinkingDone),
      ),
    );
  }

  const visibleCursor =
    !state.inThinking && (state.visible.length > 0 || !showThinking);
  const visible = formatVisibleBody(state.visible, visibleCursor);
  if (visible) {
    parts.push(visible);
  } else if (!showThinking) {
    parts.push(BLESSED_STREAM_CURSOR);
  }

  return parts.filter(Boolean).join("\n");
}