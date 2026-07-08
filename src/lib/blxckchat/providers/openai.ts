import OpenAI from "openai";
import type {
  ChatMessage,
  ChatResult,
  Provider,
  ProviderConfig,
  ToolCall,
  ToolDefinition,
} from "./types.js";

/**
 * OpenAI Chat Completions adapter (function calling). Also used for Ollama,
 * which exposes an OpenAI-compatible /v1/chat/completions endpoint — see
 * createOllamaProvider() in ollama.ts, which just points baseURL here.
 */
export function createOpenAIProvider(config: ProviderConfig): Provider {
  const client = new OpenAI({
    apiKey: config.apiKey || "unused",
    baseURL: config.baseUrl,
  });

  return {
    id: config.baseUrl ? "ollama" : "openai",
    async chat(
      messages: ChatMessage[],
      tools: ToolDefinition[]
    ): Promise<ChatResult> {
      const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(
        (m) => {
          if (m.role === "tool") {
            return {
              role: "tool",
              tool_call_id: m.toolCallId ?? "",
              content: m.content,
            };
          }
          if (m.role === "system") {
            return { role: "system", content: m.content };
          }
          if (m.role === "assistant") {
            return { role: "assistant", content: m.content };
          }
          return { role: "user", content: m.content };
        }
      );

      const toolsParam = tools.length
        ? tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }))
        : undefined;

      const response = await client.chat.completions.create({
        model: config.model,
        messages: openaiMessages,
        ...(toolsParam ? { tools: toolsParam } : {}),
      });

      const choice = response.choices[0];
      const message = choice?.message;
      const toolCalls: ToolCall[] = (message?.tool_calls ?? [])
        .filter((tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: "function" } => tc.type === "function")
        .map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || "{}"),
        }));

      return {
        message: { role: "assistant", content: message?.content ?? "" },
        toolCalls,
        stopReason: toolCalls.length > 0 ? "tool_calls" : "stop",
      };
    },
  };
}
