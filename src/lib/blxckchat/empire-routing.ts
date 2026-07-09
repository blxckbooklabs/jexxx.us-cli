import { looksLikeVerseReference, parseVerseReference } from "../bible.js";

/** BLXCKCHAT tools + slash commands surfaced in routing hints. */
export type RoutableTool =
  | "tv_query"
  | "veil_query"
  | "bible_query"
  | "run_doctor"
  | "import_contacts"
  | "send_notification";

export interface PhraseCollision {
  /** Stable id for tests and logging. */
  id: string;
  /** Case-insensitive pattern — any match activates the row. */
  pattern: RegExp;
  tools: RoutableTool[];
  /** Tools to strip from the plan when this row matches (false friends). */
  exclude?: RoutableTool[];
  /** Optional /divinities or other slash hints (not tool calls). */
  slashHints?: string[];
  note: string;
}

export interface EmpireToolPlan {
  tools: RoutableTool[];
  exclude: RoutableTool[];
  slashHints: string[];
  matchedRules: string[];
}

/**
 * Compact collision table — biblical-sounding empire vocabulary that routes to
 * different surfaces. Order matters: later exclude rules can remove false tools.
 */
export const PHRASE_COLLISIONS: readonly PhraseCollision[] = [
  {
    id: "tv-series-forgive-me-father",
    pattern: /forgive\s+me\s+father/i,
    tools: ["tv_query"],
    exclude: ["bible_query"],
    note: "Forgive Me Father is a TV tag/series (Deviante), not a verse lookup.",
  },
  {
    id: "tv-channels-mormon-girlz-deviante",
    pattern: /\b(mormon\s+girlz|deviante)\b/i,
    tools: ["tv_query"],
    exclude: ["bible_query"],
    note: "TV channel/tag names — search tv.jexxx.us.",
  },
  {
    id: "tv-categories",
    pattern:
      /\b(in\s+church|pastor\/?priest|pastor'?s?\s+wife|nuns?|crucifixion|orgies|lesbo|bdsm|adultery|ai\s+sacraments|deepthroat|creampie|wedding)\b/i,
    tools: ["tv_query"],
    note: "JEXXXUS | TV thematic category.",
  },
  {
    id: "veil-categories",
    pattern: /\b(corruption|confessions?|the\s+altar|clergy)\b/i,
    tools: ["veil_query"],
    note: "VEIL article category or theme.",
  },
  {
    id: "veil-pastor-wife-read",
    pattern: /pastor'?s?\s+wife.*\b(read|article|story)\b/i,
    tools: ["veil_query", "tv_query"],
    exclude: ["bible_query"],
    note: "Pastor's wife spans VEIL clergy posts and TV category.",
  },
  {
    id: "persona-biblical-women",
    pattern: /\b(jezebel|delilah|bathsheba|hannah|mary\s+magdalene|bithiah)\b/i,
    tools: ["veil_query"],
    exclude: ["bible_query"],
    slashHints: ["/divinities"],
    note: "Biblical figure names — VEIL authors/personas; use /divinities unless user cites Book Ch:V.",
  },
  {
    id: "intent-watch",
    pattern: /\b(watch|stream|video|videos|episode|tv\b|something\s+to\s+watch)\b/i,
    tools: ["tv_query"],
    note: "Watch intent → tv_query.",
  },
  {
    id: "intent-read",
    pattern: /\b(read|article|articles|story|stories|post|posts|veil\b)\b/i,
    tools: ["veil_query"],
    note: "Read intent → veil_query.",
  },
  {
    id: "intent-scripture-words",
    pattern: /\b(verse|scripture|passage|chapter)\b/i,
    tools: ["bible_query"],
    note: "Explicit scripture language → bible_query when reference present.",
  },
  {
    id: "operator-doctor",
    pattern: /\b(doctor|mamabase|connectivity|database\s+up|stack\s+up|is\s+the\s+database)\b/i,
    tools: ["run_doctor"],
    note: "Stack health → run_doctor.",
  },
  {
    id: "operator-import",
    pattern: /\b(import\s+contacts|csv\s+import|blxckbook\s+import)\b/i,
    tools: ["import_contacts"],
    note: "Contact import → import_contacts (confirmation required).",
  },
  {
    id: "operator-notify",
    pattern: /\b(notify|notification|alert\s+me|ping\s+me)\b/i,
    tools: ["send_notification"],
    note: "Notifications → send_notification (confirmation required).",
  },
  {
    id: "catalog-latest-both",
    pattern: /\b(latest|recent|new)\b.*\b(veil|tv)\b/i,
    tools: ["veil_query", "tv_query"],
    note: "Latest across surfaces — list both catalogs (action=list, skip discover).",
  },
] as const;

const WATCH_CATEGORY_ON_TV = /\b(nuns?|category)\b.*\b(tv|jexxxus\s*\|\s*tv)\b/i;
const VEIL_SURFACE = /\bveil\b/i;
const TV_SURFACE = /\b(tv|jexxxus\s*\|\s*tv)\b/i;

function addTools(set: Set<RoutableTool>, tools: RoutableTool[]): void {
  for (const t of tools) set.add(t);
}

function removeTools(set: Set<RoutableTool>, tools: RoutableTool[]): void {
  for (const t of tools) set.delete(t);
}

/** Plan which empire tools fit a user message (deterministic, testable). */
export function planEmpireTools(userPrompt: string): EmpireToolPlan {
  const tools = new Set<RoutableTool>();
  const exclude = new Set<RoutableTool>();
  const slashHints = new Set<string>();
  const matchedRules: string[] = [];

  const prompt = userPrompt.trim();
  const hasVerseRef =
    looksLikeVerseReference(prompt) ||
    [...prompt.matchAll(/\b((?:\d+\s+)?[A-Za-z][A-Za-z0-9\s.'-]*?\s+\d+\s*[: ]\s*\d+)\b/g)]
      .some((m) => m[1] && parseVerseReference(m[1]) !== null);

  for (const row of PHRASE_COLLISIONS) {
    if (!row.pattern.test(prompt)) continue;
    matchedRules.push(row.id);
    addTools(tools, row.tools);
    if (row.exclude) {
      for (const t of row.exclude) exclude.add(t);
    }
    if (row.slashHints) {
      for (const h of row.slashHints) slashHints.add(h);
    }
  }

  if (WATCH_CATEGORY_ON_TV.test(prompt)) {
    addTools(tools, ["tv_query"]);
    matchedRules.push("tv-category-on-tv-surface");
  }

  if (VEIL_SURFACE.test(prompt) && /\b(article|corruption)\b/i.test(prompt)) {
    addTools(tools, ["veil_query"]);
    matchedRules.push("veil-surface-explicit");
  }

  if (TV_SURFACE.test(prompt) && /\b(latest|list)\b/i.test(prompt)) {
    addTools(tools, ["tv_query"]);
    matchedRules.push("tv-surface-list");
  }

  if (hasVerseRef) {
    addTools(tools, ["bible_query"]);
    matchedRules.push("verse-reference-detected");
  }

  // Scripture + watch in one message → both (regression #3).
  if (
    /\b(scripture|verse)\b/i.test(prompt) &&
    /\b(watch|video|something\s+to\s+watch)\b/i.test(prompt)
  ) {
    addTools(tools, ["bible_query", "tv_query"]);
    matchedRules.push("scripture-and-watch-bundle");
  }

  // Pastor's wife read + watch bundle (regression #4).
  if (/pastor'?s?\s+wife/i.test(prompt) && /\b(read|watch)\b/i.test(prompt)) {
    addTools(tools, ["veil_query", "tv_query"]);
    exclude.add("bible_query");
    matchedRules.push("pastor-wife-read-watch-bundle");
  }

  removeTools(tools, [...exclude]);

  // Never suggest bible_query without a verse-shaped reference unless scripture words + explicit ref elsewhere.
  if (!hasVerseRef && !/\b(scripture|verse|passage)\b/i.test(prompt)) {
    tools.delete("bible_query");
  }

  return {
    tools: [...tools],
    exclude: [...exclude],
    slashHints: [...slashHints],
    matchedRules,
  };
}

/** Human-readable block appended to the system prompt for the current user turn. */
export function formatEmpireRoutingHint(userPrompt: string): string | null {
  const plan = planEmpireTools(userPrompt);
  if (plan.tools.length === 0 && plan.slashHints.length === 0) return null;

  const lines = ["## Routing hint for this message (empire collision table)"];
  if (plan.tools.length > 0) {
    lines.push(`Prefer tools: ${plan.tools.join(", ")}`);
  }
  if (plan.exclude.length > 0) {
    lines.push(`Avoid tools: ${plan.exclude.join(", ")}`);
  }
  if (plan.slashHints.length > 0) {
    lines.push(`Slash hints: ${plan.slashHints.join(", ")}`);
  }
  lines.push(
    "Synthesize all relevant results in one reply. Do not retry a failed bible_query with format variants.",
  );
  return lines.join("\n");
}

/** Collision table excerpt embedded in the static system prompt. */
export const EMPIRE_COLLISION_TABLE_EXCERPT = `### Phrase collision quick reference
| Phrase | Tools |
| Forgive Me Father, Mormon Girlz, Deviante | tv_query (not bible_query) |
| Pastor's Wife, Nuns, In Church, Crucifixion | tv_query category search |
| corruption, confession, clergy (read) | veil_query |
| Jezebel, Hannah, Bathsheba (who/what) | veil_query + /divinities (not bible_query unless Book Ch:V) |
| 1 John 1:9, Genesis 1:1 | bible_query only |
| watch + scripture in one ask | tv_query + bible_query |
| latest VEIL and TV | veil_query list + tv_query list |
| database up / doctor | run_doctor |`;

export const EMPIRE_CONTENT_ROUTING = `## Empire content routing (pick every relevant tool)

- **tv_query** — JEXXXUS | TV videos on tv.jexxx.us. Use for watch recommendations, channels, series, tags, and titles (e.g. "Forgive Me Father", "Mormon Girlz", "Nuns", Pastor/Priest). Prefer action=search with the phrase the user named.
- **veil_query** — VEIL articles on veil.jexxx.us. Use for written erotica topics and article links.
- **bible_query** — Scripture vault only. action=query with an explicit reference: "Genesis 1:1", "1 John 1:9", "John 3 16". Never use bible_query for video/series/channel names or general themes.

When the user names something that exists on TV (uploaders, tags, series), call **tv_query** even if the phrase sounds biblical. Synthesize one reply from **all** tool results (TV links + verses + articles). If bible_query fails once, do not spam format variants — try tv_query or veil_query instead.

${EMPIRE_COLLISION_TABLE_EXCERPT}`;