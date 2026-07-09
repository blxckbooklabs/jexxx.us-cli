import blessed from "blessed";

import { releaseOverlayFocus, takeOverlayFocus } from "../editor/overlay-focus.js";
import { readClipboard } from "../session/tui-snapshot.js";
import { THEME } from "../theme.js";

export interface PromptOverlayOptions {
  title: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  secret?: boolean;
  height?: number;
}

export interface PromptOverlayHandle {
  ask: (options: PromptOverlayOptions) => Promise<string | null>;
  isVisible: () => boolean;
  cancel: () => void;
}

type BlessedKey = {
  name?: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  ch?: string;
};

const MASK_CHAR = "•";

function isPasteKey(key: BlessedKey): boolean {
  return (
    ((key.meta || key.ctrl) && key.name === "v") ||
    (key.name === "p" && !key.ctrl && !key.meta) ||
    (key.name === "insert" && Boolean(key.shift))
  );
}

function isPrintable(ch: string, key: BlessedKey): boolean {
  return (
    Boolean(ch) &&
    ch.length === 1 &&
    !key.ctrl &&
    !key.meta &&
    !/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)
  );
}

/**
 * Plain blessed box for prompt input — avoids textbox readInput/focus bugs that
 * steal paste from the transmit row underneath.
 */
export function createPromptOverlay(screen: blessed.Widgets.Screen): PromptOverlayHandle {
  let visible = false;
  let secretMode = false;
  let buffer = "";
  let resolvePending: ((value: string | null) => void) | null = null;

  const box = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "72%",
    height: 10,
    border: { type: "line" },
    label: " prompt ",
    tags: true,
    hidden: true,
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.pink },
    },
  });

  const hintLine = blessed.box({
    parent: box,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    tags: true,
    content: "",
    style: { fg: THEME.textMuted, bg: THEME.bgElevated },
  });

  const inputArea = blessed.box({
    parent: box,
    top: 1,
    left: 0,
    width: "100%-2",
    height: 3,
    border: { type: "line" },
    label: " value ",
    tags: true,
    keys: true,
    mouse: false,
    style: {
      fg: THEME.text,
      bg: THEME.bgInset,
      border: { fg: THEME.cyan },
      focus: { border: { fg: THEME.pinkGlow } },
    },
  });

  const footer = blessed.box({
    parent: box,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    tags: true,
    content: "",
    style: { fg: THEME.textDim, bg: THEME.bgElevated },
  });

  const render = (status?: string): void => {
    const display = secretMode
      ? buffer.length > 0
        ? MASK_CHAR.repeat(buffer.length)
        : ""
      : buffer;
    inputArea.setContent(display || " ");
    const count = `${buffer.length} char${buffer.length === 1 ? "" : "s"}`;
    const pasteHint = secretMode ? "⌘V or P paste" : "⌘V paste";
    setFooter(
      status
        ? `${status} · ${count} · Enter save · Esc cancel`
        : `${pasteHint} · ${count} · Enter save · Esc cancel`,
    );
    screen.render();
  };

  const setFooter = (message: string): void => {
    footer.setContent(`{gray-fg}${message}{/gray-fg}`);
  };

  const appendText = (text: string, status?: string): void => {
    if (!text) return;
    buffer += text;
    render(status);
  };

  const pasteFromClipboard = async (): Promise<void> => {
    const clip = await readClipboard();
    const normalized = clip.replace(/\r?\n/g, "").replace(/\t/g, "").trim();
    if (!normalized) {
      render("Clipboard empty — copy key first");
      return;
    }
    appendText(normalized, `Pasted ${normalized.length} chars`);
  };

  const finish = (value: string | null): void => {
    visible = false;
    box.hide();
    releaseOverlayFocus(screen);
    screen.render();
    const resolve = resolvePending;
    resolvePending = null;
    resolve?.(value);
  };

  const handleKeypress = (ch: string, key: BlessedKey): void => {
    if (!visible) return;

    if (isPasteKey(key)) {
      void pasteFromClipboard();
      return;
    }

    if (key.name === "enter" || key.name === "return") {
      finish(buffer.trim());
      return;
    }

    if (key.name === "escape") {
      finish(null);
      return;
    }

    if (key.name === "backspace") {
      buffer = buffer.slice(0, -1);
      render();
      return;
    }

    if (isPrintable(ch, key)) {
      buffer += ch;
      render();
    }
  };

  inputArea.on("keypress", handleKeypress);

  inputArea.key(["enter", "C-m"], () => {
    if (!visible) return;
    finish(buffer.trim());
  });

  inputArea.key(["escape", "C-c"], () => {
    if (!visible) return;
    finish(null);
  });

  inputArea.key(["C-v", "M-v", "p", "P", "S-insert"], () => {
    if (!visible) return;
    void pasteFromClipboard();
  });

  return {
    ask(options) {
      return new Promise((resolve) => {
        resolvePending = resolve;
        secretMode = Boolean(options.secret);
        buffer = options.defaultValue ?? "";

        box.setLabel(` ${options.title} `);
        inputArea.setLabel(` ${options.label} `);
        hintLine.setContent(
          options.hint ? `{gray-fg}${options.hint}{/gray-fg}` : "",
        );
        box.height = options.height ?? (options.hint ? 11 : 9);

        box.setFront();
        box.show();
        takeOverlayFocus(screen, inputArea);
        visible = true;
        render();
      });
    },
    isVisible() {
      return visible;
    },
    cancel() {
      if (visible) finish(null);
    },
  };
}