import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveAddContactName } from "../lib/blxckchat/tools/vault-write-tools.js";

test("resolveAddContactName prefers name then aliases", () => {
  assert.equal(resolveAddContactName({ name: "Ruth" }), "Ruth");
  assert.equal(resolveAddContactName({ contactName: "Ruth" }), "Ruth");
  assert.equal(resolveAddContactName({ displayName: "Ruth" }), "Ruth");
  assert.equal(resolveAddContactName({}), "");
});