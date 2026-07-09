import type { ToolResult, ToolStatus } from "../session/session-store.js";
import { escapeBlessed } from "../renderer/markdown.js";
import { TAG } from "../theme.js";

const STATUS_ICONS: Record<ToolStatus, string> = {
  pending: "◌",
  success: "◆",
  error: "◇",
  declined: "◇",
  blocked: "◇",
};

const STATUS_COLORS: Record<ToolStatus, string> = {
  pending: "#facc15-fg",
  success: "#4ade80-fg",
  error: "#f87171-fg",
  declined: "#f87171-fg",
  blocked: "#f87171-fg",
};

const TOOL_DISPLAY_MAX_LINES = 6;
const TOOL_DISPLAY_MAX_CHARS = 480;
const VEIL_CATALOG_MAX_LINES = 80;
const VEIL_CATALOG_MAX_CHARS = 8000;

/** Compact tool output for the TUI — full result still goes to the model. */
export function summarizeToolResultForDisplay(
  result: string,
  status: ToolStatus,
  toolName?: string,
): string {
  if (status === "pending") return "running…";

  const trimmed = result.trim();
  if (!trimmed) return "(empty)";

  // Full tool output — chat pane scrolls (mouse scrollbar + wheel).
  if (
    (toolName === "veil_query" || toolName === "tv_query") &&
    status === "success"
  ) {
    return trimmed;
  }

  const isVeilCatalog =
    toolName === "veil_query" &&
    (trimmed.startsWith("VEIL articles") ||
      trimmed.startsWith("VEIL public endpoints") ||
      trimmed.startsWith("No VEIL articles"));
  const isTvCatalog =
    toolName === "tv_query" &&
    (trimmed.startsWith("JEXXXUS | TV videos") ||
      trimmed.startsWith("JEXXXUS | TV public endpoints") ||
      trimmed.startsWith("No JEXXXUS | TV videos"));
  const isVeilMeta =
    toolName === "veil_query" && trimmed.includes("Public SEO / discovery:");
  const isTvMeta =
    toolName === "tv_query" && trimmed.includes("Public SEO / discovery:");
  const isVeilArticleBody =
    toolName === "veil_query" && trimmed.includes("\n---\n");
  const isTvVideoBody =
    toolName === "tv_query" && trimmed.includes("\n---\n");

  if (isVeilCatalog || isVeilMeta || isTvCatalog || isTvMeta) {
    const lines = trimmed.split("\n");
    if (lines.length <= VEIL_CATALOG_MAX_LINES && trimmed.length <= VEIL_CATALOG_MAX_CHARS) {
      return trimmed;
    }
    return `${lines.slice(0, VEIL_CATALOG_MAX_LINES).join("\n")}\n… (scroll chat history for full catalog)`;
  }

  if (isVeilArticleBody || isTvVideoBody) {
    const header = trimmed.split("\n---\n")[0] ?? trimmed;
    const label = isTvVideoBody ? "video description" : "article body";
    return `${header}\n… [${label} omitted in TUI — full text in model context]`;
  }

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const preview = parsed
          .slice(0, 3)
          .map((item) => {
            if (item && typeof item === "object" && "title" in item) {
              return String((item as { title: string }).title);
            }
            return null;
          })
          .filter(Boolean)
          .join("; ");
        return `${parsed.length} items${preview ? `: ${preview}` : ""}${parsed.length > 3 ? "…" : ""}`;
      }
    } catch {
      // fall through
    }
  }

  const lines = trimmed.split("\n");
  if (lines.length <= TOOL_DISPLAY_MAX_LINES && trimmed.length <= TOOL_DISPLAY_MAX_CHARS) {
    return trimmed;
  }

  const clipped = lines.slice(0, TOOL_DISPLAY_MAX_LINES).join("\n");
  const suffix =
    lines.length > TOOL_DISPLAY_MAX_LINES || trimmed.length > TOOL_DISPLAY_MAX_CHARS
      ? `\n… (${lines.length} lines, ${trimmed.length} chars total)`
      : "";
  const body =
    clipped.length > TOOL_DISPLAY_MAX_CHARS
      ? `${clipped.slice(0, TOOL_DISPLAY_MAX_CHARS)}…`
      : clipped;
  return `${body}${suffix}`;
}

export function formatToolLinePlain(
  toolName: string,
  result: string,
  status: ToolStatus,
): string {
  const icon = STATUS_ICONS[status];
  const label =
    status === "pending" ? "running…" : summarizeToolResultForDisplay(result, status, toolName);
  return `  ${icon} tool:${toolName} → ${label}\n`;
}

export function formatToolLine(toolName: string, result: string, status: ToolStatus): string {
  const icon = STATUS_ICONS[status];
  const color = STATUS_COLORS[status];
  const label =
    status === "pending"
      ? "running…"
      : escapeBlessed(summarizeToolResultForDisplay(result, status, toolName));
  return `  {${color}}${icon}{/} ${TAG.pink}${toolName}${TAG.pinkEnd} {gray-fg}→{/gray-fg} {${color}}${label}{/${color}}\n`;
}

export function formatToolResult(entry: ToolResult): string {
  return formatToolLine(entry.toolName, entry.result, entry.status);
}

export function formatToolResults(entries: ToolResult[]): string {
  return entries.map(formatToolResult).join("");
}

export function formatToolResultsPlain(entries: ToolResult[]): string {
  return entries
    .map((e) => formatToolLinePlain(e.toolName, e.result, e.status))
    .join("");
}