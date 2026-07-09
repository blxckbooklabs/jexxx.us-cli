import type blessed from "blessed";

import { readClipboard } from "../session/tui-snapshot.js";
import { createModalKeypress, type BlessedKey } from "./modal-keypress.js";
import {
  applyLineEditorAction,
  createLineEditorState,
  insertText,
  renderLineEditorView,
  resolveLineEditorKey,
  type LineEditorState,
} from "./line-editor.js";

type TextboxElement = blessed.Widgets.TextboxElement & {
  emit: (event: string, ...args: unknown[]) => boolean;
  ileft: number;
  iwidth: number;
  itop: number;
  width: number;
  _updateCursor: (get?: boolean) => void;
  _value?: string;
  value: string;
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

/**
 * Transmit row editor — program-level key capture (not blessed readInput) so
 * macOS ⌥⇧← word select, ⌘⌫ line kill, and paste work reliably.
 */
export function attachBlessedLineEditor(
  input: blessed.Widgets.TextboxElement,
  screen: blessed.Widgets.Screen,
  options: BlessedLineEditorOptions = {},
): BlessedLineEditorHandle {
  const box = input as TextboxElement;
  let state = createLineEditorState(box.getValue() ?? "");
  let captureActive = false;
  let focused = false;
  const modalKeys = createModalKeypress(screen);

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

  const handleKeypress = (ch: string, key: BlessedKey): void => {
    if (!captureActive || !focused) return;

    // History / slash / exit layers handle these on the transmit element.
    if (key.name === "escape" || key.name === "up" || key.name === "down") {
      return;
    }

    const action = resolveLineEditorKey({ ...key, ch });
    if (action.type === "submit") {
      box.emit("submit", state.text);
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

  const startCapture = (): void => {
    if (captureActive) return;
    captureActive = true;
    modalKeys.start(handleKeypress);
    screen.grabKeys = true;
  };

  const stopCapture = (): void => {
    if (!captureActive) return;
    captureActive = false;
    modalKeys.stop();
  };

  box.on("focus", () => {
    focused = true;
    startCapture();
    render();
  });

  box.on("blur", () => {
    focused = false;
    stopCapture();
  });

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