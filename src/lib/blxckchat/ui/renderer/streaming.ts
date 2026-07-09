import { markdownToAnsi, STREAM_CURSOR } from "./markdown-ansi.js";

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
 * Format a partial stream buffer for live display.
 * Incremental markdown → ANSI (Pi / OpenCode) so blessed wrap stays readable.
 */
export function formatStreamingChunk(buffer: string): string {
  if (!buffer.trim()) {
    return STREAM_CURSOR;
  }
  const rendered = markdownToAnsi(buffer);
  if (!rendered) {
    return `${buffer.trimEnd()}\n${STREAM_CURSOR}`;
  }
  return `${rendered}${STREAM_CURSOR}`;
}

/** Finalize streamed assistant text with markdown rendering. */
export function finalizeStreamedContent(raw: string): string {
  if (!raw.trim()) {
    return "";
  }
  return markdownToAnsi(raw);
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