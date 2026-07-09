import blessed from "blessed";

import {
  createModalLineInput,
  insertModalLinePaste,
  type ModalLineInputHandle,
} from "../editor/modal-line-input.js";
import { createModalKeypress, type BlessedKey } from "../editor/modal-keypress.js";
import { releaseOverlayFocus, takeOverlayFocus } from "../editor/overlay-focus.js";
import { readClipboard } from "../session/tui-snapshot.js";
import { isSlashPopupMouseEnabled } from "../tty.js";
import { THEME } from "../theme.js";

export interface SearchOverlayHandle {
  open: () => void;
  close: () => void;
  isVisible: () => boolean;
  getQuery: () => string;
}

export function createSearchOverlay(
  screen: blessed.Widgets.Screen,
  onSearch: (query: string) => void,
): SearchOverlayHandle {
  let visible = false;
  const searchInput: ModalLineInputHandle = createModalLineInput();
  const mouseEnabled = isSlashPopupMouseEnabled();
  const modalKeys = createModalKeypress(screen);

  const box = blessed.box({
    parent: screen,
    top: 2,
    left: 1,
    width: "100%-2",
    height: 3,
    border: { type: "line" },
    label: " ░ search ░ ",
    tags: true,
    hidden: true,
    keys: true,
    mouse: mouseEnabled,
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.cyan },
      focus: { border: { fg: THEME.pinkGlow } },
    },
  });

  const viewWidth = (): number => Math.max(8, ((box.width as number) || 60) - 4);

  const render = (): void => {
    box.setContent(searchInput.formatDisplay(viewWidth()));
    screen.render();
  };

  const submit = (): void => {
    onSearch(searchInput.getText().trim());
    close();
  };

  const handleKeypress = (ch: string, key: BlessedKey): void => {
    if (!visible) return;

    if (key.name === "escape" || key.name === "C-c") {
      onSearch("");
      close();
      return;
    }

    const result = searchInput.handleKey(ch, key);
    if (result.action === "submit") {
      submit();
      return;
    }
    if (result.action === "paste-request") {
      void readClipboard().then((clip) => {
        insertModalLinePaste(searchInput, clip);
        render();
      });
      return;
    }
    if (result.action === "updated") {
      render();
    }
  };

  const close = (): void => {
    box.hide();
    visible = false;
    searchInput.setText("");
    modalKeys.stop();
    releaseOverlayFocus(screen);
    screen.render();
  };

  if (mouseEnabled) {
    box.on("click", () => {
      if (!visible) return;
      box.focus();
      screen.render();
    });
    screen.enableMouse(box);
  }

  return {
    open() {
      searchInput.setText("");
      box.setFront();
      box.show();
      takeOverlayFocus(screen, box);
      modalKeys.start(handleKeypress);
      visible = true;
      render();
    },
    close,
    isVisible() {
      return visible;
    },
    getQuery() {
      return searchInput.getText();
    },
  };
}