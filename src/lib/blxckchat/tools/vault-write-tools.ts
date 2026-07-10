import * as fs from "fs";

import type { BlxckchatTool } from "./types.js";
import { resolveAuthenticatedAccountSession } from "../../account-data/session.js";
import {
  updateContact,
  addJournalEntry,
  managePlaylist,
  syncBlxckbookExport,
} from "../../account-data/mutations.js";
import { exportVaultToDisk, type VaultExportTarget } from "../../account-data/export-to-disk.js";
import type { DashboardTarget } from "../../supabase.js";

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
