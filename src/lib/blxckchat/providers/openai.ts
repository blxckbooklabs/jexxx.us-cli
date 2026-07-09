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

  const buildMessages = (messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] =>
    messages.map((m) => {
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
    });

  const buildTools = (tools: ToolDefinition[]) =>
    tools.length
      ? tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }))
      : undefined;

  return {
    id: config.baseUrl ? "ollama" : "openai",
    async chat(
      messages: ChatMessage[],
      tools: ToolDefinition[]
    ): Promise<ChatResult> {
      const response = await (
        tools.length > 0
          ? client.chat.completions.create({
              model: config.model,
              messages: buildMessages(messages),
              tools: buildTools(tools)!,
            })
          : client.chat.completions.create({
              model: config.model,
              messages: buildMessages(messages),
            })
      );

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

    async chatStream(
      messages: ChatMessage[],
      tools: ToolDefinition[],
      onChunk: (chunk: string) => void
    ): Promise<ChatResult> {
      const stream = await (
        tools.length > 0
          ? client.chat.completions.create({
              model: config.model,
              messages: buildMessages(messages),
              tools: buildTools(tools)!,
              stream: true,
            })
          : client.chat.completions.create({
              model: config.model,
              messages: buildMessages(messages),
              stream: true,
            })
      );

      let fullContent = "";
      try {
        for await (const event of stream) {
          const delta = event.choices[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            onChunk(delta.content);
          }
        }
      } catch (err) {
        // Ignore stream errors after content has been received (Ollama may close prematurely)
        if (!fullContent) {
          throw err;
        }
      }

      // For now, streaming doesn't support tool calls (they're not streamed in OpenAI API)
      // If tool calls are needed, fall back to non-streaming mode
      return {
        message: { role: "assistant", content: fullContent },
        toolCalls: [],
        stopReason: "stop",
      };
    },
  };
}
