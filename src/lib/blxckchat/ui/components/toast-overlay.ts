import blessed from "blessed";

import { dismissSlashMenuBeforeOverlay } from "../menu-mutex.js";
import { THEME } from "../theme.js";

export type ToastVariant = "info" | "error";

export interface ToastOverlayHandle {
  show: (message: string, variant?: ToastVariant) => void;
  hide: () => void;
  isVisible: () => boolean;
}

const TOAST_MS = 4000;

export function createToastOverlay(screen: blessed.Widgets.Screen): ToastOverlayHandle {
  let visible = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const box = blessed.box({
    parent: screen,
    top: 2,
    right: 2,
    width: 32,
    height: 3,
    border: { type: "line" },
    tags: true,
    hidden: true,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.cyan },
    },
  });

  const hide = (): void => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    box.hide();
    visible = false;
    screen.render();
  };

  return {
    show(message, variant = "info") {
      dismissSlashMenuBeforeOverlay();
      const border = variant === "error" ? THEME.error : THEME.cyan;
      box.style.border = { fg: border };
      const clipped =
        message.length > 120 ? `${message.slice(0, 117)}…` : message;
      box.setContent(`{#67e8f9-fg}${escapeToast(clipped)}{/}`);
      box.setFront();
      box.show();
      visible = true;
      screen.render();
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, TOAST_MS);
    },
    hide,
    isVisible() {
      return visible;
    },
  };
}

function escapeToast(text: string): string {
  return text.replace(/\{/g, "{open}").replace(/\}/g, "{close}");
}