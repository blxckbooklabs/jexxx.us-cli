import type { BlxckchatTool } from "./types.js";
import { resolveAuthenticatedAccountSession } from "../../account-data/session.js";
import {
  listNotifications,
  connectContactBack,
  getRelationshipTier,
} from "../../account-data/connections.js";

export const listNotificationsTool: BlxckchatTool = {
  name: "list_notifications",
  description:
    "List the signed-in user's contact-connection notifications (someone added them on JEXXXUS) " +
    "and pending event invites. Read-only. Requires /auth login.",
  parameters: { type: "object", properties: {} },
  requiresConfirmation: false,
  async execute(): Promise<string> {
    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const { contactNotifications, pendingInvites } = await listNotifications(resolved.session);

    if (contactNotifications.length === 0 && pendingInvites.length === 0) {
      return "No notifications or pending invites.";
    }

    const lines: string[] = [];
    if (contactNotifications.length > 0) {
      lines.push("Contact notifications:");
      for (const n of contactNotifications) {
        lines.push(
          `  • ${n.read ? "" : "[unread] "}${n.actor_name} added you (actor_user_id: ${n.actor_user_id}) — ${n.created_at}`,
        );
      }
    }
    if (pendingInvites.length > 0) {
      lines.push("Pending event invites:");
      for (const inv of pendingInvites) {
        lines.push(
          `  • "${inv.title}" from ${inv.organizer_name} on ${inv.event_date}${inv.location ? ` at ${inv.location}` : ""} (invite id: ${inv.id})`,
        );
      }
    }
    return lines.join("\n");
  },
};

export const connectContactBackTool: BlxckchatTool = {
  name: "connect_contact_back",
  description:
    "Connect back with a Clerk user who added the signed-in user as a contact (from " +
    "list_notifications output — pass their actor_user_id and actor_name). Merge-aware: if an " +
    "existing unlinked (dummy/manual) contact with the same name already exists, this merges " +
    "into it rather than creating a duplicate — the exact bug class that silently drops the " +
    "ecosystem connection when merged the other way around. Also restores any previously " +
    "archived relationship points and notifies the other user back. Requires /auth login.",
  parameters: {
    type: "object",
    properties: {
      actorUserId: { type: "string", description: "Clerk user id from list_notifications" },
      actorName: { type: "string", description: "Display name from list_notifications" },
      actorAvatarUrl: { type: "string", description: "Optional avatar URL from list_notifications" },
    },
    required: ["actorUserId", "actorName"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const actorUserId = String(args.actorUserId ?? "").trim();
    const actorName = String(args.actorName ?? "").trim();
    if (!actorUserId || !actorName) {
      return "Error: actorUserId and actorName are required (from list_notifications output).";
    }

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const actorAvatarUrl = typeof args.actorAvatarUrl === "string" ? args.actorAvatarUrl : undefined;
    const result = await connectContactBack(resolved.session, actorUserId, actorName, actorAvatarUrl);
    return result.message;
  },
};

export const getRelationshipStatusTool: BlxckchatTool = {
  name: "get_relationship_status",
  description:
    "Get the signed-in user's current relationship tier and points total with a Clerk-linked " +
    "BLXCKBOOK contact (fuzzy-matched by name). Only meaningful for contacts that came from a " +
    "real JEXXXUS connection, not manually-created dummy contacts. Read-only. Requires /auth login.",
  parameters: {
    type: "object",
    properties: {
      contactName: { type: "string", description: "Contact name to look up" },
    },
    required: ["contactName"],
  },
  requiresConfirmation: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const contactName = String(args.contactName ?? "").trim();
    if (!contactName) return "Error: contactName is required.";

    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) return `Error: ${resolved.message}`;

    const result = await getRelationshipTier(resolved.session, contactName);
    return result.message;
  },
};
