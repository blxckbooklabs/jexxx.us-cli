import blessed from "blessed";

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

  const box = blessed.textbox({
    parent: screen,
    top: 2,
    left: 1,
    width: "100%-2",
    height: 3,
    border: { type: "line" },
    label: " ░ search ░ ",
    tags: true,
    hidden: true,
    inputOnFocus: true,
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.cyan },
      focus: { border: { fg: THEME.pinkGlow } },
    },
  });

  const close = (): void => {
    box.hide();
    visible = false;
    screen.render();
  };

  box.on("submit", (value: string) => {
    onSearch(value.trim());
    close();
  });

  box.key(["escape", "C-c"], () => close());

  return {
    open() {
      box.setValue("");
      box.show();
      box.focus();
      visible = true;
      screen.render();
    },
    close,
    isVisible() {
      return visible;
    },
    getQuery() {
      return box.getValue();
    },
  };
}