import blessed from "blessed";

import type { SlashPopupHandle } from "./slash-popup.js";
import { applySuggestion } from "./slash-popup.js";
import {
  detectSlashInputMode,
  type SlashSuggestion,
} from "../slash/autocomplete.js";
import { attachBlessedLineEditor } from "../editor/blessed-line-editor.js";
import { bindFocusedKey } from "../editor/focused-key.js";
import { frameTransmitInput } from "../renderer/plain-text.js";
import { isBlessedMouseEnabled } from "../tty.js";
import { isModalOverlayActive } from "../menu-mutex.js";
import { THEME } from "../theme.js";

export interface InputBoxHandle {
  element: blessed.Widgets.BoxElement;
  focus: () => void;
  clear: () => void;
  setValue: (value: string) => void;
  getValue: () => string;
  getHistory: () => string[];
  getPlainText: () => string;
  hideSlashPopup: () => void;
}

export interface InputShortcutHandlers {
  onSave?: () => void;
  onCopyTui?: () => void;
  onCopyChrome?: () => void;
  onCopyLastReply?: () => void;
  onModelList?: () => void;
  onModelNext?: () => void;
  onModelPrev?: () => void;
  onToggleAllThinking?: () => void;
  onNewSession?: () => void;
  onFocusMessages?: () => void;
}

export interface InputBoxOptions {
  onUpdate?: () => void;
  onExit?: () => void;
  onShowHotkeys?: () => void;
  onQueueIfProcessing?: () => boolean;
  onOpenExternalEditor?: () => void;
  shortcuts?: InputShortcutHandlers;
  slashPopup?: SlashPopupHandle;
  getSlashSuggestions?: (value: string) => Promise<SlashSuggestion[]>;
  /** Start provider BYOK setup immediately (slash catalog pick). */
  onSetupProvider?: (catalogId: string) => void | Promise<void>;
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
  let lastSlashValue = "";
  let slashRequestGen = 0;

  const notify = (): void => {
    options.onUpdate?.();
  };

  const hideSlashPopup = (): void => {
    if (slashDebounce) {
      clearTimeout(slashDebounce);
      slashDebounce = null;
    }
    slashRequestGen++;
    options.slashPopup?.hide();
    slashSuggestions = [];
    lastSlashValue = "";
  };

  const refreshSlashSuggestions = (value: string): void => {
    if (!options.getSlashSuggestions || !options.slashPopup) return;

    if (isModalOverlayActive()) {
      hideSlashPopup();
      return;
    }

    const { mode } = detectSlashInputMode(value);
    if (mode === "none") {
      hideSlashPopup();
      return;
    }

    if (slashDebounce) clearTimeout(slashDebounce);
    const requestGen = ++slashRequestGen;
    const requestedValue = value;
    slashDebounce = setTimeout(() => {
      slashDebounce = null;
      const preserveIndex =
        requestedValue === lastSlashValue && options.slashPopup!.isVisible();
      const startIndex = preserveIndex ? options.slashPopup!.getSelectedIndex() : 0;
      lastSlashValue = requestedValue;

      void options.getSlashSuggestions!(requestedValue).then((suggestions) => {
        if (requestGen !== slashRequestGen) return;
        if (lineEditor.getText() !== requestedValue) return;
        if (isModalOverlayActive()) {
          hideSlashPopup();
          return;
        }

        slashSuggestions = suggestions;
        if (suggestions.length > 0) {
          const index = preserveIndex
            ? Math.min(startIndex, suggestions.length - 1)
            : 0;
          options.slashPopup!.show(suggestions, index);
        } else {
          hideSlashPopup();
        }
      });
    }, 50);
  };

