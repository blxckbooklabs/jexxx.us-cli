import type { StoredProviderConfig } from "../config.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAIProvider } from "./openai.js";
import { createOllamaProvider } from "./ollama.js";
import { resolveStoredProvider } from "./resolve-config.js";
import type { Provider, ProviderConfig } from "./types.js";

export function resolveProvider(config: ProviderConfig | StoredProviderConfig): Provider {
  const resolved =
    "name" in config
      ? resolveStoredProvider(config)
      : resolveStoredProvider({
          name: config.provider,
          provider: config.provider,
          model: config.model,
          ...(config.apiKey ? { apiKey: config.apiKey } : {}),
          ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        });

  switch (resolved.adapter) {
    case "anthropic":
      return createAnthropicProvider(resolved);
    case "ollama":
      return createOllamaProvider(resolved);
    case "openai":
      return createOpenAIProvider(resolved);
    default:
      return createOpenAIProvider(resolved);
  }
}