import type { AccountQueryAction } from "../account-data/account-query.js";

export type AccountRoutableTool = "account_query";

export interface AccountPhraseCollision {
  id: string;
  pattern: RegExp;
  action: AccountQueryAction;
  /** Hint for account_query action=contact|journal|timeline|events */
  contactName?: string;
  relationshipStatus?: string;
  target?: "blxckbook" | "nxt" | "auto";
  slashHints?: string[];
  note: string;
}

export interface AccountToolPlan {
  tools: AccountRoutableTool[];
  action: AccountQueryAction | null;
  contactName: string | null;
  relationshipStatus: string | null;
  target: "blxckbook" | "nxt" | "auto" | null;
  slashHints: string[];
  matchedRules: string[];
}

/**
 * Phrase → account_query routing table. Mirrors empire-routing's PHRASE_COLLISIONS
 * pattern for TV/VEIL — deterministic, testable, appended to the system prompt.
 */
export const ACCOUNT_PHRASE_COLLISIONS: readonly AccountPhraseCollision[] = [
  {
    id: "vault-summary",
    pattern:
      /\b(how many contacts|vault summary|account summary|what(?:'s| is) in my vault|my vault stats)\b/i,
    action: "summary",
    slashHints: ["/account"],
    note: "Vault counts → account_query summary.",
  },
  {
    id: "list-contacts",
    pattern:
      /\b(list my contacts|my contacts|my current contacts|current contacts(?:\s+list)?|who(?:'re| are) (?:my )?(?:current )?contacts|my connections|who(?:'s| is) in my vault|show my connections)\b/i,
    action: "contacts",
    target: "blxckbook",
    note: "BLXCKBOOK contact list → account_query contacts.",
  },
  {
    id: "dating-status",
    pattern: /\b(who am i dating|currently dating|people i(?:'m| am) dating)\b/i,
    action: "contacts",
    relationshipStatus: "Dating",
    target: "blxckbook",
    note: "Dating filter → account_query contacts relationshipStatus=Dating.",
  },
  {
    id: "committed-status",
    pattern: /\b(who am i committed to|committed relationships?)\b/i,
    action: "contacts",
    relationshipStatus: "Committed",
    target: "blxckbook",
    note: "Committed filter → account_query contacts.",
  },
  {
    id: "journal-entries",
    pattern: /\b(my journal|journal entries?|what did i write|recent journal)\b/i,
    action: "journal",
    target: "blxckbook",
    note: "Journal → account_query journal.",
  },
  {
    id: "timeline-activity",
    pattern:
      /\b(my timeline|recent activity|what happened|relationship timeline|last week|last month)\b/i,
    action: "timeline",
    target: "blxckbook",
    note: "Timeline → account_query timeline.",
  },
  {
    id: "nxt-dates",
    pattern: /\b(my dates|upcoming dates|logged dates|date history|nxt events?)\b/i,
    action: "events",
    target: "nxt",
    note: "NXT dates → account_query events.",
  },
  {
    id: "nxt-profiles",
    pattern: /\b(nxt profiles?|relationship profiles?|my nxt contacts?)\b/i,
    action: "profiles",
    target: "nxt",
    note: "NXT profiles → account_query profiles.",
  },
  {
    id: "contact-about",
    pattern: /\b(tell me about|what do i know about|notes on|status with)\s+([A-Za-z][A-Za-z0-9' -]{1,40})/i,
    action: "contact",
    target: "auto",
    note: "Named person → account_query contact with contactName.",
  },
  {
    id: "export-vault",
    pattern: /\b(export my (?:data|vault|account)|download my (?:data|vault)|backup my vault)\b/i,
    action: "export_preview",
    slashHints: ["/account export"],
    note: "Full export preview → account_query export_preview or /account export.",
  },
] as const;

const CONTACT_CAPTURE = /\b(?:about|on|with)\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i;

export function planAccountTools(userPrompt: string): AccountToolPlan {
  const tools = new Set<AccountRoutableTool>();
  const slashHints = new Set<string>();
  const matchedRules: string[] = [];
  let action: AccountQueryAction | null = null;
  let contactName: string | null = null;
  let relationshipStatus: string | null = null;
  let target: "blxckbook" | "nxt" | "auto" | null = null;

  for (const row of ACCOUNT_PHRASE_COLLISIONS) {
    const match = row.pattern.exec(userPrompt);
    if (!match) continue;

    matchedRules.push(row.id);
    tools.add("account_query");
    action = row.action;
    if (row.relationshipStatus) relationshipStatus = row.relationshipStatus;
    if (row.target) target = row.target;
    if (row.slashHints) {
      for (const h of row.slashHints) slashHints.add(h);
    }

    if (row.action === "contact" && match[2]) {
      contactName = match[2].trim();
    }
  }

  if (!contactName) {
    const named = CONTACT_CAPTURE.exec(userPrompt);
    if (named?.[1] && tools.has("account_query")) {
      contactName = named[1].trim();
      if (!action) action = "contact";
      tools.add("account_query");
      matchedRules.push("contact-name-captured");
    }
  }

  return {
    tools: [...tools],
    action,
    contactName,
    relationshipStatus,
    target,
    slashHints: [...slashHints],
    matchedRules,
  };
}

/** True when the user prompt is a private vault/data question (not empire TV/VEIL). */
export function isVaultPrimaryPrompt(userPrompt: string): boolean {
  return planAccountTools(userPrompt).tools.length > 0;
}

export const ACCOUNT_VAULT_REPLY_RULES = `**Vault-only reply rules (this message):**
- Call **account_query only** — do NOT call tv_query, veil_query, or bible_query.
- Do not recommend TV/VEIL videos or quote scripture based on contact names or tags.
- Reply in plain language: a short intro line, then one bullet per contact from tool output.
- Format each contact: \`• Name (Status) · tags: …\` — omit tags line when empty.
- No dramatic section headers (e.g. "VESSEL REGISTRY"), no roleplay framing unless the user asked for a persona.
- Never invent URLs; never glue tv.jexxx.us or veil.jexxx.us links into vault answers.`;

export function formatAccountRoutingHint(userPrompt: string): string | null {
  const plan = planAccountTools(userPrompt);
  if (plan.tools.length === 0) return null;

  const lines = ["## Routing hint for this message (account / vault collision table)"];
  lines.push("Prefer tool: account_query (requires JEXXXUS sign-in via /auth login)");
  lines.push(ACCOUNT_VAULT_REPLY_RULES);
  if (plan.action) {
    lines.push(`Suggested action: ${plan.action}`);
  }
  if (plan.target) {
    lines.push(`Target dashboard: ${plan.target}`);
  }
  if (plan.contactName) {
    lines.push(`contactName: "${plan.contactName}"`);
  }
  if (plan.relationshipStatus) {
    lines.push(`relationshipStatus filter: ${plan.relationshipStatus}`);
  }
  if (plan.slashHints.length > 0) {
    lines.push(`Slash hints: ${plan.slashHints.join(", ")}`);
  }
  lines.push(
    "Answer only from account_query results — never invent contact names, dates, or journal text.",
  );
  lines.push(
    "If the user is not signed in, tell them to run /auth login before vault questions.",
  );
  return lines.join("\n");
}

export const ACCOUNT_COLLISION_TABLE_EXCERPT = `### Account / vault collision quick reference
| User prompt | account_query |
| list my contacts / my connections | action=contacts target=blxckbook |
| who am I dating | action=contacts relationshipStatus=Dating |
| my journal / what did I write | action=journal |
| timeline / what happened last week | action=timeline |
| NXT dates / my dates | action=events target=nxt |
| tell me about Alex | action=contact contactName=Alex |
| vault summary / how many contacts | action=summary |
| export my vault | action=export_preview or /account export |`;

export const ACCOUNT_CONTENT_ROUTING = `## Account data routing (private vault — signed-in users only)

- **account_query** — Read-only access to the operator's own BLXCKBOOK vault (api.contacts, journal, timeline) and NXT profiles/events (public.vessels, contact_events). RLS-scoped via Clerk JWT from /auth login. Never guess vault contents.

**Response rules:**
- Call account_query before answering questions about contacts, dating status, journal entries, timeline, or NXT dates.
- Vault-only turns: account_query **only** — never mix TV/VEIL/scripture into contact lists; tags are metadata, not watch recommendations.
- Summarize by default; quote journal notes only when the user asks for detail.
- If account_query returns empty results, say the vault is empty — do not fabricate people or events.
- If not authenticated, direct the user to /auth login (same as secure.jexxx.us device flow).
- Do not use run_doctor, import_contacts, or send_notification for personal vault questions.

${ACCOUNT_COLLISION_TABLE_EXCERPT}`;