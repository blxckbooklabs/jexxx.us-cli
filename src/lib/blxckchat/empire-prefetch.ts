import { findVerse } from "../bible.js";
import { getTvContentSourceInfo, listTvVideos, searchTvVideos } from "../tv.js";
import { getVeilContentSourceInfo, listVeilArticles, searchVeilArticles } from "../veil.js";
import { formatBibleVerseForChat } from "./bible-format.js";
import {
  inferTvSearchQuery,
  inferVeilSearchQuery,
  planEmpireTools,
  type EmpireRoutingOptions,
} from "./empire-routing.js";
import { formatTvVideoList } from "./tools/tv-format.js";
import { formatVeilArticleList } from "./tools/veil-format.js";

const PREFETCH_TV_LIMIT = 8;
const PREFETCH_VEIL_LIMIT = 6;
const PREFETCH_VERSE_LIMIT = 3;

/**
 * Pre-fetch companion scripture and TV/VEIL search hits for thematic empire asks.
 * Injected into the system prompt so smaller models can synthesize without
 * mis-calling bible_query (e.g. listing chapters) or tv_query list.
 */
export async function prefetchEmpireContext(
  userPrompt: string,
  options?: EmpireRoutingOptions,
): Promise<string | null> {
  const plan = planEmpireTools(userPrompt, options);
  const routingText = options?.conversationContext
    ? `${userPrompt}\n\n${options.conversationContext}`
    : userPrompt;
  const tvSearch = inferTvSearchQuery(routingText, plan);
  const veilSearch = inferVeilSearchQuery(routingText, plan);
  const verses = plan.companionVerses.slice(0, PREFETCH_VERSE_LIMIT);

  if (!tvSearch && !veilSearch && verses.length === 0) return null;

  const blocks: string[] = [
    "## Pre-fetched empire context (authoritative — weave into your reply)",
    "Use the data below directly in roleplay or synthesis. Do not call bible_query with book names only " +
      "or action=chapters. Quote 2–3 verses and link VEIL/TV results with exact URLs.",
  ];

  if (verses.length > 0) {
    const lines = ["", "### Companion scripture"];
    for (const ref of verses) {
      const verse = findVerse(ref);
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

  return blocks.join("\n");
}