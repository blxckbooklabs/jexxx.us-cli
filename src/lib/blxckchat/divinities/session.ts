import type { TerminalSession } from "../ui/session/session-store.js";
import type { DivinityPersona } from "./source.js";

export interface ActiveDivinity {
  id: string;
  name: string;
  role?: string;
  pillar?: string;
}

export function getActiveDivinity(session: TerminalSession): ActiveDivinity | null {
  return session.activeDivinity ?? null;
}

/** Switch persona — clears chat history so the new voice starts fresh. */
export function activateDivinityPersona(
  session: TerminalSession,
  persona: DivinityPersona,
): void {
  session.conversationHistory = [];
  session.messages = [];
  session.toolResults = [];
  session.thinkingBlocks = [];
  const active: ActiveDivinity = {
    id: persona.id,
    name: persona.name,
  };
  if (persona.role) active.role = persona.role;
  if (persona.pillar) active.pillar = persona.pillar;
  session.activeDivinity = active;
}

export function clearActiveDivinity(session: TerminalSession): void {
  session.activeDivinity = null;
  session.conversationHistory = [];
  session.messages = [];
  session.toolResults = [];
  session.thinkingBlocks = [];
}

export function formatDivinityActivationMessage(persona: DivinityPersona): string {
  const role = persona.role ? ` · ${persona.role}` : "";
  const pillar = persona.pillar ? ` · ${persona.pillar}` : "";
  return [
    `Divinity active: ${persona.name}${role}${pillar}`,
    "Chat history cleared — speak as this persona. Tools remain available.",
    "Use /divinities to switch · /divinities clear to return to BLXCKCHAT",
  ].join("\n");
}

export function formatDivinityClearedMessage(): string {
  return "Divinity cleared — BLXCKCHAT default agent restored. Chat history cleared.";
}