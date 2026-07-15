import blessed from "blessed";

import {
  createModalLineInput,
  insertModalLinePaste,
  isPasteKey,
  type ModalLineInputHandle,
} from "../editor/modal-line-input.js";
import { releaseOverlayFocus, takeOverlayFocus } from "../editor/overlay-focus.js";
import {
  normalizeSecretClipboardPaste,
  readClipboardRobust,
} from "../session/tui-snapshot.js";
import { isSecretPromptPasteKey } from "../secret-prompt-input.js";
import { isSlashPopupMouseEnabled } from "../tty.js";
import { dismissSlashMenuBeforeOverlay } from "../menu-mutex.js";
import { THEME } from "../theme.js";
import type { BlessedKey } from "../editor/modal-keypress.js";

/**
 * Bracketed paste mode sequences.
 * Modern terminals wrap pasted text in \x1b[200~...\x1b[201~ markers.
 * blessed 0.1.81 does not parse these, which can cause character loss on paste.
 */
const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

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

type BlessedProgram = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
};

function programOf(screen: blessed.Widgets.Screen): BlessedProgram {
  return screen.program as unknown as BlessedProgram;
}

/**
 * Modal prompt — captures keys at the program level while open so paste/typing
 * never falls through to the transmit row underneath.
 */
export function createPromptOverlay(screen: blessed.Widgets.Screen): PromptOverlayHandle {
  let visible = false;
  let secretMode = false;
  let input: ModalLineInputHandle = createModalLineInput();
  let resolvePending: ((value: string | null) => void) | null = null;
  let onProgramKeypress: ((ch: string, key: BlessedKey) => void) | null = null;
  let onProgramPaste: (() => void) | null = null;
  /** Dedup flag — prevents double paste when both "keypress" and "key C-v" fire. */
  let pasteInFlight = false;

  const mouseEnabled = isSlashPopupMouseEnabled();

  /** Disable bracketed paste mode so raw characters arrive cleanly. */
  const disableBracketedPaste = (): void => {
    if (!process.stdout.isTTY) return;
    process.stdout.write("\x1b[?2004l");
  };

  /** Re-enable bracketed paste mode when overlay closes. */
  const enableBracketedPaste = (): void => {
    if (!process.stdout.isTTY) return;
    process.stdout.write("\x1b[?2004h");
  };

  /** Read clipboard and insert into the input field (with dedup). */
  const pasteFromClipboard = async (): Promise<void> => {
    if (pasteInFlight) return;
    pasteInFlight = true;
    try {
      render("Reading clipboard…");
      const clip = await readClipboardRobust();
      const normalized = normalizeSecretClipboardPaste(clip);
      if (!normalized) {
        render("Clipboard empty — copy text first, then ⌘V");
        return;
      }
      insertModalLinePaste(input, normalized);
      render(`Pasted ${normalized.length} chars`);
    } finally {
      pasteInFlight = false;
    }
  };

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

  const inputViewWidth = (): number =>
    Math.max(8, ((inputArea.width as number) || 60) - 4);

  const setFooter = (message: string): void => {
    footer.setContent(`{gray-fg}${message}{/gray-fg}`);
  };

  const render = (status?: string): void => {
    inputArea.setContent(input.formatDisplay(inputViewWidth()));
    const count = `${input.getText().length} char${input.getText().length === 1 ? "" : "s"}`;
    const editHint = "⌥←→ word · ⌥⇧←→ select · ⌥⌫ delete word";
    const pasteHint = secretMode ? "⌘V or P paste" : "⌘V paste";
    setFooter(
      status
        ? `${status} · ${count} · Enter save · Esc cancel`
        : `${pasteHint} · ${editHint} · ${count} · Enter · Esc`,
    );
    screen.render();
  };

  const focusInput = (): void => {
    inputArea.focus();
    screen.grabKeys = true;
    screen.render();
  };

  const handleKeypress = (ch: string, key: BlessedKey): void => {
    if (!visible) return;

    if (key.name === "escape") {
      finish(null);
      return;
    }

    // In secret mode, treat "p" (no ctrl/meta) as a paste trigger since most
    // terminals intercept Cmd+V on macOS and it never reaches blessed.
    if (secretMode && isSecretPromptPasteKey(ch, key)) {
      void pasteFromClipboard();
      return;
    }

    const result = input.handleKey(ch, key);
    if (result.action === "paste-request") {
      void pasteFromClipboard();
      return;
    }
    if (result.action === "submit") {
      finish(input.getText().trim());
      return;
    }
    if (result.action === "updated") {
      render();
    }
  };

  const startModalCapture = (): void => {
    stopModalCapture();
    disableBracketedPaste();
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
    enableBracketedPaste();
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
      render("Focused — ⌘V to paste");
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
        input = createModalLineInput(options.defaultValue ?? "", {
          mask: secretMode,
        });

        box.setLabel(` ${options.title} `);
        inputArea.setLabel(` ${options.label} `);
        hintLine.setContent(
          options.hint ? `{gray-fg}${options.hint}{/gray-fg}` : "",
        );
        box.height = options.height ?? (options.hint ? 11 : 9);

        dismissSlashMenuBeforeOverlay();
        box.setFront();
        box.show();
        takeOverlayFocus(screen, inputArea);
        startModalCapture();
        visible = true;
        render(secretMode ? "Ready — ⌘V to paste API key" : undefined);
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