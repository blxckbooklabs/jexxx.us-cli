import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listNotifications,
  connectContactBack,
  getRelationshipTier,
} from "../lib/account-data/connections.js";
import type { AuthenticatedAccountSession } from "../lib/account-data/session.js";

/**
 * Lightweight mock covering the additional chain shapes connections.ts
 * needs beyond account-data-mutations.test.ts's mock: .order()/.limit()
 * (listNotifications), .rpc() (tier/restore RPCs), and .or()/.maybeSingle()
 * (relationship_tiers lookup). .or() is a simplifying no-op here — it
 * returns whatever rows are in the table rather than parsing the OR
 * expression, since the tests below only ever seed a single relevant row
 * per table and care about the JS branching logic in connections.ts, not
 * PostgREST's OR-filter syntax itself.
 */
function createMockClient(
  initialTables: Record<string, Record<string, unknown>[]>,
  rpcResults: Record<string, unknown> = {},
) {
  const tables = new Map<string, Record<string, unknown>[]>(
    Object.entries(initialTables).map(([k, v]) => [k, [...v]]),
  );
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  function from(table: string) {
    let rows = tables.get(table) ?? [];
    let mode: "select" | "update" | "insert" = "select";
    let updatePayload: Record<string, unknown> | null = null;
    let insertPayload: Record<string, unknown> | null = null;
    const filters: Array<{ col: string; val: unknown }> = [];

    const applyFilters = (candidates: Record<string, unknown>[]) =>
      candidates.filter((r) => filters.every((f) => r[f.col] === f.val));

    const chain = {
      select() {
        return chain;
      },
      eq(col: string, val: unknown) {
        filters.push({ col, val });
        return chain;
      },
      or() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      update(payload: Record<string, unknown>) {
        mode = "update";
        updatePayload = payload;
        return chain;
      },
      insert(payload: Record<string, unknown>) {
        mode = "insert";
        insertPayload = payload;
        return chain;
      },
      maybeSingle() {
        const matched = applyFilters(rows)[0] ?? null;
        return Promise.resolve({ data: matched, error: null });
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (mode === "update") {
          rows = rows.map((r) =>
            applyFilters([r]).length > 0 ? { ...r, ...(updatePayload ?? {}) } : r,
          );
          tables.set(table, rows);
          resolve({ data: null, error: null });
          return;
        }
        if (mode === "insert") {
          rows.push({ ...(insertPayload ?? {}) });
          tables.set(table, rows);
          resolve({ data: null, error: null });
          return;
        }
        resolve({ data: applyFilters(rows), error: null });
      },
    };
    return chain;
  }

  function rpc(name: string, args: unknown) {
    rpcCalls.push({ name, args });
    return Promise.resolve({ data: rpcResults[name] ?? null, error: null });
  }

  return { from, rpc, _tables: tables, _rpcCalls: rpcCalls };
}

