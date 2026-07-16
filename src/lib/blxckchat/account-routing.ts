import type { AccountQueryAction } from "../account-data/account-query.js";
import { isKingdomSurfaceName, isKingdomSurfacePrompt } from "./kingdom-surfaces.js";

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
  playlistName: string | null;
  relationshipStatus: string | null;
  target: "blxckbook" | "nxt" | "auto" | null;
  slashHints: string[];
  matchedRules: string[];
}

/**
 * Phrase → account_query routing table. Mirrors kingdom-routing's PHRASE_COLLISIONS
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
      /\b(list my contacts|my contacts|my current contacts|current contacts(?:\s+list)?|who(?:'re| are) (?:my )?(?:current )?contacts|who my contacts are|(?:tell|show) me who (?:my )?contacts are|contacts in (?:my )?blxckbook|blxckbook contacts|my connections|who(?:'s| is) in my vault|show my connections)\b/i,
    action: "contacts",
    target: "blxckbook",
    note: "BLXCKBOOK contact list → account_query contacts.",
  },
  {
    id: "blxckbook-contacts-capability",
    pattern:
      /\b((?:do you have the )?ability to|(?:are you )?(?:able|capable)(?:\s+to)?|can you)\s+(?:tell|show|list|name|share|read|pull|access|see).*(?:contacts|connections).*(?:in\s+)?(?:my\s+)?blxckbook\b/i,
    action: "contacts",
    target: "blxckbook",
    note: "BLXCKBOOK contacts capability question → call account_query contacts, then answer yes with the list.",
  },
  {
    id: "blxckbook-write-capability",
    pattern:
      /\b((?:are you )?capable of|can you)\s+(?:making\s+)?edit(?:s|ing)?\s+(?:to\s+)?(?:my\s+)?blxckbook\b/i,
    action: "summary",
    target: "blxckbook",
    note: "BLXCKBOOK write capability — vault write tools (add/update/delete contact, journal, playlists).",
  },
  {
    id: "vault-crud-capability",
    pattern:
      /\b(?:CRUD|create a (?:new )?test contact|ability to create(?: a)?(?: new)? contact|delete that test contact)\b/i,
    action: "summary",
    target: "blxckbook",
    note:
      "Vault CRUD capability — answer yes; use add_contact with {\"name\":\"...\"} when user names a contact to create.",
  },
  {
    id: "delete-contact",
    pattern:
      /\b(?:delete|remove|purge|dissolve|sever)\s+(?:contact\s+)?([A-Za-z][A-Za-z0-9' -]+?)(?=\s*(?:because|and|from|please|now|again|who|that|[.?!]|$))/i,
    action: "contacts",
    target: "blxckbook",
    note:
      "Contact delete — MUST call delete_contact with target=blxckbook, then account_query contacts to verify.",
  },
  {
    id: "blxckbook-write-intent",
    pattern:
      /\b(edit(?:s|ing)?|update|change|modify|add to)\s+(?:my\s+)?blxckbook\b/i,
    action: "summary",
    target: "blxckbook",
    note: "BLXCKBOOK write intent — use vault write tools when user specifies the change.",
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
  {
    id: "tv-playlists",
    pattern:
      /\b(my (?:tv )?playlists?|my altars|custom playlists?|saved videos? in (?:my )?playlists?|jexxxus tv playlists?)\b/i,
    action: "playlists",
    note: "Private TV playlists → account_query playlists (not public tv_query).",
  },
  {
    id: "tv-playlist-detail",
    pattern: /\b(what(?:'s| is) in (?:my )?playlist|videos? in (?:my )?playlist|open playlist)\s+([A-Za-z][A-Za-z0-9' -]{1,40})/i,
    action: "playlist",
    note: "Named TV playlist → account_query playlist with playlistName.",
  },
] as const;

const CONTACT_CAPTURE = /\b(?:about|on|with)\s+([A-Za-z][A-Za-z0-9' -]{1,40})\b/i;
/** Captures "named Ruth" / "named Anna Test and assign …" — not only end-of-string names. */
const CONTACT_NAMED_CAPTURE =
  /\b(?:named|called)\s+"?([A-Za-z][A-Za-z0-9' -]+?)"?(?:\s+and\b|\s+with\b|\s+to\b|\s*[.?!]|$)/i;
const CONTACT_DELETE_CAPTURE =
  /\b(?:delete|remove|purge|dissolve|sever)\s+(?:contact\s+)?"?([A-Za-z][A-Za-z0-9' -]+?)"?(?=\s*(?:because|and|from|please|now|again|who|that|[.?!]|$))/i;

