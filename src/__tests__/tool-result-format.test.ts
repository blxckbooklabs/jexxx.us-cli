import assert from "node:assert/strict";
import { test } from "node:test";

import { formatToolResultForFallback } from "../lib/blxckchat/tool-result-format.js";

test("formatToolResultForFallback rejects raw chapter JSON arrays", () => {
  const raw = '["Chapter 1","Chapter 2","Chapter 3"]';
  const out = formatToolResultForFallback("bible_query", raw);
  assert.match(out, /catalog metadata|chapter list|try again/i);
  assert.doesNotMatch(out, /Chapter 1/);
});

test("formatToolResultForFallback passes through TV list formatting", () => {
  const raw = "JEXXXUS | TV videos (2 shown of 10):\n\n1. Example";
  const out = formatToolResultForFallback("tv_query", raw);
  assert.equal(out, raw);
});