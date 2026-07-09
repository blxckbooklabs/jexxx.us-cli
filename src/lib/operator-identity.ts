import type { Credentials } from "./auth.js";
import type { AuthenticatedAccountSession } from "./account-data/session.js";
import { fetchAccountSummary } from "./account-data/account-query.js";
import { fetchTvPlaylistSummary } from "./account-data/tv-playlists.js";
import { isSuperAdminClerkUser } from "./super-admin.js";

export function formatCredentialsDisplayName(creds: Credentials): string {
  const name = creds.fullName?.trim();
  if (name && creds.email) {
    return `${name} <${creds.email}>`;
  }
  return creds.email || creds.userId;
}

export function formatCredentialsShortLabel(creds: Credentials): string {
  const name = creds.fullName?.trim();
  if (name) return name;
  return creds.email || creds.userId.slice(0, 12);
}

/**
 * Kingdom-wide operator block injected into every BLXCKCHAT system prompt when
 * the user is signed in — profile, access scope, and super-admin posture.
 */
export async function buildOperatorIdentityContext(
  session: AuthenticatedAccountSession,
): Promise<string> {
  const { creds } = session;
  const display = formatCredentialsDisplayName(creds);
  const profileLines = [
    `Signed-in operator: ${display}`,
    `Clerk user ID: ${creds.userId}`,
  ];
  if (creds.username) {
    profileLines.push(`Clerk username: ${creds.username}`);
  }
  if (creds.imageUrl) {
    profileLines.push(`Profile image URL: ${creds.imageUrl}`);
  }

  const accessLines = [
    "Access scope (default): RLS-scoped to this Clerk user only — BLXCKBOOK (api.contacts, journal, timeline), NXT (public.vessels, contact_events), and private JEXXXUS | TV playlists (api.playlists).",
    "Cybersecurity default: never infer or fabricate another user's private vault or playlist data. Other users' BLXCKBOOK/NXT entries saved about this operator are not visible unless explicitly shared via RLS.",
  ];

  if (session.isSuperAdmin) {
    if (session.operator) {
      accessLines.push(
        "Super-admin elevation: ACTIVE — service-role operator clients are available for cross-user kingdom queries when account_query includes asUserId (another Clerk user ID). Personal vault questions still default to this operator's own RLS scope unless asUserId is set.",
      );
    } else {
      accessLines.push(
        "Super-admin elevation: recognized, but SUPABASE_KEY (service role) is not loaded in jexxx.us-cli/.env — only RLS-scoped reads are available in this session.",
      );
    }
  }

  try {
    const [summary, tv] = await Promise.all([
      fetchAccountSummary(session),
      fetchTvPlaylistSummary(session.tv, creds.userId),
    ]);
    const dist = Object.entries(summary.blxckbook.relationshipStatusDistribution)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    const snapshot = [
      "## Signed-in operator context (authoritative — do not invent vault/TV private data)",
      ...profileLines,
      ...accessLines,
      `BLXCKBOOK: ${summary.blxckbook.contacts} contacts, ${summary.blxckbook.journalEntries} journal entries, ${summary.blxckbook.timelineEvents} timeline events`,
      dist ? `BLXCKBOOK status mix: ${dist}` : "",
      `NXT: ${summary.nxt.profiles} profiles, ${summary.nxt.events} logged events`,
      `JEXXXUS | TV: ${tv.playlistCount} custom playlist(s), ${tv.savedVideoCount} saved video(s) across your playlists`,
      tv.playlists.length
        ? `TV playlists: ${tv.playlists.map((p) => `${p.name} (${p.videoCount}${p.isPrivate ? ", private" : ", public"})`).join("; ")}`
        : "",
      "Use account_query for private vault/TV playlist specifics; tv_query remains public catalog only.",
    ].filter(Boolean);

    return snapshot.join("\n");
  } catch {
    return [
      "## Signed-in operator context",
      ...profileLines,
      ...accessLines,
      "Vault/TV snapshot unavailable — call account_query for live data.",
    ].join("\n");
  }
}

/** Lightweight label when session resolution failed but creds exist on disk. */
export function buildOfflineOperatorIdentityContext(creds: Credentials): string {
  const superAdmin = isSuperAdminClerkUser(creds.userId);
  return [
    "## Signed-in operator context (limited)",
    `Signed-in operator: ${formatCredentialsDisplayName(creds)}`,
    `Clerk user ID: ${creds.userId}`,
    superAdmin
      ? "Super-admin Clerk ID recognized; load SUPABASE_ANON_KEY + SUPABASE_KEY in .env for full vault and elevation."
      : "RLS-scoped vault access requires SUPABASE_ANON_KEY in jexxx.us-cli/.env.",
  ].join("\n");
}