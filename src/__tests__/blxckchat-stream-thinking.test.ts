import assert from "node:assert/strict";
import { test } from "node:test";

import {
  StreamThinkingParser,
  formatLiveStreamDisplay,
  formatThinkingWaitState,
} from "../lib/blxckchat/ui/renderer/stream-thinking.js";

test("StreamThinkingParser splits <think> tags across chunks", () => {
  const parser = new StreamThinkingParser();
  parser.append("Hello ");
  parser.append("<think>reason");
  parser.append("ing here</think>");
  parser.append(" world");

  const state = parser.getState();
  assert.equal(state.thinking, "reasoning here");
  assert.equal(state.visible, "Hello  world");
  assert.equal(state.hasThinking, true);
});

test("appendThinking accumulates API reasoning channel", () => {
  const parser = new StreamThinkingParser();
  parser.appendThinking("step one. ");
  parser.appendThinking("step two.");

  const state = parser.getState();
  assert.equal(state.thinking, "step one. step two.");
  assert.equal(state.hasThinking, true);
  assert.equal(state.inThinking, true);
});

test("formatLiveStreamDisplay shows expanded think block while streaming", () => {
  const parser = new StreamThinkingParser();
  parser.appendThinking("Considering vault data");

  const out = formatLiveStreamDisplay(parser.getState());
  assert.match(out, /think/);
  assert.match(out, /Considering vault data/);
  assert.match(out, /▌/);
});

test("formatThinkingWaitState shows placeholder cursor", () => {
  const out = formatThinkingWaitState();
  assert.match(out, /thinking/);
  assert.match(out, /▌/);
});

test("StreamThinkingParser reset clears state", () => {
  const parser = new StreamThinkingParser();
  parser.append("<think>x</think>y");
  parser.reset();
  const state = parser.getState();
  assert.equal(state.thinking, "");
  assert.equal(state.visible, "");
  assert.equal(state.hasThinking, false);
});