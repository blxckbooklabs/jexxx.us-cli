import assert from "node:assert/strict";
import { test } from "node:test";

import { isSecretPromptPasteKey } from "../lib/blxckchat/ui/secret-prompt-input.js";
import { normalizeSecretClipboardPaste } from "../lib/blxckchat/ui/session/tui-snapshot.js";

test("normalizeSecretClipboardPaste strips newlines and tabs", () => {
  assert.equal(normalizeSecretClipboardPaste("  xai-key\n\t  "), "xai-key");
});

test("isSecretPromptPasteKey accepts Cmd+V and standalone p", () => {
  assert.equal(isSecretPromptPasteKey("", { meta: true, name: "v" }), true);
  assert.equal(isSecretPromptPasteKey("", { ctrl: true, name: "v" }), true);
  assert.equal(isSecretPromptPasteKey("p", { name: "p" }), true);
  assert.equal(isSecretPromptPasteKey("P", { name: "p", shift: true }), true);
});

test("isSecretPromptPasteKey rejects ctrl+p and unrelated keys", () => {
  assert.equal(isSecretPromptPasteKey("p", { ctrl: true, name: "p" }), false);
  assert.equal(isSecretPromptPasteKey("a", { name: "a" }), false);
});