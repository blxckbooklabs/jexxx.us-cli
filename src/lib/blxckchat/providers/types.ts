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

/** Catalog provider id (anthropic, openrouter, groq, …). */
export type ProviderName = string;

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

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  /** API-native reasoning tokens (OpenAI reasoning_content, OpenRouter reasoning, etc.). */
  onThinkingChunk?: (chunk: string) => void;
}

export interface Provider {
  id: ProviderName;
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult>;
  chatStream?(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    callbacks: StreamCallbacks | ((chunk: string) => void),
  ): Promise<ChatResult>;
}