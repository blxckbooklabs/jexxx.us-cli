import { looksLikeVerseReference, parseVerseReference } from "../bible.js";
import { isVaultPrimaryPrompt } from "./account-routing.js";

/** BLXCKCHAT tools + slash commands surfaced in routing hints. */
export type RoutableTool =
  | "tv_query"
  | "veil_query"
  | "bible_query"
  | "run_doctor"
  | "import_contacts"
  | "send_notification";

/** Thematic scripture to pair with TV/VEIL results (explicit Book Ch:V refs). */
export const COMPANION_VERSE_SETS = {
  forgiveness: ["1 John 1:9", "Luke 23:34", "Psalm 51:1"],
  confession: ["1 John 1:9", "James 5:16"],
  clergy: ["1 Timothy 3:2", "Hebrews 13:17"],
  jezebel: ["1 Kings 21:25", "Revelation 2:20"],
  crucifixion: ["Luke 23:34", "Matthew 27:46"],
  adultery: ["Proverbs 6:32", "Hebrews 13:4"],
  church: ["1 Corinthians 6:19", "Ephesians 5:23"],
  proverbs31: ["Proverbs 31:10", "Proverbs 31:30", "Proverbs 5:3"],
  rachelLeah: ["Genesis 29:16", "Genesis 29:17", "Genesis 29:25"],
} as const;

export const MAX_COMPANION_VERSES = 4;

export interface PhraseCollision {
  id: string;
  pattern: RegExp;
  tools: RoutableTool[];
  exclude?: RoutableTool[];
  slashHints?: string[];
  /** Fitting bible_query refs to fetch alongside TV/VEIL (not instead of them). */
  companionVerses?: readonly string[];
  /** Explicit tv_query search string (series, tag, category). */
  tvSearchQuery?: string;
  /** Explicit veil_query search string (topic, title fragment). */
  veilSearchQuery?: string;
  note: string;
}

export interface EmpireRoutingOptions {
  /** Recent user/assistant turns — used when the latest message is a short follow-up. */
  conversationContext?: string;
}

export interface EmpireToolPlan {
  tools: RoutableTool[];
  exclude: RoutableTool[];
  slashHints: string[];
  /** Distinct verse refs for separate bible_query action=query calls. */
  companionVerses: string[];
  /** Best tv_query search string for this prompt, if any. */
  tvSearchQuery: string | null;
  /** Best veil_query search string for this prompt, if any. */
  veilSearchQuery: string | null;
  matchedRules: string[];
}

