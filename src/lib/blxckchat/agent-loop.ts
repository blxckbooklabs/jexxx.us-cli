import chalk from "chalk";
import type { ChatMessage, Provider } from "./providers/types.js";
import type { BlxckchatTool } from "./tools/types.js";
import { findTool } from "./tools/registry.js";
import { confirmToolCall as defaultConfirmToolCall } from "./confirm.js";
import { recordAudit } from "./audit.js";
import { searchDocs } from "./rag/index.js";

export type ToolCompleteStatus = "success" | "error" | "declined" | "blocked";

export interface RunAgentOptions {
  /** Route streamed tokens to the terminal UI instead of stdout. */
  onStream?: (chunk: string) => void;
  onToolStart?: (toolName: string) => void;
  onToolComplete?: (
    toolName: string,
    result: string,
    status: ToolCompleteStatus,
  ) => void;
  confirmToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
}

const SYSTEM_PROMPT_BASE = `You are BLXCKCHAT, the native AI agent for the JEXXXUS CLI. You service \
specific functions related to the JEXXXUS kingdom/garden ecosystem — Bible lookups, dashboard \
diagnostics, notifications, and contact imports. You are not a general coding agent; stay scoped \
to the tools available to you. When a tool call would write data or run a shell command, expect \
the user to be prompted for confirmation before it executes — explain what you're about to do so \
they can make an informed choice.`;

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

function buildSystemPrompt(userPrompt: string): string {
  const docChunks = searchDocs(userPrompt, 5);
  if (docChunks.length === 0) return SYSTEM_PROMPT_BASE;

  const context = docChunks
    .map((c) => `### ${c.source} — ${c.heading}\n${c.text}`)
    .join("\n\n");

  return `${SYSTEM_PROMPT_BASE}\n\nRelevant JEXXXUS documentation context:\n\n${context}`;
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

  const systemPrompt = buildSystemPrompt(userPrompt);
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

  // Wraps a final answer with the transcript to hand back as next-turn
  // history — every early-return path below must go through this so the
  // REPL's conversation memory stays consistent regardless of how the turn
  // ended (clean stop, repeat-loop short-circuit, or MAX_TURNS exhaustion).
  const finish = (response: string): AgentTurnResult => {
    messages.push({ role: "assistant", content: response });
    return { response, history: messages.slice(conversationStartIndex) };
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Use streaming for text responses if available
    let result;
    if (provider.chatStream) {
      const onChunk =
        options.onStream ??
        ((chunk: string) => {
          process.stdout.write(chunk);
        });
      result = await provider.chatStream(messages, toolDefs, onChunk);
    } else {
      result = await provider.chat(messages, toolDefs);
    }

    if (result.stopReason === "stop" || result.toolCalls.length === 0) {
      if (!useCustomStream) {
        console.log(); // Newline after streamed stdout output
      }
      return finish(result.message.content);
    }

    messages.push({
      role: "assistant",
      content: result.message.content,
      toolCalls: result.toolCalls,
    });

    for (const toolCall of result.toolCalls) {
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

      if (repeatCount >= 2 && lastSuccessfulResult) {
        // The model already has this result and is looping instead of
        // answering. Return it directly rather than exhausting MAX_TURNS.
        return finish(`Based on the ${tool.name} result: ${lastSuccessfulResult}`);
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
        const toolResult = await tool.execute(toolCall.arguments);
        const isBlocked = toolResult.startsWith("Error: command blocked");
        const isError = toolResult.startsWith("Error:");
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
    lastSuccessfulResult
      ? `Based on the available tool result: ${lastSuccessfulResult}`
      : "BLXCKCHAT stopped after reaching the maximum number of tool-call turns."
  );
}
