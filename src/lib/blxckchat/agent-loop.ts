import chalk from "chalk";
import type { ChatMessage, Provider } from "./providers/types.js";
import type { BlxckchatTool } from "./tools/types.js";
import { findTool } from "./tools/registry.js";
import { confirmToolCall as defaultConfirmToolCall } from "./confirm.js";
import { recordAudit } from "./audit.js";
import { searchDocs } from "./rag/index.js";
import {
  EMPIRE_CONTENT_ROUTING,
  extractRoutingContextFromHistory,
  formatEmpireRoutingHint,
  type EmpireRoutingOptions,
} from "./empire-routing.js";
import { prefetchEmpireContext } from "./empire-prefetch.js";
import {
  ACCOUNT_CONTENT_ROUTING,
  ACCOUNT_VAULT_REPLY_RULES,
  formatAccountRoutingHint,
  isVaultPrimaryPrompt,
} from "./account-routing.js";
import { prefetchAccountContext } from "./account-prefetch.js";
import { loadCredentials } from "../auth.js";
import { resolveAuthenticatedAccountSession } from "../account-data/session.js";
import {
  buildOfflineOperatorIdentityContext,
  buildOperatorIdentityContext,
} from "../operator-identity.js";
import {
  extractEmpireUrlsFromText,
  sanitizeEmpireUrls,
  type EmpireUrlEntry,
} from "./empire-url-sanitize.js";
import {
  collectEmpireToolResultsSinceUser,
  EMPIRE_SYNTHESIS_NUDGE,
  needsEmpireSynthesis,
  stripMetaContinuationPrompts,
} from "./empire-synthesis.js";
import { sanitizeRoleplayProse } from "./prose-sanitize.js";
import { formatToolResultForFallback } from "./tool-result-format.js";

export type ToolCompleteStatus = "success" | "error" | "declined" | "blocked";

export class AgentAbortedError extends Error {
  constructor(message = "Agent turn aborted") {
    super(message);
    this.name = "AgentAbortedError";
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AgentAbortedError();
  }
}

export interface PersonaContext {
  name: string;
  systemPrompt: string;
}

export interface RunAgentOptions {
  /** Obsidian Divinities persona override (from /divinities). */
  persona?: PersonaContext;
  /** Abort an in-flight turn (Esc during streaming/tools). */
  signal?: AbortSignal;
  /** Route streamed tokens to the terminal UI instead of stdout. */
  onStream?: (chunk: string) => void;
  onToolStart?: (toolName: string) => void;
  onToolComplete?: (
    toolName: string,
    result: string,
    status: ToolCompleteStatus,
  ) => void;
  /** Clear streamed assistant text before a synthesis retry pass. */
  onSynthesisRetry?: () => void;
  /** Called at the start of each provider stream (e.g. after tools, before synthesis). */
  onStreamReset?: () => void;
  /** API-native reasoning tokens, distinct from <think> tags in content. */
  onThinkingStream?: (chunk: string) => void;
  confirmToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
}

const SYSTEM_PROMPT_BASE = `You are BLXCKCHAT, the native AI agent for the JEXXXUS CLI. You service \
specific functions related to the JEXXXUS kingdom/garden ecosystem — Bible lookups, public VEIL \
articles (veil.jexxx.us), public JEXXXUS | TV videos (tv.jexxx.us), private vault data for \
signed-in users (BLXCKBOOK + NXT + private JEXXXUS | TV playlists), dashboard diagnostics, notifications, and contact imports. You \
are not a general coding agent; stay scoped to the tools available to you. When a tool call would \
write data or run a shell command, expect the user to be prompted for confirmation before it \
executes — explain what you're about to do so they can make an informed choice.

${EMPIRE_CONTENT_ROUTING}

${ACCOUNT_CONTENT_ROUTING}`;

const MAX_TURNS = 8;

// Caps how many prior turns are replayed to the model each call. Prevents
// unbounded context growth in long interactive REPL sessions; the system
// prompt (with fresh RAG context for the *current* query) is always
// prepended separately and doesn't count against this.
const MAX_HISTORY_MESSAGES = 40;

