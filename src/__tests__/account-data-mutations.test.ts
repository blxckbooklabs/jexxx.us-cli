import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addContact,
  updateContact,
  deleteContact,
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  managePlaylist,
  addContactEvent,
  updateContactEvent,
  deleteContactEvent,
} from "../lib/account-data/mutations.js";
import type { AuthenticatedAccountSession } from "../lib/account-data/session.js";

/**
 * Mock Supabase query-builder chain covering select/insert/update/delete —
 * a superset of account-data.test.ts's read-only mock, since mutations.ts
 * exercises the write side of the same `.from(table)...` chain. Each table
 * gets a mutable `rows` array so insert/update/delete visibly affect what a
 * later `.select()` on the same mock would see, mirroring real Postgres
 * semantics closely enough to catch logic bugs (e.g. wrong id used in
 * `.eq()`) without touching a real database.
 */
function createMockVaultClient(initialTables: Record<string, Record<string, unknown>[]>) {
  const tables = new Map<string, Record<string, unknown>[]>(
    Object.entries(initialTables).map(([k, v]) => [k, [...v]]),
  );
  let nextId = 1;
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  function from(table: string) {
    let rows = tables.get(table) ?? [];
    let mode: "select" | "update" | "insert" | "delete" = "select";
    let updatePayload: Record<string, unknown> | null = null;
    let insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;
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
      update(payload: Record<string, unknown>) {
        mode = "update";
        updatePayload = payload;
        calls.push({ table, op: "update", payload });
        return chain;
      },
      insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
        mode = "insert";
        insertPayload = payload;
        calls.push({ table, op: "insert", payload });
        return chain;
      },
      delete() {
        mode = "delete";
        calls.push({ table, op: "delete" });
        return chain;
      },
      single() {
        if (mode === "insert" && insertPayload && !Array.isArray(insertPayload)) {
          const row = { id: `mock-${nextId++}`, ...insertPayload };
          rows.push(row);
          tables.set(table, rows);
          return Promise.resolve({ data: row, error: null });
        }
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
          const toInsert = Array.isArray(insertPayload)
            ? insertPayload
            : insertPayload
              ? [insertPayload]
              : [];
          const inserted = toInsert.map((p) => ({ id: `mock-${nextId++}`, ...p }));
          rows.push(...inserted);
          tables.set(table, rows);
          resolve({ data: inserted, error: null });
          return;
        }
        if (mode === "delete") {
          const remaining = rows.filter((r) => applyFilters([r]).length === 0);
          tables.set(table, remaining);
          resolve({ data: null, error: null });
          return;
        }
        resolve({ data: applyFilters(rows), error: null });
      },
    };
    return chain;
  }

  return { from, _calls: calls, _tables: tables };
}

function fakeSession(clients: {
  blxckbook?: ReturnType<typeof createMockVaultClient>;
  nxt?: ReturnType<typeof createMockVaultClient>;
  tv?: ReturnType<typeof createMockVaultClient>;
}): AuthenticatedAccountSession {
  return {
    creds: { userId: "user_test", email: "test@example.com" } as AuthenticatedAccountSession["creds"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blxckbook: (clients.blxckbook ?? createMockVaultClient({})) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nxt: (clients.nxt ?? createMockVaultClient({})) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tv: (clients.tv ?? createMockVaultClient({})) as any,
    isSuperAdmin: false,
  };
}

test("addContact creates a new row when no name match exists", async () => {
  const client = createMockVaultClient({ contacts: [] });
  const session = fakeSession({ blxckbook: client });

  const result = await addContact(session, "New Person", { notes: "met at coffee" });
  assert.equal(result.ok, true);
  assert.match(result.message, /synced automatically to both BLXCKBOOK and NXT/);
  const rows = client._tables.get("contacts") ?? [];
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.name, "New Person");
});

test("addContact refuses to create a duplicate for an existing name", async () => {
  const client = createMockVaultClient({
    contacts: [{ id: "c1", user_id: "user_test", name: "Existing Person" }],
  });
  const session = fakeSession({ blxckbook: client });

  const result = await addContact(session, "existing person");
  assert.equal(result.ok, false);
  assert.match(result.message, /already exists/);
  assert.equal((client._tables.get("contacts") ?? []).length, 1, "must not insert a duplicate row");
});

test("updateContact applies allowed fields to the fuzzy-matched row", async () => {
  const client = createMockVaultClient({
    contacts: [{ id: "c1", user_id: "user_test", name: "Xena Test", relationship_status: "Talking" }],
  });
  const session = fakeSession({ blxckbook: client });

  const result = await updateContact(session, "blxckbook", "xena", {
    relationship_status: "Dating",
  });

  assert.equal(result.ok, true);
  assert.match(result.message, /Updated blxckbook contact "Xena Test"/);
  const row = client._tables.get("contacts")?.[0];
  assert.equal(row?.relationship_status, "Dating");
});

