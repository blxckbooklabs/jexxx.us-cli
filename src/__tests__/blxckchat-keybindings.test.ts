import assert from "node:assert/strict";
import { test } from "node:test";

import { BLXCKCHAT_HOTKEYS, formatHotkeysOverlay } from "../lib/blxckchat/ui/keybindings.js";
import { cycleModelOption, type ModelOption } from "../lib/blxckchat/providers/models.js";
import type { StoredProviderConfig } from "../lib/blxckchat/config.js";

test("BLXCKCHAT_HOTKEYS includes pi/codex model and copy shortcuts", () => {
  const keys = BLXCKCHAT_HOTKEYS.map((h) => h.keys).join(" ");
  assert.match(keys, /Ctrl\+L/);
  assert.match(keys, /Ctrl\+P/);
  assert.match(keys, /Ctrl\+O/);
  assert.match(keys, /\?/);
});

test("formatHotkeysOverlay renders shortcut list", () => {
  const out = formatHotkeysOverlay();
  assert.match(out, /BLXCKCHAT keyboard shortcuts/);
  assert.match(out, /Ctrl\+C/);
});

test("cycleModelOption rotates within active provider", () => {
  const config: StoredProviderConfig = {
    name: "t",
    provider: "openai",
    model: "gpt-4o",
    apiKey: "x",
  };
  const options: ModelOption[] = [
    { id: "gpt-4o", label: "a", provider: "openai", source: "configured" },
    { id: "gpt-4o-mini", label: "b", provider: "openai", source: "suggested" },
    { id: "llama3", label: "c", provider: "ollama", source: "ollama" },
  ];
  const next = cycleModelOption(options, config, 1);
  assert.equal(next?.id, "gpt-4o-mini");
  const prev = cycleModelOption(options, { ...config, model: "gpt-4o-mini" }, -1);
  assert.equal(prev?.id, "gpt-4o");
});