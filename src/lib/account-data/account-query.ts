import type { SupabaseClient } from "@supabase/supabase-js";

import type { BlxckbookContact, BlxckbookJournalEntry, BlxckbookTimelineEvent } from "./blxckbook-export.js";
import { fetchBlxckbookExport } from "./blxckbook-export.js";
import { fetchNxtExport } from "./nxt-export.js";
import {
  fetchPlaylistDetail,
  fetchTvPlaylistSummary,
  fetchUserPlaylists,
} from "./tv-playlists.js";
import type { AuthenticatedAccountSession } from "./session.js";
import { resolveTvClient, resolveVaultClient } from "./session.js";
import { formatCredentialsDisplayName } from "../operator-identity.js";
import type { DashboardTarget } from "../supabase.js";
import {
  executeAccountQueryViaApi,
  fetchAccountSummaryViaApi,
  getJexxxusApiBaseUrl,
} from "./jexxxus-api-client.js";

export type AccountQueryAction =
  | "summary"
  | "contacts"
  | "contact"
  | "journal"
  | "timeline"
  | "events"
  | "profiles"
  | "playlists"
  | "playlist"
  | "export_preview";

export type AccountQueryTarget = DashboardTarget | "auto";

export interface AccountQueryArgs {
  action: AccountQueryAction;
  target?: AccountQueryTarget;
  contactName?: string;
  relationshipStatus?: string;
  playlistName?: string;
  /** Super-admin only: read another Clerk user's vault/TV data */
  asUserId?: string;
  limit?: number;
}

