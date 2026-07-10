import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthenticatedAccountSession } from "./session.js";
import { resolveTvClient, resolveVaultClient } from "./session.js";
import type { DashboardTarget } from "../supabase.js";
import { fuzzyMatchContact, normalizeName } from "./account-query.js";

/**
 * Vault write path — mirrors account-query.ts's read path exactly:
 * resolveVaultClient()/resolveTvClient() with NO asUserId. Mutations never
 * accept asUserId, even for super-admins — reading another user's data is
 * one thing, writing to it on their behalf is a different risk class this
 * tool surface deliberately does not take on. Every mutation re-checks
 * `.eq("user_id", userId)` alongside RLS, same defense-in-depth rationale
 * as the export fetchers.
 */

const CONTACT_UPDATABLE_FIELDS = [
  "name",
  "notes",
  "tags",
  "relationship_status",
  "visibility",
  "is_discoverable",
] as const;
type ContactUpdatableField = (typeof CONTACT_UPDATABLE_FIELDS)[number];

/** NXT vessels have no fixed schema (see nxt-export.ts) — allow the same
 * shape BLXCKBOOK contacts use since dxsh.blxckbook.jexxx.us/dxsh.nxt sync
 * triggers keep both in the same column shape for shared fields, but never
 * accept id/user_id/created_at regardless of target. */
const PROTECTED_FIELDS = new Set(["id", "user_id", "created_at"]);

export interface UpdateContactResult {
  ok: boolean;
  message: string;
}

function sanitizeContactUpdates(
  updates: Record<string, unknown>,
): { fields: Record<string, unknown>; rejected: string[] } {
  const fields: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (PROTECTED_FIELDS.has(key)) {
      rejected.push(key);
      continue;
    }
    fields[key] = value;
  }
  return { fields, rejected };
}

export interface AddContactResult {
  ok: boolean;
  message: string;
  contactId?: string;
}

/**
 * Create a brand-new contact. Always inserts into `api.contacts`
 * (BLXCKBOOK) only — `public.vessels` (NXT) is NOT written to separately.
 * `trg_sync_contact_to_vessel` (Postgres trigger, confirmed live: insert /
 * update / delete on api.contacts) mirrors the row into public.vessels
 * automatically, same id, in both directions. Writing to both tables from
 * here would race the trigger and risk two divergent rows — the exact bug
 * class this session already fixed once (a manual-merge bug that left two
 * rows for one person). One insert, one schema, the trigger keeps both
 * dashboards synchronized — hence "very synchronistic" without doing
 * anything explicit for NXT at all.
 */
export async function addContact(
  session: AuthenticatedAccountSession,
  name: string,
  options?: {
    notes?: string;
    tags?: string[];
    relationshipStatus?: string;
    visibility?: string;
  },
): Promise<AddContactResult> {
  const vault = resolveVaultClient(session, "blxckbook");

  const { data: existingRows } = await vault.client
    .from("contacts")
    .select("*")
    .eq("user_id", vault.effectiveUserId);
  const existing = fuzzyMatchContact((existingRows ?? []) as { name: string }[], name);
  if (existing) {
    return {
      ok: false,
      message:
        `A contact matching "${name}" already exists ("${existing.name}") — ` +
        `use update_contact to edit it instead of creating a duplicate.`,
    };
  }

  const { data: inserted, error } = await vault.client
    .from("contacts")
    .insert({
      user_id: vault.effectiveUserId,
      name,
      notes: options?.notes ?? "",
      tags: options?.tags ?? [],
      relationship_status: options?.relationshipStatus ?? null,
      visibility: options?.visibility ?? "private",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, message: `Failed to add contact: ${error?.message ?? "unknown error"}` };
  }

  return {
    ok: true,
    contactId: inserted.id as string,
    message: `Added "${name}" — synced automatically to both BLXCKBOOK and NXT (shared trigger).`,
  };
}

/**
 * Update one BLXCKBOOK contact or NXT vessel by fuzzy name match.
 * `target` must be "blxckbook" or "nxt" — no "auto" here, since the same
 * name could exist as a contact on one side and a vessel on the other and
 * silently updating the wrong one is worse than requiring the caller to
 * be explicit (the read-only account_query tool can disambiguate first).
 */
