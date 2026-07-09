import assert from "node:assert/strict";
import { test } from "node:test";

import {
  StreamBuffer,
  formatStreamingChunk,
  finalizeStreamedContent,
  streamTokens,
} from "../lib/blxckchat/ui/renderer/streaming.js";

test("StreamBuffer accumulates chunks", () => {
  const buf = new StreamBuffer();
  assert.equal(buf.append("hel"), "hel");
  assert.equal(buf.append("lo"), "hello");
  assert.equal(buf.length, 5);
  buf.reset();
  assert.equal(buf.getContent(), "");
});

test("formatStreamingChunk shows cursor for empty buffer", () => {
  assert.match(formatStreamingChunk(""), /▌/);
});

test("formatStreamingChunk appends cursor to partial text", () => {
  const out = formatStreamingChunk("Hi");
  assert.match(out, /Hi/);
  assert.match(out, /▌/);
});

test("formatStreamingChunk renders incremental markdown during stream", () => {
  const out = formatStreamingChunk("**Hello**");
  assert.match(out, /\{bold\}Hello\{\/bold\}/);
  assert.match(out, /▌/);
  assert.doesNotMatch(out, /\x1b\[/);
});

test("finalizeStreamedContent applies blessed markdown rendering", () => {
  const out = finalizeStreamedContent("**done**");
  assert.match(out, /\{bold\}done\{\/bold\}/);
  assert.doesNotMatch(out, /\*\*done\*\*/);
  assert.doesNotMatch(out, /\x1b\[/);
});

test("streamTokens invokes onUpdate for each chunk and finalizes", async () => {
  const updates: string[] = [];
  const raw = await streamTokens(
    "ab",
    (partial) => updates.push(partial),
    1,
    0,
  );
  assert.equal(raw, "ab");
  assert.ok(updates.length >= 2);
  const last = updates[updates.length - 1]!;
  assert.ok(last.includes("a") || last.includes("▌"));
});