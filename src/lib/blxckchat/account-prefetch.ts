import {
  executeAccountQuery,
  fetchAccountSummary,
  type AccountQueryArgs,
} from "../account-data/account-query.js";
import type { AuthenticatedAccountSession } from "../account-data/session.js";
import { resolveAuthenticatedAccountSession } from "../account-data/session.js";
import { formatCredentialsDisplayName } from "../operator-identity.js";
import {
  isVaultReadOnlyPrompt,
  isVaultWritePrompt,
  planAccountTools,
} from "./account-routing.js";

export interface AccountPrefetchResult {
  text: string;
  /** True when executeAccountQuery ran — caller may skip tool loop for read-only vault turns. */
  liveQuery: boolean;
}

/**
 * Pre-load vault data when the user is signed in and the prompt matches account routing.
 * For read-only vault turns, runs account_query server-side so Divinity personas can answer
 * without a provider tool loop (avoids Bad Request on some BYOK models).
 */
export async function prefetchAccountContext(
  userPrompt: string,
  session?: AuthenticatedAccountSession | null,
): Promise<AccountPrefetchResult | null> {
  const plan = planAccountTools(userPrompt);
  if (plan.tools.length === 0) {
    return null;
  }

  let resolvedSession = session ?? null;
  if (!resolvedSession) {
    const resolved = await resolveAuthenticatedAccountSession();
    if (!resolved.ok) {
      return null;
    }
    resolvedSession = resolved.session;
  }

  if (isVaultWritePrompt(userPrompt)) {
    return null;
  }

  const readOnly = isVaultReadOnlyPrompt(userPrompt);
  if (readOnly && plan.action) {
    try {
      const args: AccountQueryArgs = {
        action: plan.action,
        target: plan.target ?? "auto",
        limit: 50,
      };
      if (plan.contactName) args.contactName = plan.contactName;
      if (plan.relationshipStatus) args.relationshipStatus = plan.relationshipStatus;
      if (plan.playlistName) args.playlistName = plan.playlistName;

      const live = await executeAccountQuery(resolvedSession, args);
      return {
        liveQuery: true,
        text: [
          "## Live vault data (RLS-scoped — authoritative for this turn)",
          `Signed in as: ${formatCredentialsDisplayName(resolvedSession.creds)}`,
          live,
          "Answer from the live data above in the user's voice. Do not refuse vault access.",
          "Do not call account_query on this turn — data is already loaded server-side.",
        ].join("\n"),
      };
    } catch (err) {
      console.warn(
        "[account-prefetch] live account_query failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  try {
    const summary = await fetchAccountSummary(resolvedSession);
    const bb = summary.blxckbook;
    const nxt = summary.nxt;
    const dist = Object.entries(bb.relationshipStatusDistribution)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    return {
      liveQuery: false,
      text: [
        "## Pre-fetched account context (RLS-scoped — do not fabricate vault data)",
        `Signed in as: ${summary.signedInAs}`,
        `BLXCKBOOK: ${bb.contacts} contacts, ${bb.journalEntries} journal entries, ${bb.timelineEvents} timeline events`,
        dist ? `Status mix: ${dist}` : "",
        bb.recentContacts.length
          ? `Recent contacts: ${bb.recentContacts.map((c) => `${c.name}${c.status ? ` (${c.status})` : ""}`).join("; ")}`
          : "",
        `NXT: ${nxt.profiles} profiles, ${nxt.events} logged events`,
        `JEXXXUS | TV: ${summary.tv.playlists} playlist(s), ${summary.tv.savedVideos} saved video(s)`,
        plan.action
          ? `Routing suggests account_query action=${plan.action}${plan.contactName ? ` contactName="${plan.contactName}"` : ""}.`
          : "",
        readOnly
          ? "Call account_query for specifics if this summary is not enough."
          : "Still call account_query for specifics — this block is summary only.",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  } catch {
    return null;
  }
}