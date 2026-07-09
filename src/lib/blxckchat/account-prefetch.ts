import { fetchAccountSummary } from "../account-data/account-query.js";
import { createAuthenticatedAccountSession } from "../account-data/session.js";
import { planAccountTools } from "./account-routing.js";

/**
 * Pre-load a compact vault summary when the user is signed in and the prompt
 * matches account routing — same role as empire-prefetch for TV/VEIL.
 */
export async function prefetchAccountContext(userPrompt: string): Promise<string | null> {
  const plan = planAccountTools(userPrompt);
  if (plan.tools.length === 0) {
    return null;
  }

  const session = await createAuthenticatedAccountSession();
  if (!session) {
    return null;
  }

  try {
    const summary = await fetchAccountSummary(session);
    const bb = summary.blxckbook;
    const nxt = summary.nxt;
    const dist = Object.entries(bb.relationshipStatusDistribution)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    return [
      "## Pre-fetched account context (RLS-scoped — do not fabricate vault data)",
      `Signed in as: ${summary.signedInAs}`,
      `BLXCKBOOK: ${bb.contacts} contacts, ${bb.journalEntries} journal entries, ${bb.timelineEvents} timeline events`,
      dist ? `Status mix: ${dist}` : "",
      bb.recentContacts.length
        ? `Recent contacts: ${bb.recentContacts.map((c) => `${c.name}${c.status ? ` (${c.status})` : ""}`).join("; ")}`
        : "",
      `NXT: ${nxt.profiles} profiles, ${nxt.events} logged events`,
      plan.action
        ? `Routing suggests account_query action=${plan.action}${plan.contactName ? ` contactName="${plan.contactName}"` : ""}.`
        : "",
      "Still call account_query for specifics — this block is summary only.",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return null;
  }
}