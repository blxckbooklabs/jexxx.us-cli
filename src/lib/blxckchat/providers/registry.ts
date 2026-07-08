import type { Provider, ProviderConfig } from "./types.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAIProvider } from "./openai.js";
import { createOllamaProvider } from "./ollama.js";

export function resolveProvider(config: ProviderConfig): Provider {
  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "openai":
      return createOpenAIProvider(config);
    case "ollama":
      return createOllamaProvider(config);
    default: {
      const exhaustiveCheck: never = config.provider;
      throw new Error(`[BLXCKCHAT] Unknown provider: ${exhaustiveCheck}`);
    }
  }
}
