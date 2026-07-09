import type blessed from "blessed";

import { readClipboard } from "../session/tui-snapshot.js";
import { createModalKeypress, type BlessedKey } from "./modal-keypress.js";
import {
  applyLineEditorAction,
  createLineEditorState,
  insertText,
  renderLineEditorView,
  resolveInsertChar,
  resolveLineEditorKey,
  type LineEditorState,
} from "./line-editor.js";

type InputBoxElement = blessed.Widgets.BoxElement & {
  emit: (event: string, ...args: unknown[]) => boolean;
  width: number;
};

export interface BlessedLineEditorHandle {
  getText: () => string;
  setText: (text: string) => void;
  clear: () => void;
  getState: () => LineEditorState;
}

export interface BlessedLineEditorOptions {
  onChange?: (text: string) => void;
  /** `?` on an empty field — show hotkeys instead of inserting. */
  onHotkeyHelp?: () => void;
}

/**
 * Transmit row editor — plain box + program-level key capture.
 * Avoids blessed textbox/textarea (typing `e` or Ctrl+E spawns `$EDITOR` / vi).
 */
export function attachBlessedLineEditor(
  input: blessed.Widgets.BoxElement,
  screen: blessed.Widgets.Screen,
  options: BlessedLineEditorOptions = {},
): BlessedLineEditorHandle {
  const box = input as InputBoxElement;
  let state = createLineEditorState("");
  let captureActive = false;
  let focused = false;
  const modalKeys = createModalKeypress(screen);

  const innerWidth = (): number => Math.max(8, ((box.width as number) || 80) - 4);

  const render = (): void => {
    const view = renderLineEditorView(state, innerWidth(), { showCursor: focused });
    box.setContent(view.content.length > 0 ? ` ${view.content}` : " ");
    screen.render();
    options.onChange?.(state.text);
  };

  const handleKeypress = (ch: string, key: BlessedKey): void => {
    if (!captureActive || !focused) return;

    // History / slash / exit layers handle these on the transmit element.
    if (key.name === "escape" || key.name === "up" || key.name === "down") {
      return;
    }

    const insertChar = resolveInsertChar({ ...key, ch });
    if (
      insertChar === "?" &&
      state.text.length === 0 &&
      options.onHotkeyHelp
    ) {
      options.onHotkeyHelp();
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
    render();
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