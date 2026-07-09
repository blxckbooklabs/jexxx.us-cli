import type { BlxckchatTool } from "./types.js";
import {
  executeAccountQuery,
  type AccountQueryAction,
  type AccountQueryArgs,
} from "../../account-data/account-query.js";
import { resolveAuthenticatedAccountSession } from "../../account-data/session.js";

const ACTIONS: AccountQueryAction[] = [
  "summary",
  "contacts",
  "contact",
  "journal",
  "timeline",
  "events",
  "profiles",
  "playlists",
  "playlist",
  "export_preview",
];

function resolveAction(raw: string): AccountQueryAction | null {
  const action = raw.toLowerCase().trim() as AccountQueryAction;
  return ACTIONS.includes(action) ? action : null;
}

/**
 * Read-only vault access for the signed-in JEXXXUS user — same data as
 * BLXCKBOOK Settings export and NXT workspace JSON export, RLS-scoped.
 */
export const accountQueryTool: BlxckchatTool = {
  name: "account_query",
  description:
    "Query the signed-in user's private JEXXXUS vault data (BLXCKBOOK contacts, journal, " +
    "timeline; NXT relationship profiles and logged dates; JEXXXUS | TV custom playlists). " +
    "Requires /auth login. RLS-scoped by default — other users' private vault data is never visible. " +
    "JEXXXUS super-admins may pass asUserId to read another Clerk user's rows (requires SUPABASE_KEY). " +
    "action=summary — counts and recent contacts. " +
    "action=contacts — list BLXCKBOOK connections (optional relationshipStatus filter). " +
    "action=contact — one person by contactName (BLXCKBOOK or NXT via target). " +
    "action=journal — journal entries (optional contactName). " +
    "action=timeline — BLXCKBOOK activity trail (optional contactName). " +
    "action=profiles — NXT relationship profiles. " +
    "action=events — NXT logged dates/events (optional contactName). " +
    "action=playlists — JEXXXUS | TV custom playlists (private + public owned by user). " +
    "action=playlist — videos in one playlist (requires playlistName). " +
    "action=export_preview — full JSON export shape (same as dashboard downloads). " +
    "Never fabricate names or events — only report tool output.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ACTIONS,
        description: "Which vault lookup to perform",
      },
      target: {
        type: "string",
        enum: ["blxckbook", "nxt", "auto"],
        description: "Dashboard schema (default: auto)",
      },
      contactName: {
        type: "string",
        description: "Filter or lookup by contact/profile name",
      },
      relationshipStatus: {
        type: "string",
        description: "Filter contacts (e.g. Dating, Committed, Talking, Ended)",
      },
      playlistName: {
        type: "string",
        description: "TV playlist name for action=playlist",
      },
      asUserId: {
        type: "string",
        description: "Super-admin only: target another Clerk user ID",
      },
      limit: {
        type: "number",
        description: "Max rows for list actions (default 10, max 50)",
      },
    },
    required: ["action"],
  },
  requiresConfirmation: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = resolveAction(String(args.action ?? ""));
    if (!action) {
      return `Error: unknown action "${String(args.action)}". Use: ${ACTIONS.join(", ")}.`;
    }

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) {
      return `Error: ${resolved.message}`;
    }
    const session = resolved.session;

    const targetRaw = typeof args.target === "string" ? args.target.trim() : "auto";
    const target =
      targetRaw === "blxckbook" || targetRaw === "nxt" || targetRaw === "auto"
        ? targetRaw
        : "auto";

    const queryArgs: AccountQueryArgs = { action, target };

    if (typeof args.contactName === "string" && args.contactName.trim()) {
      queryArgs.contactName = args.contactName.trim();
    }
    if (typeof args.relationshipStatus === "string" && args.relationshipStatus.trim()) {
      queryArgs.relationshipStatus = args.relationshipStatus.trim();
    }
    if (typeof args.playlistName === "string" && args.playlistName.trim()) {
      queryArgs.playlistName = args.playlistName.trim();
    }
    if (typeof args.asUserId === "string" && args.asUserId.trim()) {
      queryArgs.asUserId = args.asUserId.trim();
    }
    if (typeof args.limit === "number") {
      queryArgs.limit = args.limit;
    }

    return executeAccountQuery(session, queryArgs);
  },
};