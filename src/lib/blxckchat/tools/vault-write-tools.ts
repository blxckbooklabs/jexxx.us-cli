import * as fs from "fs";

import type { BlxckchatTool } from "./types.js";
import { resolveAuthenticatedAccountSession } from "../../account-data/session.js";
import {
  addContact,
  updateContact,
  deleteContact,
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  addContactEvent,
  updateContactEvent,
  deleteContactEvent,
  managePlaylist,
  syncBlxckbookExport,
} from "../../account-data/mutations.js";
import { exportVaultToDisk, type VaultExportTarget } from "../../account-data/export-to-disk.js";
import type { DashboardTarget } from "../../supabase.js";

/** Accept common model aliases (contactName, displayName, etc.) for add_contact. */
export function resolveAddContactName(args: Record<string, unknown>): string {
  for (const key of ["name", "contactName", "displayName", "fullName", "contact_name"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export const addContactTool: BlxckchatTool = {
  name: "add_contact",
  description:
    "Create a brand-new contact. Automatically synced to both BLXCKBOOK and NXT — a single " +
    "Postgres trigger mirrors the row into both, so this never needs a separate call per " +
    "dashboard. Refuses (with a suggestion to use update_contact instead) if a contact matching " +
    "that name already exists, to avoid creating a duplicate. Requires /auth login. " +
    "IMPORTANT: always pass the contact name in tool arguments as JSON, e.g. {\"name\": \"Ruth\"}.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Contact display name (required). Example: Ruth",
      },
      contactName: {
        type: "string",
        description: "Alias for name — prefer the name field when possible",
      },
      notes: { type: "string", description: "Optional notes" },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
      relationshipStatus: { type: "string", description: "Optional relationship status" },
      visibility: {
        type: "string",
        enum: ["private", "shared", "ecosystem"],
        description: "Optional visibility (default: private)",
      },
    },
    required: [],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const name = resolveAddContactName(args);
    if (!name) {
      return (
        "Error: add_contact requires a contact name in tool arguments. " +
        'Call add_contact again with JSON args like {"name": "Ruth"}.'
      );
    }

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const options: {
      notes?: string;
      tags?: string[];
      relationshipStatus?: string;
      visibility?: string;
    } = {};
    if (typeof args.notes === "string") options.notes = args.notes;
    if (Array.isArray(args.tags)) options.tags = args.tags as string[];
    if (typeof args.relationshipStatus === "string") options.relationshipStatus = args.relationshipStatus;
    if (typeof args.visibility === "string") options.visibility = args.visibility;

    const result = await addContact(resolved.session, name, options);
    return result.message;
  },
};

export const updateContactTool: BlxckchatTool = {
  name: "update_contact",
  description:
    "Update fields on one BLXCKBOOK contact or NXT vessel (fuzzy-matched by name). This writes " +
    "to production data — the update is scoped to the signed-in user's own row via RLS and " +
    "shows up live in their dashboard (no refresh needed). Never asUserId — this tool only ever " +
    "writes the signed-in user's own data, regardless of super-admin status. Allowed fields: " +
    "name, notes, tags, relationship_status, visibility, is_discoverable. Requires /auth login.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ["blxckbook", "nxt"],
        description: "Which vault the contact lives in — required, no auto-detect",
      },
      contactName: { type: "string", description: "Name to fuzzy-match against existing contacts" },
      updates: {
        type: "object",
        description:
          "Fields to change, e.g. { \"relationship_status\": \"Dating\", \"notes\": \"...\" }",
      },
    },
    required: ["target", "contactName", "updates"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const target = args.target as DashboardTarget;
    if (target !== "blxckbook" && target !== "nxt") {
      return 'Error: target must be "blxckbook" or "nxt".';
    }
    const contactName = String(args.contactName ?? "").trim();
    if (!contactName) return "Error: contactName is required.";
    const updates =
      typeof args.updates === "object" && args.updates !== null
        ? (args.updates as Record<string, unknown>)
        : {};

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const result = await updateContact(resolved.session, target, contactName, updates);
    return result.message;
  },
};

