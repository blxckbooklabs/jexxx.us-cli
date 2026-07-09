import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchBlxckbookExport } from "../lib/account-data/blxckbook-export.js";
import { fetchNxtExport } from "../lib/account-data/nxt-export.js";

/**
 * Minimal fake mirroring the real Supabase query-builder chain
 * (.from().select().eq().order()), same pattern as
 * src/__tests__/import.test.ts's createMockSupabase(). Records every
 * `.eq("user_id", ...)` call per table so tests can assert the
 * defense-in-depth scoping is actually applied, not just RLS.
 */
function createMockSupabase(tables: Record<string, { data: unknown[] | null; error: { message: string } | null }>) {
  const eqCalls: Array<{ table: string; column: string; value: string }> = [];

  return {
    _eqCalls: eqCalls,
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null };
      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: string) {
          eqCalls.push({ table, column, value });
          return chain;
        },
        order() {
          return Promise.resolve(result);
        },
        then(resolve: (value: typeof result) => void) {
          resolve(result);
        },
      };
      return chain;
    },
  };
}

test("fetchBlxckbookExport assembles export payload matching SettingsView schema", async () => {
  const supabase = createMockSupabase({
    contacts: {
      data: [
        {
          id: "c1",
          name: "Alex",
          photo: "",
          last_active: "Just now",
          created_at: "2026-07-01T00:00:00.000Z",
          tags: ["close"],
          notes: "met at coffee shop",
          is_discoverable: true,
          linked_ecosystem_id: null,
          visibility: "private",
          relationship_status: "dating",
        },
      ],
      error: null,
    },
    journal_entries: {
      data: [
        {
          id: "j1",
          title: "First date",
          content: "Went well",
          created_at: "2026-07-02T00:00:00.000Z",
          tags: ["milestone"],
        },
      ],
      error: null,
    },
    journal_contact_links: {
      data: [{ journal_id: "j1", contact_id: "c1" }],
      error: null,
    },
    timeline_events: {
      data: [
        {
          id: "t1",
          title: "Connection added: Alex",
          kind: "contact_added",
          happens_at: "2026-07-01T00:00:00.000Z",
          contact_id: "c1",
        },
      ],
      error: null,
    },
  });

  const result = await fetchBlxckbookExport(supabase as never, "user_1", "alice@example.com");

  assert.equal(result.$schema, "https://jexxx.us/schemas/blxckbook-export.schema.json");
  assert.equal(result.format_version, "1.0");
  assert.equal(result.user.id, "user_1");
  assert.equal(result.user.email, "alice@example.com");

  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0]?.name, "Alex");
  assert.equal(result.contacts[0]?.relationshipStatus, "dating");

  assert.equal(result.journal_entries.length, 1);
  assert.deepEqual(result.journal_entries[0]?.linkedContacts, ["c1"]);

  assert.equal(result.timeline_events.length, 1);
  assert.equal(result.timeline_events[0]?.contactId, "c1");

  assert.equal(result._statistics.total_contacts, 1);
  assert.equal(result._statistics.relationship_status_distribution.dating, 1);

  // Defense-in-depth: every table query must scope to user_id explicitly,
  // even though RLS already enforces it — see the leak-fix rationale in
  // fetchBlxckbookExport()'s doc comment.
  const scopedTables = supabase._eqCalls.map((c) => c.table);
  assert.ok(scopedTables.includes("contacts"));
  assert.ok(scopedTables.includes("journal_entries"));
  assert.ok(scopedTables.includes("journal_contact_links"));
  assert.ok(scopedTables.includes("timeline_events"));
  assert.ok(supabase._eqCalls.every((c) => c.value === "user_1"));
});

test("fetchBlxckbookExport throws with a descriptive message on query error", async () => {
  const supabase = createMockSupabase({
    contacts: { data: null, error: { message: "permission denied for table contacts" } },
    journal_entries: { data: [], error: null },
    journal_contact_links: { data: [], error: null },
    timeline_events: { data: [], error: null },
  });

  await assert.rejects(
    () => fetchBlxckbookExport(supabase as never, "user_1", "alice@example.com"),
    /Failed to fetch contacts: permission denied/,
  );
});

test("fetchNxtExport returns raw vessels + contact_events rows scoped to the user", async () => {
  const supabase = createMockSupabase({
    vessels: {
      data: [{ id: "v1", user_id: "user_1", name: "Bob" }],
      error: null,
    },
    contact_events: {
      data: [{ id: "e1", user_id: "user_1", vessel_id: "v1", event_type: "date" }],
      error: null,
    },
  });

  const result = await fetchNxtExport(supabase as never, "user_1");

  assert.equal(result.format_version, "1.0");
  assert.equal(result.contacts.length, 1);
  assert.equal(result.events.length, 1);

  const scopedTables = supabase._eqCalls.map((c) => c.table);
  assert.ok(scopedTables.includes("vessels"));
  assert.ok(scopedTables.includes("contact_events"));
  assert.ok(supabase._eqCalls.every((c) => c.value === "user_1"));
});

test("fetchNxtExport throws with a descriptive message on query error", async () => {
  const supabase = createMockSupabase({
    vessels: { data: null, error: { message: "relation does not exist" } },
    contact_events: { data: [], error: null },
  });

  await assert.rejects(
    () => fetchNxtExport(supabase as never, "user_1"),
    /Failed to fetch vessels: relation does not exist/,
  );
});
