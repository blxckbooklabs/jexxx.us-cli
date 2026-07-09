import type blessed from "blessed";

import { readClipboard } from "../session/tui-snapshot.js";
import {
  applyLineEditorAction,
  createLineEditorState,
  insertText,
  renderLineEditorView,
  resolveLineEditorKey,
  type LineEditorState,
} from "./line-editor.js";

type BlessedKey = {
  name?: string;
  shift?: boolean;
  meta?: boolean;
  ctrl?: boolean;
};

type TextboxElement = blessed.Widgets.TextboxElement & {
  __listener?: (ch: string, key: BlessedKey) => void;
  _listener: (ch: string, key: BlessedKey) => void;
  _done?: (err: unknown, value: string | null) => void;
  _reading?: boolean;
  _value?: string;
  value: string;
  ileft: number;
  iright: number;
  iwidth: number;
  itop: number;
  width: number;
  _updateCursor: (get?: boolean) => void;
};

export interface BlessedLineEditorHandle {
  getText: () => string;
  setText: (text: string) => void;
  clear: () => void;
  getState: () => LineEditorState;
}

export interface BlessedLineEditorOptions {
  onChange?: (text: string) => void;
}

export function attachBlessedLineEditor(
  input: blessed.Widgets.TextboxElement,
  screen: blessed.Widgets.Screen,
  options: BlessedLineEditorOptions = {},
): BlessedLineEditorHandle {
  const box = input as TextboxElement;
  let state = createLineEditorState(box.getValue() ?? "");

  const innerWidth = (): number =>
    Math.max(8, ((box.width as number) || 80) - (box.iwidth || 0) - 2);

  const positionCursor = (column: number): void => {
    const coords = (box as { _getCoords?: () => { xi: number; yi: number } })._getCoords?.();
    if (!coords) return;
    const program = screen.program as {
      y: number;
      x: number;
      cup: (y: number, x: number) => void;
      cuf: (n: number) => void;
      cub: (n: number) => void;
    };
    const cy = coords.yi + (box.itop || 0);
    const cx = coords.xi + (box.ileft || 0) + column;
    if (cy === program.y) {
      if (cx > program.x) program.cuf(cx - program.x);
      else if (cx < program.x) program.cub(program.x - cx);
    } else {
      program.cup(cy, cx);
    }
  };

  const syncBlessedValue = (): void => {
    box.value = state.text;
    box._value = state.text;
  };

  const render = (): void => {
    syncBlessedValue();
    const view = renderLineEditorView(state, innerWidth());
    box.setContent(view.content);
    box._updateCursor?.();
    positionCursor(view.cursorColumn);
    screen.render();
    options.onChange?.(state.text);
  };

  const editorListener = (ch: string, key: BlessedKey): void => {
    if (key.name === "escape") {
      box._done?.(null, null);
      return;
    }

    const action = resolveLineEditorKey({ ...key, ch });
    if (action.type === "submit") {
      box._done?.(null, state.text);
      return;
    }
    if (action.type === "paste") {
      void readClipboard().then((clip) => {
        const normalized = clip.replace(/\r?\n/g, " ").replace(/\t/g, " ");
        if (!normalized) return;
        state = insertText(state, normalized);
        render();
      });
      return;
    }
    if (action.type === "noop") return;

    state = applyLineEditorAction(state, action);
    render();
  };

  const installListener = (): void => {
    if (!box._reading) return;
    if (box.__listener) {
      box.removeListener("keypress", box.__listener);
    }
    box.__listener = editorListener;
    box.on("keypress", editorListener);
  };

  box.on("focus", () => {
    setImmediate(() => setImmediate(installListener));
  });

  if (box._reading) {
    installListener();
  }

  return {
    getText: () => state.text,
    setText(text: string) {
      state = createLineEditorState(text);
      render();
    },
    clear() {
      state = createLineEditorState("");
      render();
    },
    getState: () => state,
  };
}