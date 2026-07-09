import blessed from "blessed";

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

type PromptTextbox = blessed.Widgets.TextboxElement & {
  value: string;
  _value?: string;
  secret?: boolean;
  censor?: boolean;
  _updateCursor?: (get?: boolean) => void;
};

const MASK_CHAR = "•";

function isPasteKey(key: { name?: string; meta?: boolean; ctrl?: boolean; shift?: boolean }): boolean {
  return (
    ((key.meta || key.ctrl) && key.name === "v") ||
    (key.name === "insert" && Boolean(key.shift))
  );
}

export function createPromptOverlay(screen: blessed.Widgets.Screen): PromptOverlayHandle {
  let visible = false;
  let secretMode = false;
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

  const input = blessed.textbox({
    parent: box,
    top: 1,
    left: 0,
    width: "100%-2",
    height: 3,
    border: { type: "line" },
    label: " value ",
    tags: true,
    inputOnFocus: true,
    style: {
      fg: THEME.text,
      bg: THEME.bgInset,
      border: { fg: THEME.cyan },
      focus: { border: { fg: THEME.pinkGlow } },
    },
  }) as PromptTextbox;

  const footer = blessed.box({
    parent: box,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    tags: true,
    content: "{gray-fg}Enter confirm · Esc cancel{/gray-fg}",
    style: { fg: THEME.textDim, bg: THEME.bgElevated },
  });

  const getRawValue = (): string => input.value ?? input.getValue() ?? "";

  const setRawValue = (value: string): void => {
    input.value = value;
    input._value = value;
  };

  const setFooter = (message: string): void => {
    footer.setContent(`{gray-fg}${message}{/gray-fg}`);
  };

  const syncMaskedView = (status?: string): void => {
    const len = getRawValue().length;
    input.setContent(len > 0 ? MASK_CHAR.repeat(len) : "");
    const count = `{bold}${len}{/bold} char${len === 1 ? "" : "s"} masked`;
    setFooter(
      status
        ? `${status} · ${count} · Enter confirm · Esc cancel`
        : `⌘V paste · ${count} · Enter confirm · Esc cancel`,
    );
    input._updateCursor?.();
    screen.render();
  };

  const syncPlainView = (status?: string): void => {
    const value = getRawValue();
    input.setValue(value);
    setFooter(
      status
        ? `${status} · Enter confirm · Esc cancel · ⌘V paste`
        : "Enter confirm · Esc cancel · ⌘V paste",
    );
    screen.render();
  };

  const refreshView = (status?: string): void => {
    if (secretMode) syncMaskedView(status);
    else syncPlainView(status);
  };

  const pasteFromClipboard = async (): Promise<void> => {
    const clip = await readClipboard();
    const normalized = clip.replace(/\r?\n/g, "").replace(/\t/g, "").trim();
    if (!normalized) {
      refreshView("Clipboard empty");
      return;
    }
    const next = getRawValue() + normalized;
    setRawValue(next);
    refreshView(`Pasted ${normalized.length} char${normalized.length === 1 ? "" : "s"}`);
  };

  const finish = (value: string | null): void => {
    box.hide();
    visible = false;
    screen.render();
    const resolve = resolvePending;
    resolvePending = null;
    resolve?.(value);
  };

  input.on("keypress", (_ch, key) => {
    if (!visible) return;
    if (isPasteKey(key)) {
      void pasteFromClipboard();
      return;
    }
    if (secretMode) {
      setImmediate(() => syncMaskedView());
    }
  });

  input.key(["C-v", "M-v", "S-insert"], () => {
    if (!visible || screen.focused !== input) return;
    void pasteFromClipboard();
  });

  input.on("submit", (value: string) => finish(value.trim()));

  input.key(["escape", "C-c"], () => finish(null));

  return {
    ask(options) {
      return new Promise((resolve) => {
        resolvePending = resolve;
        secretMode = Boolean(options.secret);
        box.setLabel(` ${options.title} `);
        input.setLabel(` ${options.label} `);
        hintLine.setContent(
          options.hint ? `{gray-fg}${options.hint}{/gray-fg}` : "",
        );
        box.height = options.height ?? (options.hint ? 11 : 9);

        // Blessed `secret: true` renders nothing — use manual bullet masking.
        input.secret = false;
        input.censor = false;

        const initial = options.defaultValue ?? "";
        setRawValue(initial);
        refreshView();

        box.setFront();
        box.show();
        input.focus();
        visible = true;
        screen.render();
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