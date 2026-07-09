import * as fs from "fs";
import * as path from "path";

import { getCredentialsDir } from "../../../auth.js";
import type { TerminalSession } from "./session-store.js";
import { exportSessionToFile } from "./session-store.js";

const AUTOSAVE_INTERVAL = 30;

export function getAutosavePath(): string {
  return path.join(getCredentialsDir(), "session-autosave.json");
}

export function shouldAutosave(messageCount: number): boolean {
  return messageCount > 0 && messageCount % AUTOSAVE_INTERVAL === 0;
}

export function autosaveSession(session: TerminalSession): string {
  return exportSessionToFile(session, getAutosavePath());
}

export interface PersistedSessionPayload {
  exportedAt: string;
  messages: TerminalSession["messages"];
  toolResults: Array<{
    id: string;
    toolName: string;
    result: string;
    status: string;
    timestamp: string;
  }>;
  thinkingBlocks: TerminalSession["thinkingBlocks"];
  conversationHistory: TerminalSession["conversationHistory"];
  activeDivinity?: TerminalSession["activeDivinity"];
}

export function loadAutosaveSession(): TerminalSession | null {
  const target = getAutosavePath();
  if (!fs.existsSync(target)) return null;
  try {
    const raw = fs.readFileSync(target, "utf-8");
    const data = JSON.parse(raw) as PersistedSessionPayload;
    return {
      messages: data.messages ?? [],
      toolResults: (data.toolResults ?? []).map((t) => ({
        id: t.id,
        toolName: t.toolName,
        result: t.result,
        status: t.status as TerminalSession["toolResults"][0]["status"],
        timestamp: new Date(t.timestamp),
      })),
      thinkingBlocks: data.thinkingBlocks ?? [],
      conversationHistory: data.conversationHistory ?? [],
      activeDivinity: data.activeDivinity ?? null,
    };
  } catch {
    return null;
  }
}