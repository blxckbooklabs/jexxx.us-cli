import {
  applyLineEditorAction,
  createLineEditorState,
  getSelectionRange,
  insertText,
  renderLineEditorView,
  resolveLineEditorKey,
  type LineEditorKey,
  type LineEditorState,
} from "./line-editor.js";
import type { BlessedKey } from "./modal-keypress.js";

export type ModalLineInputResult =
  | { action: "updated" }
  | { action: "submit" }
  | { action: "noop" }
  | { action: "paste-request" };

export interface ModalLineInputOptions {
  /** Mask characters (API keys). Selection still highlights. */
  mask?: boolean;
  maskChar?: string;
}

export interface ModalLineInputHandle {
  getText: () => string;
  setText: (text: string) => void;
  getState: () => LineEditorState;
  handleKey: (ch: string, key: BlessedKey) => ModalLineInputResult;
  formatDisplay: (viewWidth: number) => string;
  isEditingKey: (ch: string, key: BlessedKey) => boolean;
}

export function isPasteKey(key: BlessedKey): boolean {
  const full = key.full ?? "";
  return (
    full === "M-v" ||
    full === "C-v" ||
    full === "S-C-v" ||
    ((key.meta || key.ctrl) && key.name === "v") ||
    (key.ctrl && key.shift && key.name === "v") ||
    (key.name === "p" && !key.ctrl && !key.meta) ||
    (key.name === "insert" && Boolean(key.shift))
  );
}

/** Single-line field with Google Docs–style shortcuts for modal overlays. */
export function createModalLineInput(
  initial = "",
  options: ModalLineInputOptions = {},
): ModalLineInputHandle {
  let state = createLineEditorState(initial);
  const mask = Boolean(options.mask);
  const maskChar = options.maskChar ?? "•";

  const toLineKey = (ch: string, key: BlessedKey): LineEditorKey => {
    const lineKey: LineEditorKey = { ch };
    if (key.name) lineKey.name = key.name;
    if (key.shift) lineKey.shift = true;
    if (key.meta) lineKey.meta = true;
    if (key.ctrl) lineKey.ctrl = true;
    if (key.full) lineKey.full = key.full;
    return lineKey;
  };

  const resolve = (ch: string, key: BlessedKey) =>
    resolveLineEditorKey(toLineKey(ch, key));

  return {
    getText() {
      return state.text;
    },
    setText(text: string) {
      state = createLineEditorState(text);
    },
    getState() {
      return state;
    },
    isEditingKey(ch: string, key: BlessedKey) {
      if (isPasteKey(key)) return true;
      const action = resolve(ch, key);
      return action.type !== "noop" && action.type !== "submit";
    },
    handleKey(ch: string, key: BlessedKey) {
      if (isPasteKey(key)) {
        return { action: "paste-request" };
      }

      const action = resolve(ch, key);
      if (action.type === "submit") {
        return { action: "submit" };
      }
      if (action.type === "paste") {
        return { action: "paste-request" };
      }
      if (action.type === "noop") {
        return { action: "noop" };
      }

      state = applyLineEditorAction(state, action);
      return { action: "updated" };
    },
    formatDisplay(viewWidth: number) {
      const width = Math.max(8, viewWidth);
      if (mask) {
        return renderMaskedView(state, width, maskChar);
      }
      const view = renderLineEditorView(state, width);
      return view.content.length > 0 ? ` ${view.content}` : " ";
    },
  };
}

/** Insert clipboard text at cursor (replaces selection). */
export function insertModalLinePaste(
  handle: ModalLineInputHandle,
  text: string,
): void {
  const normalized = text.replace(/\r?\n/g, "").replace(/\t/g, " ");
  if (!normalized) return;
  const current = handle.getState();
  handle.setText(insertText(current, normalized).text);
}

function renderMaskedView(
  state: LineEditorState,
  viewWidth: number,
  maskChar: string,
): string {
  const range = getSelectionRange(state);
  let start = 0;
  if (state.text.length > viewWidth) {
    start = Math.max(
      0,
      Math.min(state.cursor - Math.floor(viewWidth * 0.4), state.text.length - viewWidth),
    );
  }
  const end = Math.min(state.text.length, start + viewWidth);

  let content = " ";
  for (let i = start; i < end; i++) {
    const selected = range && i >= range.start && i < range.end;
    content += selected ? `{inverse}${maskChar}{/inverse}` : maskChar;
  }
  return content;
}