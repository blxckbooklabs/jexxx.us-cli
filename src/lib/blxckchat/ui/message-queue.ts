/** Queued prompts submitted while the agent is still processing (codex Tab). */
export class MessageQueue {
  private readonly items: string[] = [];

  enqueue(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    this.items.push(trimmed);
    return true;
  }

  dequeue(): string | undefined {
    return this.items.shift();
  }

  peekAll(): string[] {
    return [...this.items];
  }

  get length(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }
}