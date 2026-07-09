import blessed from "blessed";

import type { SlashSuggestion } from "../slash/autocomplete.js";
import { isBlessedMouseEnabled } from "../tty.js";
import { THEME } from "../theme.js";

export interface SlashPopupHandle {
  show: (suggestions: SlashSuggestion[], selectedIndex: number) => void;
  hide: () => void;
  isVisible: () => boolean;
  moveSelection: (delta: number, total: number) => number;
  getSelectedIndex: () => number;
  setSelectedIndex: (index: number) => void;
}

export function createSlashPopup(screen: blessed.Widgets.Screen): SlashPopupHandle {
  let selectedIndex = 0;
  let visible = false;
  let currentSuggestions: SlashSuggestion[] = [];

  const list = blessed.list({
    parent: screen,
    bottom: 4,
    left: 1,
    width: "68%",
    height: 10,
    border: { type: "line" },
    label: " /commands ",
    tags: true,
    hidden: true,
    keys: false,
    mouse: isBlessedMouseEnabled(),
    vi: false,
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.pink },
      selected: { bg: THEME.pink, fg: THEME.text, bold: true },
    },
  });

  const formatItem = (s: SlashSuggestion): string => {
    const desc =
      s.description.length > 48 ? `${s.description.slice(0, 45)}…` : s.description;
    return `{bold}${s.label}{/bold} {gray-fg}${desc}{/gray-fg}`;
  };

  return {
    show(suggestions: SlashSuggestion[], index: number) {
      currentSuggestions = suggestions;
      selectedIndex = Math.min(index, Math.max(0, suggestions.length - 1));
      if (suggestions.length === 0) {
        list.hide();
        visible = false;
        screen.render();
        return;
      }
      list.setItems(suggestions.map(formatItem));
      list.select(selectedIndex);
      list.show();
      visible = true;
      screen.render();
    },
    hide() {
      list.hide();
      visible = false;
      currentSuggestions = [];
      screen.render();
    },
    isVisible() {
      return visible;
    },
    moveSelection(delta: number, total: number) {
      if (total === 0) return 0;
      selectedIndex = (selectedIndex + delta + total) % total;
      list.select(selectedIndex);
      screen.render();
      return selectedIndex;
    },
    getSelectedIndex() {
      return selectedIndex;
    },
    setSelectedIndex(index: number) {
      selectedIndex = index;
      if (visible) {
        list.select(selectedIndex);
        screen.render();
      }
    },
  };
}

export function applySuggestion(
  currentValue: string,
  suggestion: SlashSuggestion,
  mode: "command" | "argument",
): string {
  if (mode === "command") {
    const cmdName = suggestion.label.replace(/^\//, "");
    return `/${cmdName} `;
  }

  const spaceIdx = currentValue.indexOf(" ");
  if (spaceIdx === -1) return currentValue;
  const prefix = currentValue.slice(0, spaceIdx + 1);
  return `${prefix}${suggestion.value} `;
}