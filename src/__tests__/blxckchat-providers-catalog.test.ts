import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  getCatalogEntry,
  listCatalogEntries,
  normalizeProviderId,
  resolveEnvApiKey,
} from "../lib/blxckchat/providers/catalog.js";
import { resolveStoredProvider } from "../lib/blxckchat/providers/resolve-config.js";
import { buildProviderConfig } from "../lib/blxckchat/config.js";

describe("provider catalog", () => {
  test("lists Pi/OpenCode parity providers", () => {
    const ids = listCatalogEntries().map((e) => e.id);
    for (const expected of [
      "opencode-zen",
      "anthropic",
      "openai",
      "google",
      "openrouter",
      "groq",
      "deepseek",
      "mistral",
      "xai",
      "together",
      "fireworks",
      "cerebras",
      "nvidia",
      "azure-openai",
      "openai-compatible",
      "ollama",
      "ollama-cloud",
      "llamacpp",
      "lmstudio",
    ]) {
      assert.ok(ids.includes(expected), `missing ${expected}`);
    }
  });

  test("resolveStoredProvider maps google to openai adapter", () => {
    const resolved = resolveStoredProvider({
      name: "google",
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "test-key",
    });
    assert.equal(resolved.adapter, "openai");
    assert.equal(resolved.catalogId, "google");
    assert.ok(resolved.baseUrl?.includes("generativelanguage.googleapis.com"));
  });

  test("buildProviderConfig omits undefined optional fields", () => {
    const config = buildProviderConfig({
      catalogId: "ollama",
      model: "llama3.1",
      name: "local",
      isDefault: true,
    });
    assert.equal(config.provider, "ollama");
    assert.equal(config.model, "llama3.1");
    assert.equal(config.apiKey, undefined);
  });

  test("normalizeProviderId preserves catalog ids", () => {
    assert.equal(normalizeProviderId("openrouter"), "openrouter");
    assert.equal(normalizeProviderId("anthropic"), "anthropic");
  });

  test("getCatalogEntry returns openrouter gateway", () => {
    const entry = getCatalogEntry("openrouter");
    assert.ok(entry);
    assert.equal(entry.baseUrl, "https://openrouter.ai/api/v1");
    assert.equal(entry.adapter, "openai");
  });

  test("resolveEnvApiKey returns undefined when unset", () => {
    const entry = getCatalogEntry("anthropic");
    assert.ok(entry);
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(resolveEnvApiKey(entry), undefined);
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });
});