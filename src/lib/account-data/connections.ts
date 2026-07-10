import type { AuthenticatedAccountSession } from "./session.js";
import { resolveVaultClient } from "./session.js";
import { fuzzyMatchContact, normalizeName } from "./account-query.js";

/**
 * Cross-user connections, notifications, and relationship tier/points —
 * mirrors dxsh.blxckbook.jexxx.us's handleAddBack() (App.tsx) and
 * relationship-tiers.ts exactly, so a connection made from the CLI behaves
 * identically to one made from the web dashboard (same merge-aware insert,
 * same restore_relationship call, same reciprocal notification).
 *
 * Schema note (confirmed live against a real query, not just the migration
 * file): `contacts` lives in the `api` schema (target "blxckbook"), but
 * `contact_notifications`, `event_invites`, `relationship_tiers`,
 * `point_transactions`, and the RPC functions
 * (fn_user_tier_with_contact/restore_relationship/cancel_relationship) all
 * live in `public` (target "nxt" — same schema resolveVaultClient() maps
 * "nxt" to). Mixing these up produces a real runtime error
 * ("Could not find the function api.fn_user_tier_with_contact ... in the
 * schema cache"), not a silent failure, which is how this was caught.
 */

export interface ContactNotificationRow {
  id: string;
  actor_user_id: string;
  actor_name: string;
  actor_avatar_url: string | null;
  read: boolean;
  created_at: string;
  /**
   * True when the signed-in user already has a contact linked to this
   * actor_user_id — computed here, not stored, since the notification row
   * itself doesn't know whether connect_contact_back already ran (from the
   * CLI, the web dashboard, or a prior CLI session). Lets callers report
   * "already connected" up front instead of offering to reconnect and only
   * finding out it's a no-op after asking.
   */
  alreadyConnected: boolean;
}

export interface EventInviteRow {
  id: string;
  organizer_user_id: string;
  organizer_name: string;
  title: string;
  event_date: string;
  event_type: string;
  location: string | null;
  notes: string | null;
  status: string;
}

export interface NotificationSummary {
  contactNotifications: ContactNotificationRow[];
  pendingInvites: EventInviteRow[];
}

/**
 * List unread/recent contact-connection notifications and pending event
 * invites. Each contact notification is cross-referenced against the
 * signed-in user's own contacts to flag `alreadyConnected` — a
 * "someone added you" notification persists after connecting back (nothing
 * deletes or marks it resolved), so without this check the same
 * already-linked notification would surface as actionable forever.
 */
