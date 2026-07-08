import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  ChatResult,
  Provider,
  ProviderConfig,
  ToolCall,
  ToolDefinition,
} from "./types.js";

/**
 * Anthropic Messages API tool-calling adapter. Maps our provider-agnostic
 * ChatMessage/ToolDefinition shape onto Anthropic's tool_use content blocks.
 */
export function createAnthropicProvider(config: ProviderConfig): Provider {
  if (!config.apiKey) {
    throw new Error("[BLXCKCHAT] Anthropic provider requires an API key.");
  }
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    id: "anthropic",
    async chat(
      messages: ChatMessage[],
      tools: ToolDefinition[]
    ): Promise<ChatResult> {
      const systemMessage = messages.find((m) => m.role === "system");
      const conversation = messages.filter((m) => m.role !== "system");

      const anthropicMessages = conversation.map((m) => {
        if (m.role === "tool") {
          return {
            role: "user" as const,
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: m.toolCallId ?? "",
                content: m.content,
              },
            ],
          };
        }
        return {
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        };
      });

      const response = await client.messages.create({
        model: config.model,
        max_tokens: 4096,
        ...(systemMessage ? { system: systemMessage.content } : {}),
        messages: anthropicMessages,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        })),
      });

      const toolCalls: ToolCall[] = [];
      let textContent = "";

      for (const block of response.content) {
        if (block.type === "text") {
          textContent += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      return {
        message: { role: "assistant", content: textContent },
        toolCalls,
        stopReason: response.stop_reason === "tool_use" ? "tool_calls" : "stop",
      };
    },
  };
}
