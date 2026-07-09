import blessed from "blessed";

import { formatHotkeysOverlay } from "../keybindings.js";
import { THEME } from "../theme.js";

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
    label: " ░ hotkeys ░ ",
    tags: true,
    hidden: true,
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.pink },
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