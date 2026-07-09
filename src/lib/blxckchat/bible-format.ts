import type { BibleVerse } from "../bible.js";

/** Human-readable verse block for BLXCKCHAT replies (not raw JSON). */
export function formatBibleVerseForChat(verse: BibleVerse): string {
  const ref = `${verse.book} ${verse.chapter}:${verse.verse}`;
  const canon = verse.canon ? ` (${verse.canon})` : "";
  const text = verse.text.trim() || "(text unavailable)";
  return `${ref}${canon}\n${text}`;
}