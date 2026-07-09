import blessed from "blessed";

import {
  createModalKeypress,
  isPrintableKey,
  type BlessedKey,
} from "../editor/modal-keypress.js";
import { releaseOverlayFocus, takeOverlayFocus } from "../editor/overlay-focus.js";
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
  let buffer = "";
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

  const render = (): void => {
    const cursor = visible ? "▌" : "";
    box.setContent(buffer ? ` ${buffer}${cursor}` : ` ▌`);
    screen.render();
  };

  const submit = (): void => {
    onSearch(buffer.trim());
    close();
  };

  const handleKeypress = (ch: string, key: BlessedKey): void => {
    if (!visible) return;

    if (key.name === "escape" || key.name === "C-c") {
      onSearch("");
      close();
      return;
    }

    if (key.name === "enter" || key.name === "return") {
      submit();
      return;
    }

    if (key.name === "backspace") {
      buffer = buffer.slice(0, -1);
      render();
      return;
    }

    if (isPrintableKey(ch, key)) {
      buffer += ch;
      render();
    }
  };

  const close = (): void => {
    box.hide();
    visible = false;
    buffer = "";
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
      buffer = "";
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
      return buffer;
    },
  };
}