export const PHRASE_COLLISIONS: readonly PhraseCollision[] = [
  {
    id: "tv-series-forgive-me-father",
    pattern: /forgive\s*,?\s*me\s*,?\s*father/i,
    tools: ["tv_query", "bible_query"],
    companionVerses: COMPANION_VERSE_SETS.forgiveness,
    tvSearchQuery: "Forgive Me Father",
    note: "Forgive Me Father TV series + forgiveness scripture companions.",
  },
  {
    id: "tv-channels-mormon-girlz-deviante",
    pattern: /\b(mormon\s+girlz|deviante)\b/i,
    tools: ["tv_query"],
    companionVerses: COMPANION_VERSE_SETS.church,
    note: "TV channel/tag search with light church-themed companions.",
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
    tools: ["veil_query", "bible_query"],
    companionVerses: COMPANION_VERSE_SETS.confession,
    note: "VEIL confession/corruption theme + matching verses.",
  },
  {
    id: "veil-pastor-wife-read",
    pattern: /pastor'?s?\s+wife.*\b(read|article|story)\b/i,
    tools: ["veil_query", "tv_query", "bible_query"],
    companionVerses: [...COMPANION_VERSE_SETS.clergy, ...COMPANION_VERSE_SETS.adultery],
    note: "Pastor's wife across VEIL + TV + clergy/adultery verses.",
  },
  {
    id: "scripture-proverbs-31",
    pattern: /proverbs\s*31/i,
    tools: ["veil_query", "bible_query"],
    companionVerses: COMPANION_VERSE_SETS.proverbs31,
    veilSearchQuery: "Proverbs 31",
    note: "Proverbs 31 bookmark/theme — VEIL + scripture companions.",
  },
  {
    id: "veil-church-girls",
    pattern: /\b(church\s+girl|churchy\s+girl|good\s+church\s+girl)\b/i,
    tools: ["veil_query", "bible_query"],
    companionVerses: COMPANION_VERSE_SETS.church,
    veilSearchQuery: "church girl",
    note: "Church girl VEIL theme + church scripture.",
  },
  {
    id: "veil-rachel-leah",
    pattern: /\b(ruth|rachels?|leahs?|boaz|naomi)\b/i,
    tools: ["veil_query", "bible_query"],
    companionVerses: COMPANION_VERSE_SETS.rachelLeah,
    veilSearchQuery: "Ruth",
    note: "Ruth / Rachel-Leah arc — VEIL + Genesis companions.",
  },
  {
    id: "divinities-multi-roleplay",
    pattern: /\broleplay\b.*\b(ruth|hannah|lil'?\s*bible)\b/i,
    tools: ["veil_query", "bible_query"],
    slashHints: ["/divinities"],
    note: "Multi-divinity roleplay — embody every named persona with VEIL/scripture.",
  },
  {
    id: "veil-draft-article",
    pattern:
      /\b(read the draft|unpublished (?:piece|article|post)|draft (?:on|article|piece)|number\s+\d+.*(?:article|piece|post))\b/i,
    tools: ["veil_query"],
    veilSearchQuery: "church girl",
    note: "Character offers a VEIL draft — search real articles.",
  },
  {
    id: "corruption-correspondent",
    pattern: /\b(corruption correspondent|lil'?\s*bible|keep the altar warm|blueprint)\b/i,
    tools: ["veil_query", "bible_query"],
    companionVerses: COMPANION_VERSE_SETS.confession,
    veilSearchQuery: "corruption",
    note: "Hannah / Lil' Bible corruption beat — VEIL + confession verses.",
  },
  {
    id: "persona-biblical-women",
    pattern: /\b(jezebel|delilah|bathsheba|mary\s+magdalene|bithiah)\b/i,
    tools: ["veil_query", "bible_query"],
    companionVerses: COMPANION_VERSE_SETS.jezebel,
    slashHints: ["/divinities"],
    note: "Biblical figure — VEIL/persona + canonical verse companions.",
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
    note: "Explicit scripture language → bible_query.",
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
    note: "Latest catalogs — list both; scripture companions optional unless theme named.",
  },
] as const;

const WATCH_CATEGORY_ON_TV = /\b(nuns?|category)\b.*\b(tv|jexxxus\s*\|\s*tv)\b/i;
const VEIL_SURFACE = /\bveil\b/i;
const TV_SURFACE = /\b(tv|jexxxus\s*\|\s*tv)\b/i;

/** Merge latest user message with recent transcript for routing/prefetch. */
export function buildEmpireRoutingText(
  userPrompt: string,
  options?: EmpireRoutingOptions,
): string {
  const parts = [userPrompt.trim()];
  const ctx = options?.conversationContext?.trim();
  if (ctx) parts.push(ctx);
  return parts.join("\n\n");
}

/** Last N user/assistant lines for empire phrase detection on short follow-ups. */
export function extractRoutingContextFromHistory(
  messages: Array<{ role: string; content: string }>,
  maxMessages = 8,
): string {
  return messages
    .slice(-maxMessages)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => m.content)
    .join("\n\n");
}

function addTools(set: Set<RoutableTool>, tools: RoutableTool[]): void {
  for (const t of tools) set.add(t);
}

function removeTools(set: Set<RoutableTool>, tools: RoutableTool[]): void {
  for (const t of tools) set.delete(t);
}

function mergeCompanionVerses(target: Set<string>, verses: readonly string[]): void {
  for (const v of verses) {
    if (target.size >= MAX_COMPANION_VERSES) break;
    target.add(v);
  }
}

/** Resolve tv_query search text from routing plan + prompt. */
export function inferTvSearchQuery(prompt: string, plan: EmpireToolPlan): string | null {
  if (plan.tvSearchQuery) return plan.tvSearchQuery;
  if (/forgive\s*,?\s*me\s*,?\s*father/i.test(prompt)) return "Forgive Me Father";
  if (/\b(mormon\s+girlz)\b/i.test(prompt)) return "Mormon Girlz";
  if (/\bdeviante\b/i.test(prompt)) return "Deviante";
  if (/\b(pastor\/?priest)\b/i.test(prompt)) return "Pastor/Priest";
  if (/\bnuns?\b/i.test(prompt)) return "Nuns";
  return null;
}

/** Infer fitting companions when TV/VEIL matched but no row supplied verses. */
export function inferThemeCompanionVerses(prompt: string): string[] {
  const verses = new Set<string>();
  if (/forgive|confession/i.test(prompt)) {
    mergeCompanionVerses(verses, COMPANION_VERSE_SETS.forgiveness);
  }
  if (/pastor|priest|clergy/i.test(prompt)) {
    mergeCompanionVerses(verses, COMPANION_VERSE_SETS.clergy);
  }
  if (/crucifixion|cross/i.test(prompt)) {
    mergeCompanionVerses(verses, COMPANION_VERSE_SETS.crucifixion);
  }
  if (/adultery|cheat|cuck/i.test(prompt)) {
    mergeCompanionVerses(verses, COMPANION_VERSE_SETS.adultery);
  }
  if (/\b(jezebel)\b/i.test(prompt)) {
    mergeCompanionVerses(verses, COMPANION_VERSE_SETS.jezebel);
  }
  if (/\b(nuns?|in\s+church|church)\b/i.test(prompt)) {
    mergeCompanionVerses(verses, COMPANION_VERSE_SETS.church);
  }
  if (/proverbs\s*31/i.test(prompt)) {
    mergeCompanionVerses(verses, COMPANION_VERSE_SETS.proverbs31);
  }
  if (/\b(rachels?|leahs?)\b/i.test(prompt)) {
    mergeCompanionVerses(verses, COMPANION_VERSE_SETS.rachelLeah);
  }
  if (/\b(corruption|confess)\b/i.test(prompt)) {
    mergeCompanionVerses(verses, COMPANION_VERSE_SETS.confession);
  }
  return [...verses].slice(0, MAX_COMPANION_VERSES);
}

/** Resolve veil_query search text from routing plan + prompt. */
export function inferVeilSearchQuery(prompt: string, plan: EmpireToolPlan): string | null {
  if (plan.veilSearchQuery) return plan.veilSearchQuery;
  if (/proverbs\s*31/i.test(prompt)) return "Proverbs 31";
  if (/\b(ruth|boaz|naomi)\b/i.test(prompt)) return "Ruth";
  if (/\b(rachels?|leahs?)\b/i.test(prompt)) return "Rachel Leah";
  if (/\b(church\s+girl|churchy)\b/i.test(prompt)) return "church girl";
  if (/\b(corruption|confession|altar)\b/i.test(prompt)) return "corruption";
  if (/\bpastor'?s?\s+wife\b/i.test(prompt)) return "pastor's wife";
  return null;
}

function isCatalogOnlyPrompt(prompt: string): boolean {
  return (
    /\b(latest|recent|list)\b/i.test(prompt) &&
    !/forgive|pastor|jezebel|corruption|confession|nuns|crucifixion|adultery/i.test(prompt)
  );
}

/** Plan which empire tools fit a user message (deterministic, testable). */
export function planEmpireTools(
  userPrompt: string,
  options?: EmpireRoutingOptions,
): EmpireToolPlan {
  const tools = new Set<RoutableTool>();
  const exclude = new Set<RoutableTool>();
  const slashHints = new Set<string>();
  const companionVerses = new Set<string>();
  let tvSearchQuery: string | null = null;
  let veilSearchQuery: string | null = null;
  const matchedRules: string[] = [];

  const prompt = buildEmpireRoutingText(userPrompt, options);
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
    if (row.companionVerses) {
      mergeCompanionVerses(companionVerses, row.companionVerses);
    }
    if (row.tvSearchQuery && !tvSearchQuery) {
      tvSearchQuery = row.tvSearchQuery;
    }
    if (row.veilSearchQuery && !veilSearchQuery) {
      veilSearchQuery = row.veilSearchQuery;
    }
  }

  if (WATCH_CATEGORY_ON_TV.test(prompt)) {
    addTools(tools, ["tv_query"]);
    mergeCompanionVerses(companionVerses, COMPANION_VERSE_SETS.church);
    matchedRules.push("tv-category-on-tv-surface");
  }

  if (VEIL_SURFACE.test(prompt) && /\b(article|corruption)\b/i.test(prompt)) {
    addTools(tools, ["veil_query"]);
    mergeCompanionVerses(companionVerses, COMPANION_VERSE_SETS.confession);
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

  if (
    /\b(scripture|verse)\b/i.test(prompt) &&
    /\b(watch|video|something\s+to\s+watch)\b/i.test(prompt)
  ) {
    addTools(tools, ["bible_query", "tv_query"]);
    mergeCompanionVerses(companionVerses, COMPANION_VERSE_SETS.forgiveness);
    matchedRules.push("scripture-and-watch-bundle");
  }

  if (/pastor'?s?\s+wife/i.test(prompt) && /\b(read|watch)\b/i.test(prompt)) {
    addTools(tools, ["veil_query", "tv_query", "bible_query"]);
    mergeCompanionVerses(companionVerses, [
      ...COMPANION_VERSE_SETS.clergy,
      ...COMPANION_VERSE_SETS.adultery,
    ]);
    matchedRules.push("pastor-wife-read-watch-bundle");
  }

  const hasContentSurface = tools.has("tv_query") || tools.has("veil_query");
  if (hasContentSurface && !isCatalogOnlyPrompt(prompt) && companionVerses.size === 0) {
    for (const v of inferThemeCompanionVerses(prompt)) {
      companionVerses.add(v);
    }
    if (companionVerses.size > 0) matchedRules.push("theme-companions-inferred");
  }

  if (companionVerses.size > 0) {
    addTools(tools, ["bible_query"]);
    matchedRules.push("companion-scripture-bundle");
  }

  removeTools(tools, [...exclude]);

  // Pure verse lookup — no TV/VEIL unless user also asked to watch/read.
  if (
    hasVerseRef &&
    !tools.has("tv_query") &&
    !tools.has("veil_query") &&
    companionVerses.size === 0
  ) {
    tools.clear();
    tools.add("bible_query");
  }

  // Scripture words without a ref still warrant bible_query when companions exist.
  if (
    companionVerses.size === 0 &&
    !hasVerseRef &&
    !/\b(scripture|verse|passage)\b/i.test(prompt)
  ) {
    tools.delete("bible_query");
  }

  if (!tvSearchQuery && tools.has("tv_query")) {
    tvSearchQuery = inferTvSearchQuery(prompt, {
      tools: [...tools],
      exclude: [...exclude],
      slashHints: [...slashHints],
      companionVerses: [...companionVerses],
      tvSearchQuery: null,
      veilSearchQuery: null,
      matchedRules,
    });
  }

  if (!veilSearchQuery && tools.has("veil_query")) {
    veilSearchQuery = inferVeilSearchQuery(prompt, {
      tools: [...tools],
      exclude: [...exclude],
      slashHints: [...slashHints],
      companionVerses: [...companionVerses],
      tvSearchQuery,
      veilSearchQuery: null,
      matchedRules,
    });
  }

  return {
    tools: [...tools],
    exclude: [...exclude],
    slashHints: [...slashHints],
    companionVerses: [...companionVerses],
    tvSearchQuery,
    veilSearchQuery,
    matchedRules,
  };
}

/** Divinity names requested for multi-persona roleplay. */
export function detectNamedDivinities(text: string): string[] {
  const names: string[] = [];
  if (/\bruth\b/i.test(text)) names.push("Ruth");
  if (/\blil'?\s*bible\b/i.test(text)) names.push("Lil' Bible");
  if (/\bhannah\b/i.test(text)) names.push("Hannah");
  return names;
}

/** Human-readable block appended to the system prompt for the current user turn. */
export function formatEmpireRoutingHint(
  userPrompt: string,
  options?: EmpireRoutingOptions,
): string | null {
  if (isVaultPrimaryPrompt(userPrompt)) {
    return null;
  }

  const plan = planEmpireTools(userPrompt, options);
  if (plan.tools.length === 0 && plan.slashHints.length === 0) return null;

  const lines = ["## Routing hint for this message (kingdom/garden content routing)"];
  if (plan.tools.length > 0) {
    lines.push(`Prefer tools: ${plan.tools.join(", ")}`);
  }
  if (plan.exclude.length > 0) {
    lines.push(`Avoid tools: ${plan.exclude.join(", ")}`);
  }
  if (plan.slashHints.length > 0) {
    lines.push(`Slash hints: ${plan.slashHints.join(", ")}`);
  }
  if (plan.tvSearchQuery && plan.tools.includes("tv_query")) {
    lines.push(
      `TV search — call tv_query action=search query="${plan.tvSearchQuery}" (not action=list).`,
    );
  }
  if (plan.veilSearchQuery && plan.tools.includes("veil_query")) {
    lines.push(
      `VEIL search — call veil_query action=search query="${plan.veilSearchQuery}" (not action=list).`,
    );
  }
  if (options?.conversationContext?.trim()) {
    lines.push(
      "Routing includes recent conversation context — use tools even during persona roleplay when scripture, drafts, or VEIL themes appear.",
    );
  }
  const personas = detectNamedDivinities(
    buildEmpireRoutingText(userPrompt, options),
  );
  if (personas.length >= 2) {
    lines.push(
      `Persona cast — labeled sections for each: ${personas.join(", ")}. Include every named character with equal depth.`,
    );
  }
  if (plan.companionVerses.length > 0) {
    lines.push(
      `Companion scripture — call bible_query action=query separately for each: ${plan.companionVerses.join("; ")}`,
    );
    lines.push(
      "Quote 2–3 of these verses in your final reply alongside TV/VEIL links. " +
        "Do not pass series titles (e.g. Forgive Me Father) to bible_query — only the Book Ch:V refs above. " +
        "Never use action=chapters or book-only lookups.",
    );
  }
  if (plan.companionVerses.length > 0 || plan.tvSearchQuery) {
    lines.push(
      "Pre-fetched TV/scripture may appear below — synthesize a polished answer from that data.",
    );
  }
  lines.push(
    "Synthesize TV + VEIL + scripture in one answer. Do not retry a failed bible_query with format variants.",
  );
  return lines.join("\n");
}

export const EMPIRE_COLLISION_TABLE_EXCERPT = `### Phrase collision quick reference
| Phrase | Tools + companions |
| Forgive Me Father, Deviante | tv_query search + bible_query (1 John 1:9, Luke 23:34, Psalm 51:1) |
| Pastor's Wife, Nuns, In Church | tv_query + fitting bible_query verses |
| corruption, confession (VEIL) | veil_query + bible_query (1 John 1:9, James 5:16) |
| Jezebel, Hannah, Bathsheba | veil_query + /divinities + bible_query companions |
| 1 John 1:9 alone | bible_query only |
| latest VEIL and TV (catalog) | veil_query list + tv_query list (no scripture unless themed) |
| database up / doctor | run_doctor |`;

export const EMPIRE_CONTENT_ROUTING = `## Kingdom/Garden content routing (pick every relevant tool)

- **tv_query** — JEXXXUS | TV videos on tv.jexxx.us. Channels, series, tags, titles (Forgive Me Father, Deviante, categories).
- **veil_query** — VEIL articles on veil.jexxx.us.
- **bible_query** — Scripture vault. action=query with explicit **Book Chapter:Verse** only (e.g. "1 John 1:9") — never pass video series titles as the query string.

**Kingdom/Garden synthesis rule:** For thematic asks (confession, forgiveness, pastor, Jezebel, Proverbs 31, church girl, etc.), call **tv_query** and/or **veil_query** AND **2–3 bible_query** calls using the companion verses from the routing hint. Weave quoted scripture into the same reply as watch/read links. During **persona roleplay**, still call tools when the scene cites scripture bookmarks, VEIL drafts/articles, or TV sacraments — cite real catalog URLs in dialogue; do not invent article numbers without veil_query.

**URL rule (strict):** Copy https://tv.jexxx.us/video/... and https://veil.jexxx.us/articles/... links **exactly** from tool or pre-fetched output — **one URL per line**, never glue two URLs together. Use markdown [Title](url) in lists, not Title [url]. Never use wv.jexxx.us, never insert spaces inside URLs or slugs, never invent paths. In persona roleplay, weave 2–3 links into the scene — avoid raw catalog dumps with ALL-CAPS headers unless the user asks for a list.

If bible_query fails once, do not spam format variants — use the listed Book Ch:V refs only.

${EMPIRE_COLLISION_TABLE_EXCERPT}`;