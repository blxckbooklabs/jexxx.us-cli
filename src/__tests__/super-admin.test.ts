import assert from "node:assert/strict";
import { test } from "node:test";

import { isSuperAdminClerkUser } from "../lib/super-admin.js";
import { resolveVaultClient } from "../lib/account-data/session.js";
import type { AuthenticatedAccountSession } from "../lib/account-data/session.js";

test("isSuperAdminClerkUser recognizes the JEXXXUS super-admin Clerk ID", () => {
  assert.equal(isSuperAdminClerkUser("user_3AH8ufbCQvjfxL0RkA75RDDGYsy"), true);
  assert.equal(isSuperAdminClerkUser("user_other"), false);
});

test("resolveVaultClient rejects cross-user reads for non-super-admins", () => {
  const session = {
    creds: { userId: "user_a", email: "a@test.com" },
    isSuperAdmin: false,
  } as AuthenticatedAccountSession;

  assert.throws(
    () => resolveVaultClient(session, "blxckbook", "user_b"),
    /super-admin/,
  );
});