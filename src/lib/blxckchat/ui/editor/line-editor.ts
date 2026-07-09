/** Single-line editor state for transmit input (Google Docs–style shortcuts). */

export interface LineEditorState {
  text: string;
  cursor: number;
  /** When non-null, selection spans [min(anchor,cursor), max(anchor,cursor)). */
  selectionAnchor: number | null;
}

const WORD_CHAR = /[\w./:@-]/;

export function createLineEditorState(text = ""): LineEditorState {
  const len = text.length;
  return { text, cursor: len, selectionAnchor: null };
}

export function getSelectionRange(
  state: LineEditorState,
): { start: number; end: number } | null {
  if (state.selectionAnchor == null) return null;
  return {
    start: Math.min(state.selectionAnchor, state.cursor),
    end: Math.max(state.selectionAnchor, state.cursor),
  };
}

export function clearSelection(state: LineEditorState): LineEditorState {
  if (state.selectionAnchor == null) return state;
  return { ...state, selectionAnchor: null };
}

export function wordLeft(text: string, pos: number): number {
  let i = Math.max(0, Math.min(pos, text.length));
  while (i > 0 && !WORD_CHAR.test(text[i - 1] ?? "")) i--;
  while (i > 0 && WORD_CHAR.test(text[i - 1] ?? "")) i--;
  return i;
}

export function wordRight(text: string, pos: number): number {
  let i = Math.max(0, Math.min(pos, text.length));
  while (i < text.length && !WORD_CHAR.test(text[i] ?? "")) i++;
  while (i < text.length && WORD_CHAR.test(text[i] ?? "")) i++;
  return i;
}

/** Inclusive start, exclusive end for the word at a click/caret index. */
export function wordBoundsAt(text: string, index: number): { start: number; end: number } {
  const pos = Math.max(0, Math.min(index, text.length));
  let anchor = pos;
  if (pos < text.length && WORD_CHAR.test(text[pos] ?? "")) {
    anchor = pos;
  } else if (pos > 0 && WORD_CHAR.test(text[pos - 1] ?? "")) {
    anchor = pos - 1;
  } else {
    return { start: pos, end: pos };
  }
  const start = wordLeft(text, anchor + 1);
  const end = wordRight(text, start);
  return { start, end };
}

/** Double-click word selection (Google Docs style). */
export function selectWordAt(state: LineEditorState, index: number): LineEditorState {
  const { start, end } = wordBoundsAt(state.text, index);
  if (start >= end) {
    return { ...state, cursor: index, selectionAnchor: null };
  }
  return { ...state, cursor: end, selectionAnchor: start };
}

/** Horizontal scroll offset for a single-line viewport (matches renderLineEditorView). */
export function lineEditorViewScrollStart(state: LineEditorState, viewWidth: number): number {
  const width = Math.max(8, viewWidth);
  if (state.text.length <= width) return 0;
  return Math.max(0, Math.min(state.cursor - Math.floor(width * 0.4), state.text.length - width));
}

/** Map blessed mouse column inside transmit box to a text index. */
export function charIndexFromMouseX(
  mouseX: number,
  state: LineEditorState,
  viewWidth: number,
): number {
  const contentCol = Math.max(0, mouseX - 2);
  const scrollStart = lineEditorViewScrollStart(state, viewWidth);
  return Math.max(0, Math.min(state.text.length, scrollStart + contentCol));
}

function clampCursor(state: LineEditorState, cursor: number): LineEditorState {
  const next = Math.max(0, Math.min(state.text.length, cursor));
  return { ...state, cursor: next };
}

function moveTo(state: LineEditorState, cursor: number, extend: boolean): LineEditorState {
  const clamped = clampCursor(state, cursor);
  if (!extend) {
    return { ...clamped, selectionAnchor: null };
  }
  const anchor = clamped.selectionAnchor ?? state.cursor;
  return { ...clamped, selectionAnchor: anchor };
}

export function moveCharLeft(state: LineEditorState, extend = false): LineEditorState {
  return moveTo(state, state.cursor - 1, extend);
}

export function moveCharRight(state: LineEditorState, extend = false): LineEditorState {
  return moveTo(state, state.cursor + 1, extend);
}

export function moveWordLeft(state: LineEditorState, extend = false): LineEditorState {
  return moveTo(state, wordLeft(state.text, state.cursor), extend);
}

export function moveWordRight(state: LineEditorState, extend = false): LineEditorState {
  return moveTo(state, wordRight(state.text, state.cursor), extend);
}

export function moveLineStart(state: LineEditorState, extend = false): LineEditorState {
  return moveTo(state, 0, extend);
}

