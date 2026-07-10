import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "node:crypto";

import type { ChatMessage } from "../../providers/types.js";
import { getCredentialsDir } from "../../../auth.js";

export type ToolStatus = "pending" | "success" | "error" | "declined" | "blocked";

export interface TerminalMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolResult {
  id: string;
  toolName: string;
  result: string;
  status: ToolStatus;
  timestamp: Date;
}

export interface ThinkingBlock {
  id: string;
  content: string;
  collapsed: boolean;
}

export interface ActiveDivinityRef {
  id: string;
  name: string;
  role?: string;
  pillar?: string;
}

export interface TerminalSession {
  messages: TerminalMessage[];
  toolResults: ToolResult[];
  thinkingBlocks: ThinkingBlock[];
  conversationHistory: ChatMessage[];
  /** Active Obsidian Divinities persona, when /divinities is engaged. */
  activeDivinity?: ActiveDivinityRef | null;
}

export function createSession(): TerminalSession {
  return {
    messages: [],
    toolResults: [],
    thinkingBlocks: [],
    conversationHistory: [],
    activeDivinity: null,
  };
}

export function addUserMessage(session: TerminalSession, content: string): TerminalMessage {
  const message: TerminalMessage = {
    id: randomUUID(),
    role: "user",
    content,
  };
  session.messages.push(message);
  return message;
}

export function addAssistantMessage(session: TerminalSession, content: string): TerminalMessage {
  const message: TerminalMessage = {
    id: randomUUID(),
    role: "assistant",
    content,
  };
  session.messages.push(message);
  return message;
}

export function addToolResult(
  session: TerminalSession,
  toolName: string,
  result: string,
  status: ToolStatus,
): ToolResult {
  const entry: ToolResult = {
    id: randomUUID(),
    toolName,
    result,
    status,
    timestamp: new Date(),
  };
  session.toolResults.push(entry);
  return entry;
}

export function updateToolResult(
  session: TerminalSession,
  toolName: string,
  result: string,
  status: ToolStatus,
): ToolResult | undefined {
  const pending = [...session.toolResults]
    .reverse()
    .find((t) => t.toolName === toolName && t.status === "pending");
  if (pending) {
    pending.result = result;
    pending.status = status;
    pending.timestamp = new Date();
    return pending;
  }
  return addToolResult(session, toolName, result, status);
}

/** Filesystem-safe ISO timestamp for default /save export filenames. */
export function formatSessionExportTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}

export function getDefaultSessionExportPath(now: Date = new Date()): string {
  const stamp = formatSessionExportTimestamp(now);
  return path.join(getCredentialsDir(), `session-export-${stamp}.json`);
}

export function exportSessionToFile(session: TerminalSession, filePath?: string): string {
  const target = filePath ?? getDefaultSessionExportPath();
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    messages: session.messages,
    toolResults: session.toolResults.map((t) => ({
      ...t,
      timestamp: t.timestamp.toISOString(),
    })),
    thinkingBlocks: session.thinkingBlocks,
    conversationHistory: session.conversationHistory,
    activeDivinity: session.activeDivinity ?? null,
  };
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), { mode: 0o600 });
  return target;
}