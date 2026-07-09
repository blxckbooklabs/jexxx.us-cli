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

export interface LineEditorKeyAction {
  readonly type:
    | "noop"
    | "insert"
    | "delete-backward"
    | "delete-forward"
    | "delete-word-backward"
    | "delete-word-forward"
    | "kill-to-end"
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

/** Map terminal key events to editor actions (macOS + cross-platform). */
export function resolveLineEditorKey(key: LineEditorKey): LineEditorKeyAction {
  const { name, shift, meta, ctrl } = parseKeyModifiers(key);

  if (name === "enter" || name === "return") return { type: "submit" };

  if (name === "backspace") {
    if (meta || (ctrl && !shift)) return { type: "delete-word-backward" };
    return { type: "delete-backward" };
  }

  if (name === "delete" || name === "S-delete" || name === "C-delete") {
    if (meta) return { type: "delete-word-forward" };
    return { type: "delete-forward" };
  }

  if (ctrl && name === "a") return { type: "select-all" };
  if ((ctrl || meta) && name === "v") return { type: "paste" };
  if ((ctrl || meta) && name === "c") return { type: "noop" };
  if ((ctrl || meta) && name === "x") return { type: "noop" };
  if (ctrl && name === "e") return { type: "move-line-end", extend: false };
  if (ctrl && name === "k") return { type: "kill-to-end" };
  if (ctrl && name === "w") return { type: "delete-word-backward" };
  if (meta && name === "a") return { type: "select-all" };

  if (name === "left") {
    if (meta && shift) return { type: "move-word-left", extend: true };
    if (meta) return { type: "move-word-left", extend: false };
    if (ctrl && shift) return { type: "move-word-left", extend: true };
    if (ctrl) return { type: "move-word-left", extend: false };
    return { type: "move-char-left", extend: shift };
  }

  if (name === "right") {
    if (meta && shift) return { type: "move-word-right", extend: true };
    if (meta) return { type: "move-word-right", extend: false };
    if (ctrl && shift) return { type: "move-word-right", extend: true };
    if (ctrl) return { type: "move-word-right", extend: false };
    return { type: "move-char-right", extend: shift };
  }

  if (name === "home" || (meta && name === "b")) {
    return { type: "move-line-start", extend: shift };
  }

  if (name === "end" || (meta && name === "f")) {
    return { type: "move-line-end", extend: shift };
  }

  if (key.ch && !ctrl && !meta && key.ch.length === 1 && !/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(key.ch)) {
    return { type: "insert", char: key.ch };
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

/** Render visible slice with optional pink inverse selection. */
export function renderLineEditorView(
  state: LineEditorState,
  viewWidth: number,
  selectionTag = "{#ec4899-fg}{inverse}",
  selectionEndTag = "{/}{/}",
): LineEditorView {
  const width = Math.max(8, viewWidth);
  const range = getSelectionRange(state);
  let start = 0;
  if (state.text.length > width) {
    start = Math.max(0, Math.min(state.cursor - Math.floor(width * 0.4), state.text.length - width));
  }
  const end = Math.min(state.text.length, start + width);
  const slice = state.text.slice(start, end);

  let content = "";
  for (let i = 0; i < slice.length; i++) {
    const abs = start + i;
    const ch = slice[i] ?? "";
    const selected = range && abs >= range.start && abs < range.end;
    content += selected ? `${selectionTag}${ch}${selectionEndTag}` : ch;
  }

  return { content, cursorColumn: state.cursor - start };
}