export function moveLineEnd(state: LineEditorState, extend = false): LineEditorState {
  return moveTo(state, state.text.length, extend);
}

export function selectAll(state: LineEditorState): LineEditorState {
  return { ...state, cursor: state.text.length, selectionAnchor: 0 };
}

function deleteRange(text: string, start: number, end: number): { text: string; cursor: number } {
  const next = text.slice(0, start) + text.slice(end);
  return { text: next, cursor: start };
}

function withSelectionRemoved(state: LineEditorState): LineEditorState {
  const range = getSelectionRange(state);
  if (!range) return state;
  const { text, cursor } = deleteRange(state.text, range.start, range.end);
  return { text, cursor, selectionAnchor: null };
}

export function insertText(state: LineEditorState, ch: string): LineEditorState {
  const base = withSelectionRemoved(state);
  const before = base.text.slice(0, base.cursor);
  const after = base.text.slice(base.cursor);
  const text = before + ch + after;
  return { text, cursor: base.cursor + ch.length, selectionAnchor: null };
}

export function deleteBackward(state: LineEditorState): LineEditorState {
  const range = getSelectionRange(state);
  if (range) {
    const { text, cursor } = deleteRange(state.text, range.start, range.end);
    return { text, cursor, selectionAnchor: null };
  }
  if (state.cursor === 0) return state;
  const { text, cursor } = deleteRange(state.text, state.cursor - 1, state.cursor);
  return { text, cursor, selectionAnchor: null };
}

export function deleteForward(state: LineEditorState): LineEditorState {
  const range = getSelectionRange(state);
  if (range) {
    const { text, cursor } = deleteRange(state.text, range.start, range.end);
    return { text, cursor, selectionAnchor: null };
  }
  if (state.cursor >= state.text.length) return state;
  const { text, cursor } = deleteRange(state.text, state.cursor, state.cursor + 1);
  return { text, cursor, selectionAnchor: null };
}

export function deleteWordBackward(state: LineEditorState): LineEditorState {
  const range = getSelectionRange(state);
  if (range) {
    const { text, cursor } = deleteRange(state.text, range.start, range.end);
    return { text, cursor, selectionAnchor: null };
  }
  const start = wordLeft(state.text, state.cursor);
  if (start === state.cursor) return state;
  const { text, cursor } = deleteRange(state.text, start, state.cursor);
  return { text, cursor, selectionAnchor: null };
}

export function deleteWordForward(state: LineEditorState): LineEditorState {
  const range = getSelectionRange(state);
  if (range) {
    const { text, cursor } = deleteRange(state.text, range.start, range.end);
    return { text, cursor, selectionAnchor: null };
  }
  const end = wordRight(state.text, state.cursor);
  if (end === state.cursor) return state;
  const { text, cursor } = deleteRange(state.text, state.cursor, end);
  return { text, cursor, selectionAnchor: null };
}

export function killToEnd(state: LineEditorState): LineEditorState {
  const range = getSelectionRange(state);
  if (range) {
    const { text, cursor } = deleteRange(state.text, range.start, range.end);
    return { text, cursor, selectionAnchor: null };
  }
  const { text, cursor } = deleteRange(state.text, state.cursor, state.text.length);
  return { text, cursor, selectionAnchor: null };
}

/** Delete from line start through cursor (macOS ⌘⌫). */
export function killToStart(state: LineEditorState): LineEditorState {
  const range = getSelectionRange(state);
  if (range) {
    const { text, cursor } = deleteRange(state.text, range.start, range.end);
    return { text, cursor, selectionAnchor: null };
  }
  const { text, cursor } = deleteRange(state.text, 0, state.cursor);
  return { text, cursor: 0, selectionAnchor: null };
}

/** Clear the entire field (readline Ctrl+U). */
export function killLine(state: LineEditorState): LineEditorState {
  return { text: "", cursor: 0, selectionAnchor: null };
}

export interface LineEditorKeyAction {
  readonly type:
    | "noop"
    | "insert"
    | "delete-backward"
    | "delete-forward"
    | "delete-word-backward"
    | "delete-word-forward"
    | "kill-to-end"
    | "kill-to-start"
    | "kill-line"
    | "move-char-left"
    | "move-char-right"
    | "move-word-left"
    | "move-word-right"
    | "move-line-start"
    | "move-line-end"
    | "select-all"
    | "paste"
    | "submit";
  readonly char?: string;
  readonly extend?: boolean;
}

export interface LineEditorKey {
  name?: string;
  shift?: boolean;
  meta?: boolean;
  ctrl?: boolean;
  ch?: string;
  full?: string;
}

