import { findVerseWithFallback } from "../bible.js";
import { getTvContentSourceInfo, listTvVideos, searchTvVideos } from "../tv.js";
import { getVeilContentSourceInfo, listVeilArticles, searchVeilArticles } from "../veil.js";
import { formatBibleVerseForChat } from "./bible-format.js";
import { isVaultPrimaryPrompt } from "./account-routing.js";
import { listLawPolicies } from "../law.js";
import {
  inferTvSearchQuery,
  inferVeilSearchQuery,
  planKingdomTools,
  type KingdomRoutingOptions,
} from "./kingdom-routing.js";
import { listMusicCatalog } from "../music.js";
import { formatLawPolicyList } from "./tools/law-format.js";
import { formatMusicCatalogList } from "./tools/music-format.js";
import { formatTvVideoList } from "./tools/tv-format.js";
import { formatVeilArticleList } from "./tools/veil-format.js";

const PREFETCH_TV_LIMIT = 8;
const PREFETCH_VEIL_LIMIT = 6;
const PREFETCH_VERSE_LIMIT = 3;

/**
 * Pre-fetch companion scripture and TV/VEIL search hits for thematic garden asks.
 * Injected into the system prompt so smaller models can synthesize without
 * mis-calling bible_query (e.g. listing chapters) or tv_query list.
 */
export async function prefetchGardenContext(
  userPrompt: string,
  options?: KingdomRoutingOptions,
): Promise<string | null> {
  if (isVaultPrimaryPrompt(userPrompt)) {
    return null;
  }

  const plan = planKingdomTools(userPrompt, options);
  const routingText = options?.conversationContext
    ? `${userPrompt}\n\n${options.conversationContext}`
    : userPrompt;
  const tvSearch = inferTvSearchQuery(routingText, plan);
  const veilSearch = inferVeilSearchQuery(routingText, plan);
  const verses = plan.companionVerses.slice(0, PREFETCH_VERSE_LIMIT);

  const needsLaw = Boolean(plan.lawQuery);
  const needsDocs = plan.docsHint;
  const needsMusic = plan.tools.includes("music_query");

  if (!tvSearch && !veilSearch && verses.length === 0 && !needsLaw && !needsDocs && !needsMusic) {
    return null;
  }

  const blocks: string[] = [
    "## Pre-fetched kingdom context (authoritative — weave into your reply)",
    "Use the data below directly. Do not call account_query for Docs or Law — they are public surfaces.",
  ];

  if (needsDocs) {
    blocks.push(
      "",
      "### JEXXXUS | Docs (docs.jexxx.us)",
      "Public reference library for architecture, CLI, and platform docs. Summarize from " +
        "Relevant JEXXXUS documentation context in the system prompt.",
    );
  }

  if (needsLaw && plan.lawQuery) {
    try {
      const policies = await listLawPolicies();
      const header = "\n### JEXXXUS | Law (law.jexxx.us)";
      const body = formatLawPolicyList(policies, policies.length);
      blocks.push(`${header}\n${body}`);
    } catch {
      blocks.push(
        "\n### JEXXXUS | Law (law.jexxx.us)\n(Catalog unavailable — use law_query action=list.)",
      );
    }
  }

  if (tvSearch || veilSearch || verses.length > 0) {
    blocks.push(
      "For TV/VEIL/scripture: do not call bible_query with book names only or action=chapters. " +
        "Quote 2–3 verses and link VEIL/TV results with exact URLs.",
    );
  }

  if (verses.length > 0) {
    const lines = ["", "### Companion scripture"];
    for (const ref of verses) {
      const verse = await findVerseWithFallback(ref);
      if (verse) {
        lines.push(formatBibleVerseForChat(verse));
        lines.push("");
      } else {
        lines.push(`${ref} — (verse not found in vault)`);
        lines.push("");
      }
    }
    blocks.push(lines.join("\n").trimEnd());
  }

  if (veilSearch && plan.tools.includes("veil_query")) {
    try {
      const allArticles = await listVeilArticles();
      const hits = searchVeilArticles(allArticles, veilSearch, PREFETCH_VEIL_LIMIT);
      const sourceInfo = getVeilContentSourceInfo();
      const header = `\n### VEIL — ${veilSearch}`;
      const body = formatVeilArticleList(hits, allArticles.length, sourceInfo);
      blocks.push(`${header}\n${body}`);
    } catch {
      blocks.push(`\n### VEIL — ${veilSearch}\n(Catalog unavailable — use veil_query action=search.)`);
    }
  }

  if (tvSearch && plan.tools.includes("tv_query")) {
    try {
      const allVideos = await listTvVideos();
      const hits = searchTvVideos(allVideos, tvSearch, PREFETCH_TV_LIMIT);
      const sourceInfo = getTvContentSourceInfo();
      const header = `\n### JEXXXUS | TV — ${tvSearch}`;
      const body = formatTvVideoList(hits, allVideos.length, sourceInfo);
      blocks.push(`${header}\n${body}`);
    } catch {
      blocks.push(`\n### JEXXXUS | TV — ${tvSearch}\n(Catalog unavailable — use tv_query action=search.)`);
    }
  }

  if (needsMusic) {
    const catalog = listMusicCatalog(8);
    blocks.push(
      `\n### JEXXXUS Music (music.jexxx.us)\n${formatMusicCatalogList(catalog, catalog.length)}`,
    );
  }

  return blocks.join("\n");
}