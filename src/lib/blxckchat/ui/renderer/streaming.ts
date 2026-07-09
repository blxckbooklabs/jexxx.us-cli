import { escapeBlessed, markdownToBlessed } from "./markdown.js";

/** Accumulates streamed tokens for incremental UI updates. */
export class StreamBuffer {
  private buffer = "";

  append(chunk: string): string {
    this.buffer += chunk;
    return this.buffer;
  }

  getContent(): string {
    return this.buffer;
  }

  reset(): void {
    this.buffer = "";
  }

  get length(): number {
    return this.buffer.length;
  }
}

/**
 * Format a partial stream buffer for live display (plain text, no full markdown parse).
 * Pink CRT cursor — full markdown rendering happens on finalize.
 */
export function formatStreamingChunk(buffer: string): string {
  if (!buffer) {
    return `{#ec4899-fg}▌{/}`;
  }
  const escaped = escapeBlessed(buffer);
  return `${escaped}{#ec4899-fg}{bold}▌{/bold}{/}`;
}

/** Finalize streamed assistant text with markdown rendering. */
export function finalizeStreamedContent(raw: string): string {
  if (!raw.trim()) {
    return "";
  }
  return markdownToBlessed(raw);
}

/**
 * Simulate token-by-token streaming for tests or replay.
 * Calls onUpdate after each chunk with the formatted partial content.
 */
export async function streamTokens(
  fullResponse: string,
  onUpdate: (partialFormatted: string) => void,
  chunkSize = 1,
  delayMs = 0,
): Promise<string> {
  const buffer = new StreamBuffer();

  for (let i = 0; i < fullResponse.length; i += chunkSize) {
    const chunk = fullResponse.slice(i, i + chunkSize);
    buffer.append(chunk);
    onUpdate(formatStreamingChunk(buffer.getContent()));
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const finalized = finalizeStreamedContent(buffer.getContent());
  onUpdate(finalized);
  return buffer.getContent();
}