function parseKeyModifiers(key: LineEditorKey): {
  name: string;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
} {
  const full = key.full ?? "";
  const parts = full ? full.split("-") : [];
  const shift = Boolean(key.shift) || parts.includes("S");
  const meta = Boolean(key.meta) || parts.includes("M");
  const ctrl =
    Boolean(key.ctrl) ||
    (parts.includes("C") && !meta) ||
    (full.startsWith("C-") && !full.startsWith("C-M-") && !full.startsWith("C-S-M-"));
  const name = key.name ?? parts[parts.length - 1] ?? "";
  return { name, shift, meta, ctrl };
}

const SHIFTED_SLASH = new Map<string, string>([
  ["1", "!"],
  ["2", "@"],
  ["3", "#"],
  ["4", "$"],
  ["5", "%"],
  ["6", "^"],
  ["7", "&"],
  ["8", "*"],
  ["9", "("],
  ["0", ")"],
  ["-", "_"],
  ["=", "+"],
  [",", "<"],
  [".", ">"],
  ["/", "?"],
  [";", ":"],
  ["'", '"'],
  ["[", "{"],
  ["]", "}"],
  ["\\", "|"],
  ["`", "~"],
]);

const NAMED_KEY_CHARS: Record<string, string> = {
  "?": "?",
  "/": "/",
  space: " ",
  period: ".",
  comma: ",",
  semicolon: ";",
  quote: "'",
  slash: "/",
  backslash: "\\",
  hyphen: "-",
  minus: "-",
  equals: "=",
  plus: "+",
  leftbrace: "[",
  rightbrace: "]",
  leftbracket: "[",
  rightbracket: "]",
};

/** Drop legacy/SGR mouse tracking bytes that leak into transmit when TTY modes desync. */
export function isSpuriousTerminalInput(ch: string, key: LineEditorKey): boolean {
  const full = key.full ?? "";
  if (full.includes("\x1b[M") || full.includes("\x1b[<")) return true;
  if (ch.includes("\x1b[M") || ch.includes("\x1b[<")) return true;
  if (ch.length >= 6 && /^[\x1b\[MCGF@.,:/\-\d^]+$/i.test(ch)) return true;
  return false;
}

/** Resolve a single printable character from a key event (incl. punctuation). */
export function resolveInsertChar(key: LineEditorKey): string | null {
  const { name, shift, meta, ctrl } = parseKeyModifiers(key);
  if (meta || ctrl) return null;

  const ch = key.ch ?? "";
  if (isSpuriousTerminalInput(ch, key)) return null;
  if (ch.length === 1 && !/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)) {
    return ch;
  }

  if (name === "slash") {
    return shift ? "?" : "/";
  }

  if (shift && SHIFTED_SLASH.has(name)) {
    return SHIFTED_SLASH.get(name) ?? null;
  }

  const named = NAMED_KEY_CHARS[name];
  if (named) return named;

  if (name.length === 1 && !/^[\x00-\x1f\x7f]$/.test(name)) {
    return name;
  }

  return null;
}

