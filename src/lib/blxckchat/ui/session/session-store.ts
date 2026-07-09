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

export interface TerminalSession {
  messages: TerminalMessage[];
  toolResults: ToolResult[];
  thinkingBlocks: ThinkingBlock[];
  conversationHistory: ChatMessage[];
}

export function createSession(): TerminalSession {
  return {
    messages: [],
    toolResults: [],
    thinkingBlocks: [],
    conversationHistory: [],
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

export function exportSessionToFile(session: TerminalSession, filePath?: string): string {
  const target =
    filePath ?? path.join(getCredentialsDir(), "session-export.json");
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
  };
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), { mode: 0o600 });
  return target;
}