import assert from "node:assert/strict";
import { test } from "node:test";

import { glitchNoise, rolePill, THEME } from "../lib/blxckchat/ui/theme.js";

test("THEME uses JEXXXUS pink accent", () => {
  assert.equal(THEME.pink, "#ec4899");
});

test("glitchNoise returns deterministic static strip", () => {
  assert.equal(glitchNoise(12, 0), glitchNoise(12, 0));
  assert.equal(glitchNoise(12, 0).length, 12);
});

test("rolePill renders blessed tags for you and blxckchat", () => {
  assert.match(rolePill("you"), /you/);
  assert.match(rolePill("blxckchat"), /blxckchat/);
});