import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractThinkingBlocks,
  formatThinkingBlock,
  toggleThinkingBlock,
} from "../lib/blxckchat/ui/components/thinking-block.js";

test("extractThinkingBlocks pulls <think> sections", () => {
  const input = "Hello <think>secret reasoning</think> world";
  const { visibleContent, blocks } = extractThinkingBlocks(input);
  assert.equal(visibleContent, "Hello  world");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.content, "secret reasoning");
  assert.equal(blocks[0]?.collapsed, true);
});

test("formatThinkingBlock shows collapsed preview", () => {
  const block = {
    id: "1",
    content: "a".repeat(100),
    collapsed: true,
  };
  const out = formatThinkingBlock(block);
  assert.match(out, /▶/);
  assert.match(out, /think/);
  assert.match(out, /100 chars/);
});

test("toggleThinkingBlock flips collapsed state", () => {
  const block = { id: "1", content: "thought", collapsed: true };
  toggleThinkingBlock(block);
  assert.equal(block.collapsed, false);
});