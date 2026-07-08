import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  loadCredentials,
  saveCredentials,
  listProvidersRedacted,
  upsertProvider,
  getDefaultProvider,
} from "../lib/blxckchat/config.js";

const CREDENTIALS_PATH = path.join(os.homedir(), ".jexxxus", "credentials.json");

function withBackup(fn: () => void): void {
  const existed = fs.existsSync(CREDENTIALS_PATH);
  const backup = existed ? fs.readFileSync(CREDENTIALS_PATH, "utf-8") : null;
  try {
    fn();
  } finally {
    if (backup !== null) {
      fs.writeFileSync(CREDENTIALS_PATH, backup, { mode: 0o600 });
    } else if (fs.existsSync(CREDENTIALS_PATH)) {
      fs.unlinkSync(CREDENTIALS_PATH);
    }
  }
}

test("saveCredentials writes file with 0600 permissions", () => {
  withBackup(() => {
    saveCredentials({
      providers: [
        { name: "test", provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "sk-test", isDefault: true },
      ],
    });
    const stat = fs.statSync(CREDENTIALS_PATH);
    // eslint-disable-next-line no-bitwise
    assert.equal(stat.mode & 0o777, 0o600);
  });
});

test("listProvidersRedacted never exposes the raw API key", () => {
  withBackup(() => {
    saveCredentials({
      providers: [
        { name: "test", provider: "openai", model: "gpt-4o", apiKey: "sk-super-secret", isDefault: true },
      ],
    });
    const listed = listProvidersRedacted();
    const serialized = JSON.stringify(listed);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.hasKey, true);
    assert.doesNotMatch(serialized, /sk-super-secret/);
  });
});

test("upsertProvider only allows a single default", () => {
  withBackup(() => {
    saveCredentials({ providers: [] });
    upsertProvider({ name: "a", provider: "anthropic", model: "m1", apiKey: "k1", isDefault: true });
    upsertProvider({ name: "b", provider: "openai", model: "m2", apiKey: "k2", isDefault: true });

    const file = loadCredentials();
    const defaults = file.providers.filter((p) => p.isDefault);
    assert.equal(defaults.length, 1);
    assert.equal(defaults[0]?.name, "b");
  });
});

test("getDefaultProvider falls back to first provider if none marked default", () => {
  withBackup(() => {
    saveCredentials({
      providers: [
        { name: "only", provider: "ollama", model: "llama3.1", baseUrl: "http://localhost:11434/v1" },
      ],
    });
    const result = getDefaultProvider();
    assert.equal(result?.name, "only");
  });
});
