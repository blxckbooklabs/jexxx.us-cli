import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyLineEditorAction,
  createLineEditorState,
  deleteWordBackward,
  getSelectionRange,
  insertText,
  killLine,
  killToEnd,
  killToStart,
  moveWordLeft,
  moveWordRight,
  isSpuriousTerminalInput,
  resolveInsertChar,
  resolveLineEditorKey,
  selectAll,
  selectWordAt,
  wordBoundsAt,
  wordLeft,
  wordRight,
} from "../lib/blxckchat/ui/editor/line-editor.js";

test("selectWordAt highlights word under double-click index", () => {
  const text = "Type a message to begin";
  assert.deepEqual(wordBoundsAt(text, 7), { start: 7, end: 14 });
  const state = selectWordAt(createLineEditorState(text), 7);
  assert.deepEqual(getSelectionRange(state), { start: 7, end: 14 });
  assert.equal(text.slice(7, 14), "message");
});

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

test("full key sequence resolves option+shift+arrow", () => {
  assert.equal(resolveLineEditorKey({ full: "M-S-left" }).type, "move-word-left");
  assert.equal(resolveLineEditorKey({ full: "M-S-left" }).extend, true);
  assert.equal(resolveLineEditorKey({ full: "M-backspace" }).type, "kill-to-start");
  assert.equal(resolveLineEditorKey({ full: "M-delete" }).type, "kill-to-end");
});

test("command+delete kills to line start or end", () => {
  const toStart = createLineEditorState("OpenCode Zen profile");
  toStart.cursor = 13;
  assert.equal(killToStart(toStart).text, "profile");

  const toEnd = createLineEditorState("OpenCode Zen profile");
  toEnd.cursor = 9;
  assert.equal(killToEnd(toEnd).text, "OpenCode ");
});

test("ctrl+u clears entire field", () => {
  assert.equal(resolveLineEditorKey({ name: "u", ctrl: true }).type, "kill-line");
  assert.equal(killLine(createLineEditorState("clear me")).text, "");
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

test("ctrl+a moves to line start (macOS Cmd+Left sends Ctrl+A)", () => {
  let state = createLineEditorState("hello world");
  state = { ...state, cursor: 8 };
  state = applyLineEditorAction(state, resolveLineEditorKey({ name: "a", ctrl: true }));
  assert.equal(state.cursor, 0);
  assert.equal(state.selectionAnchor, null);
});

test("ctrl+shift+a selects from cursor to line start", () => {
  let state = createLineEditorState("hello world");
  state = { ...state, cursor: 8 };
  state = applyLineEditorAction(
    state,
    resolveLineEditorKey({ name: "a", ctrl: true, shift: true }),
  );
  assert.deepEqual(getSelectionRange(state), { start: 0, end: 8 });
});

test("ctrl+e moves to line end with optional shift extend", () => {
  let state = createLineEditorState("hello world");
  state = applyLineEditorAction(state, resolveLineEditorKey({ name: "e", ctrl: true }));
  assert.equal(state.cursor, 11);
  state = createLineEditorState("hello world");
  state = { ...state, cursor: 0 };
  state = applyLineEditorAction(
    state,
    resolveLineEditorKey({ name: "e", ctrl: true, shift: true }),
  );
  assert.deepEqual(getSelectionRange(state), { start: 0, end: 11 });
});

test("meta+b and meta+f move by word (macOS Option+arrow)", () => {
  let state = createLineEditorState("hello world");
  state = { ...state, cursor: 11 };
  state = applyLineEditorAction(state, resolveLineEditorKey({ name: "b", meta: true }));
  assert.equal(state.cursor, 6);
  state = applyLineEditorAction(state, resolveLineEditorKey({ name: "f", meta: true }));
  assert.equal(state.cursor, 11);
});

test("ctrl+shift+left selects from cursor to line start", () => {
  let state = createLineEditorState("one two three");
  state = { ...state, cursor: 7 };
  state = applyLineEditorAction(
    state,
    resolveLineEditorKey({ name: "left", ctrl: true, shift: true }),
  );
  assert.deepEqual(getSelectionRange(state), { start: 0, end: 7 });
});

test("ctrl+shift+right selects from cursor to line end", () => {
  let state = createLineEditorState("one two three");
  state = { ...state, cursor: 7 };
  state = applyLineEditorAction(
    state,
    resolveLineEditorKey({ name: "right", ctrl: true, shift: true }),
  );
  assert.deepEqual(getSelectionRange(state), { start: 7, end: 13 });
});

test("selectAll still available via editor API", () => {
  const state = selectAll(createLineEditorState("copy me"));
  assert.deepEqual(getSelectionRange(state), { start: 0, end: 7 });
});

test("insert replaces active selection", () => {
  let state = selectAll(createLineEditorState("old"));
  state = insertText(state, "new");
  assert.equal(state.text, "new");
});

test("resolveInsertChar handles question mark and shifted punctuation", () => {
  assert.equal(resolveInsertChar({ ch: "?" }), "?");
  assert.equal(resolveInsertChar({ name: "?" }), "?");
  assert.equal(resolveInsertChar({ name: "slash", shift: true }), "?");
  assert.equal(resolveInsertChar({ name: "slash", shift: false }), "/");
  assert.equal(resolveInsertChar({ name: "1", shift: true }), "!");
});

test("isSpuriousTerminalInput drops mouse tracking escape noise", () => {
  assert.equal(isSpuriousTerminalInput("\x1b[MCp!", { full: "\x1b[MCp!" }), true);
  assert.equal(resolveInsertChar({ ch: "\x1b[MCp!", full: "\x1b[MCp!" }), null);
  assert.equal(resolveLineEditorKey({ ch: "\x1b[MCp!", full: "\x1b[MCp!" }).type, "noop");
});

test("deleteWordBackward removes prior token", () => {
  const state = deleteWordBackward({
    text: "/model gpt",
    cursor: 11,
    selectionAnchor: null,
  });
  assert.equal(state.text, "/model ");
});