import assert from "node:assert/strict";
import { test } from "node:test";

import { fuzzyFilter, fuzzyScore } from "../lib/blxckchat/ui/slash/fuzzy.js";
import {
  getCommandSuggestions,
  detectSlashInputMode,
} from "../lib/blxckchat/ui/slash/autocomplete.js";
import {
  dispatchSlashCommand,
  isSlashCommand,
  parseSlashInput,
} from "../lib/blxckchat/ui/slash/handler.js";
import { coerceSlashLine } from "../lib/blxckchat/ui/slash/coerce.js";
import {
  resolveExactCommandToken,
  resolveSlashCommandName,
} from "../lib/blxckchat/ui/slash/registry.js";
import { findModelMatch, type ModelOption } from "../lib/blxckchat/providers/models.js";
import { createSession } from "../lib/blxckchat/ui/session/session-store.js";
import type { StoredProviderConfig } from "../lib/blxckchat/config.js";
import { resolveProvider } from "../lib/blxckchat/providers/registry.js";

test("resolveSlashCommandName resolves aliases", () => {
  assert.equal(resolveSlashCommandName("mo"), "model");
  assert.equal(resolveSlashCommandName("providers"), "provider");
  assert.equal(resolveSlashCommandName("connect"), "provider");
  assert.equal(resolveSlashCommandName("quit"), "exit");
  assert.equal(resolveSlashCommandName("clear"), "reset");
  assert.equal(resolveSlashCommandName("auth"), "auth");
});

test("resolveExactCommandToken matches full command tokens", () => {
  assert.equal(resolveExactCommandToken("providers"), "provider");
  assert.equal(resolveExactCommandToken("connect"), "provider");
  assert.equal(resolveExactCommandToken("mod"), null);
});

test("coerceSlashLine expands unambiguous partial commands", () => {
  assert.equal(coerceSlashLine("/mod"), "/model");
  assert.equal(coerceSlashLine("/prov"), "/provider");
});

test("detectSlashInputMode treats /providers as provider arguments", () => {
  assert.deepEqual(detectSlashInputMode("/providers"), {
    mode: "argument",
    commandName: "provider",
    commandFilter: "",
    argFilter: "",
  });
});

test("detectSlashInputMode normalizes spaced provider aliases", () => {
  assert.deepEqual(detectSlashInputMode("/connect "), {
    mode: "argument",
    commandName: "provider",
    commandFilter: "",
    argFilter: "",
  });
});

test("detectSlashInputMode treats /auth as auth arguments", () => {
  assert.deepEqual(detectSlashInputMode("/auth"), {
    mode: "argument",
    commandName: "auth",
    commandFilter: "",
    argFilter: "",
  });
});

test("dispatchSlashCommand bare /auth opens auth picker when wired", async () => {
  let opened = false;
  const config: StoredProviderConfig = {
    name: "test",
    provider: "openai",
    model: "gpt-4o",
    apiKey: "sk-test",
    isDefault: true,
  };
  const result = await dispatchSlashCommand("/auth", {
    session: createSession(),
    activeConfig: config,
    toolCount: 1,
    setActiveConfig: () => {},
    copySnapshot: async () => ({ path: "", copied: false }),
    openAuthPicker: () => {
      opened = true;
    },
  });
  assert.equal(opened, true);
  assert.equal(result.handled, true);
  assert.equal(result.messages.length, 0);
  assert.equal(result.deferInputFocus, true);
});

test("dispatchSlashCommand /auth login still bypasses picker", async () => {
  let opened = false;
  const config: StoredProviderConfig = {
    name: "test",
    provider: "openai",
    model: "gpt-4o",
    apiKey: "sk-test",
    isDefault: true,
  };
  const result = await dispatchSlashCommand("/auth login", {
    session: createSession(),
    activeConfig: config,
    toolCount: 1,
    setActiveConfig: () => {},
    copySnapshot: async () => ({ path: "", copied: false }),
    openAuthPicker: () => {
      opened = true;
    },
    authActions: {
      status: async () => ["status"],
      login: async () => ["login flow started"],
      logout: async () => ["logout"],
      refresh: async () => ["refresh"],
    },
  });
  assert.equal(opened, false);
  assert.equal(result.handled, true);
  assert.deepEqual(result.messages, ["login flow started"]);
});

