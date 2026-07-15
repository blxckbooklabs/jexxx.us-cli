import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterPickerItems,
  resolvePickerSelection,
} from "../lib/blxckchat/ui/dye/picker-filter.js";
import type { PickerItemDef } from "../lib/blxckchat/ui/dye/dye-types.js";

const items: PickerItemDef[] = [
  { id: "catalog:opencode-zen", label: "+ OpenCode Zen", description: "gateway" },
  { id: "catalog:anthropic", label: "+ Anthropic" },
  { id: "catalog:xai", label: "+ xAI", description: "Grok" },
];

test("resolvePickerSelection uses the active filter query", () => {
  const picked = resolvePickerSelection(items, "xai", 0);
  assert.equal(picked?.id, "catalog:xai");
});

test("resolvePickerSelection does not pick from the unfiltered list", () => {
  const picked = resolvePickerSelection(items, "", 0);
  assert.equal(picked?.id, "catalog:opencode-zen");
  const wrong = resolvePickerSelection(items, "xai", 0);
  assert.notEqual(wrong?.id, "catalog:opencode-zen");
});

test("filterPickerItems matches label and id", () => {
  assert.equal(filterPickerItems(items, "grok").length, 1);
  assert.equal(filterPickerItems(items, "catalog:xai")[0]?.label, "+ xAI");
});