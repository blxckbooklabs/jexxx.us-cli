import assert from "node:assert/strict";
import * as path from "path";
import { test, afterEach } from "node:test";

import {
  extractPersonaPrompt,
  parsePersonaMetadata,
} from "../lib/blxckchat/divinities/prompt.js";
import {
  clearDivinityPersonaCache,
  findDivinityPersona,
  listDivinityPersonas,
} from "../lib/blxckchat/divinities/source.js";
import {
  activateDivinityPersona,
  clearActiveDivinity,
} from "../lib/blxckchat/divinities/session.js";
import { dispatchSlashCommand } from "../lib/blxckchat/ui/slash/handler.js";
import { createSession } from "../lib/blxckchat/ui/session/session-store.js";
import type { StoredProviderConfig } from "../lib/blxckchat/config.js";

const FIXTURE_ROOT = path.join(
  process.cwd(),
  "src",
  "__tests__",
  "fixtures",
  "divinities",
);

const priorVault = process.env.DIVINITIES_VAULT_PATH;

afterEach(() => {
  if (priorVault === undefined) delete process.env.DIVINITIES_VAULT_PATH;
  else process.env.DIVINITIES_VAULT_PATH = priorVault;
  clearDivinityPersonaCache();
});

test("extractPersonaPrompt pulls AGENTS.md blocks from Extracts", () => {
  const md = `## Extracts\n\n### X | AGENTS.md\n\`\`\`md\nYou are X.\n\`\`\``;
  assert.match(extractPersonaPrompt(md), /You are X\./);
});

test("parsePersonaMetadata reads title and role", () => {
  const meta = parsePersonaMetadata("# Luna Verde\n\n- **Role**: CMO\n");
  assert.equal(meta.name, "Luna Verde");
  assert.equal(meta.role, "CMO");
});

test("listDivinityPersonas loads vault Personas tree", () => {
  process.env.DIVINITIES_VAULT_PATH = FIXTURE_ROOT;
  clearDivinityPersonaCache();
  const personas = listDivinityPersonas(true);
  assert.ok(personas.length >= 1);
  const testPersona = personas.find((p) => p.name === "Test Persona");
  assert.ok(testPersona);
  assert.match(testPersona!.systemPrompt, /Test oracle online/);
  assert.equal(testPersona!.pillar, "Test Pillar");
});

test("findDivinityPersona resolves by name", () => {
  process.env.DIVINITIES_VAULT_PATH = FIXTURE_ROOT;
  clearDivinityPersonaCache();
  const match = findDivinityPersona("test persona");
  assert.ok(match);
  assert.equal(match!.name, "Test Persona");
});

test("activateDivinityPersona sets session and clears history", () => {
  process.env.DIVINITIES_VAULT_PATH = FIXTURE_ROOT;
  clearDivinityPersonaCache();
  const session = createSession();
  session.conversationHistory = [{ role: "user", content: "old" }];
  const persona = findDivinityPersona("Test Persona");
  assert.ok(persona);
  activateDivinityPersona(session, persona!);
  assert.equal(session.activeDivinity?.name, "Test Persona");
  assert.equal(session.conversationHistory.length, 0);
});

test("dispatchSlashCommand /divinities clear removes persona", async () => {
  process.env.DIVINITIES_VAULT_PATH = FIXTURE_ROOT;
  clearDivinityPersonaCache();
  const session = createSession();
  const persona = findDivinityPersona("Test Persona");
  assert.ok(persona);
  activateDivinityPersona(session, persona!);

  const config = {
    name: "test",
    provider: "ollama",
    model: "test",
  } as StoredProviderConfig;

  const result = await dispatchSlashCommand("/divinities clear", {
    session,
    activeConfig: config,
    toolCount: 4,
    setActiveConfig: () => {},
    copySnapshot: async () => ({ path: "", copied: false }),
  });

  assert.equal(result.handled, true);
  assert.equal(session.activeDivinity, null);
  clearActiveDivinity(session);
});

test("dispatchSlashCommand /divinities <name> activates persona", async () => {
  process.env.DIVINITIES_VAULT_PATH = FIXTURE_ROOT;
  clearDivinityPersonaCache();
  const session = createSession();
  const config = {
    name: "test",
    provider: "ollama",
    model: "test",
  } as StoredProviderConfig;

  const result = await dispatchSlashCommand("/divinities Test Persona", {
    session,
    activeConfig: config,
    toolCount: 4,
    setActiveConfig: () => {},
    copySnapshot: async () => ({ path: "", copied: false }),
  });

  assert.equal(result.handled, true);
  assert.equal(session.activeDivinity?.name, "Test Persona");
  assert.match(result.messages.join("\n"), /Divinity active/);
});