export interface AgentTurnResult {
  /** The final natural-language answer for this turn. */
  response: string;
  /**
   * Updated conversation transcript (user/assistant/tool messages, no system
   * prompt) — pass this back into the next runAgent() call as `history` to
   * keep multi-turn context (follow-ups, confirmations, "yes"/"no" replies).
   */
  history: ChatMessage[];
}

const PERSONA_CLI_BRIDGE = `You are operating inside the JEXXXUS CLI (BLXCKCHAT). Retain your persona voice \
and identity above. You still have access to BLXCKCHAT tools (Bible lookups, public VEIL articles, \
public JEXXXUS | TV videos, signed-in vault/TV playlist data via account_query, dashboard diagnostics, \
notifications, contact imports). Stay in character when explaining tool actions; the operator must \
confirm any write/shell tool before it runs.

**Persona + empire:** When the scene mentions scripture bookmarks (Proverbs 31, etc.), a VEIL draft/article, \
or a TV sacrament, call veil_query / bible_query / tv_query in the **same turn** and weave real URLs and \
quoted verses into the dialogue. If a character offers "the draft" or "number 11," fetch a matching VEIL \
article via veil_query action=search — do not invent unpublished pieces. Cite 2–3 articles as markdown \
[Title](url) markdown links woven into the scene — not a mid-reply catalog dump with ALL-CAPS section headers. \
Advance with catalog-backed detail; avoid generic "want me to keep going?" prompts.

${EMPIRE_CONTENT_ROUTING}`;

function appendDocContext(prompt: string, userPrompt: string): string {
  const docChunks = searchDocs(userPrompt, 5);
  if (docChunks.length === 0) return prompt;

  const context = docChunks
    .map((c) => `### ${c.source} — ${c.heading}\n${c.text}`)
    .join("\n\n");

  return `${prompt}\n\nRelevant JEXXXUS documentation context:\n\n${context}`;
}

async function buildSystemPrompt(
  userPrompt: string,
  persona?: PersonaContext,
  routingOptions?: EmpireRoutingOptions,
): Promise<string> {
  const base = persona
    ? `${persona.systemPrompt.trim()}\n\n---\n\n${PERSONA_CLI_BRIDGE}`
    : SYSTEM_PROMPT_BASE;

  const vaultPrimary = isVaultPrimaryPrompt(userPrompt);
  const routingHint = vaultPrimary
    ? null
    : formatEmpireRoutingHint(userPrompt, routingOptions);
  const accountHint = formatAccountRoutingHint(userPrompt);
  let prompt = base;
  if (routingHint) prompt = `${prompt}\n\n${routingHint}`;
  if (accountHint) prompt = `${prompt}\n\n${accountHint}`;
  if (vaultPrimary && persona) {
    prompt = `${prompt}\n\n## Vault-only override (persona secondary)\n${ACCOUNT_VAULT_REPLY_RULES}`;
  }

  const prefetch = vaultPrimary
    ? null
    : await prefetchEmpireContext(userPrompt, routingOptions);
  if (prefetch) {
    prompt = `${prompt}\n\n${prefetch}`;
  }

  const accountPrefetch = await prefetchAccountContext(userPrompt);
  if (accountPrefetch) {
    prompt = `${prompt}\n\n${accountPrefetch}`;
  }

  const operatorContext = await buildSignedInOperatorContext();
  if (operatorContext) {
    prompt = `${prompt}\n\n${operatorContext}`;
  }

  return appendDocContext(prompt, userPrompt);
}

async function buildSignedInOperatorContext(): Promise<string | null> {
  const creds = loadCredentials({ quiet: true });
  if (!creds) return null;

  const resolved = await resolveAuthenticatedAccountSession();
  if (resolved.ok) {
    return buildOperatorIdentityContext(resolved.session);
  }

  return buildOfflineOperatorIdentityContext(creds);
}

/**
 * Core agent loop: prime with RAG context, send messages + tool defs to the
 * provider, execute any tool calls (with confirmation gating), feed results
 * back, and repeat until the model stops calling tools or MAX_TURNS is hit.
 *
 * Accepts and returns `history` (the prior conversation, sans system prompt)
 * so callers — e.g. the interactive REPL in index.ts — can carry context
 * across turns. Without this, a follow-up like "yes" has nothing to refer
 * to, since each call otherwise starts from a blank slate.
 */
