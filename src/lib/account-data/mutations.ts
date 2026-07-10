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