export const deleteContactTool: BlxckchatTool = {
  name: "delete_contact",
  description:
    "Permanently delete one BLXCKBOOK contact or NXT vessel (fuzzy-matched by name). This is a " +
    "destructive, irreversible write to production data — always confirm with the user which " +
    "specific contact before calling this, and never call it speculatively. Requires /auth login.",
  parameters: {
    type: "object",
    properties: {
      target: { type: "string", enum: ["blxckbook", "nxt"], description: "Which vault the contact lives in" },
      contactName: { type: "string", description: "Name to fuzzy-match against existing contacts" },
    },
    required: ["target", "contactName"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const target = args.target as DashboardTarget;
    if (target !== "blxckbook" && target !== "nxt") {
      return 'Error: target must be "blxckbook" or "nxt".';
    }
    const contactName = String(args.contactName ?? "").trim();
    if (!contactName) return "Error: contactName is required.";

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const result = await deleteContact(resolved.session, target, contactName);
    return result.message;
  },
};

export const addJournalEntryTool: BlxckchatTool = {
  name: "add_journal_entry",
  description:
    "Create a new BLXCKBOOK journal entry for the signed-in user, optionally linked to existing " +
    "contacts by name. Shows up live in the dashboard. Journal entries are BLXCKBOOK-only (NXT " +
    "has no journal concept). Requires /auth login.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Entry title" },
      content: { type: "string", description: "Entry body text" },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
      linkedContactNames: {
        type: "array",
        items: { type: "string" },
        description: "Optional contact names to link this entry to (fuzzy-matched)",
      },
    },
    required: ["title", "content"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const title = String(args.title ?? "").trim();
    const content = String(args.content ?? "");
    if (!title) return "Error: title is required.";

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const options: { tags?: string[]; linkedContactNames?: string[] } = {};
    if (Array.isArray(args.tags)) options.tags = args.tags as string[];
    if (Array.isArray(args.linkedContactNames)) {
      options.linkedContactNames = args.linkedContactNames as string[];
    }

    const result = await addJournalEntry(resolved.session, title, content, options);
    return result.message;
  },
};

export const updateJournalEntryTool: BlxckchatTool = {
  name: "update_journal_entry",
  description:
    "Update an existing BLXCKBOOK journal entry's title, content, or tags — matched by id (if " +
    "known from account_query) or by fuzzy title match. Requires /auth login.",
  parameters: {
    type: "object",
    properties: {
      entryIdOrTitle: { type: "string", description: "Journal entry id or title to match" },
      title: { type: "string", description: "New title (omit to leave unchanged)" },
      content: { type: "string", description: "New content (omit to leave unchanged)" },
      tags: { type: "array", items: { type: "string" }, description: "New tags (omit to leave unchanged)" },
    },
    required: ["entryIdOrTitle"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const entryIdOrTitle = String(args.entryIdOrTitle ?? "").trim();
    if (!entryIdOrTitle) return "Error: entryIdOrTitle is required.";

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const updates: { title?: string; content?: string; tags?: string[] } = {};
    if (typeof args.title === "string") updates.title = args.title;
    if (typeof args.content === "string") updates.content = args.content;
    if (Array.isArray(args.tags)) updates.tags = args.tags as string[];

    const result = await updateJournalEntry(resolved.session, entryIdOrTitle, updates);
    return result.message;
  },
};

export const deleteJournalEntryTool: BlxckchatTool = {
  name: "delete_journal_entry",
  description:
    "Permanently delete a BLXCKBOOK journal entry (and its contact links) — matched by id or " +
    "fuzzy title match. Irreversible — always confirm which entry with the user first. Requires " +
    "/auth login.",
  parameters: {
    type: "object",
    properties: {
      entryIdOrTitle: { type: "string", description: "Journal entry id or title to match" },
    },
    required: ["entryIdOrTitle"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const entryIdOrTitle = String(args.entryIdOrTitle ?? "").trim();
    if (!entryIdOrTitle) return "Error: entryIdOrTitle is required.";

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const result = await deleteJournalEntry(resolved.session, entryIdOrTitle);
    return result.message;
  },
};

export const manageContactEventTool: BlxckchatTool = {
  name: "manage_contact_event",
  description:
    "Create, update, or delete an NXT logged date/event (contact_events), linked to a vessel by " +
    "name for create. Requires /auth login.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["create", "update", "delete"] },
      contactName: { type: "string", description: "Vessel name — required for action=create" },
      eventId: { type: "string", description: "Event id — required for action=update/delete" },
      title: { type: "string", description: "Event title" },
      eventDate: { type: "string", description: "ISO date string" },
      eventType: { type: "string", description: "Event category (default: date)" },
      location: { type: "string", description: "Event location" },
      notes: { type: "string", description: "Event notes" },
    },
    required: ["action"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? "");
    if (!["create", "update", "delete"].includes(action)) {
      return "Error: action must be one of create, update, delete.";
    }

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    if (action === "create") {
      const contactName = String(args.contactName ?? "").trim();
      const title = typeof args.title === "string" ? args.title : "";
      const eventDate = typeof args.eventDate === "string" ? args.eventDate : "";
      if (!contactName) return "Error: contactName is required for action=create.";
      if (!title || !eventDate) return "Error: title and eventDate are required for action=create.";
      const fields: {
        title: string;
        eventDate: string;
        eventType?: string;
        location?: string;
        notes?: string;
      } = { title, eventDate };
      if (typeof args.eventType === "string") fields.eventType = args.eventType;
      if (typeof args.location === "string") fields.location = args.location;
      if (typeof args.notes === "string") fields.notes = args.notes;
      const result = await addContactEvent(resolved.session, contactName, fields);
      return result.message;
    }

    if (action === "update") {
      const eventId = String(args.eventId ?? "").trim();
      if (!eventId) return "Error: eventId is required for action=update.";
      const updates: {
        title?: string;
        eventDate?: string;
        eventType?: string;
        location?: string;
        notes?: string;
      } = {};
      if (typeof args.title === "string") updates.title = args.title;
      if (typeof args.eventDate === "string") updates.eventDate = args.eventDate;
      if (typeof args.eventType === "string") updates.eventType = args.eventType;
      if (typeof args.location === "string") updates.location = args.location;
      if (typeof args.notes === "string") updates.notes = args.notes;
      const result = await updateContactEvent(resolved.session, eventId, updates);
      return result.message;
    }

    const eventId = String(args.eventId ?? "").trim();
    if (!eventId) return "Error: eventId is required for action=delete.";
    const result = await deleteContactEvent(resolved.session, eventId);
    return result.message;
  },
};

