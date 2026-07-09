import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createModalLineInput,
  insertModalLinePaste,
  isPasteKey,
} from "../lib/blxckchat/ui/editor/modal-line-input.js";

test("modal line input supports option+shift+word select", () => {
  const input = createModalLineInput("my profile name");
  input.handleKey("", { name: "left", meta: true, shift: true });
  input.handleKey("", { name: "left", meta: true, shift: true });
  const state = input.getState();
  assert.ok(state.selectionAnchor != null);
  assert.ok(state.cursor < state.text.length);
});

test("modal line input deletes word with ctrl+backspace", () => {
  const input = createModalLineInput("hello world");
  input.handleKey("", { name: "backspace", ctrl: true });
  assert.equal(input.getText(), "hello ");
});

test("modal line input kills to line start with command+delete", () => {
  const input = createModalLineInput("OpenCode Zen");
  input.handleKey("", { name: "backspace", meta: true });
  assert.equal(input.getText(), "");
});

test("letter p inserts text and is not a paste shortcut", () => {
  assert.equal(isPasteKey({ name: "p" }), false);
  const input = createModalLineInput("OpenCode ");
  const result = input.handleKey("p", { name: "p", ch: "p" });
  assert.equal(result.action, "updated");
  assert.equal(input.getText(), "OpenCode p");
});

test("insertModalLinePaste replaces selection", () => {
  const input = createModalLineInput("old-name");
  input.handleKey("", { name: "a", ctrl: true });
  insertModalLinePaste(input, "new-name");
  assert.equal(input.getText(), "new-name");
});