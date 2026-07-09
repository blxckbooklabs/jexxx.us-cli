import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import {
  getArgumentSuggestions,
} from "../lib/blxckchat/ui/slash/autocomplete.js";
import {
  isPickerSlashCommand,
  shouldSuppressSlashArgumentSuggestions,
} from "../lib/blxckchat/ui/slash/picker-commands.js";
import {
  isModalOverlayActive,
  registerOverlayActiveCheck,
  registerSlashMenuDismiss,
} from "../lib/blxckchat/ui/menu-mutex.js";
import type { StoredProviderConfig } from "../lib/blxckchat/config.js";

const config = {
  name: "test",
  provider: "ollama",
  model: "llama3.1",
} as StoredProviderConfig;

afterEach(() => {
  registerSlashMenuDismiss(() => {});
  registerOverlayActiveCheck(() => false);
});

test("isPickerSlashCommand resolves aliases", () => {
  assert.equal(isPickerSlashCommand("divinity"), true);
  assert.equal(isPickerSlashCommand("providers"), true);
  assert.equal(isPickerSlashCommand("auth"), true);
  assert.equal(isPickerSlashCommand("help"), false);
});

test("shouldSuppressSlashArgumentSuggestions for bare picker commands", () => {
  assert.equal(shouldSuppressSlashArgumentSuggestions("divinities", ""), true);
  assert.equal(shouldSuppressSlashArgumentSuggestions("model", ""), true);
  assert.equal(shouldSuppressSlashArgumentSuggestions("auth", ""), true);
  assert.equal(shouldSuppressSlashArgumentSuggestions("divinities", "luna"), false);
});

test("getArgumentSuggestions empty for bare /auth", async () => {
  const suggestions = await getArgumentSuggestions("auth", "", { activeConfig: config });
  assert.equal(suggestions.length, 0);
});

test("getArgumentSuggestions empty for bare /divinities", async () => {
  const suggestions = await getArgumentSuggestions("divinities", "", { activeConfig: config });
  assert.equal(suggestions.length, 0);
});

test("getArgumentSuggestions filters divinities when arg present", async () => {
  process.env.DIVINITIES_VAULT_PATH = `${process.cwd()}/src/__tests__/fixtures/divinities`;
  const suggestions = await getArgumentSuggestions("divinities", "test", {
    activeConfig: config,
  });
  assert.ok(suggestions.some((s) => s.label.includes("Test Persona")));
  delete process.env.DIVINITIES_VAULT_PATH;
});

test("isModalOverlayActive reflects registered check", () => {
  registerOverlayActiveCheck(() => true);
  assert.equal(isModalOverlayActive(), true);
});