export async function updateContact(
  session: AuthenticatedAccountSession,
  target: DashboardTarget,
  contactName: string,
  updates: Record<string, unknown>,
): Promise<UpdateContactResult> {
  const { fields, rejected } = sanitizeContactUpdates(updates);
  if (rejected.length > 0) {
    return {
      ok: false,
      message: `Refused to update protected field(s): ${rejected.join(", ")}.`,
    };
  }
  if (Object.keys(fields).length === 0) {
    return { ok: false, message: "No updatable fields provided." };
  }

  let vault;
  try {
    vault = resolveVaultClient(session, target);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  const table = target === "blxckbook" ? "contacts" : "vessels";
  const { data: rows, error: findError } = await vault.client
    .from(table)
    .select("*")
    .eq("user_id", vault.effectiveUserId);

  if (findError) {
    return { ok: false, message: `Lookup failed: ${findError.message}` };
  }

  const match = fuzzyMatchContact((rows ?? []) as { name: string }[], contactName);
  if (!match) {
    return { ok: false, message: `No ${target} contact matching "${contactName}" found.` };
  }

  const row = match as Record<string, unknown>;
  const { error: updateError } = await vault.client
    .from(table)
    .update(fields)
    .eq("id", row.id)
    .eq("user_id", vault.effectiveUserId);

  if (updateError) {
    return { ok: false, message: `Update failed: ${updateError.message}` };
  }

  const changedKeys = Object.keys(fields).join(", ");
  return {
    ok: true,
    message: `Updated ${target} contact "${row.name}" (${changedKeys}).`,
  };
}

export interface AddJournalEntryResult {
  ok: boolean;
  message: string;
  entryId?: string;
}

/**
 * Create a BLXCKBOOK journal entry, optionally linked to existing contacts
 * by name (fuzzy-matched, same as updateContact). NXT has no journal
 * concept today — journal entries are BLXCKBOOK-only.
 */
export async function addJournalEntry(
  session: AuthenticatedAccountSession,
  title: string,
  content: string,
  options?: { tags?: string[]; linkedContactNames?: string[] },
): Promise<AddJournalEntryResult> {
  const vault = resolveVaultClient(session, "blxckbook");

  const { data: inserted, error: insertError } = await vault.client
    .from("journal_entries")
    .insert({
      user_id: vault.effectiveUserId,
      title,
      content,
      tags: options?.tags ?? [],
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return {
      ok: false,
      message: `Failed to create journal entry: ${insertError?.message ?? "unknown error"}`,
    };
  }

  const entryId = inserted.id as string;

  if (options?.linkedContactNames?.length) {
    const { data: contacts } = await vault.client
      .from("contacts")
      .select("id, name")
      .eq("user_id", vault.effectiveUserId);

    const linkRows = options.linkedContactNames
      .map((name) => fuzzyMatchContact((contacts ?? []) as { name: string; id: string }[], name))
      .filter((c): c is { name: string; id: string } => Boolean(c))
      .map((c) => ({
        user_id: vault.effectiveUserId,
        journal_id: entryId,
        contact_id: c.id,
      }));

    if (linkRows.length > 0) {
      await vault.client.from("journal_contact_links").insert(linkRows);
    }
  }

  return {
    ok: true,
    message: `Created journal entry "${title}" (id ${entryId}).`,
    entryId,
  };
}

export interface JournalEntryMutationResult {
  ok: boolean;
  message: string;
}

async function findJournalEntry(
  vault: { client: ReturnType<typeof resolveVaultClient>["client"]; effectiveUserId: string },
  entryIdOrTitle: string,
): Promise<{ id: string; title: string } | null> {
  const { data } = await vault.client
    .from("journal_entries")
    .select("id, title")
    .eq("user_id", vault.effectiveUserId);
  const rows = (data ?? []) as { id: string; title: string }[];
  const direct = rows.find((r) => r.id === entryIdOrTitle);
  if (direct) return direct;
  const needle = normalizeName(entryIdOrTitle);
  return (
    rows.find((r) => normalizeName(r.title ?? "") === needle) ??
    rows.find((r) => normalizeName(r.title ?? "").includes(needle)) ??
    null
  );
}

/** Update an existing BLXCKBOOK journal entry's title/content/tags, matched by id or title. */
export async function updateJournalEntry(
  session: AuthenticatedAccountSession,
  entryIdOrTitle: string,
  updates: { title?: string; content?: string; tags?: string[] },
): Promise<JournalEntryMutationResult> {
  const vault = resolveVaultClient(session, "blxckbook");
  const entry = await findJournalEntry(vault, entryIdOrTitle);
  if (!entry) {
    return { ok: false, message: `No journal entry matching "${entryIdOrTitle}" found.` };
  }

  const fields: Record<string, unknown> = {};
  if (updates.title !== undefined) fields.title = updates.title;
  if (updates.content !== undefined) fields.content = updates.content;
  if (updates.tags !== undefined) fields.tags = updates.tags;
  if (Object.keys(fields).length === 0) {
    return { ok: false, message: "No updatable fields provided (title, content, tags)." };
  }

  const { error } = await vault.client
    .from("journal_entries")
    .update(fields)
    .eq("id", entry.id)
    .eq("user_id", vault.effectiveUserId);
  if (error) return { ok: false, message: `Update failed: ${error.message}` };

  return { ok: true, message: `Updated journal entry "${entry.title}".` };
}

/** Delete a BLXCKBOOK journal entry (and its contact links), matched by id or title. */
export async function deleteJournalEntry(
  session: AuthenticatedAccountSession,
  entryIdOrTitle: string,
): Promise<JournalEntryMutationResult> {
  const vault = resolveVaultClient(session, "blxckbook");
  const entry = await findJournalEntry(vault, entryIdOrTitle);
  if (!entry) {
    return { ok: false, message: `No journal entry matching "${entryIdOrTitle}" found.` };
  }

  await vault.client
    .from("journal_contact_links")
    .delete()
    .eq("journal_id", entry.id)
    .eq("user_id", vault.effectiveUserId);

  const { error } = await vault.client
    .from("journal_entries")
    .delete()
    .eq("id", entry.id)
    .eq("user_id", vault.effectiveUserId);
  if (error) return { ok: false, message: `Delete failed: ${error.message}` };

  return { ok: true, message: `Deleted journal entry "${entry.title}".` };
}

/** Delete a BLXCKBOOK contact or NXT vessel by fuzzy name match. */
export async function deleteContact(
  session: AuthenticatedAccountSession,
  target: DashboardTarget,
  contactName: string,
): Promise<UpdateContactResult> {
  let vault;
  try {
    vault = resolveVaultClient(session, target);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  const table = target === "blxckbook" ? "contacts" : "vessels";
  const { data: rows } = await vault.client
    .from(table)
    .select("*")
    .eq("user_id", vault.effectiveUserId);

  const match = fuzzyMatchContact((rows ?? []) as { name: string }[], contactName);
  if (!match) {
    return { ok: false, message: `No ${target} contact matching "${contactName}" found.` };
  }
  const row = match as Record<string, unknown>;

  const { error } = await vault.client
    .from(table)
    .delete()
    .eq("id", row.id)
    .eq("user_id", vault.effectiveUserId);
  if (error) return { ok: false, message: `Delete failed: ${error.message}` };

  return { ok: true, message: `Deleted ${target} contact "${row.name}".` };
}

export interface ContactEventMutationResult {
  ok: boolean;
  message: string;
  eventId?: string;
}

/**
 * Create an NXT contact_events row (a logged date/event), linked to a
 * vessel by name. Column names verified live against a real (throwaway
 * test) row after the schema (public.contact_events: id, user_id,
 * vessel_id, event_date, event_type, title, location, notes, created_at,
 * updated_at — see supabase/supabase/migrations/20260708223504_remote_schema.sql
 * line ~1289) turned out to differ from the initial assumption (vessel_id,
 * not contact_id; event_type, not kind).
 */
export async function addContactEvent(
  session: AuthenticatedAccountSession,
  contactName: string,
  fields: { title: string; eventDate: string; eventType?: string; location?: string; notes?: string },
): Promise<ContactEventMutationResult> {
  const vault = resolveVaultClient(session, "nxt");
  const { data: vessels } = await vault.client
    .from("vessels")
    .select("*")
    .eq("user_id", vault.effectiveUserId);
  const vessel = fuzzyMatchContact((vessels ?? []) as { name: string; id: string }[], contactName);
  if (!vessel) {
    return { ok: false, message: `No NXT contact matching "${contactName}" found.` };
  }

  const row: Record<string, unknown> = {
    user_id: vault.effectiveUserId,
    vessel_id: (vessel as { id: string }).id,
    title: fields.title,
    event_date: fields.eventDate,
  };
  if (fields.eventType !== undefined) row.event_type = fields.eventType;
  if (fields.location !== undefined) row.location = fields.location;
  if (fields.notes !== undefined) row.notes = fields.notes;

  const { data: inserted, error } = await vault.client
    .from("contact_events")
    .insert(row)
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, message: `Failed to add event: ${error?.message ?? "unknown error"}` };
  }
  return {
    ok: true,
    message: `Added event "${fields.title}" for "${contactName}".`,
    eventId: inserted.id as string,
  };
}

/** Update an NXT contact_events row, matched by id. */
export async function updateContactEvent(
  session: AuthenticatedAccountSession,
  eventId: string,
  updates: { title?: string; eventDate?: string; eventType?: string; location?: string; notes?: string },
): Promise<ContactEventMutationResult> {
  const vault = resolveVaultClient(session, "nxt");
  const fields: Record<string, unknown> = {};
  if (updates.title !== undefined) fields.title = updates.title;
  if (updates.eventDate !== undefined) fields.event_date = updates.eventDate;
  if (updates.eventType !== undefined) fields.event_type = updates.eventType;
  if (updates.location !== undefined) fields.location = updates.location;
  if (updates.notes !== undefined) fields.notes = updates.notes;
  if (Object.keys(fields).length === 0) {
    return { ok: false, message: "No updatable fields provided (title, eventDate, eventType, location, notes)." };
  }

  const { error } = await vault.client
    .from("contact_events")
    .update(fields)
    .eq("id", eventId)
    .eq("user_id", vault.effectiveUserId);
  if (error) return { ok: false, message: `Update failed: ${error.message}` };
  return { ok: true, message: `Updated event ${eventId}.` };
}

/** Delete an NXT contact_events row, matched by id. */
export async function deleteContactEvent(
  session: AuthenticatedAccountSession,
  eventId: string,
): Promise<ContactEventMutationResult> {
  const vault = resolveVaultClient(session, "nxt");
  const { error } = await vault.client
    .from("contact_events")
    .delete()
    .eq("id", eventId)
    .eq("user_id", vault.effectiveUserId);
  if (error) return { ok: false, message: `Delete failed: ${error.message}` };
  return { ok: true, message: `Deleted event ${eventId}.` };
}

export type PlaylistAction =
  | "create"
  | "rename"
  | "delete"
  | "add_video"
  | "remove_video";

export interface ManagePlaylistResult {
  ok: boolean;
  message: string;
}

/** JEXXXUS | TV custom playlist mutations — always the signed-in user's own. */
export async function managePlaylist(
  session: AuthenticatedAccountSession,
  action: PlaylistAction,
  playlistName: string,
  options?: { newName?: string; videoId?: string; isPrivate?: boolean },
): Promise<ManagePlaylistResult> {
  const tv = resolveTvClient(session);

  const findPlaylist = async (): Promise<{ id: string; name: string } | null> => {
    const { data } = await tv.client
      .from("playlists")
      .select("id, name")
      .eq("user_id", tv.effectiveUserId);
    const rows = (data ?? []) as { id: string; name: string }[];
    const needle = normalizeName(playlistName);
    return (
      rows.find((r) => normalizeName(r.name) === needle) ??
      rows.find((r) => normalizeName(r.name).includes(needle)) ??
      null
    );
  };

  switch (action) {
    case "create": {
      const { error } = await tv.client.from("playlists").insert({
        user_id: tv.effectiveUserId,
        name: playlistName,
        is_private: options?.isPrivate ?? true,
      });
      if (error) return { ok: false, message: `Failed to create playlist: ${error.message}` };
      return { ok: true, message: `Created playlist "${playlistName}".` };
    }

    case "rename": {
      if (!options?.newName) {
        return { ok: false, message: "newName is required for action=rename." };
      }
      const playlist = await findPlaylist();
      if (!playlist) return { ok: false, message: `No playlist matching "${playlistName}" found.` };
      const { error } = await tv.client
        .from("playlists")
        .update({ name: options.newName })
        .eq("id", playlist.id)
        .eq("user_id", tv.effectiveUserId);
      if (error) return { ok: false, message: `Rename failed: ${error.message}` };
      return { ok: true, message: `Renamed playlist "${playlist.name}" to "${options.newName}".` };
    }

    case "delete": {
      const playlist = await findPlaylist();
      if (!playlist) return { ok: false, message: `No playlist matching "${playlistName}" found.` };
      const { error } = await tv.client
        .from("playlists")
        .delete()
        .eq("id", playlist.id)
        .eq("user_id", tv.effectiveUserId);
      if (error) return { ok: false, message: `Delete failed: ${error.message}` };
      return { ok: true, message: `Deleted playlist "${playlist.name}".` };
    }

    case "add_video": {
      if (!options?.videoId) {
        return { ok: false, message: "videoId is required for action=add_video." };
      }
      const playlist = await findPlaylist();
      if (!playlist) return { ok: false, message: `No playlist matching "${playlistName}" found.` };
      const { error } = await tv.client.from("playlist_items").insert({
        playlist_id: playlist.id,
        video_id: options.videoId,
      });
      if (error) return { ok: false, message: `Failed to add video: ${error.message}` };
      return { ok: true, message: `Added video ${options.videoId} to "${playlist.name}".` };
    }

    case "remove_video": {
      if (!options?.videoId) {
        return { ok: false, message: "videoId is required for action=remove_video." };
      }
      const playlist = await findPlaylist();
      if (!playlist) return { ok: false, message: `No playlist matching "${playlistName}" found.` };
      const { error } = await tv.client
        .from("playlist_items")
        .delete()
        .eq("playlist_id", playlist.id)
        .eq("video_id", options.videoId);
      if (error) return { ok: false, message: `Failed to remove video: ${error.message}` };
      return { ok: true, message: `Removed video ${options.videoId} from "${playlist.name}".` };
    }
  }
}

interface SyncableContact {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

interface SyncableJournalEntry {
  id?: string;
  title?: string;
  content?: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * Re-apply a (possibly hand-edited) BLXCKBOOK export back to Supabase.
 * Rows with an `id` matching an existing row are updated; rows without an
 * `id` (or whose `id` doesn't match anything) are treated as new and
 * inserted. Never deletes — a row missing from the file is left untouched,
 * since inferring "the user deleted this" from absence is too easy to get
 * wrong (e.g. a truncated/partial export).
 */
export async function syncBlxckbookExport(
  session: AuthenticatedAccountSession,
  payload: { contacts?: SyncableContact[]; journal_entries?: SyncableJournalEntry[] },
): Promise<string> {
  const vault = resolveVaultClient(session, "blxckbook");
  const summary: string[] = [];

  if (payload.contacts?.length) {
    let updated = 0;
    let created = 0;
    let skipped = 0;
    for (const row of payload.contacts) {
      const { fields, rejected } = sanitizeContactUpdates(row);
      delete fields.id;
      if (rejected.length > 0) skipped++;

      if (row.id) {
        const { error } = await vault.client
          .from("contacts")
          .update(fields)
          .eq("id", row.id)
          .eq("user_id", vault.effectiveUserId);
        if (!error) updated++;
        else skipped++;
      } else if (row.name) {
        const { error } = await vault.client
          .from("contacts")
          .insert({ ...fields, user_id: vault.effectiveUserId });
        if (!error) created++;
        else skipped++;
      } else {
        skipped++;
      }
    }
    summary.push(`contacts: ${updated} updated, ${created} created, ${skipped} skipped`);
  }

  if (payload.journal_entries?.length) {
    let updated = 0;
    let created = 0;
    let skipped = 0;
    for (const row of payload.journal_entries) {
      const fields: Record<string, unknown> = {};
      if (row.title !== undefined) fields.title = row.title;
      if (row.content !== undefined) fields.content = row.content;
      if (row.tags !== undefined) fields.tags = row.tags;

      if (row.id) {
        const { error } = await vault.client
          .from("journal_entries")
          .update(fields)
          .eq("id", row.id)
          .eq("user_id", vault.effectiveUserId);
        if (!error) updated++;
        else skipped++;
      } else if (row.title || row.content) {
        const { error } = await vault.client
          .from("journal_entries")
          .insert({ ...fields, user_id: vault.effectiveUserId });
        if (!error) created++;
        else skipped++;
      } else {
        skipped++;
      }
    }
    summary.push(`journal_entries: ${updated} updated, ${created} created, ${skipped} skipped`);
  }

  return summary.length > 0 ? summary.join("; ") : "Nothing to sync — no contacts or journal_entries in file.";
}

export type { SupabaseClient };
export { CONTACT_UPDATABLE_FIELDS };
export type { ContactUpdatableField };
