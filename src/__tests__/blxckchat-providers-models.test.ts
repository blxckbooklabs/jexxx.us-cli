import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { getCatalogEntry } from "../lib/blxckchat/providers/catalog.js";
import {
  fetchOpenAiCompatibleModels,
  listModelsForProvider,
  resolveModelsEndpoint,
  supportsLiveModelDiscovery,
} from "../lib/blxckchat/providers/models.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("provider model discovery", () => {
  test("resolveModelsEndpoint normalizes base URLs", () => {
    assert.equal(
      resolveModelsEndpoint("https://opencode.ai/zen/v1"),
      "https://opencode.ai/zen/v1/models",
    );
    assert.equal(
      resolveModelsEndpoint("https://api.deepseek.com"),
      "https://api.deepseek.com/v1/models",
    );
  });

  test("supportsLiveModelDiscovery for gateways and locals", () => {
    const zen = getCatalogEntry("opencode-zen");
    const anthropic = getCatalogEntry("anthropic");
    const azure = getCatalogEntry("azure-openai");
    const ollama = getCatalogEntry("ollama");
    assert.ok(zen && anthropic && azure && ollama);
    assert.equal(supportsLiveModelDiscovery(zen), true);
    assert.equal(supportsLiveModelDiscovery(anthropic), false);
    assert.equal(supportsLiveModelDiscovery(azure), false);
    assert.equal(supportsLiveModelDiscovery(ollama), true);
  });

  test("fetchOpenAiCompatibleModels parses OpenAI list shape", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [{ id: "big-pickle" }, { id: "gpt-5.2" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    const models = await fetchOpenAiCompatibleModels("https://opencode.ai/zen/v1");
    assert.deepEqual(models, ["big-pickle", "gpt-5.2"]);
  });

  test("listModelsForProvider merges live OpenCode Zen catalog", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/models")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "big-pickle" },
              { id: "claude-sonnet-4-5" },
              { id: "gpt-5.5" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const models = await listModelsForProvider("opencode-zen");
    assert.ok(models.includes("big-pickle"), "includes free big-pickle");
    assert.ok(models.includes("gpt-5.5"), "includes live-only model");
    assert.equal(models[0], "big-pickle", "free models sort first");
  });

  test("listModelsForProvider falls back to static list on fetch failure", async () => {
    globalThis.fetch = (async () => new Response("error", { status: 500 })) as typeof fetch;

    const models = await listModelsForProvider("opencode-zen");
    assert.ok(models.includes("big-pickle"));
    assert.ok(models.includes("claude-sonnet-4-5"));
  });
});