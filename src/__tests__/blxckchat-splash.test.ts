import assert from "node:assert/strict";
import { test } from "node:test";

import {
  renderJexxxusHeroBlessed,
  renderJexxxusHeroPlain,
} from "../lib/blxckchat/ui/components/jexxxus-hero.js";

const META = {
  authLabel: "alice@example.com",
  toolCount: 5,
  providerLabel: "ollama/gemma",
};

test("renderJexxxusHeroPlain centers block JEXXXUS letters", () => {
  const frame = renderJexxxusHeroPlain(80, META);
  assert.match(frame, /█████/);
  assert.match(frame, /Type a message to begin/);
  assert.match(frame, /alice@example\.com/);
});

test("renderJexxxusHeroBlessed highlights XXX in pink tags", () => {
  const frame = renderJexxxusHeroBlessed(80, META);
  assert.match(frame, /\{#ec4899-fg\}/);
  assert.match(frame, /Type a message to begin/);
});