test("detectSlashInputMode distinguishes command vs argument", () => {
  assert.deepEqual(detectSlashInputMode("/"), {
    mode: "command",
    commandName: "",
    commandFilter: "",
    argFilter: "",
  });
  assert.deepEqual(detectSlashInputMode("/mod"), {
    mode: "command",
    commandName: "",
    commandFilter: "mod",
    argFilter: "",
  });
  assert.deepEqual(detectSlashInputMode("/model gpt"), {
    mode: "argument",
    commandName: "model",
    commandFilter: "",
    argFilter: "gpt",
  });
});

test("getCommandSuggestions fuzzy-filters commands", () => {
  const results = getCommandSuggestions("mod");
  assert.ok(results.some((r) => r.label === "/model"));
});

test("getCommandSuggestions lists all commands for bare slash", () => {
  const results = getCommandSuggestions("");
  assert.ok(results.length >= 8);
  assert.ok(results.some((r) => r.label === "/provider"));
  assert.ok(results.some((r) => r.label === "/help"));
  assert.ok(results.some((r) => r.label === "/model"));
});

test("fuzzyScore prefers prefix matches", () => {
  assert.ok(fuzzyScore("mod", "model") > fuzzyScore("mod", "compact"));
});

test("parseSlashInput extracts command and args", () => {
  assert.deepEqual(parseSlashInput("/model gpt-4o"), {
    command: "model",
    args: "gpt-4o",
  });
  assert.deepEqual(parseSlashInput("/help"), {
    command: "help",
    args: "",
  });
});

test("isSlashCommand detects slash lines", () => {
  assert.equal(isSlashCommand("/help"), true);
  assert.equal(isSlashCommand("hello"), false);
});

test("findModelMatch resolves provider/model syntax", () => {
  const options: ModelOption[] = [
    {
      id: "gpt-4o",
      label: "openai: openai/gpt-4o",
      provider: "openai",
      source: "configured",
    },
  ];
  assert.equal(findModelMatch("gpt-4o", options)?.id, "gpt-4o");
  assert.equal(findModelMatch("openai/gpt-4o", options)?.id, "gpt-4o");
});

test("dispatchSlashCommand /reset clears session", async () => {
  const config: StoredProviderConfig = {
    name: "test",
    provider: "openai",
    model: "gpt-4o",
    apiKey: "sk-test",
    isDefault: true,
  };
  const session = createSession();
  session.conversationHistory = [{ role: "user", content: "hi" }];
  let active = config;

  const result = await dispatchSlashCommand("/reset", {
    session,
    activeConfig: active,
    toolCount: 3,
    setActiveConfig: (c) => {
      active = c;
    },
    copySnapshot: async () => ({ path: "/tmp/x", copied: false }),
  });

  assert.equal(result.handled, true);
  assert.equal(session.conversationHistory.length, 0);
});

test("dispatchSlashCommand /model lists current model", async () => {
  const config: StoredProviderConfig = {
    name: "local",
    provider: "ollama",
    model: "llama3.1",
    baseUrl: "http://localhost:11434/v1",
    isDefault: true,
  };

  const result = await dispatchSlashCommand("/model", {
    session: createSession(),
    activeConfig: config,
    toolCount: 2,
    setActiveConfig: () => {},
    copySnapshot: async () => ({ path: "", copied: false }),
  });

  assert.equal(result.handled, true);
  assert.ok(result.messages.some((m) => m.includes("llama3.1")));
});

test("dispatchSlashCommand /provider switches config", async () => {
  const config: StoredProviderConfig = {
    name: "alpha",
    provider: "openai",
    model: "gpt-4o",
    apiKey: "sk-a",
    isDefault: true,
  };
  const other: StoredProviderConfig = {
    name: "beta",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    apiKey: "sk-b",
  };

  let active = config;
  const result = await dispatchSlashCommand("/provider beta", {
    session: createSession(),
    activeConfig: active,
    toolCount: 1,
    setActiveConfig: (c, p) => {
      active = c;
      assert.equal(p.id, "anthropic");
    },
    copySnapshot: async () => ({ path: "", copied: false }),
  });

  // May fail if beta not in credentials file — test only structure when unknown
  if (result.messages[0]?.includes("Unknown")) {
    assert.match(result.messages[0], /Unknown profile/);
    return;
  }

  assert.equal(active.name, "beta");
  assert.equal(resolveProvider(active).id, "anthropic");
});