import type { Provider, ProviderConfig } from "./types.js";
import { createOpenAIProvider } from "./openai.js";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

/**
 * Ollama exposes an OpenAI-compatible /v1/chat/completions endpoint
 * (including the `tools` param on recent versions), so we reuse the OpenAI
 * adapter with baseUrl pointed at the local Ollama server. No API key
 * required — Ollama ignores the Authorization header entirely.
 */
export function createOllamaProvider(config: ProviderConfig): Provider {
  return createOpenAIProvider({
    ...config,
    apiKey: config.apiKey || "ollama",
    baseUrl: config.baseUrl || DEFAULT_OLLAMA_BASE_URL,
  });
}
