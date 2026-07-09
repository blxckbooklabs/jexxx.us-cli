import assert from "node:assert/strict";
import { test } from "node:test";

import { renderJexxxusSplashFrame } from "../lib/blxckchat/ui/components/jexxxus-splash.js";

test("renderJexxxusSplashFrame centers JEXXXUS letters", () => {
  const frame = renderJexxxusSplashFrame(0, 80);
  assert.match(frame, /J/);
  assert.match(frame, /E/);
  assert.match(frame, /X/);
  assert.match(frame, /U/);
  assert.match(frame, /S/);
  assert.match(frame, /KINGDOM FEED|BLXCKCHAT/);
});

test("renderJexxxusSplashFrame animates across ticks", () => {
  const a = renderJexxxusSplashFrame(0, 60);
  const b = renderJexxxusSplashFrame(3, 60);
  assert.notEqual(a, b);
});