/** Map terminal key events to editor actions (macOS + cross-platform). */
export function resolveLineEditorKey(key: LineEditorKey): LineEditorKeyAction {
  const { name, shift, meta, ctrl } = parseKeyModifiers(key);

  if (isSpuriousTerminalInput(key.ch ?? "", key)) return { type: "noop" };

  if (name === "enter" || name === "return") return { type: "submit" };

  if (name === "backspace") {
    // ⌘⌫ (Command+Delete) — delete to beginning of line when Command reports as meta.
    if (meta) return { type: "kill-to-start" };
    if (ctrl && !shift) return { type: "delete-word-backward" };
    return { type: "delete-backward" };
  }

  if (name === "delete" || name === "S-delete" || name === "C-delete") {
    // ⌘⌦ (Command+Forward Delete) — delete through end of line.
    if (meta) return { type: "kill-to-end" };
    return { type: "delete-forward" };
  }

  if (ctrl && name === "u") return { type: "kill-line" };
  // macOS Terminal maps ⌘← / ⌘→ to Ctrl+A / Ctrl+E (readline home/end) — not select-all.
  if (ctrl && name === "a") return { type: "move-line-start", extend: shift };
  if ((ctrl || meta) && name === "v") return { type: "paste" };
  if ((ctrl || meta) && name === "c") return { type: "noop" };
  if ((ctrl || meta) && name === "x") return { type: "noop" };
  if (ctrl && name === "e") return { type: "move-line-end", extend: shift };
  if (ctrl && name === "k") return { type: "kill-to-end" };
  if (ctrl && name === "w") return { type: "delete-word-backward" };
  // Option+a (explicit meta+a key) — select all; distinct from ⌘← byte stream on macOS.
  if (meta && !ctrl && name === "a") return { type: "select-all" };

  if (name === "left") {
    // ⇧⌘← — select to line start (some terminals send Ctrl+Shift+arrow).
    if (ctrl && shift) return { type: "move-line-start", extend: true };
    // ⇧⌥← — select word left.
    if (meta && shift) return { type: "move-word-left", extend: true };
    // ⌥← — word left (M-left).
    if (meta) return { type: "move-word-left", extend: false };
    // Ctrl+← — word left on Linux/Windows terminals.
    if (ctrl) return { type: "move-word-left", extend: false };
    return { type: "move-char-left", extend: shift };
  }

  if (name === "right") {
    if (ctrl && shift) return { type: "move-line-end", extend: true };
    if (meta && shift) return { type: "move-word-right", extend: true };
    if (meta) return { type: "move-word-right", extend: false };
    if (ctrl) return { type: "move-word-right", extend: false };
    return { type: "move-char-right", extend: shift };
  }

  if (name === "home") {
    return { type: "move-line-start", extend: shift };
  }

  if (name === "end") {
    return { type: "move-line-end", extend: shift };
  }

  // macOS Option+arrow often emits readline M-b / M-f (word motion), not arrow keys.
  if (meta && name === "b") {
    return { type: "move-word-left", extend: shift };
  }

  if (meta && name === "f") {
    return { type: "move-word-right", extend: shift };
  }

  const insertChar = resolveInsertChar(key);
  if (insertChar) {
    return { type: "insert", char: insertChar };
  }

  return { type: "noop" };
}

export function applyLineEditorAction(
  state: LineEditorState,
  action: LineEditorKeyAction,
): LineEditorState {
  const extend = action.extend ?? false;
  switch (action.type) {
    case "insert":
      return insertText(state, action.char ?? "");
    case "delete-backward":
      return deleteBackward(state);
    case "delete-forward":
      return deleteForward(state);
    case "delete-word-backward":
      return deleteWordBackward(state);
    case "delete-word-forward":
      return deleteWordForward(state);
    case "kill-to-end":
      return killToEnd(state);
    case "kill-to-start":
      return killToStart(state);
    case "kill-line":
      return killLine(state);
    case "move-char-left":
      return moveCharLeft(state, extend);
    case "move-char-right":
      return moveCharRight(state, extend);
    case "move-word-left":
      return moveWordLeft(state, extend);
    case "move-word-right":
      return moveWordRight(state, extend);
    case "move-line-start":
      return moveLineStart(state, extend);
    case "move-line-end":
      return moveLineEnd(state, extend);
    case "select-all":
      return selectAll(state);
    default:
      return state;
  }
}

export interface LineEditorView {
  content: string;
  cursorColumn: number;
}

export interface RenderLineEditorOptions {
  selectionTag?: string;
  selectionEndTag?: string;
  /** Draw a block cursor at the caret (for box widgets without readInput). */
  showCursor?: boolean;
  cursorChar?: string;
}

/** Render visible slice with optional pink inverse selection. */
export function renderLineEditorView(
  state: LineEditorState,
  viewWidth: number,
  selectionTagOrOptions: string | RenderLineEditorOptions = "{#ec4899-fg}{inverse}",
  selectionEndTag = "{/}{/}",
): LineEditorView {
  const options: RenderLineEditorOptions =
    typeof selectionTagOrOptions === "string"
      ? { selectionTag: selectionTagOrOptions, selectionEndTag }
      : selectionTagOrOptions;
  const selTag = options.selectionTag ?? "{#ec4899-fg}{inverse}";
  const selEndTag = options.selectionEndTag ?? "{/}{/}";
  const cursorChar = options.cursorChar ?? "▌";
  const width = Math.max(8, viewWidth);
  const range = getSelectionRange(state);
  const start = lineEditorViewScrollStart(state, width);
  const end = Math.min(state.text.length, start + width);
  const slice = state.text.slice(start, end);

  let content = "";
  for (let i = 0; i < slice.length; i++) {
    const abs = start + i;
    if (options.showCursor && abs === state.cursor) {
      content += `{inverse}${cursorChar}{/inverse}`;
    }
    const ch = slice[i] ?? "";
    const selected = range && abs >= range.start && abs < range.end;
    content += selected ? `${selTag}${ch}${selEndTag}` : ch;
  }
  if (options.showCursor && state.cursor === end) {
    content += `{inverse}${cursorChar}{/inverse}`;
  }

  return { content, cursorColumn: state.cursor - start };
}