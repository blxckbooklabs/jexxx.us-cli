import type { ProviderName } from "./types.js";
import {
  listProvidersRedacted,
  type StoredProviderConfig,
} from "../config.js";

const DEFAULT_OLLAMA_BASE = "http://localhost:11434";

const SUGGESTED_MODELS: Record<ProviderName, string[]> = {
  anthropic: [
    "claude-sonnet-4-5",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini"],
  ollama: ["llama3.1", "llama3.2", "mistral", "codellama", "qwen2.5"],
};

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderName;
  source: "configured" | "suggested" | "ollama";
}

function ollamaRootUrl(baseUrl?: string): string {
  const raw = baseUrl?.trim() || `${DEFAULT_OLLAMA_BASE}/v1`;
  return raw.replace(/\/v1\/?$/, "");
}

/** Fetch locally installed Ollama model tags (best-effort). */
export async function listOllamaModels(baseUrl?: string): Promise<string[]> {
  try {
    const root = ollamaRootUrl(baseUrl);
    const res = await fetch(`${root}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models ?? []).map((m) => m.name).filter(Boolean);
  } catch {
    return [];
  }
}

/** Build deduplicated model suggestions for autocomplete and /model. */
export async function listModelOptions(
  activeConfig?: StoredProviderConfig,
): Promise<ModelOption[]> {
  const seen = new Set<string>();
  const options: ModelOption[] = [];

  const push = (
    id: string,
    provider: ProviderName,
    source: ModelOption["source"],
    label?: string,
  ): void => {
    const key = `${provider}/${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    options.push({
      id,
      label: label ?? `${provider}/${id}`,
      provider,
      source,
    });
  };

  for (const p of listProvidersRedacted()) {
    push(p.model, p.provider, "configured", `${p.name}: ${p.provider}/${p.model}`);
  }

  if (activeConfig) {
    for (const id of SUGGESTED_MODELS[activeConfig.provider] ?? []) {
      push(id, activeConfig.provider, "suggested");
    }
    if (activeConfig.provider === "ollama") {
      const local = await listOllamaModels(activeConfig.baseUrl);
      for (const id of local) {
        push(id, "ollama", "ollama");
      }
    }
  }

  return options;
}

export function findModelMatch(
  query: string,
  options: ModelOption[],
): ModelOption | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const exact = options.find(
    (o) =>
      o.id.toLowerCase() === q ||
      o.label.toLowerCase() === q ||
      `${o.provider}/${o.id}`.toLowerCase() === q,
  );
  if (exact) return exact;

  const partial = options.filter(
    (o) =>
      o.id.toLowerCase().includes(q) ||
      o.label.toLowerCase().includes(q) ||
      `${o.provider}/${o.id}`.toLowerCase().includes(q),
  );
  return partial.length === 1 ? (partial[0] ?? null) : null;
}