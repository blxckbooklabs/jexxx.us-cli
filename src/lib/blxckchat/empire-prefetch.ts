import { findVerse } from "../bible.js";
import { getTvContentSourceInfo, listTvVideos, searchTvVideos } from "../tv.js";
import { formatBibleVerseForChat } from "./bible-format.js";
import { formatTvVideoList } from "./tools/tv-format.js";
import { inferTvSearchQuery, planEmpireTools } from "./empire-routing.js";

const PREFETCH_TV_LIMIT = 8;
const PREFETCH_VERSE_LIMIT = 3;

/**
 * Pre-fetch companion scripture and TV search hits for thematic empire asks.
 * Injected into the system prompt so smaller models can synthesize without
 * mis-calling bible_query (e.g. listing chapters) or tv_query list.
 */
export async function prefetchEmpireContext(userPrompt: string): Promise<string | null> {
  const plan = planEmpireTools(userPrompt);
  const tvQuery = inferTvSearchQuery(userPrompt, plan);
  const verses = plan.companionVerses.slice(0, PREFETCH_VERSE_LIMIT);

  if (!tvQuery && verses.length === 0) return null;

  const blocks: string[] = [
    "## Pre-fetched empire context (authoritative — weave into your reply)",
    "Use the data below directly. Do not call bible_query with book names only or " +
      "action=chapters. Quote 2–3 verses and link TV results in polished prose.",
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

  if (tvQuery && plan.tools.includes("tv_query")) {
    try {
      const allVideos = await listTvVideos();
      const hits = searchTvVideos(allVideos, tvQuery, PREFETCH_TV_LIMIT);
      const sourceInfo = getTvContentSourceInfo();
      const header = `\n### JEXXXUS | TV — ${tvQuery}`;
      const body = formatTvVideoList(hits, allVideos.length, sourceInfo);
      blocks.push(`${header}\n${body}`);
    } catch {
      blocks.push(`\n### JEXXXUS | TV — ${tvQuery}\n(Catalog unavailable — use tv_query action=search.)`);
    }
  }

  return blocks.join("\n");
}