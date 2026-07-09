import type { ToolCall } from "./types.js";

/** Partial tool call state while merging streamed OpenAI deltas. */
export interface StreamingToolCallAcc {
  id?: string;
  name?: string;
  arguments: string;
}

export interface StreamingToolCallDelta {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/** Merge one chunk of streamed tool_call deltas into the accumulator map. */
export function accumulateStreamingToolCalls(
  acc: Map<number, StreamingToolCallAcc>,
  deltas: StreamingToolCallDelta[] | undefined,
): void {
  if (!deltas?.length) return;

  for (const delta of deltas) {
    const index = delta.index ?? 0;
    let entry = acc.get(index);
    if (!entry) {
      entry = { arguments: "" };
      acc.set(index, entry);
    }
    if (delta.id) entry.id = delta.id;
    if (delta.function?.name) entry.name = delta.function.name;
    if (delta.function?.arguments) {
      entry.arguments += delta.function.arguments;
    }
  }
}

/** Convert accumulated streamed tool calls into parsed ToolCall objects. */
export function finalizeStreamingToolCalls(
  acc: Map<number, StreamingToolCallAcc>,
): ToolCall[] {
  const result: ToolCall[] = [];

  for (const index of [...acc.keys()].sort((a, b) => a - b)) {
    const entry = acc.get(index);
    if (!entry?.id || !entry.name) continue;

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(entry.arguments || "{}") as Record<string, unknown>;
    } catch {
      args = {};
    }

    result.push({
      id: entry.id,
      name: entry.name,
      arguments: args,
    });
  }

  return result;
}