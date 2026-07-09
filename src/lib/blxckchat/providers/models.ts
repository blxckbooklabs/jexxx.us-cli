import {
  getCatalogEntry,
  listCatalogEntries,
  normalizeProviderId,
  resolveBaseUrl,
  type ProviderCatalogEntry,
} from "./catalog.js";
import type { ProviderName } from "./types.js";
import {
  listProvidersRedacted,
  type StoredProviderConfig,
} from "../config.js";

const DEFAULT_OLLAMA_BASE = "http://localhost:11434";
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const MODELS_FETCH_TIMEOUT_MS = 5000;

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderName;
  source: "configured" | "suggested" | "ollama" | "catalog" | "live";
}

function ollamaRootUrl(baseUrl?: string): string {
  const raw = baseUrl?.trim() || `${DEFAULT_OLLAMA_BASE}/v1`;
  return raw.replace(/\/v1\/?$/, "");
}

/** Normalize catalog base URL to an OpenAI-compatible `/models` endpoint. */
export function resolveModelsEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/models`;
  return `${trimmed}/v1/models`;
}

/** Whether live model discovery is supported for this catalog entry. */
export function supportsLiveModelDiscovery(entry: ProviderCatalogEntry): boolean {
  if (entry.adapter === "ollama") return true;
  if (entry.adapter !== "openai") return false;
  if (entry.id === "azure-openai") return false;
  if (entry.requiresBaseUrl) return true;
  return Boolean(entry.baseUrl) || entry.id === "openai";
}

function resolveDiscoveryBaseUrl(
  entry: ProviderCatalogEntry,
  override?: string,
): string | undefined {
  const resolved = resolveBaseUrl(entry, override);
  if (resolved) return resolved;
  if (entry.id === "openai") return DEFAULT_OPENAI_BASE;
  return undefined;
}

function isFreeTierModel(id: string): boolean {
  const lower = id.toLowerCase();
  return lower.includes("-free") || lower.endsWith("-free") || lower === "big-pickle";
}

function sortModelIds(ids: readonly string[], catalogId: string): string[] {
  const unique = [...new Set(ids.filter(Boolean))];
  if (catalogId === "opencode-zen") {
    return unique.sort((a, b) => {
      const aFree = isFreeTierModel(a);
      const bFree = isFreeTierModel(b);
      if (aFree !== bFree) return aFree ? -1 : 1;
      return a.localeCompare(b);
    });
  }
  return unique.sort((a, b) => a.localeCompare(b));
}

function mergeModelIds(
  staticModels: readonly string[],
  liveModels: readonly string[],
  catalogId: string,
): string[] {
  return sortModelIds([...staticModels, ...liveModels], catalogId);
}

/** Fetch model ids from an OpenAI-compatible `GET /v1/models` endpoint. */
export async function fetchOpenAiCompatibleModels(
  baseUrl: string,
  apiKey?: string,
): Promise<string[]> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey?.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const res = await fetch(resolveModelsEndpoint(baseUrl), {
      headers,
      signal: AbortSignal.timeout(MODELS_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ id?: string; name?: string }>;
    };

    const fromData = (data.data ?? []).map((m) => m.id).filter(Boolean) as string[];
    if (fromData.length > 0) return fromData;

    const fromModels = (data.models ?? [])
      .map((m) => m.id ?? m.name)
      .filter(Boolean) as string[];
    return fromModels;
  } catch {
    return [];
  }
}

/** Fetch locally installed Ollama model tags (best-effort). */
export async function listOllamaModels(baseUrl?: string): Promise<string[]> {
  try {
    const root = ollamaRootUrl(baseUrl);
    const res = await fetch(`${root}/api/tags`, {
      signal: AbortSignal.timeout(MODELS_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models ?? []).map((m) => m.name).filter(Boolean);
  } catch {
    return [];
  }
}

/** Live + static model ids for a catalog provider (used in setup and /model). */
export async function listModelsForProvider(
  catalogId: string,
  opts?: { apiKey?: string; baseUrl?: string },
): Promise<string[]> {
  const normalized = normalizeProviderId(catalogId);
  const entry = getCatalogEntry(normalized);
  if (!entry) return [];

  if (entry.adapter === "ollama") {
    const live = await listOllamaModels(opts?.baseUrl ?? entry.baseUrl);
    return mergeModelIds(entry.suggestedModels, live, normalized);
  }

  if (!supportsLiveModelDiscovery(entry)) {
    return [...entry.suggestedModels];
  }

  const discoveryBase = resolveDiscoveryBaseUrl(entry, opts?.baseUrl);
  if (!discoveryBase) {
    return [...entry.suggestedModels];
  }

  const apiKey = opts?.apiKey?.trim() || undefined;
  const live = await fetchOpenAiCompatibleModels(discoveryBase, apiKey);
  return mergeModelIds(entry.suggestedModels, live, normalized);
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
    const catalogId = normalizeProviderId(activeConfig.provider);
    const entry = getCatalogEntry(catalogId);

    if (entry) {
      const discoveryOpts: { apiKey?: string; baseUrl?: string } = {};
      if (activeConfig.apiKey?.trim()) {
        discoveryOpts.apiKey = activeConfig.apiKey.trim();
      }
      if (activeConfig.baseUrl?.trim()) {
        discoveryOpts.baseUrl = activeConfig.baseUrl.trim();
      }
      const modelIds = await listModelsForProvider(catalogId, discoveryOpts);
      const hasLive = supportsLiveModelDiscovery(entry);
      for (const id of modelIds) {
        const inStatic = entry.suggestedModels.includes(id);
        const source: ModelOption["source"] =
          hasLive && !inStatic ? "live" : "suggested";
        push(id, catalogId, source, `${entry.label} · ${id}`);
      }
    }
  }

  for (const entry of listCatalogEntries()) {
    for (const id of entry.suggestedModels.slice(0, 2)) {
      push(id, entry.id, "catalog", `${entry.label} · ${id}`);
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

/** Cycle to next/previous model within the active provider's option list. */
export function cycleModelOption(
  options: ModelOption[],
  current: StoredProviderConfig,
  direction: 1 | -1,
): ModelOption | null {
  const catalogId = normalizeProviderId(current.provider);
  const forProvider = options.filter((o) => o.provider === catalogId);
  if (forProvider.length === 0) return null;

  const idx = forProvider.findIndex((o) => o.id === current.model);
  const nextIdx =
    idx === -1
      ? direction === 1
        ? 0
        : forProvider.length - 1
      : (idx + direction + forProvider.length) % forProvider.length;

  return forProvider[nextIdx] ?? null;
}