import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeToolResultForDisplay } from "../lib/blxckchat/ui/components/tool-box.js";

test("summarizeToolResultForDisplay compresses JSON arrays", () => {
  const raw = JSON.stringify([
    { title: "Alpha" },
    { title: "Beta" },
    { title: "Gamma" },
    { title: "Delta" },
  ]);
  const out = summarizeToolResultForDisplay(raw, "success");
  assert.match(out, /4 items/);
  assert.match(out, /Alpha/);
  assert.doesNotMatch(out, /"title"/);
});

test("summarizeToolResultForDisplay keeps short multiline text", () => {
  const raw = "VEIL articles (2 shown):\n\n1. One\n   https://veil.jexxx.us/a";
  const out = summarizeToolResultForDisplay(raw, "success");
  assert.equal(out, raw);
});

test("summarizeToolResultForDisplay shows full veil_query catalogs", () => {
  const raw = `VEIL articles (10 shown of 47):\n\n${"1. Title\n   https://veil.jexxx.us/a\n\n".repeat(10)}Public discovery:`;
  const out = summarizeToolResultForDisplay(raw, "success", "veil_query");
  assert.equal(out, raw);
  assert.doesNotMatch(out, /chars total/);
});