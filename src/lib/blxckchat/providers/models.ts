import {
  getCatalogEntry,
  listCatalogEntries,
  normalizeProviderId,
} from "./catalog.js";
import type { ProviderName } from "./types.js";
import {
  listProvidersRedacted,
  type StoredProviderConfig,
} from "../config.js";

const DEFAULT_OLLAMA_BASE = "http://localhost:11434";

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderName;
  source: "configured" | "suggested" | "ollama" | "catalog";
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
    const catalogId = normalizeProviderId(activeConfig.provider);
    const entry = getCatalogEntry(catalogId);

    if (entry) {
      for (const id of entry.suggestedModels) {
        push(id, catalogId, "suggested", `${entry.label} · ${id}`);
      }
    }

    if (catalogId === "ollama" || entry?.adapter === "ollama") {
      const local = await listOllamaModels(activeConfig.baseUrl ?? entry?.baseUrl);
      for (const id of local) {
        push(id, catalogId, "ollama", `ollama · ${id}`);
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