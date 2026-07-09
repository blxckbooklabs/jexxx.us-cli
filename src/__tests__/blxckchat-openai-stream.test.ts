import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accumulateStreamingToolCalls,
  finalizeStreamingToolCalls,
} from "../lib/blxckchat/providers/openai-stream.js";

test("accumulateStreamingToolCalls merges fragmented streamed tool deltas", () => {
  const acc = new Map<number, { id?: string; name?: string; arguments: string }>();

  accumulateStreamingToolCalls(acc, [
    { index: 0, id: "call_1", function: { name: "bible_query", arguments: '{"act' } },
  ]);
  accumulateStreamingToolCalls(acc, [
    { index: 0, function: { arguments: 'ion":"query","query":"Hannah"}' } },
  ]);

  const toolCalls = finalizeStreamingToolCalls(acc);
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0]?.id, "call_1");
  assert.equal(toolCalls[0]?.name, "bible_query");
  assert.deepEqual(toolCalls[0]?.arguments, { action: "query", query: "Hannah" });
});

test("finalizeStreamingToolCalls tolerates invalid JSON arguments", () => {
  const acc = new Map<number, { id?: string; name?: string; arguments: string }>();
  acc.set(0, { id: "call_x", name: "echo_tool", arguments: "not-json" });

  const toolCalls = finalizeStreamingToolCalls(acc);
  assert.equal(toolCalls.length, 1);
  assert.deepEqual(toolCalls[0]?.arguments, {});
});