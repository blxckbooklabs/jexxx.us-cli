import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyLineEditorAction,
  createLineEditorState,
  deleteWordBackward,
  getSelectionRange,
  insertText,
  moveWordLeft,
  moveWordRight,
  resolveLineEditorKey,
  selectAll,
  wordLeft,
  wordRight,
} from "../lib/blxckchat/ui/editor/line-editor.js";

test("wordLeft and wordRight skip by token", () => {
  const text = "hello /model world";
  assert.equal(wordLeft(text, 18), 13);
  assert.equal(wordRight(text, 0), 5);
  assert.equal(wordRight(text, 6), 12);
});

test("option+arrow resolves to word movement", () => {
  assert.equal(resolveLineEditorKey({ name: "left", meta: true }).type, "move-word-left");
  assert.equal(resolveLineEditorKey({ name: "right", meta: true, shift: true }).type, "move-word-right");
  assert.equal(resolveLineEditorKey({ name: "left", meta: true, shift: true }).extend, true);
});

test("shift+arrow extends character selection", () => {
  let state = createLineEditorState("abcdef");
  state = applyLineEditorAction(state, { type: "move-char-left", extend: true });
  state = applyLineEditorAction(state, { type: "move-char-left", extend: true });
  const range = getSelectionRange(state);
  assert.deepEqual(range, { start: 4, end: 6 });
});

test("option+shift+arrow extends word selection", () => {
  let state = createLineEditorState("/model gpt-4o");
  state = { ...state, cursor: state.text.length };
  state = moveWordLeft(state, true);
  const range = getSelectionRange(state);
  assert.ok(range);
  assert.equal(state.text.slice(range!.start, range!.end), "gpt-4o");
});

test("ctrl+a selects all text", () => {
  const state = selectAll(createLineEditorState("copy me"));
  assert.deepEqual(getSelectionRange(state), { start: 0, end: 7 });
});

test("insert replaces active selection", () => {
  let state = selectAll(createLineEditorState("old"));
  state = insertText(state, "new");
  assert.equal(state.text, "new");
});

test("deleteWordBackward removes prior token", () => {
  const state = deleteWordBackward({
    text: "/model gpt",
    cursor: 11,
    selectionAnchor: null,
  });
  assert.equal(state.text, "/model ");
});