import blessed from "blessed";

import type { SlashPopupHandle } from "./slash-popup.js";
import { applySuggestion } from "./slash-popup.js";
import {
  detectSlashInputMode,
  type SlashSuggestion,
} from "../slash/autocomplete.js";

export interface InputBoxHandle {
  element: blessed.Widgets.TextboxElement;
  focus: () => void;
  clear: () => void;
  setValue: (value: string) => void;
  getValue: () => string;
  getHistory: () => string[];
  getPlainText: () => string;
  hideSlashPopup: () => void;
}

export interface InputBoxOptions {
  onUpdate?: () => void;
  onExit?: () => void;
  slashPopup?: SlashPopupHandle;
  getSlashSuggestions?: (value: string) => Promise<SlashSuggestion[]>;
}

export function createInputBox(
  screen: blessed.Widgets.Screen,
  onSubmit: (line: string) => void,
  options: InputBoxOptions = {},
): InputBoxHandle {
  const history: string[] = [];
  let historyIndex = -1;
  let draft = "";
  let slashSuggestions: SlashSuggestion[] = [];
  let slashDebounce: ReturnType<typeof setTimeout> | null = null;

  const input = blessed.textbox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    border: { type: "line" },
    label: " Message ",
    tags: true,
    style: {
      fg: "white",
      bg: "#111111",
      border: { fg: "#ec4899" },
      focus: { border: { fg: "#ec4899" } },
    },
    inputOnFocus: true,
    keys: true,
    mouse: true,
    vi: false,
  });

  const notify = (): void => {
    options.onUpdate?.();
  };

  const hideSlashPopup = (): void => {
    options.slashPopup?.hide();
    slashSuggestions = [];
  };

  const refreshSlashSuggestions = (value: string): void => {
    if (!options.getSlashSuggestions || !options.slashPopup) return;

    const { mode } = detectSlashInputMode(value);
    if (mode === "none") {
      hideSlashPopup();
      return;
    }

    if (slashDebounce) clearTimeout(slashDebounce);
    slashDebounce = setTimeout(() => {
      void options.getSlashSuggestions!(value).then((suggestions) => {
        slashSuggestions = suggestions;
        if (suggestions.length > 0) {
          options.slashPopup!.show(suggestions, 0);
        } else {
          hideSlashPopup();
        }
      });
    }, 50);
  };

  const applySelectedSuggestion = (): boolean => {
    if (!options.slashPopup?.isVisible() || slashSuggestions.length === 0) {
      return false;
    }
    const idx = options.slashPopup.getSelectedIndex();
    const suggestion = slashSuggestions[idx];
    if (!suggestion) return false;

    const value = input.getValue();
    const { mode } = detectSlashInputMode(value);
    if (mode === "none") return false;

    const next = applySuggestion(value, suggestion, mode);
    input.setValue(next);
    hideSlashPopup();
    screen.render();
    notify();
    return true;
  };

  input.on("submit", (value: string) => {
    hideSlashPopup();
    const trimmed = value.trim();
    if (trimmed) {
      history.push(trimmed);
      historyIndex = history.length;
    }
    draft = "";
    input.clearValue();
    onSubmit(trimmed);
    input.focus();
    notify();
  });

  input.on("keypress", () => {
    refreshSlashSuggestions(input.getValue());
    notify();
  });

  input.key(["C-c", "C-d"], () => {
    options.onExit?.();
  });

  input.key("tab", () => {
    if (applySelectedSuggestion()) return;
  });

  input.key("up", () => {
    if (options.slashPopup?.isVisible() && slashSuggestions.length > 0) {
      options.slashPopup.moveSelection(-1, slashSuggestions.length);
      return;
    }
    if (history.length === 0) return;
    if (historyIndex === history.length) {
      draft = input.getValue();
    }
    if (historyIndex > 0) {
      historyIndex--;
      input.setValue(history[historyIndex] ?? "");
      hideSlashPopup();
      screen.render();
      notify();
    }
  });

  input.key("down", () => {
    if (options.slashPopup?.isVisible() && slashSuggestions.length > 0) {
      options.slashPopup.moveSelection(1, slashSuggestions.length);
      return;
    }
    if (history.length === 0) return;
    if (historyIndex < history.length - 1) {
      historyIndex++;
      input.setValue(history[historyIndex] ?? "");
    } else {
      historyIndex = history.length;
      input.setValue(draft);
    }
    hideSlashPopup();
    screen.render();
    notify();
  });

  const getPlainText = (): string => {
    const cols = Math.max(40, screen.width as number);
    const value = input.getValue();
    const border = "─".repeat(Math.max(10, cols - 2));
    return [`┌${border}┐`, `│ > ${value}_`, `└${border}┘`].join("\n");
  };

  return {
    element: input,
    focus() {
      input.focus();
    },
    clear() {
      input.clearValue();
      draft = "";
      historyIndex = history.length;
      hideSlashPopup();
      notify();
    },
    setValue(value: string) {
      input.setValue(value);
      refreshSlashSuggestions(value);
      screen.render();
      notify();
    },
    getValue() {
      return input.getValue();
    },
    getHistory() {
      return [...history];
    },
    getPlainText,
    hideSlashPopup,
  };
}