export interface AccountSummary {
  signedInAs: string;
  userId: string;
  isSuperAdmin: boolean;
  elevated: boolean;
  tv: {
    playlists: number;
    savedVideos: number;
  };
  blxckbook: {
    contacts: number;
    journalEntries: number;
    timelineEvents: number;
    relationshipStatusDistribution: Record<string, number>;
    recentContacts: Array<{ name: string; status: string | null }>;
  };
  nxt: {
    profiles: number;
    events: number;
    recentProfiles: Array<{ name: string; status: string | null }>;
  };
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function fuzzyMatchContact<T extends { name: string }>(
  rows: T[],
  contactName: string,
): T | undefined {
  const needle = normalizeName(contactName);
  return (
    rows.find((r) => normalizeName(r.name) === needle) ??
    rows.find((r) => normalizeName(r.name).includes(needle))
  );
}

function truncateNotes(notes: string, max = 240): string {
  const trimmed = notes.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function vesselName(row: Record<string, unknown>): string {
  return typeof row.name === "string" ? row.name : "Unnamed";
}

function vesselStatus(row: Record<string, unknown>): string | null {
  const status = row.relationship_status;
  return typeof status === "string" ? status : null;
}

export async function fetchAccountSummary(
  session: AuthenticatedAccountSession,
  asUserId?: string,
): Promise<AccountSummary> {
  if (getJexxxusApiBaseUrl()) {
    try {
      return await fetchAccountSummaryViaApi(session, asUserId);
    } catch (err) {
      console.warn(
        "[account] JEXXXUS | API summary failed — falling back to direct Supabase:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const bbVault = resolveVaultClient(session, "blxckbook", asUserId);
  const nxtVault = resolveVaultClient(session, "nxt", asUserId);
  const tvVault = resolveTvClient(session, asUserId);

  const [bb, nxt, tv] = await Promise.all([
    fetchBlxckbookExport(
      bbVault.client,
      bbVault.effectiveUserId,
      session.creds.email,
    ),
    fetchNxtExport(nxtVault.client, nxtVault.effectiveUserId),
    fetchTvPlaylistSummary(tvVault.client, tvVault.effectiveUserId),
  ]);

  return {
    signedInAs: formatCredentialsDisplayName(session.creds),
    userId: bbVault.effectiveUserId,
    isSuperAdmin: session.isSuperAdmin,
    elevated: bbVault.elevated || nxtVault.elevated || tvVault.elevated,
    tv: {
      playlists: tv.playlistCount,
      savedVideos: tv.savedVideoCount,
    },
    blxckbook: {
      contacts: bb._statistics.total_contacts,
      journalEntries: bb._statistics.total_journal_entries,
      timelineEvents: bb._statistics.total_timeline_events,
      relationshipStatusDistribution: bb._statistics.relationship_status_distribution,
      recentContacts: bb.contacts.slice(0, 5).map((c) => ({
        name: c.name,
        status: c.relationshipStatus,
      })),
    },
    nxt: {
      profiles: nxt.contacts.length,
      events: nxt.events.length,
      recentProfiles: nxt.contacts.slice(0, 5).map((row) => ({
        name: vesselName(row),
        status: vesselStatus(row),
      })),
    },
  };
}

async function fetchBlxckbookContacts(
  client: SupabaseClient,
  userId: string,
  opts: { relationshipStatus?: string; limit: number },
): Promise<BlxckbookContact[]> {
  let query = client
    .from("contacts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(opts.limit);

  if (opts.relationshipStatus) {
    query = query.eq("relationship_status", opts.relationshipStatus);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch contacts: ${error.message}`);
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    photo: c.photo || "",
    lastActive: c.last_active || "Just now",
    createdAt: c.created_at || new Date().toISOString(),
    tags: c.tags || [],
    notes: c.notes || "",
    isDiscoverable: c.is_discoverable || false,
    linkedEcosystemId: c.linked_ecosystem_id || null,
    visibility: c.visibility || "private",
    relationshipStatus: c.relationship_status || null,
  }));
}

async function fetchBlxckbookJournal(
  client: SupabaseClient,
  userId: string,
  contactName: string | undefined,
  limit: number,
): Promise<BlxckbookJournalEntry[]> {
  const exportData = await fetchBlxckbookExport(client, userId, "");
  let entries = exportData.journal_entries;

  if (contactName) {
    const contact = fuzzyMatchContact(exportData.contacts, contactName);
    if (!contact) {
      return [];
    }
    entries = entries.filter((j) => j.linkedContacts.includes(contact.id));
  }

  return entries.slice(0, limit);
}

async function fetchBlxckbookTimeline(
  client: SupabaseClient,
  userId: string,
  contactName: string | undefined,
  limit: number,
): Promise<BlxckbookTimelineEvent[]> {
  const exportData = await fetchBlxckbookExport(client, userId, "");
  let events = exportData.timeline_events;

  if (contactName) {
    const contact = fuzzyMatchContact(exportData.contacts, contactName);
    if (!contact) {
      return [];
    }
    events = events.filter((e) => e.contactId === contact.id);
  }

  return events.slice(-limit).reverse();
}

export async function executeAccountQuery(
  session: AuthenticatedAccountSession,
  args: AccountQueryArgs,
): Promise<string> {
  if (getJexxxusApiBaseUrl()) {
    try {
      return await executeAccountQueryViaApi(session, args);
    } catch (err) {
      console.warn(
        "[account] JEXXXUS | API query failed — falling back to direct Supabase:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const action = args.action;
  const target = args.target ?? "auto";
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
  const contactName = args.contactName?.trim();
  const playlistName = args.playlistName?.trim();
  const asUserId = args.asUserId?.trim();

  let bbVault;
  let nxtVault;
  let tvVault;
  try {
    bbVault = resolveVaultClient(session, "blxckbook", asUserId);
    nxtVault = resolveVaultClient(session, "nxt", asUserId);
    tvVault = resolveTvClient(session, asUserId);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const userId = bbVault.effectiveUserId;
  const scopeLabel = bbVault.elevated ? ` (elevated read for ${userId})` : "";

  switch (action) {
    case "summary": {
      const summary = await fetchAccountSummary(session, asUserId);
      return JSON.stringify(summary, null, 2);
    }

    case "export_preview": {
      const payload: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        user: { id: userId, email: session.creds.email },
        elevated: bbVault.elevated,
      };
      const includeBlxckbook = target !== "nxt";
      const includeNxt = target !== "blxckbook";
      if (includeBlxckbook) {
        payload.blxckbook = await fetchBlxckbookExport(
          bbVault.client,
          userId,
          session.creds.email,
        );
      }
      if (includeNxt) {
        payload.nxt = await fetchNxtExport(nxtVault.client, userId);
      }
      return JSON.stringify(payload, null, 2);
    }

    case "contacts": {
      const contactOpts: { limit: number; relationshipStatus?: string } = { limit };
      if (args.relationshipStatus) {
        contactOpts.relationshipStatus = args.relationshipStatus;
      }
      const contacts = await fetchBlxckbookContacts(
        bbVault.client,
        userId,
        contactOpts,
      );
      const lines = contacts.map(
        (c) =>
          `• ${c.name}${c.relationshipStatus ? ` (${c.relationshipStatus})` : ""}` +
          `${c.tags.length ? ` · tags: ${c.tags.join(", ")}` : ""}`,
      );
      return lines.length
        ? `BLXCKBOOK contacts (${contacts.length})${scopeLabel}:\n${lines.join("\n")}`
        : `No contacts in BLXCKBOOK vault${scopeLabel}.`;
    }

    case "contact": {
      if (!contactName) {
        return "Error: contactName is required for action=contact.";
      }
      if (target === "nxt") {
        const nxt = await fetchNxtExport(nxtVault.client, userId);
        const hit = fuzzyMatchContact(
          nxt.contacts.map((row) => ({ name: vesselName(row) })),
          contactName,
        );
        const row = hit
          ? nxt.contacts.find((r) => vesselName(r) === hit.name)
          : undefined;
        if (!row) {
          return `No NXT profile matching "${contactName}".`;
        }
        return JSON.stringify(row, null, 2);
      }

      const contacts = await fetchBlxckbookContacts(bbVault.client, userId, {
        limit: 100,
      });
      const contact = fuzzyMatchContact(contacts, contactName);
      if (!contact) {
        return `No BLXCKBOOK contact matching "${contactName}".`;
      }
      return [
        `Contact: ${contact.name}`,
        `Status: ${contact.relationshipStatus ?? "unset"}`,
        `Tags: ${contact.tags.length ? contact.tags.join(", ") : "(none)"}`,
        `Notes: ${truncateNotes(contact.notes) || "(empty)"}`,
        `Last active: ${contact.lastActive}`,
      ].join("\n");
    }

    case "journal": {
      const entries = await fetchBlxckbookJournal(
        bbVault.client,
        userId,
        contactName,
        limit,
      );
      if (entries.length === 0) {
        return contactName
          ? `No journal entries linked to "${contactName}".`
          : "No journal entries in your vault.";
      }
      const lines = entries.map(
        (j) =>
          `• ${j.date} — ${j.title}` +
          `${j.tags.length ? ` [${j.tags.join(", ")}]` : ""}` +
          `\n  ${truncateNotes(j.content, 160)}`,
      );
      return `Journal entries (${entries.length}):\n${lines.join("\n\n")}`;
    }

    case "timeline": {
      const events = await fetchBlxckbookTimeline(
        bbVault.client,
        userId,
        contactName,
        limit,
      );
      if (events.length === 0) {
        return contactName
          ? `No timeline events for "${contactName}".`
          : "No timeline events in your vault.";
      }
      const lines = events.map((e) => `• ${e.date} — ${e.title} (${e.kind})`);
      return `Timeline (${events.length}):\n${lines.join("\n")}`;
    }

    case "profiles": {
      const nxt = await fetchNxtExport(nxtVault.client, userId);
      const rows = nxt.contacts.slice(0, limit);
      if (rows.length === 0) {
        return "No relationship profiles in NXT.";
      }
      const lines = rows.map((row) => {
        const name = vesselName(row);
        const status = vesselStatus(row);
        return `• ${name}${status ? ` (${status})` : ""}`;
      });
      return `NXT profiles (${rows.length}):\n${lines.join("\n")}`;
    }

    case "events": {
      const nxt = await fetchNxtExport(nxtVault.client, userId);
      let events = nxt.events;
      if (contactName) {
        const profile = fuzzyMatchContact(
          nxt.contacts.map((row) => ({ name: vesselName(row) })),
          contactName,
        );
        const vesselId = profile
          ? (nxt.contacts.find((r) => vesselName(r) === profile.name)?.id as string | undefined)
          : undefined;
        if (!vesselId) {
          return `No NXT profile matching "${contactName}" for event lookup.`;
        }
        events = events.filter((e) => e.vessel_id === vesselId);
      }
      events = events.slice(0, limit);
      if (events.length === 0) {
        return "No logged dates/events in NXT.";
      }
      const lines = events.map((e) => {
        const date = typeof e.event_date === "string" ? e.event_date : "?";
        const title = typeof e.title === "string" ? e.title : "";
        const type = typeof e.event_type === "string" ? e.event_type : "event";
        return `• ${date} — ${title || type}`;
      });
      return `NXT events (${events.length}):\n${lines.join("\n")}`;
    }

    case "playlists": {
      const playlists = await fetchUserPlaylists(tvVault.client, userId, { limit });
      if (playlists.length === 0) {
        return `No JEXXXUS | TV custom playlists${scopeLabel}.`;
      }
      const lines = playlists.map(
        (p) =>
          `• ${p.name} — ${p.videoCount} video${p.videoCount === 1 ? "" : "s"}` +
          `${p.isPrivate ? " (private)" : " (public)"}`,
      );
      return `TV playlists (${playlists.length})${scopeLabel}:\n${lines.join("\n")}`;
    }

    case "playlist": {
      if (!playlistName) {
        return "Error: playlistName is required for action=playlist.";
      }
      const detail = await fetchPlaylistDetail(
        tvVault.client,
        userId,
        playlistName,
        limit,
      );
      if (!detail) {
        return `No TV playlist matching "${playlistName}"${scopeLabel}.`;
      }
      const { playlist, videos } = detail;
      const lines = videos.map(
        (v) => `• ${v.order}. ${v.title} (${v.videoId})`,
      );
      return [
        `Playlist: ${playlist.name}${playlist.isPrivate ? " (private)" : " (public)"}${scopeLabel}`,
        `Videos (${videos.length}):`,
        lines.length ? lines.join("\n") : "(empty playlist)",
      ].join("\n");
    }

    default:
      return `Error: unknown action "${action}".`;
  }
}