/** Trim trailing prose accidentally captured after a contact display name. */
export function normalizeCapturedContactName(raw: string): string {
  let name = raw.trim();
  const stop = name.search(/\s+(because|and|from|please|now|again|has|was|who|that)\b/i);
  if (stop > 0) name = name.slice(0, stop);
  return name.trim();
}

export function extractContactDeleteFromText(text: string): string | null {
  const match = CONTACT_DELETE_CAPTURE.exec(text.trim());
  const captured = match?.[1]?.trim();
  return captured ? normalizeCapturedContactName(captured) : null;
}

export function isContactDeletePrompt(userPrompt: string): boolean {
  return CONTACT_DELETE_CAPTURE.test(userPrompt.trim());
}

export function planAccountTools(userPrompt: string): AccountToolPlan {
  const tools = new Set<AccountRoutableTool>();
  const slashHints = new Set<string>();
  const matchedRules: string[] = [];
  let action: AccountQueryAction | null = null;
  let contactName: string | null = null;
  let playlistName: string | null = null;
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
      const captured = match[2].trim();
      if (isKingdomSurfaceName(captured)) {
        matchedRules.pop();
        tools.delete("account_query");
        action = null;
        continue;
      }
      contactName = captured;
    }
    if (row.action === "playlist" && match[2]) {
      playlistName = match[2].trim();
    }
    if (row.id === "delete-contact" && match[1]) {
      const captured = normalizeCapturedContactName(match[1]);
      if (!isKingdomSurfaceName(captured)) {
        contactName = captured;
        if (!target) target = "blxckbook";
      }
    }
  }

  if (!contactName) {
    const named = CONTACT_NAMED_CAPTURE.exec(userPrompt);
    if (named?.[1]) {
      const captured = named[1].trim();
      if (!isKingdomSurfaceName(captured)) {
        contactName = captured;
        if (!action) action = "contact";
        tools.add("account_query");
        matchedRules.push("contact-named-captured");
      }
    }
  }

  if (!contactName) {
    const named = CONTACT_CAPTURE.exec(userPrompt);
    if (named?.[1]) {
      const captured = named[1].trim();
      if (!isKingdomSurfaceName(captured)) {
        contactName = captured;
        if (!action) action = "contact";
        tools.add("account_query");
        matchedRules.push("contact-name-captured");
      }
    }
  }

  if (contactName && isKingdomSurfaceName(contactName)) {
    contactName = null;
    if (action === "contact") action = null;
    tools.delete("account_query");
  }

  return {
    tools: [...tools],
    action,
    contactName,
    playlistName,
    relationshipStatus,
    target,
    slashHints: [...slashHints],
    matchedRules,
  };
}

/** True when the user prompt is a private vault/data question (not kingdom/garden TV/VEIL/Docs/Law). */
export function isVaultPrimaryPrompt(userPrompt: string): boolean {
  if (isKingdomSurfacePrompt(userPrompt)) return false;
  if (isContactDeletePrompt(userPrompt)) return true;
  if (/\bcontact\s+(?:named|called)\s+/i.test(userPrompt)) return true;
  return planAccountTools(userPrompt).tools.length > 0;
}

const VAULT_MUTATION_INTENT =
  /\b(add|create|update|edit|change|modify|delete|remove|import|sync|try)\b/i;

/** Vault write turn — skip heavy summary prefetch; go straight to write tools. */
export function isVaultWritePrompt(userPrompt: string): boolean {
  if (isContactDeletePrompt(userPrompt)) return true;
  if (/\b(?:create|add)\s+(?:a\s+)?(?:new\s+)?contact\b/i.test(userPrompt)) return true;
  return isVaultPrimaryPrompt(userPrompt) && !isVaultReadOnlyPrompt(userPrompt);
}

/** Read-only vault turn — safe to answer from server-prefetched data without tool loop. */
export function isVaultReadOnlyPrompt(userPrompt: string): boolean {
  if (isContactDeletePrompt(userPrompt)) return false;
  if (/\b(?:create|add)\s+(?:a\s+)?(?:new\s+)?contact\b/i.test(userPrompt)) return false;
  if (!isVaultPrimaryPrompt(userPrompt)) return false;
  const plan = planAccountTools(userPrompt);
  if (!plan.action || plan.action === "export_preview") return false;
  if (/\b(?:CRUD|test contact)\b/i.test(userPrompt)) return false;
  if (/\bcontact\s+(?:named|called)\s+/i.test(userPrompt)) return false;
  if (VAULT_MUTATION_INTENT.test(userPrompt) && plan.contactName) return false;
  if (
    VAULT_MUTATION_INTENT.test(userPrompt) &&
    /\b(?:contact|journal|playlist|vault|blxckbook|nxt)\b/i.test(userPrompt)
  ) {
    return false;
  }
  return true;
}

