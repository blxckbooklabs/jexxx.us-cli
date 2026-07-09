import blessed from "blessed";

import { formatHotkeysOverlay } from "../keybindings.js";

export interface HotkeysOverlayHandle {
  toggle: () => void;
  hide: () => void;
  isVisible: () => boolean;
}

export function createHotkeysOverlay(
  screen: blessed.Widgets.Screen,
): HotkeysOverlayHandle {
  let visible = false;

  const overlay = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "85%",
    height: 22,
    border: { type: "line" },
    label: " Hotkeys ",
    tags: true,
    hidden: true,
    style: {
      fg: "white",
      bg: "#111111",
      border: { fg: "#ec4899" },
    },
    content: formatHotkeysOverlay(),
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    scrollable: true,
    keys: true,
  });

  const hide = (): void => {
    overlay.hide();
    visible = false;
    screen.render();
  };

  overlay.key(["escape", "?", "q", "C-c", "C-d"], () => {
    hide();
  });

  return {
    toggle() {
      if (visible) {
        hide();
      } else {
        overlay.setContent(formatHotkeysOverlay());
        overlay.show();
        overlay.focus();
        visible = true;
        screen.render();
      }
    },
    hide,
    isVisible() {
      return visible;
    },
  };
}