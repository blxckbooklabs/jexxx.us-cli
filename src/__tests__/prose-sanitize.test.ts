import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeRoleplayProse } from "../lib/blxckchat/prose-sanitize.js";

test("sanitizeRoleplayProse removes orphan paren lines and letter garbage", () => {
  const raw = [
    "RUTH (steady)",
    ")",
    "Line of prose",
    "a   p      u     E   t       I w",
    "Clean ending.",
  ].join("\n");
  const out = sanitizeRoleplayProse(raw);
  assert.doesNotMatch(out, /^\s*\)\s*$/m);
  assert.doesNotMatch(out, /a   p      u/);
  assert.match(out, /Clean ending/);
});