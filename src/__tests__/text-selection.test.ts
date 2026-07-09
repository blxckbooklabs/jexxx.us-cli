import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applySelectionHighlight,
  getSelectedText,
  normalizeSelectionRange,
  selectionHasText,
} from "../lib/blxckchat/ui/selection/text-selection.js";

test("getSelectedText extracts single and multi-line ranges", () => {
  const lines = ["hello world", "second line"];
  assert.equal(
    getSelectedText(lines, { line: 0, col: 0 }, { line: 0, col: 5 }),
    "hello",
  );
  assert.equal(
    getSelectedText(lines, { line: 0, col: 6 }, { line: 1, col: 6 }),
    "world\nsecond",
  );
});

test("normalizeSelectionRange orders cells", () => {
  assert.deepEqual(
    normalizeSelectionRange({ line: 1, col: 2 }, { line: 0, col: 5 }),
    { start: { line: 0, col: 5 }, end: { line: 1, col: 2 } },
  );
});

test("applySelectionHighlight wraps inverse tags", () => {
  const out = applySelectionHighlight(
    ["abcdef"],
    { line: 0, col: 1 },
    { line: 0, col: 4 },
    (s) => s,
  );
  assert.match(out, /a\{inverse\}bcd\{\/inverse\}ef/);
});

test("selectionHasText ignores whitespace-only ranges", () => {
  const lines = ["   "];
  assert.equal(selectionHasText(lines, { line: 0, col: 0 }, { line: 0, col: 3 }), false);
});