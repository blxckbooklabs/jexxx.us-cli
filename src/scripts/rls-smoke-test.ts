/**
 * Manual RLS smoke test — NOT part of `npm test` / CI.
 *
 * Verifies the one property that matters most for account-data access:
 * user A's Clerk JWT can never read user B's rows, even though both users
 * hit the same anon-key + `createUserSupabaseClient()` path. This can only
 * be checked against a real (or staging) Supabase project with two real,
 * signed-in Clerk sessions — there is no way to fake RLS enforcement with a
 * mocked client, which is why this lives outside the regular unit-test
 * suite (see src/__tests__/account-data.test.ts for the mocked-client
 * behavioral tests).
 *
 * Usage:
 *   1. Sign in as two different JEXXXUS accounts (e.g. two browser
 *      profiles), each with at least one contact in BLXCKBOOK and/or NXT.
 *   2. Grab each account's Clerk session JWT — the same accessToken stored
 *      in ~/.jexxxus/credentials.json after `jexxxus auth login`, or copy
 *      it out of that file directly for a second account without
 *      overwriting your own session.
 *   3. Run:
 *      JEXXXUS_RLS_TEST_TOKEN_A=<userA jwt> \
 *      JEXXXUS_RLS_TEST_TOKEN_B=<userB jwt> \
 *      SUPABASE_URL=<url> SUPABASE_ANON_KEY=<anon key> \
 *      npx tsx src/scripts/rls-smoke-test.ts
 *
 * PASS means: user A's query returns >0 rows that are all user A's, user
 * B's query returns >0 rows that are all user B's, and user A's *raw*
 * unfiltered query (no .eq("user_id", ...) — simulating what would happen
 * if the defense-in-depth check were ever accidentally removed) still
 * returns zero rows belonging to user B. That last check is what actually
 * proves RLS — not just the application-level filter — is doing the work.
 */
import { createUserSupabaseClient } from "../lib/user-supabase.js";
import type { UserEnv } from "../lib/env.js";

function fail(message: string): never {
  console.error(`\x1b[31m[FAIL]\x1b[0m ${message}`);
  process.exit(1);
}

function pass(message: string): void {
  console.log(`\x1b[32m[PASS]\x1b[0m ${message}`);
}

async function main(): Promise<void> {
  const tokenA = process.env.JEXXXUS_RLS_TEST_TOKEN_A?.trim();
  const tokenB = process.env.JEXXXUS_RLS_TEST_TOKEN_B?.trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!tokenA || !tokenB || !supabaseUrl || !supabaseAnonKey) {
    fail(
      "Missing required env vars. Need JEXXXUS_RLS_TEST_TOKEN_A, " +
        "JEXXXUS_RLS_TEST_TOKEN_B, SUPABASE_URL, SUPABASE_ANON_KEY. See the " +
        "usage comment at the top of this file.",
    );
  }

  const env: UserEnv = { supabaseUrl: supabaseUrl!, supabaseAnonKey: supabaseAnonKey! };

  const clientA = createUserSupabaseClient(env, async () => tokenA!, "blxckbook");
  const clientB = createUserSupabaseClient(env, async () => tokenB!, "blxckbook");

  console.log("Running RLS smoke test against api.contacts...\n");

  // Each user's own (RLS-scoped) query must return only their own rows.
  const { data: rowsA, error: errorA } = await clientA.from("contacts").select("id, user_id");
  if (errorA) fail(`User A query failed: ${errorA.message}`);
  if (!rowsA || rowsA.length === 0) {
    fail("User A has zero contacts — seed at least one contact for this account before running.");
  }
  const userIdA = (rowsA[0] as { user_id: string }).user_id;
  const leakedIntoA = rowsA.filter((r) => (r as { user_id: string }).user_id !== userIdA);
  if (leakedIntoA.length > 0) {
    fail(
      `User A's query returned ${leakedIntoA.length} row(s) belonging to a different user_id — RLS is not enforcing per-user scoping!`,
    );
  }
  pass(`User A (${userIdA}): ${rowsA.length} row(s), all correctly scoped.`);

  const { data: rowsB, error: errorB } = await clientB.from("contacts").select("id, user_id");
  if (errorB) fail(`User B query failed: ${errorB.message}`);
  if (!rowsB || rowsB.length === 0) {
    fail("User B has zero contacts — seed at least one contact for this account before running.");
  }
  const userIdB = (rowsB[0] as { user_id: string }).user_id;
  const leakedIntoB = rowsB.filter((r) => (r as { user_id: string }).user_id !== userIdB);
  if (leakedIntoB.length > 0) {
    fail(
      `User B's query returned ${leakedIntoB.length} row(s) belonging to a different user_id — RLS is not enforcing per-user scoping!`,
    );
  }
  pass(`User B (${userIdB}): ${rowsB.length} row(s), all correctly scoped.`);

  if (userIdA === userIdB) {
    fail("Both tokens resolved to the same user_id — provide two distinct accounts' tokens.");
  }

  // The critical check: user A's client, queried WITHOUT any .eq("user_id",
  // ...) filter (i.e. relying on RLS alone, exactly as PostgREST sees the
  // query once the accessToken callback attaches user A's JWT) must never
  // surface user B's rows. If this fails, RLS itself is broken — the
  // application-level .eq() filter in blxckbook-export.ts / nxt-export.ts
  // would be the only thing standing between users, which the plan
  // explicitly does not treat as sufficient on its own.
  const crossUserRows = rowsA.filter((r) => (r as { user_id: string }).user_id === userIdB);
  if (crossUserRows.length > 0) {
    fail(
      `CRITICAL: User A's unfiltered query returned ${crossUserRows.length} row(s) belonging to User B. RLS policy is not enforcing per-user access on api.contacts.`,
    );
  }
  pass("User A's client cannot see any of User B's rows, and vice versa. RLS is enforcing correctly.");

  console.log("\n\x1b[32mAll RLS smoke test checks passed.\x1b[0m");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
