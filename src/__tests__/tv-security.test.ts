import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { readPublicJsonCatalog } from "../lib/tv-security.js";

test("readPublicJsonCatalog blocks non-json paths", () => {
  assert.throws(
    () => readPublicJsonCatalog("/tmp/evil.txt"),
    /Blocked non-JSON/i,
  );
});

test("readPublicJsonCatalog reads fixture catalog", () => {
  const jsonPath = path.join(
    process.cwd(),
    "src/__tests__/fixtures/tv/src/data/videos.json",
  );
  const raw = readPublicJsonCatalog(jsonPath);
  const parsed = JSON.parse(raw) as unknown[];
  assert.equal(parsed.length, 1);
});