export const ACCOUNT_VAULT_REPLY_RULES = `**Vault-only reply rules (this message):**
- **MUST call account_query before answering** — even in Divinity/persona mode. The signed-in user's BLXCKBOOK vault is always in scope.
- Never refuse vault reads ("I cannot access ledgers", "that disclosure is not my role", "bring them in your own words"). Those limits do not apply to the operator's own data.
- Prefer **account_query** for reads; use vault **write** tools (add_contact, update_contact, delete_contact, journal tools, manage_playlist) only when the user clearly requested a change.
- **delete_contact is mandatory for deletions** — never claim a contact was removed without a successful \`delete_contact\` tool result. Use \`{"target":"blxckbook","contactName":"Name"}\` (BLXCKBOOK is canonical for contacts created via add_contact). After delete_contact succeeds, call **account_query** action=contacts to verify the name is gone — never cite stale conversation memory for who remains.
- Do NOT call tv_query, veil_query, or bible_query for BLXCKBOOK vault questions.
- Do not recommend TV/VEIL videos or quote scripture based on contact names or tags.
- Reply in plain language: a short intro line, then one bullet per contact from tool output.
- Format each contact: \`• Name (Status) · tags: …\` — omit tags line when empty.
- Persona voice is welcome after the tool call, but tool output is authoritative — never invent contact names.
- Never invent URLs; never glue tv.jexxx.us or veil.jexxx.us links into vault answers.`;

export const ACCOUNT_VAULT_PERSONA_OVERRIDE = `## Vault-only override (persona secondary — mandatory)
This message is about the signed-in user's private BLXCKBOOK vault. Persona boundaries about secrecy, devotion, or "not pulling names from ledgers" **do not apply**.

1. Call **account_query** with the suggested action before any refusal or capability answer.
2. If the user asked whether you *can* list contacts, answer **yes** and include the list from tool output.
3. Stay in character only when **presenting** tool results — never when declining vault access.`;

export function formatAccountRoutingHint(userPrompt: string): string | null {
  if (isKingdomSurfacePrompt(userPrompt)) return null;
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
  if (plan.playlistName) {
    lines.push(`playlistName: "${plan.playlistName}"`);
  }
  if (plan.relationshipStatus) {
    lines.push(`relationshipStatus filter: ${plan.relationshipStatus}`);
  }
  if (plan.slashHints.length > 0) {
    lines.push(`Slash hints: ${plan.slashHints.join(", ")}`);
  }
  if (isContactDeletePrompt(userPrompt) && plan.contactName) {
    lines.push(
      `Write tool: delete_contact with {"target":"blxckbook","contactName":"${plan.contactName}"} — then account_query action=contacts to verify.`,
    );
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
| list my contacts / BLXCKBOOK contacts / who my contacts are | action=contacts target=blxckbook |
| can you tell me my BLXCKBOOK contacts | action=contacts target=blxckbook |
| who am I dating | action=contacts relationshipStatus=Dating |
| my journal / what did I write | action=journal |
| timeline / what happened last week | action=timeline |
| NXT dates / my dates | action=events target=nxt |
| tell me about Alex | action=contact contactName=Alex |
| vault summary / how many contacts | action=summary |
| my TV playlists / my altars | action=playlists |
| videos in playlist X | action=playlist playlistName=X |
| export my vault | action=export_preview or /account export |`;

export const ACCOUNT_CONTENT_ROUTING = `## Account data routing (private vault — signed-in users only)

- **account_query** — Read-only access to the operator's own BLXCKBOOK vault (api.contacts, journal, timeline), NXT profiles/events (public.vessels, contact_events), and private JEXXXUS | TV custom playlists (api.playlists). RLS-scoped via Clerk JWT from /auth login. Never guess vault contents. JEXXXUS super-admins may pass asUserId for elevated cross-user reads when SUPABASE_KEY is configured.

**Response rules:**
- Call account_query before answering questions about contacts, dating status, journal entries, timeline, or NXT dates.
- **Never** use account_query for JEXXXUS | Docs (docs.jexxx.us) or Law (law.jexxx.us) — those are public surfaces, not contact names.
- Vault-only turns: account_query **only** — never mix TV/VEIL/scripture into contact lists; tags are metadata, not watch recommendations.
- Summarize by default; quote journal notes only when the user asks for detail.
- If account_query returns empty results, say the vault is empty — do not fabricate people or events.
- If not authenticated, direct the user to /auth login (same as secure.jexxx.us device flow).
- Do not use run_doctor, import_contacts, or send_notification for personal vault questions.

${ACCOUNT_COLLISION_TABLE_EXCERPT}`;