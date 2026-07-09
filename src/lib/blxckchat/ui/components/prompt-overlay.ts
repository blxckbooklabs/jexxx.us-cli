import blessed from "blessed";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { releaseOverlayFocus, takeOverlayFocus } from "../editor/overlay-focus.js";
import { readClipboard } from "../session/tui-snapshot.js";
import { isSlashPopupMouseEnabled } from "../tty.js";
import { THEME } from "../theme.js";

const execFileAsync = promisify(execFile);

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
  full?: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  ch?: string;
};

type BlessedProgram = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
};

const MASK_CHAR = "•";

function programOf(screen: blessed.Widgets.Screen): BlessedProgram {
  return screen.program as unknown as BlessedProgram;
}

function isPasteKey(key: BlessedKey): boolean {
  const full = key.full ?? "";
  return (
    full === "M-v" ||
    full === "C-v" ||
    full === "S-C-v" ||
    ((key.meta || key.ctrl) && key.name === "v") ||
    (key.ctrl && key.shift && key.name === "v") ||
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

/** macOS pasteboard — explicit path; spawn('pbpaste') can fail in some PATH contexts. */
async function readClipboardRobust(): Promise<string> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("/usr/bin/pbpaste", [], {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
      });
      return stdout;
    } catch {
      return readClipboard();
    }
  }
  return readClipboard();
}

/**
 * Modal prompt — captures keys at the program level while open so paste/typing
 * never falls through to the transmit row underneath.
 */
export function createPromptOverlay(screen: blessed.Widgets.Screen): PromptOverlayHandle {
  let visible = false;
  let secretMode = false;
  let buffer = "";
  let resolvePending: ((value: string | null) => void) | null = null;
  let onProgramKeypress: ((ch: string, key: BlessedKey) => void) | null = null;
  let onProgramPaste: (() => void) | null = null;

  const mouseEnabled = isSlashPopupMouseEnabled();

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
    mouse: mouseEnabled,
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

  const setFooter = (message: string): void => {
    footer.setContent(`{gray-fg}${message}{/gray-fg}`);
  };

  const render = (status?: string): void => {
    const display = secretMode
      ? buffer.length > 0
        ? MASK_CHAR.repeat(buffer.length)
        : ""
      : buffer;
    inputArea.setContent(display || " ");
    const count = `${buffer.length} char${buffer.length === 1 ? "" : "s"}`;
    const pasteHint = secretMode ? "Press P to paste (or ⌘V)" : "⌘V paste";
    setFooter(
      status
        ? `${status} · ${count} · Enter save · Esc cancel`
        : `${pasteHint} · ${count} · Enter save · Esc cancel`,
    );
    screen.render();
  };

  const appendText = (text: string, status?: string): void => {
    if (!text) return;
    buffer += text;
    render(status);
  };

  const pasteFromClipboard = async (): Promise<void> => {
    render("Reading clipboard…");
    const clip = await readClipboardRobust();
    const normalized = clip.replace(/\r?\n/g, "").replace(/\t/g, "").trim();
    if (!normalized) {
      render("Clipboard empty — copy API key first, then press P");
      return;
    }
    buffer += normalized;
    render(`Pasted ${normalized.length} chars`);
  };

  const focusInput = (): void => {
    inputArea.focus();
    screen.grabKeys = true;
    screen.render();
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

  const startModalCapture = (): void => {
    stopModalCapture();
    const program = programOf(screen);

    onProgramKeypress = (ch: unknown, key: unknown) => {
      handleKeypress(String(ch ?? ""), (key ?? {}) as BlessedKey);
    };
    onProgramPaste = () => {
      if (!visible) return;
      void pasteFromClipboard();
    };

    program.on("keypress", onProgramKeypress as (...args: unknown[]) => void);
    program.on("key C-v", onProgramPaste);
    program.on("key M-v", onProgramPaste);
    program.on("key S-C-v", onProgramPaste);

    screen.grabKeys = true;
  };

  const stopModalCapture = (): void => {
    const program = programOf(screen);
    if (onProgramKeypress) {
      program.removeListener("keypress", onProgramKeypress as (...args: unknown[]) => void);
      onProgramKeypress = null;
    }
    if (onProgramPaste) {
      program.removeListener("key C-v", onProgramPaste);
      program.removeListener("key M-v", onProgramPaste);
      program.removeListener("key S-C-v", onProgramPaste);
      onProgramPaste = null;
    }
    screen.grabKeys = false;
  };

  const finish = (value: string | null): void => {
    visible = false;
    stopModalCapture();
    box.hide();
    releaseOverlayFocus(screen);
    screen.render();
    const resolve = resolvePending;
    resolvePending = null;
    resolve?.(value);
  };

  const wireClickFocus = (el: blessed.Widgets.Node): void => {
    if (!mouseEnabled) return;
    el.on("click", () => {
      if (!visible) return;
      focusInput();
      render("Focused — press P to paste");
    });
  };

  wireClickFocus(box);
  wireClickFocus(inputArea);

  if (mouseEnabled) {
    screen.enableMouse(box);
    screen.enableMouse(inputArea);
  }

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
        startModalCapture();
        visible = true;
        render(secretMode ? "Ready — press P to paste API key" : undefined);
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