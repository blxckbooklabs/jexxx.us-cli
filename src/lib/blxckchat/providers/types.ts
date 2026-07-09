export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string | undefined;
  toolCalls?: ToolCall[] | undefined;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ProviderName = "anthropic" | "openai" | "ollama";

export interface ProviderConfig {
  provider: ProviderName;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  model: string;
}

export interface ChatResult {
  message: ChatMessage;
  toolCalls: ToolCall[];
  stopReason: "stop" | "tool_calls";
}

export interface Provider {
  id: ProviderName;
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult>;
  chatStream?(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onChunk: (chunk: string) => void
  ): Promise<ChatResult>;
}
