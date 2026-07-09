import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { filterPickerItems } from "../lib/blxckchat/ui/components/picker-overlay.js";

describe("picker filter", () => {
  const items = [
    { id: "big-pickle", label: "big-pickle", description: "free tier" },
    { id: "gpt-5.2", label: "gpt-5.2", description: "gateway" },
    { id: "claude-sonnet-4-5", label: "claude-sonnet-4-5", description: "suggested" },
  ];

  test("empty query returns all items", () => {
    assert.equal(filterPickerItems(items, "").length, 3);
  });

  test("filters by id substring", () => {
    const result = filterPickerItems(items, "pickle");
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, "big-pickle");
  });

  test("filters by description", () => {
    const result = filterPickerItems(items, "free");
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, "big-pickle");
  });
});