export async function listNotifications(
  session: AuthenticatedAccountSession,
): Promise<NotificationSummary> {
  const contactsSchema = resolveVaultClient(session, "blxckbook");
  const publicSchema = resolveVaultClient(session, "nxt");

  const { data: notifs } = await publicSchema.client
    .from("contact_notifications")
    .select("*")
    .eq("recipient_user_id", publicSchema.effectiveUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: invites } = await publicSchema.client
    .from("event_invites")
    .select("*")
    .eq("invitee_user_id", publicSchema.effectiveUserId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  const rawNotifs = (notifs ?? []) as Omit<ContactNotificationRow, "alreadyConnected">[];
  let linkedIds = new Set<string>();
  if (rawNotifs.length > 0) {
    const { data: contacts } = await contactsSchema.client
      .from("contacts")
      .select("linked_ecosystem_id")
      .eq("user_id", contactsSchema.effectiveUserId);
    linkedIds = new Set(
      ((contacts ?? []) as { linked_ecosystem_id: string | null }[])
        .map((c) => c.linked_ecosystem_id)
        .filter((id): id is string => Boolean(id)),
    );
  }

  return {
    contactNotifications: rawNotifs.map((n) => ({
      ...n,
      alreadyConnected: linkedIds.has(n.actor_user_id),
    })),
    pendingInvites: (invites ?? []) as EventInviteRow[],
  };
}

export interface ConnectContactBackResult {
  ok: boolean;
  message: string;
}

/**
 * Connect back with a Clerk user who added the signed-in user as a contact
 * — the "Connect back" button's exact behavior (NotificationCenter.tsx /
 * App.tsx#handleAddBack): merge-aware insert (never a duplicate row if an
 * unlinked dummy contact with the same name already exists — this is the
 * exact bug class fixed in dxsh.blxckbook.jexxx.us's manual merge path),
 * restore any archived relationship points, and notify the other user back.
 */
export async function connectContactBack(
  session: AuthenticatedAccountSession,
  actorUserId: string,
  actorName: string,
  actorAvatarUrl?: string | null,
): Promise<ConnectContactBackResult> {
  const contactsSchema = resolveVaultClient(session, "blxckbook");
  const publicSchema = resolveVaultClient(session, "nxt");

  const { data: existingRows } = await contactsSchema.client
    .from("contacts")
    .select("*")
    .eq("user_id", contactsSchema.effectiveUserId);
  const rows = (existingRows ?? []) as Record<string, unknown>[];

  const alreadyLinked = rows.find((r) => r.linked_ecosystem_id === actorUserId);
  if (alreadyLinked) {
    return { ok: false, message: `Already connected with ${actorName} — no action taken.` };
  }

  const existingUnlinked = rows.find(
    (r) => !r.linked_ecosystem_id && normalizeName(String(r.name ?? "")) === normalizeName(actorName),
  );

  if (existingUnlinked) {
    const { error } = await contactsSchema.client
      .from("contacts")
      .update({
        linked_ecosystem_id: actorUserId,
        photo: actorAvatarUrl || existingUnlinked.photo,
        visibility: "ecosystem",
      })
      .eq("id", existingUnlinked.id)
      .eq("user_id", contactsSchema.effectiveUserId);
    if (error) {
      return { ok: false, message: `Failed to merge into existing contact: ${error.message}` };
    }
  } else {
    const { error } = await contactsSchema.client.from("contacts").insert({
      user_id: contactsSchema.effectiveUserId,
      name: actorName,
      photo: actorAvatarUrl || null,
      notes: "",
      tags: [],
      is_discoverable: false,
      linked_ecosystem_id: actorUserId,
      visibility: "ecosystem",
      relationship_status: null,
    });
    if (error) {
      return { ok: false, message: `Failed to add contact: ${error.message}` };
    }
  }

  // Best-effort: snap back any points archived by a prior cancel_relationship.
  await publicSchema.client.rpc("restore_relationship", { p_contact_user_id: actorUserId });

  // Notify the other user that this connection is now mutual.
  await publicSchema.client.from("contact_notifications").insert({
    recipient_user_id: actorUserId,
    actor_user_id: contactsSchema.effectiveUserId,
    actor_name: session.creds.fullName || session.creds.email,
    actor_avatar_url: session.creds.imageUrl ?? null,
  });

  const mergedNote = existingUnlinked
    ? ` (merged into your existing contact "${existingUnlinked.name}")`
    : "";
  return {
    ok: true,
    message: `Connected back with ${actorName}${mergedNote} — they'll see you've added them too.`,
  };
}

export interface RelationshipTierResult {
  ok: boolean;
  message: string;
  tier?: number;
  totalPoints?: number;
}

/** Current relationship tier + points for the signed-in user and a Clerk-linked contact. */
export async function getRelationshipTier(
  session: AuthenticatedAccountSession,
  contactName: string,
): Promise<RelationshipTierResult> {
  const contactsSchema = resolveVaultClient(session, "blxckbook");
  const publicSchema = resolveVaultClient(session, "nxt");

  const { data: rows } = await contactsSchema.client
    .from("contacts")
    .select("*")
    .eq("user_id", contactsSchema.effectiveUserId);
  const contact = fuzzyMatchContact((rows ?? []) as { name: string }[], contactName);
  if (!contact) {
    return { ok: false, message: `No contact matching "${contactName}" found.` };
  }
  const linkedId = (contact as Record<string, unknown>).linked_ecosystem_id as string | null;
  if (!linkedId) {
    return {
      ok: false,
      message: `"${contactName}" isn't a Clerk-linked contact — no shared tier/points to report.`,
    };
  }

  const { data: tier, error: tierError } = await publicSchema.client.rpc(
    "fn_user_tier_with_contact",
    { p_contact_user_id: linkedId },
  );
  if (tierError) {
    return { ok: false, message: `Failed to fetch tier: ${tierError.message}` };
  }

  const { data: tierRow } = await publicSchema.client
    .from("relationship_tiers")
    .select("total_points, relationship_status")
    .or(
      `and(user_a_id.eq.${publicSchema.effectiveUserId},user_b_id.eq.${linkedId}),and(user_a_id.eq.${linkedId},user_b_id.eq.${publicSchema.effectiveUserId})`,
    )
    .maybeSingle();

  const totalPoints = (tierRow as { total_points?: number } | null)?.total_points ?? 0;
  const status = (tierRow as { relationship_status?: string | null } | null)?.relationship_status;

  return {
    ok: true,
    tier: (tier as number) ?? 0,
    totalPoints,
    message:
      `Tier ${tier ?? 0} with ${contact.name} (${totalPoints} points)` +
      (status ? `, status: ${status}` : "") +
      ".",
  };
}