export const managePlaylistTool: BlxckchatTool = {
  name: "manage_playlist",
  description:
    "Create, rename, delete a JEXXXUS | TV custom playlist, or add/remove a video from one. " +
    "Always the signed-in user's own playlists. Shows up live in the TV dashboard. Requires " +
    "/auth login.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "rename", "delete", "add_video", "remove_video"],
      },
      playlistName: { type: "string", description: "Playlist to act on (fuzzy-matched by name)" },
      newName: { type: "string", description: "New name — required for action=rename" },
      videoId: { type: "string", description: "Video ID — required for add_video/remove_video" },
      isPrivate: { type: "boolean", description: "Private vs public — used by action=create (default true)" },
    },
    required: ["action", "playlistName"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? "");
    const validActions = ["create", "rename", "delete", "add_video", "remove_video"];
    if (!validActions.includes(action)) {
      return `Error: action must be one of ${validActions.join(", ")}.`;
    }
    const playlistName = String(args.playlistName ?? "").trim();
    if (!playlistName) return "Error: playlistName is required.";

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const playlistOptions: { newName?: string; videoId?: string; isPrivate?: boolean } = {};
    if (typeof args.newName === "string") playlistOptions.newName = args.newName;
    if (typeof args.videoId === "string") playlistOptions.videoId = args.videoId;
    if (typeof args.isPrivate === "boolean") playlistOptions.isPrivate = args.isPrivate;

    const result = await managePlaylist(
      resolved.session,
      action as "create" | "rename" | "delete" | "add_video" | "remove_video",
      playlistName,
      playlistOptions,
    );
    return result.message;
  },
};

export const exportVaultTool: BlxckchatTool = {
  name: "export_vault",
  description:
    "Export the signed-in user's BLXCKBOOK and/or NXT vault data to a local JSON file. Defaults " +
    "to ~/.jexxxus/exports/ — pass destinationDir for a specific local folder instead. Combine " +
    "with edit_local_file to modify the export, then sync_export_file to re-apply changes.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ["blxckbook", "nxt", "all"],
        description: "Which vault(s) to export (default: all)",
      },
      destinationDir: {
        type: "string",
        description: "Optional absolute folder to write the export into instead of ~/.jexxxus/exports",
      },
    },
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const target = (args.target as VaultExportTarget | undefined) ?? "all";
    const destinationDir = typeof args.destinationDir === "string" ? args.destinationDir : undefined;

    const result = await exportVaultToDisk(target, destinationDir);
    if (result.error) return `Error: ${result.error}`;
    return `Exported to: ${result.paths.join(", ")}`;
  },
};

export const syncExportFileTool: BlxckchatTool = {
  name: "sync_export_file",
  description:
    "Read a local vault export JSON file (from export_vault, possibly hand-edited via " +
    "edit_local_file) and re-apply its contacts and journal_entries as updates to the signed-in " +
    "user's BLXCKBOOK vault. Matches existing rows by id — new entries without an id are created; " +
    "existing entries are updated in place. Does not delete rows missing from the file. " +
    "BLXCKBOOK only for now (matches export_vault's schema).",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the export JSON file to sync back" },
    },
    required: ["filePath"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = String(args.filePath ?? "").trim();
    if (!filePath) return "Error: filePath is required.";
    if (!fs.existsSync(filePath)) return `Error: file not found at ${filePath}.`;

    let payload: unknown;
    try {
      payload = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return "Error: file is not valid JSON.";
    }

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const blxckbook = (payload as { blxckbook?: { contacts?: unknown[]; journal_entries?: unknown[] } })
      .blxckbook;
    if (!blxckbook) {
      return 'Error: expected a { "blxckbook": { "contacts": [...], "journal_entries": [...] } } shape.';
    }

    const summary = await syncBlxckbookExport(
      resolved.session,
      blxckbook as Parameters<typeof syncBlxckbookExport>[1],
    );
    return summary;
  },
};