test("updateContact refuses to write protected fields", async () => {
  const client = createMockVaultClient({
    contacts: [{ id: "c1", user_id: "user_test", name: "Xena Test" }],
  });
  const session = fakeSession({ blxckbook: client });

  const result = await updateContact(session, "blxckbook", "xena", {
    user_id: "someone_else",
    notes: "fine",
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /protected field/);
});

test("updateContact reports no match for an unknown contact name", async () => {
  const client = createMockVaultClient({ contacts: [] });
  const session = fakeSession({ blxckbook: client });

  const result = await updateContact(session, "blxckbook", "nobody", { notes: "x" });
  assert.equal(result.ok, false);
  assert.match(result.message, /No blxckbook contact matching/);
});

test("deleteContact removes the fuzzy-matched row", async () => {
  const client = createMockVaultClient({
    contacts: [{ id: "c1", user_id: "user_test", name: "Xena Test" }],
  });
  const session = fakeSession({ blxckbook: client });

  const result = await deleteContact(session, "blxckbook", "xena test");
  assert.equal(result.ok, true);
  assert.equal(client._tables.get("contacts")?.length, 0);
});

test("addJournalEntry creates an entry and links matched contacts", async () => {
  const client = createMockVaultClient({
    journal_entries: [],
    journal_contact_links: [],
    contacts: [{ id: "c1", user_id: "user_test", name: "Xena Test" }],
  });
  const session = fakeSession({ blxckbook: client });

  const result = await addJournalEntry(session, "First date", "It went well", {
    linkedContactNames: ["xena"],
  });

  assert.equal(result.ok, true);
  assert.ok(result.entryId);
  const links = client._tables.get("journal_contact_links") ?? [];
  assert.equal(links.length, 1);
  assert.equal(links[0]?.contact_id, "c1");
});

test("updateJournalEntry matches by fuzzy title and applies field updates", async () => {
  const client = createMockVaultClient({
    journal_entries: [{ id: "j1", user_id: "user_test", title: "First date", content: "old" }],
  });
  const session = fakeSession({ blxckbook: client });

  const result = await updateJournalEntry(session, "first date", { content: "new content" });
  assert.equal(result.ok, true);
  const row = client._tables.get("journal_entries")?.[0];
  assert.equal(row?.content, "new content");
});

test("deleteJournalEntry removes the entry and its contact links", async () => {
  const client = createMockVaultClient({
    journal_entries: [{ id: "j1", user_id: "user_test", title: "First date" }],
    journal_contact_links: [{ journal_id: "j1", user_id: "user_test", contact_id: "c1" }],
  });
  const session = fakeSession({ blxckbook: client });

  const result = await deleteJournalEntry(session, "j1");
  assert.equal(result.ok, true);
  assert.equal(client._tables.get("journal_entries")?.length, 0);
  assert.equal(client._tables.get("journal_contact_links")?.length, 0);
});

test("managePlaylist create/rename/add_video/remove_video/delete round-trip", async () => {
  const client = createMockVaultClient({ playlists: [], playlist_items: [] });
  const session = fakeSession({ tv: client });

  const created = await managePlaylist(session, "create", "Date Night", { isPrivate: true });
  assert.equal(created.ok, true);

  const renamed = await managePlaylist(session, "rename", "Date Night", { newName: "Anniversary" });
  assert.equal(renamed.ok, true);

  const added = await managePlaylist(session, "add_video", "Anniversary", { videoId: "vid1" });
  assert.equal(added.ok, true);
  assert.equal(client._tables.get("playlist_items")?.length, 1);

  const removed = await managePlaylist(session, "remove_video", "Anniversary", { videoId: "vid1" });
  assert.equal(removed.ok, true);
  assert.equal(client._tables.get("playlist_items")?.length, 0);

  const deleted = await managePlaylist(session, "delete", "Anniversary");
  assert.equal(deleted.ok, true);
  assert.equal(client._tables.get("playlists")?.length, 0);
});

test("addContactEvent links to the fuzzy-matched vessel", async () => {
  const client = createMockVaultClient({
    vessels: [{ id: "v1", user_id: "user_test", name: "Xena Test" }],
    contact_events: [],
  });
  const session = fakeSession({ nxt: client });

  const result = await addContactEvent(session, "xena", { title: "Coffee", eventDate: "2026-07-01" });
  assert.equal(result.ok, true);
  assert.ok(result.eventId);
  const row = client._tables.get("contact_events")?.[0];
  assert.equal(row?.vessel_id, "v1");
});

test("updateContactEvent and deleteContactEvent operate by event id", async () => {
  const client = createMockVaultClient({
    contact_events: [{ id: "e1", user_id: "user_test", title: "Coffee", event_date: "2026-07-01" }],
  });
  const session = fakeSession({ nxt: client });

  const updated = await updateContactEvent(session, "e1", { title: "Dinner" });
  assert.equal(updated.ok, true);
  assert.equal(client._tables.get("contact_events")?.[0]?.title, "Dinner");

  const deleted = await deleteContactEvent(session, "e1");
  assert.equal(deleted.ok, true);
  assert.equal(client._tables.get("contact_events")?.length, 0);
});
