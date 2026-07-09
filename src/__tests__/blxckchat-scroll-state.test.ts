import assert from "node:assert/strict";
import { test } from "node:test";

import {
  halfPageScrollDelta,
  isNearBottom,
  lineScrollStep,
  pageScrollDelta,
  restoreScrollOffset,
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

test("restoreScrollOffset clamps when content shrinks or grows", () => {
  assert.equal(restoreScrollOffset(40, 10, 30), 20);
  assert.equal(restoreScrollOffset(40, 10, 15), 5);
  assert.equal(restoreScrollOffset(-3, 10, 30), 0);
});

test("page and half-page deltas match OpenCode viewport ratios", () => {
  assert.equal(pageScrollDelta(20), 10);
  assert.equal(halfPageScrollDelta(20), 5);
  assert.equal(pageScrollDelta(8), 5);
  assert.equal(halfPageScrollDelta(8), 5);
});

test("lineScrollStep defaults to 1 and honors BLXCKCHAT_SCROLL_LINES", () => {
  const prev = process.env.BLXCKCHAT_SCROLL_LINES;
  delete process.env.BLXCKCHAT_SCROLL_LINES;
  assert.equal(lineScrollStep(), 1);
  process.env.BLXCKCHAT_SCROLL_LINES = "3";
  assert.equal(lineScrollStep(), 3);
  if (prev === undefined) delete process.env.BLXCKCHAT_SCROLL_LINES;
  else process.env.BLXCKCHAT_SCROLL_LINES = prev;
});