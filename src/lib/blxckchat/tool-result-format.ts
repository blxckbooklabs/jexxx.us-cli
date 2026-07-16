/** Format a tool result for fallback synthesis when the model exhausts turns. */
export function formatToolResultForFallback(toolName: string, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "I looked that up but did not get usable results. Try rephrasing your question.";
  }

  if (toolName === "bible_query") {
    if (trimmed.startsWith("Chapter list for") || trimmed.includes("navigation only")) {
      return (
        "I need a full verse reference (e.g. 1 John 1:9) rather than a chapter list. " +
        "Ask again and I will quote scripture alongside any TV or VEIL results."
      );
    }
    if (trimmed.includes("does not look like a scripture reference")) {
      return trimmed;
    }
    if (looksLikeChapterJsonArray(trimmed)) {
      return (
        "I retrieved a chapter list instead of verse text. " +
        "Companion scripture is pre-fetched for thematic queries — ask again for TV links plus quoted verses."
      );
    }
    return trimmed;
  }

  if (toolName === "tv_query" || toolName === "veil_query" || toolName === "music_query") {
    if (
      trimmed.includes("JEXXXUS | TV videos") ||
      trimmed.includes("VEIL") ||
      trimmed.includes("JEXXXUS Music")
    ) {
      return trimmed;
    }
  }

  if (toolName === "account_query") {
    if (trimmed.startsWith("Error: not signed in")) {
      return `${trimmed} Vault questions need /auth login first.`;
    }
    return trimmed;
  }

  if (looksLikeChapterJsonArray(trimmed)) {
    return (
      "I retrieved catalog metadata but not the content you asked for. " +
      "Please try again — I will search TV/VEIL and quote companion scripture."
    );
  }

  return trimmed;
}

function looksLikeChapterJsonArray(trimmed: string): boolean {
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return false;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((v) => typeof v === "string" && /^Chapter\s+\d+$/i.test(v))
    );
  } catch {
    return false;
  }
}