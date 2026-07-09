import assert from "node:assert/strict";
import { test } from "node:test";

import { stepListIndex } from "../lib/blxckchat/ui/components/slash-popup.js";

test("stepListIndex clamps at bounds without wrapping", () => {
  assert.equal(stepListIndex(0, -1, 8), 0);
  assert.equal(stepListIndex(0, 1, 8), 1);
  assert.equal(stepListIndex(1, 1, 8), 2);
  assert.equal(stepListIndex(7, 1, 8), 7);
  assert.equal(stepListIndex(7, -1, 8), 6);
});

test("stepListIndex handles empty lists", () => {
  assert.equal(stepListIndex(0, 1, 0), 0);
});