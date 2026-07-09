import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isNearBottom,
  scrollPercent,
  scrollPercentAfterContent,
} from "../lib/blxckchat/ui/components/scroll-state.js";

test("scrollPercent maps line offset to 0–100", () => {
  assert.equal(scrollPercent(0, 10, 10), 100);
  assert.equal(scrollPercent(0, 10, 20), 0);
  assert.equal(scrollPercent(5, 10, 20), 50);
  assert.equal(scrollPercent(10, 10, 20), 100);
});

test("isNearBottom respects threshold lines", () => {
  assert.equal(isNearBottom(7, 10, 20, 3), true);
  assert.equal(isNearBottom(6, 10, 20, 3), false);
  assert.equal(isNearBottom(0, 10, 10, 3), true);
});

test("scrollPercentAfterContent only pins when user was pinned", () => {
  assert.equal(scrollPercentAfterContent(true, 12), 100);
  assert.equal(scrollPercentAfterContent(false, 12), 12);
  assert.equal(scrollPercentAfterContent(false, 150), 100);
  assert.equal(scrollPercentAfterContent(false, -5), 0);
});