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

export function formatToolLinePlain(
  toolName: string,
  result: string,
  status: ToolStatus,
): string {
  const icon = STATUS_ICONS[status];
  const label = status === "pending" ? "running…" : result;
  return `  ${icon} tool:${toolName} → ${label}\n`;
}

export function formatToolLine(toolName: string, result: string, status: ToolStatus): string {
  const icon = STATUS_ICONS[status];
  const color = STATUS_COLORS[status];
  const label = status === "pending" ? "running…" : escapeBlessed(result);
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