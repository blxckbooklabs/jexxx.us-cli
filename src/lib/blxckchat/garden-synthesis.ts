import type { ChatMessage } from "./providers/types.js";

export interface GardenToolResultSummary {
  tool: "veil_query" | "tv_query" | "bible_query";
  result: string;
}

export const GARDEN_SYNTHESIS_NUDGE =
  "Rewrite your last in-character reply using the kingdom/garden tool results above. " +
  "Quote bible_query verse text, link VEIL/TV with [Title](url), and end on an in-world beat. " +
  "Do not ask whether to continue the scene or offer meta pivots.";

const CONTINUATION_TAIL =
  /\n+(?:Want the scene to continue\?|Want me to keep going\?|Or you can slip into one of their voices)[\s\S]*$/i;

/** Remove generic meta continuation offers from persona replies. */
export function stripMetaContinuationPrompts(content: string): string {
  return content.replace(CONTINUATION_TAIL, "").trimEnd();
}

function classifyGardenToolResult(content: string): GardenToolResultSummary | null {
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith("Error:") || trimmed.startsWith("No verse found")) {
    return null;
  }
  if (trimmed.startsWith("VEIL articles") || /veil\.jexxx\.us\/articles\//i.test(trimmed)) {
    return { tool: "veil_query", result: trimmed };
  }
  if (trimmed.startsWith("JEXXXUS | TV") || /tv\.jexxx\.us\/video\//i.test(trimmed)) {
    return { tool: "tv_query", result: trimmed };
  }
  if (/^\d+\s+[A-Za-z].*\d+:\d+/m.test(trimmed) || /\([A-Za-z]+\)\s*$/m.test(trimmed)) {
    return { tool: "bible_query", result: trimmed };
  }
  return null;
}

function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

/** Successful veil/tv/bible tool payloads since the latest user message. */
export function collectGardenToolResultsSinceUser(
  messages: ChatMessage[],
): GardenToolResultSummary[] {
  const start = lastUserIndex(messages);
  if (start < 0) return [];

  const out: GardenToolResultSummary[] = [];
  for (let i = start + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg?.role !== "tool") continue;
    const classified = classifyGardenToolResult(msg.content);
    if (classified) out.push(classified);
  }
  return out;
}

function bibleResultReferenced(content: string, result: string): boolean {
  const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
  const refLine = lines[0] ?? "";
  const textLine = lines[1] ?? "";
  if (refLine && content.includes(refLine.replace(/\s*\([^)]*\)\s*$/, "").trim())) {
    return true;
  }
  if (textLine.length >= 16) {
    const snippet = textLine.slice(0, 20).toLowerCase();
    return content.toLowerCase().includes(snippet.slice(0, 12));
  }
  return false;
}

/** True when garden tools returned data but the assistant reply ignored them. */
export function needsGardenSynthesis(
  assistantContent: string,
  toolResults: GardenToolResultSummary[],
): boolean {
  if (toolResults.length === 0 || !assistantContent.trim()) return false;

  const content = assistantContent;
  for (const { tool, result } of toolResults) {
    if (tool === "veil_query" && !/veil\.jexxx\.us/i.test(content)) return true;
    if (tool === "tv_query" && !/tv\.jexxx\.us/i.test(content)) return true;
    if (tool === "bible_query" && !bibleResultReferenced(content, result)) return true;
  }
  return false;
}