export async function runAgent(
  provider: Provider,
  tools: BlxckchatTool[],
  userPrompt: string,
  history: ChatMessage[] = [],
  options: RunAgentOptions = {},
): Promise<AgentTurnResult> {
  const confirm = options.confirmToolCall ?? defaultConfirmToolCall;
  const useCustomStream = Boolean(options.onStream);
  const trimmedHistory =
    history.length > MAX_HISTORY_MESSAGES
      ? history.slice(history.length - MAX_HISTORY_MESSAGES)
      : history;

  const routingOptions: EmpireRoutingOptions = {
    conversationContext: extractRoutingContextFromHistory(trimmedHistory),
  };
  const systemPrompt = await buildSystemPrompt(
    userPrompt,
    options.persona,
    routingOptions,
  );
  const canonicalUrlCatalog: EmpireUrlEntry[] = [
    ...extractEmpireUrlsFromText(systemPrompt),
  ];
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...trimmedHistory,
    { role: "user", content: userPrompt },
  ];

  // Everything pushed onto `messages` after this point (user query onward)
  // becomes the new history returned to the caller; the system prompt is
  // rebuilt fresh every call (it's keyed to the *current* query's RAG
  // context), so it's excluded from what gets carried forward.
  const conversationStartIndex = 1;

  const toolDefs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  // Some smaller/local models re-call the same tool with identical args
  // instead of synthesizing a final answer from the result. Track the last
  // successful (tool, args, result) so we can short-circuit gracefully
  // rather than burning through MAX_TURNS with no output.
  let lastCallSignature: string | null = null;
  let repeatCount = 0;
  let lastSuccessfulResult: string | null = null;
  let lastSuccessfulTool: string | null = null;
  let bibleQueryMissCount = 0;
  let synthesisNudgeCount = 0;
  const MAX_SYNTHESIS_NUDGES = 1;

  // Wraps a final answer with the transcript to hand back as next-turn
  // history — every early-return path below must go through this so the
  // REPL's conversation memory stays consistent regardless of how the turn
  // ended (clean stop, repeat-loop short-circuit, or MAX_TURNS exhaustion).
  const finish = (response: string): AgentTurnResult => {
    const cleaned = sanitizeRoleplayProse(stripMetaContinuationPrompts(response));
    const sanitized = sanitizeEmpireUrls(cleaned, canonicalUrlCatalog);
    messages.push({ role: "assistant", content: sanitized });
    return { response: sanitized, history: messages.slice(conversationStartIndex) };
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    assertNotAborted(options.signal);

    if (turn > 0) {
      options.onStreamReset?.();
    }

    // Use streaming for text responses if available
    let result;
    if (provider.chatStream) {
      const baseOnChunk =
        options.onStream ??
        ((chunk: string) => {
          process.stdout.write(chunk);
        });
      const baseOnThinking = options.onThinkingStream;
      const onChunk = (chunk: string): void => {
        assertNotAborted(options.signal);
        baseOnChunk(chunk);
      };
      const onThinkingChunk = baseOnThinking
        ? (chunk: string): void => {
            assertNotAborted(options.signal);
            baseOnThinking(chunk);
          }
        : undefined;
      result = await provider.chatStream(messages, toolDefs, {
        onChunk,
        ...(onThinkingChunk ? { onThinkingChunk } : {}),
      });
    } else {
      result = await provider.chat(messages, toolDefs);
    }

    assertNotAborted(options.signal);

    if (result.stopReason === "stop" || result.toolCalls.length === 0) {
      const empireTools = collectEmpireToolResultsSinceUser(messages);
      const draft = result.message.content;
      if (
        synthesisNudgeCount < MAX_SYNTHESIS_NUDGES &&
        needsEmpireSynthesis(draft, empireTools)
      ) {
        if (draft.trim()) {
          messages.push({ role: "assistant", content: draft });
        }
        options.onSynthesisRetry?.();
        messages.push({ role: "user", content: EMPIRE_SYNTHESIS_NUDGE });
        synthesisNudgeCount++;
        continue;
      }

      if (!useCustomStream) {
        console.log(); // Newline after streamed stdout output
      }
      return finish(draft);
    }

    messages.push({
      role: "assistant",
      content: result.message.content,
      toolCalls: result.toolCalls,
    });

    for (const toolCall of result.toolCalls) {
      assertNotAborted(options.signal);
      const tool = findTool(tools, toolCall.name);

      if (!tool) {
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: `Error: unknown tool "${toolCall.name}".`,
        });
        continue;
      }

      const signature = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;
      if (signature === lastCallSignature) {
        repeatCount++;
      } else {
        repeatCount = 0;
        lastCallSignature = signature;
      }

      if (repeatCount >= 2 && lastSuccessfulResult && lastSuccessfulTool) {
        // The model already has this result and is looping instead of
        // answering. Return formatted context rather than raw JSON dumps.
        const formatted = formatToolResultForFallback(lastSuccessfulTool, lastSuccessfulResult);
        return finish(formatted);
      }

      let confirmed = true;
      if (tool.requiresConfirmation) {
        confirmed = await confirm(tool.name, toolCall.arguments);
      }

      if (!confirmed) {
        recordAudit({
          toolName: tool.name,
          arguments: toolCall.arguments,
          confirmed: false,
          outcome: "declined",
        });
        options.onToolComplete?.(tool.name, "User declined", "declined");
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: "User declined to run this action.",
        });
        continue;
      }

      options.onToolStart?.(tool.name);

      try {
        let toolResult = await tool.execute(toolCall.arguments);
        const isBlocked = toolResult.startsWith("Error: command blocked");
        const isError =
          toolResult.startsWith("Error:") ||
          toolResult.startsWith("No verse found") ||
          toolResult.includes("does not look like a scripture reference");
        if (toolCall.name === "bible_query" && isError) {
          bibleQueryMissCount++;
          if (bibleQueryMissCount >= 2) {
            toolResult +=
              "\n\n(Stop retrying bible_query with malformed queries. Use tv_query for series/channel " +
              "names (e.g. Forgive Me Father), and bible_query only with Book Chapter:Verse refs " +
              "from the routing hint companions — e.g. 1 John 1:9. Combine TV + VEIL + quoted " +
              "scripture in your final answer.)";
          }
        }
        recordAudit({
          toolName: tool.name,
          arguments: toolCall.arguments,
          confirmed: true,
          outcome: isBlocked ? "blocked" : "executed",
          resultPreview: toolResult.slice(0, 200),
        });
        if (isBlocked) {
          if (!useCustomStream) {
            console.log(chalk.red(`[BLXCKCHAT] ${toolResult}`));
          }
          options.onToolComplete?.(tool.name, toolResult, "blocked");
        } else if (isError) {
          options.onToolComplete?.(tool.name, toolResult, "error");
        } else {
          options.onToolComplete?.(tool.name, toolResult, "success");
        }
        if (!isError) {
          lastSuccessfulResult = toolResult;
          lastSuccessfulTool = tool.name;
          for (const entry of extractEmpireUrlsFromText(toolResult)) {
            const key = `${entry.surface}:${entry.slug}`;
            if (!canonicalUrlCatalog.some((e) => `${e.surface}:${e.slug}` === key)) {
              canonicalUrlCatalog.push(entry);
            }
          }
        }
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content:
            repeatCount >= 1
              ? `${toolResult}\n\n(You already called this tool with these exact arguments. You have the result — please answer the user's question now instead of calling it again.)`
              : toolResult,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        recordAudit({
          toolName: tool.name,
          arguments: toolCall.arguments,
          confirmed: true,
          outcome: "error",
          resultPreview: errorMessage.slice(0, 200),
        });
        options.onToolComplete?.(tool.name, `Error: ${errorMessage}`, "error");
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: `Error: ${errorMessage}`,
        });
      }
    }
  }

  return finish(
    lastSuccessfulResult && lastSuccessfulTool
      ? formatToolResultForFallback(lastSuccessfulTool, lastSuccessfulResult)
      : "BLXCKCHAT stopped after reaching the maximum number of tool-call turns. " +
          "Try asking again — pre-fetched TV and scripture may already be in context for thematic queries."
  );
}
