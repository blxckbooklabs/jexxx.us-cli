import type { ToolResult, ToolStatus } from "../session/session-store.js";
import { escapeBlessed } from "../renderer/markdown.js";

const STATUS_ICONS: Record<ToolStatus, string> = {
  pending: "⏳",
  success: "✓",
  error: "✗",
  declined: "✗",
  blocked: "✗",
};

const STATUS_COLORS: Record<ToolStatus, string> = {
  pending: "yellow-fg",
  success: "green-fg",
  error: "red-fg",
  declined: "red-fg",
  blocked: "red-fg",
};

export function formatToolLine(toolName: string, result: string, status: ToolStatus): string {
  const icon = STATUS_ICONS[status];
  const color = STATUS_COLORS[status];
  const label = status === "pending" ? "Running..." : escapeBlessed(result);
  return `{${color}}[${icon} Tool: ${toolName}] ${label}{/${color}}\n`;
}

export function formatToolResult(entry: ToolResult): string {
  return formatToolLine(entry.toolName, entry.result, entry.status);
}

export function formatToolResults(entries: ToolResult[]): string {
  return entries.map(formatToolResult).join("");
}