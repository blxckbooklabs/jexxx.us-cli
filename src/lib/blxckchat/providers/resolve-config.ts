import type { StoredProviderConfig } from "../config.js";
import {
  defaultModelFor,
  getCatalogEntry,
  normalizeProviderId,
  resolveBaseUrl,
  resolveEnvApiKey,
  type ProviderAdapter,
} from "./catalog.js";
import type { ProviderConfig } from "./types.js";

export interface ResolvedProviderConfig extends ProviderConfig {
  adapter: ProviderAdapter;
  catalogId: string;
}

export function resolveStoredProvider(stored: StoredProviderConfig): ResolvedProviderConfig {
  const catalogId = normalizeProviderId(stored.provider);
  const entry = getCatalogEntry(catalogId);

  if (!entry) {
    const adapter = inferLegacyAdapter(catalogId);
    return {
      catalogId,
      provider: catalogId,
      adapter,
      apiKey: stored.apiKey,
      baseUrl: stored.baseUrl,
      model: stored.model,
    };
  }

  const apiKey =
    stored.apiKey?.trim() ||
    (entry.requiresApiKey ? resolveEnvApiKey(entry) : undefined);

  return {
    catalogId,
    provider: catalogId,
    adapter: entry.adapter,
    apiKey,
    baseUrl: resolveBaseUrl(entry, stored.baseUrl),
    model: stored.model || defaultModelFor(entry),
  };
}

function inferLegacyAdapter(id: string): ProviderAdapter {
  if (id === "anthropic") return "anthropic";
  if (id === "ollama") return "ollama";
  return "openai";
}