  const input = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    border: { type: "line" },
    label: " transmit ",
    tags: true,
    keys: true,
    mouse: isBlessedMouseEnabled(),
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.pink },
      focus: {
        border: { fg: THEME.pinkGlow },
        bg: THEME.bgPanel,
      },
    },
  });

  const lineEditor = attachBlessedLineEditor(input, screen, {
    onChange: (text) => {
      setImmediate(() => {
        refreshSlashSuggestions(text);
        notify();
      });
    },
    onHotkeyHelp: () => options.onShowHotkeys?.(),
  });

  const applySlashSuggestionAt = (idx: number): boolean => {
    if (!options.slashPopup?.isVisible() || slashSuggestions.length === 0) {
      return false;
    }
    const suggestion = slashSuggestions[idx];
    if (!suggestion) return false;

    const value = lineEditor.getText();
    const { mode } = detectSlashInputMode(value);
    if (mode === "none") return false;

    if (suggestion.connectProvider && options.onSetupProvider) {
      hideSlashPopup();
      lineEditor.clear();
      lastSlashValue = "";
      screen.render();
      notify();
      void options.onSetupProvider(suggestion.connectProvider);
      return true;
    }

    const next = applySuggestion(value, suggestion, mode);
    lineEditor.setText(next);
    lastSlashValue = next;
    hideSlashPopup();
    input.focus();
    screen.render();
    notify();
    return true;
  };

  const applySelectedSuggestion = (): boolean =>
    applySlashSuggestionAt(options.slashPopup?.getSelectedIndex() ?? 0);

  options.slashPopup?.setOnPick((index) => {
    applySlashSuggestionAt(index);
  });

  const submitLine = (value: string): void => {
    hideSlashPopup();
    const trimmed = value.trim();
    if (trimmed) {
      history.push(trimmed);
      historyIndex = history.length;
    }
    draft = "";
    lineEditor.clear();
    onSubmit(trimmed);
    notify();
  };

  input.on("submit", (value: string) => {
    if (options.slashPopup?.isVisible() && slashSuggestions.length > 0) {
      if (applySelectedSuggestion()) return;
    }
    submitLine(value);
  });

  input.key(["C-c", "C-d"], () => {
    options.onExit?.();
  });

  input.key(["C-u"], () => {
    lineEditor.clear();
    hideSlashPopup();
    screen.render();
    notify();
  });

  const sc = options.shortcuts;
  if (sc?.onSave) input.key(["C-s"], () => sc.onSave!());
  if (sc?.onCopyTui) input.key(["C-y"], () => void sc.onCopyTui!());
  if (sc?.onCopyChrome) input.key(["C-S-y"], () => void sc.onCopyChrome!());
  if (sc?.onCopyLastReply) input.key(["C-o"], () => void sc.onCopyLastReply!());
  if (sc?.onModelList) input.key(["C-l"], () => void sc.onModelList!());
  if (sc?.onModelNext) input.key(["C-p"], () => void sc.onModelNext!());
  if (sc?.onModelPrev) input.key(["S-C-p"], () => void sc.onModelPrev!());
  if (sc?.onToggleAllThinking) input.key(["C-t"], () => sc.onToggleAllThinking!());
  if (sc?.onNewSession) input.key(["C-n"], () => void sc.onNewSession!());
  if (sc?.onFocusMessages) input.key(["C-b"], () => sc.onFocusMessages!());

  input.key("tab", () => {
    if (options.onQueueIfProcessing?.()) return;
    if (applySelectedSuggestion()) return;
  });

  if (options.onOpenExternalEditor) {
    input.key(["C-g"], () => options.onOpenExternalEditor!());
  }

  bindFocusedKey(screen, input, "up", () => {
    if (options.slashPopup?.isVisible() && slashSuggestions.length > 0) {
      options.slashPopup.moveSelection(-1, slashSuggestions.length);
      notify();
      return;
    }
    if (history.length === 0) return;
    if (historyIndex === history.length) {
      draft = lineEditor.getText();
    }
    if (historyIndex > 0) {
      historyIndex--;
      lineEditor.setText(history[historyIndex] ?? "");
      hideSlashPopup();
      screen.render();
      notify();
    }
  });

  bindFocusedKey(screen, input, "down", () => {
    if (options.slashPopup?.isVisible() && slashSuggestions.length > 0) {
      options.slashPopup.moveSelection(1, slashSuggestions.length);
      notify();
      return;
    }
    if (history.length === 0) return;
    if (historyIndex < history.length - 1) {
      historyIndex++;
      lineEditor.setText(history[historyIndex] ?? "");
    } else {
      historyIndex = history.length;
      lineEditor.setText(draft);
    }
    hideSlashPopup();
    screen.render();
    notify();
  });

  const getPlainText = (): string =>
    frameTransmitInput(lineEditor.getText(), (screen.width as number) || 80);

  return {
    element: input,
    focus() {
      input.focus();
    },
    clear() {
      lineEditor.clear();
      draft = "";
      historyIndex = history.length;
      hideSlashPopup();
      notify();
    },
    setValue(value: string) {
      lineEditor.setText(value);
      refreshSlashSuggestions(value);
      screen.render();
      notify();
    },
    getValue() {
      return lineEditor.getText();
    },
    getHistory() {
      return [...history];
    },
    getPlainText,
    hideSlashPopup,
  };
}