function fakeSession(
  blxckbook: ReturnType<typeof createMockClient>,
  nxt: ReturnType<typeof createMockClient>,
): AuthenticatedAccountSession {
  return {
    creds: {
      userId: "user_test",
      email: "test@example.com",
      fullName: "Test User",
    } as AuthenticatedAccountSession["creds"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blxckbook: blxckbook as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nxt: nxt as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tv: {} as any,
    isSuperAdmin: false,
  };
}

test("listNotifications reads from the public-schema client, not api", async () => {
  const nxt = createMockClient({
    contact_notifications: [
      { id: "n1", recipient_user_id: "user_test", actor_name: "Luna", actor_user_id: "u2", read: false, created_at: "t" },
    ],
    event_invites: [
      { id: "e1", invitee_user_id: "user_test", status: "pending", title: "Coffee", organizer_name: "Luna", event_date: "2026-07-10", event_type: "date" },
    ],
  });
  const blxckbook = createMockClient({});
  const session = fakeSession(blxckbook, nxt);

  const result = await listNotifications(session);
  assert.equal(result.contactNotifications.length, 1);
  assert.equal(result.contactNotifications[0]?.actor_name, "Luna");
  assert.equal(result.pendingInvites.length, 1);
  assert.equal(result.pendingInvites[0]?.title, "Coffee");
});

test("connectContactBack refuses to duplicate an already-linked contact", async () => {
  const blxckbook = createMockClient({
    contacts: [{ id: "c1", user_id: "user_test", name: "Luna", linked_ecosystem_id: "u2" }],
  });
  const nxt = createMockClient({});
  const session = fakeSession(blxckbook, nxt);

  const result = await connectContactBack(session, "u2", "Luna");
  assert.equal(result.ok, false);
  assert.match(result.message, /Already connected/);
});

test("connectContactBack merges into an existing unlinked contact instead of duplicating", async () => {
  const blxckbook = createMockClient({
    contacts: [{ id: "c1", user_id: "user_test", name: "Luna Verde", notes: "old note", linked_ecosystem_id: null }],
  });
  const nxt = createMockClient({});
  const session = fakeSession(blxckbook, nxt);

  const result = await connectContactBack(session, "u2", "Luna Verde");
  assert.equal(result.ok, true);
  assert.match(result.message, /merged into your existing contact/);

  const rows = blxckbook._tables.get("contacts") ?? [];
  assert.equal(rows.length, 1, "must not create a duplicate row");
  assert.equal(rows[0]?.linked_ecosystem_id, "u2");
  assert.equal(rows[0]?.notes, "old note", "existing notes must survive the merge");
});

test("connectContactBack inserts a fresh contact when no unlinked match exists", async () => {
  const blxckbook = createMockClient({ contacts: [] });
  const nxt = createMockClient({});
  const session = fakeSession(blxckbook, nxt);

  const result = await connectContactBack(session, "u2", "Brand New Person");
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.message, /merged into/);

  const rows = blxckbook._tables.get("contacts") ?? [];
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.linked_ecosystem_id, "u2");
});

test("connectContactBack calls restore_relationship and notifies the other user via the public-schema client", async () => {
  const blxckbook = createMockClient({ contacts: [] });
  const nxt = createMockClient({});
  const session = fakeSession(blxckbook, nxt);

  await connectContactBack(session, "u2", "Someone");

  assert.equal(nxt._rpcCalls.length, 1);
  assert.equal(nxt._rpcCalls[0]?.name, "restore_relationship");
  const notifs = nxt._tables.get("contact_notifications") ?? [];
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0]?.recipient_user_id, "u2");
  assert.equal(notifs[0]?.actor_user_id, "user_test");
});

test("getRelationshipTier reports not-found for an unknown contact name", async () => {
  const blxckbook = createMockClient({ contacts: [] });
  const nxt = createMockClient({});
  const session = fakeSession(blxckbook, nxt);

  const result = await getRelationshipTier(session, "Nobody");
  assert.equal(result.ok, false);
  assert.match(result.message, /No contact matching/);
});

test("getRelationshipTier reports not-linked for a dummy (non-Clerk) contact", async () => {
  const blxckbook = createMockClient({
    contacts: [{ id: "c1", user_id: "user_test", name: "Dummy Contact", linked_ecosystem_id: null }],
  });
  const nxt = createMockClient({});
  const session = fakeSession(blxckbook, nxt);

  const result = await getRelationshipTier(session, "Dummy Contact");
  assert.equal(result.ok, false);
  assert.match(result.message, /isn't a Clerk-linked contact/);
});

test("getRelationshipTier returns tier and points for a linked contact", async () => {
  const blxckbook = createMockClient({
    contacts: [{ id: "c1", user_id: "user_test", name: "Luna Verde", linked_ecosystem_id: "u2" }],
  });
  const nxt = createMockClient(
    {
      relationship_tiers: [{ user_a_id: "u2", user_b_id: "user_test", total_points: 75, relationship_status: "dating" }],
    },
    { fn_user_tier_with_contact: 1 },
  );
  const session = fakeSession(blxckbook, nxt);

  const result = await getRelationshipTier(session, "luna verde");
  assert.equal(result.ok, true);
  assert.equal(result.tier, 1);
  assert.equal(result.totalPoints, 75);
  assert.match(result.message, /Tier 1 with Luna Verde \(75 points\), status: dating/);
});
