import blessed from "blessed";

import { attachBlessedPaste } from "../editor/blessed-paste.js";
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

export function createPromptOverlay(screen: blessed.Widgets.Screen): PromptOverlayHandle {
  let visible = false;
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
  });

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

  const finish = (value: string | null): void => {
    box.hide();
    visible = false;
    screen.render();
    const resolve = resolvePending;
    resolvePending = null;
    resolve?.(value);
  };

  attachBlessedPaste(input, screen);

  input.on("submit", (value: string) => finish(value.trim()));

  input.key(["escape", "C-c"], () => finish(null));

  return {
    ask(options) {
      return new Promise((resolve) => {
        resolvePending = resolve;
        box.setLabel(` ${options.title} `);
        input.setLabel(` ${options.label} `);
        hintLine.setContent(
          options.hint ? `{gray-fg}${options.hint}{/gray-fg}` : "",
        );
        box.height = options.height ?? (options.hint ? 11 : 9);
        input.setValue(options.defaultValue ?? "");
        if (options.secret) {
          input.secret = true;
          footer.setContent(
            "{gray-fg}Enter confirm · Esc cancel · ⌘V paste (masked){/gray-fg}",
          );
        } else {
          input.secret = false;
          footer.setContent("{gray-fg}Enter confirm · Esc cancel · ⌘V paste{/gray-fg}");
        }
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