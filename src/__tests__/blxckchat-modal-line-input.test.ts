import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createModalLineInput,
  insertModalLinePaste,
} from "../lib/blxckchat/ui/editor/modal-line-input.js";

test("modal line input supports option+shift+word select", () => {
  const input = createModalLineInput("my profile name");
  input.handleKey("", { name: "left", meta: true, shift: true });
  input.handleKey("", { name: "left", meta: true, shift: true });
  const state = input.getState();
  assert.ok(state.selectionAnchor != null);
  assert.ok(state.cursor < state.text.length);
});

test("modal line input deletes word with option+backspace", () => {
  const input = createModalLineInput("hello world");
  input.handleKey("", { name: "backspace", meta: true });
  assert.equal(input.getText(), "hello ");
});

test("insertModalLinePaste replaces selection", () => {
  const input = createModalLineInput("old-name");
  input.handleKey("", { name: "a", ctrl: true });
  insertModalLinePaste(input, "new-name");
  assert.equal(input.getText(), "new-name");
});