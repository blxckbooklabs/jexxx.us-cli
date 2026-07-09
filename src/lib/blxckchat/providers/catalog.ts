/** Inference provider catalog — aligned with Pi Agent / OpenCode core gateways. */

export type ProviderAdapter = "anthropic" | "openai" | "ollama";

export interface ProviderCatalogEntry {
  /** Stable provider id (stored in credentials). */
  id: string;
  /** Human label in pickers. */
  label: string;
  adapter: ProviderAdapter;
  /** Default OpenAI-compatible base URL (hosted gateways). */
  baseUrl?: string;
  /** User must supply a base URL (Azure, custom compatible). */
  requiresBaseUrl?: boolean;
  requiresApiKey: boolean;
  /** Environment variables checked for BYOK (first match wins). */
  envKeys?: readonly string[];
  suggestedModels: readonly string[];
  /** Short hint in connect flow. */
  hint?: string;
}

/** Pi / OpenCode–parity provider set (hosted gateways + local). */
export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: "opencode-zen",
    label: "OpenCode Zen",
    adapter: "openai",
    baseUrl: "https://opencode.ai/zen/v1",
    requiresApiKey: true,
    envKeys: ["OPENCODE_API_KEY", "OPENCODE_ZEN_API_KEY"],
    suggestedModels: [
      "big-pickle",
      "deepseek-v4-flash-free",
      "mimo-v2.5-free",
      "hy3-free",
      "nemotron-3-ultra-free",
      "north-mini-code-free",
      "claude-sonnet-4-5",
      "gpt-5.2",
      "deepseek-v4-pro",
      "kimi-k2.5",
      "glm-5.2",
    ],
    hint: "API key from opencode.ai/auth — curated models gateway",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    adapter: "anthropic",
    requiresApiKey: true,
    envKeys: ["ANTHROPIC_API_KEY"],
    suggestedModels: [
      "claude-sonnet-4-5",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
    hint: "Claude API key from console.anthropic.com",
  },
  {
    id: "openai",
    label: "OpenAI",
    adapter: "openai",
    requiresApiKey: true,
    envKeys: ["OPENAI_API_KEY"],
    suggestedModels: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
    hint: "API key from platform.openai.com",
  },
  {
    id: "google",
    label: "Google Gemini",
    adapter: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    requiresApiKey: true,
    envKeys: ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"],
    suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    hint: "Gemini API key from aistudio.google.com",
  },
  {
    id: "vercel-ai-gateway",
    label: "Vercel AI Gateway",
    adapter: "openai",
    baseUrl: "https://ai-gateway.vercel.sh/v1",
    requiresApiKey: true,
    envKeys: ["AI_GATEWAY_API_KEY", "VERCEL_AI_GATEWAY_API_KEY"],
    suggestedModels: ["anthropic/claude-sonnet-4", "openai/gpt-4o", "google/gemini-2.5-pro"],
    hint: "API key from Vercel dashboard → AI Gateway",
  },
  {
    id: "cloudflare-gateway",
    label: "Cloudflare AI Gateway",
    adapter: "openai",
    requiresBaseUrl: true,
    requiresApiKey: true,
    envKeys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_AI_GATEWAY_TOKEN"],
    suggestedModels: ["openai/gpt-4o", "anthropic/claude-sonnet-4"],
    hint: "Base URL: https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/GATEWAY_ID/openai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    adapter: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresApiKey: true,
    envKeys: ["OPENROUTER_API_KEY"],
    suggestedModels: ["anthropic/claude-sonnet-4", "openai/gpt-4o", "google/gemini-2.5-pro"],
    hint: "Unified gateway — one key, many models",
  },
  {
    id: "groq",
    label: "Groq",
    adapter: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    requiresApiKey: true,
    envKeys: ["GROQ_API_KEY"],
    suggestedModels: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    adapter: "openai",
    baseUrl: "https://api.deepseek.com",
    requiresApiKey: true,
    envKeys: ["DEEPSEEK_API_KEY"],
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "mistral",
    label: "Mistral",
    adapter: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    requiresApiKey: true,
    envKeys: ["MISTRAL_API_KEY"],
    suggestedModels: ["mistral-large-latest", "codestral-latest"],
  },
  {
    id: "xai",
    label: "xAI",
    adapter: "openai",
    baseUrl: "https://api.x.ai/v1",
    requiresApiKey: true,
    envKeys: ["XAI_API_KEY"],
    suggestedModels: ["grok-2-latest", "grok-2-vision-latest"],
  },
  {
    id: "together",
    label: "Together AI",
    adapter: "openai",
    baseUrl: "https://api.together.xyz/v1",
    requiresApiKey: true,
    envKeys: ["TOGETHER_API_KEY"],
    suggestedModels: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    adapter: "openai",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    requiresApiKey: true,
    envKeys: ["FIREWORKS_API_KEY"],
    suggestedModels: ["accounts/fireworks/models/llama-v3p3-70b-instruct"],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    adapter: "openai",
    baseUrl: "https://api.cerebras.ai/v1",
    requiresApiKey: true,
    envKeys: ["CEREBRAS_API_KEY"],
    suggestedModels: ["qwen-3-coder-480b"],
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    adapter: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    requiresApiKey: true,
    envKeys: ["NVIDIA_API_KEY"],
    suggestedModels: ["meta/llama-3.1-70b-instruct"],
  },
  {
    id: "alibaba-cloud",
    label: "Alibaba Cloud (DashScope)",
    adapter: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    requiresApiKey: true,
    envKeys: ["DASHSCOPE_API_KEY", "ALIBABA_CLOUD_API_KEY"],
    suggestedModels: ["qwen-max", "qwen-plus", "qwen-turbo"],
    hint: "DashScope API key from Alibaba Cloud Model Studio",
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    adapter: "openai",
    baseUrl: "https://api.githubcopilot.com",
    requiresApiKey: true,
    envKeys: ["GITHUB_COPILOT_TOKEN", "GH_TOKEN"],
    suggestedModels: ["gpt-4o", "claude-sonnet-4"],
    hint: "Copilot subscription — paste token or use GH_TOKEN if configured",
  },
  {
    id: "venice-ai",
    label: "Venice AI",
    adapter: "openai",
    baseUrl: "https://api.venice.ai/api/v1",
    requiresApiKey: true,
    envKeys: ["VENICE_API_KEY"],
    suggestedModels: ["llama-3.3-70b", "mistral-large"],
    hint: "API key from venice.ai",
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI",
    adapter: "openai",
    requiresBaseUrl: true,
    requiresApiKey: true,
    envKeys: ["AZURE_OPENAI_API_KEY", "OPENAI_API_KEY"],
    suggestedModels: ["gpt-4o"],
    hint: "Base URL: https://RESOURCE.openai.azure.com/openai/deployments/MODEL",
  },
  {
    id: "openai-compatible",
    label: "OpenAI Compatible (custom)",
    adapter: "openai",
    requiresBaseUrl: true,
    requiresApiKey: false,
    suggestedModels: ["gpt-4o"],
    hint: "Any OpenAI-compatible gateway (LM Studio, vLLM, etc.)",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    adapter: "ollama",
    baseUrl: "http://localhost:11434/v1",
    requiresApiKey: false,
    suggestedModels: ["llama3.1", "llama3.2", "qwen2.5", "mistral"],
    hint: "Local models — no API key required",
  },
  {
    id: "ollama-cloud",
    label: "Ollama Cloud",
    adapter: "openai",
    baseUrl: "https://ollama.com/v1",
    requiresApiKey: true,
    envKeys: ["OLLAMA_API_KEY"],
    suggestedModels: ["gpt-oss:120b-cloud", "gemma4:31b-cloud", "deepseek-v4-flash"],
    hint: "API key from ollama.com/settings/keys",
  },
  {
    id: "llamacpp",
    label: "llama.cpp (local)",
    adapter: "openai",
    baseUrl: "http://127.0.0.1:8080/v1",
    requiresApiKey: false,
    suggestedModels: ["local-model"],
    hint: "llama-server OpenAI-compatible endpoint (default :8080)",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    adapter: "openai",
    baseUrl: "http://127.0.0.1:1234/v1",
    requiresApiKey: false,
    suggestedModels: ["local-model"],
    hint: "LM Studio OpenAI-compatible server",
  },
] as const;

const CATALOG_BY_ID = new Map(PROVIDER_CATALOG.map((e) => [e.id, e]));

export function getCatalogEntry(id: string): ProviderCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id);
}

export function listCatalogEntries(): readonly ProviderCatalogEntry[] {
  return PROVIDER_CATALOG;
}

/** Legacy configs used provider as adapter id only. */
export function normalizeProviderId(id: string): string {
  if (CATALOG_BY_ID.has(id)) return id;
  const legacy = id as "anthropic" | "openai" | "ollama";
  if (legacy === "anthropic" || legacy === "openai" || legacy === "ollama") {
    return legacy;
  }
  return id;
}

export function resolveEnvApiKey(entry: ProviderCatalogEntry): string | undefined {
  for (const key of entry.envKeys ?? []) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function defaultModelFor(entry: ProviderCatalogEntry): string {
  return entry.suggestedModels[0] ?? "gpt-4o";
}

export function resolveBaseUrl(
  entry: ProviderCatalogEntry,
  override?: string,
): string | undefined {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  return entry.baseUrl;
}