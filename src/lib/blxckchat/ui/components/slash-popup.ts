import blessed from "blessed";

import type { SlashSuggestion } from "../slash/autocomplete.js";
import { bindFocusedKey } from "../editor/focused-key.js";
import { isSlashPopupMouseEnabled } from "../tty.js";
import { isModalOverlayActive } from "../menu-mutex.js";
import { THEME } from "../theme.js";

export interface SlashPopupHandle {
  show: (suggestions: SlashSuggestion[], selectedIndex: number) => void;
  hide: () => void;
  isVisible: () => boolean;
  moveSelection: (delta: number, total: number) => number;
  getSelectedIndex: () => number;
  setSelectedIndex: (index: number) => void;
  setOnPick: (handler: ((index: number) => void) | undefined) => void;
}

/** Step list index with wrap-around at both ends. */
export function stepListIndex(current: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  const next = current + delta;
  if (next < 0) return total - 1;
  if (next >= total) return 0;
  return next;
}

type ListItem = blessed.Widgets.BoxElement & { __slashMouseWired?: boolean };

type SlashList = blessed.Widgets.ListElement & {
  items: ListItem[];
  mouse: boolean;
  getItemIndex: (child: blessed.Widgets.BoxElement) => number;
};

export function createSlashPopup(screen: blessed.Widgets.Screen): SlashPopupHandle {
  let selectedIndex = 0;
  let visible = false;
  let onPickHandler: ((index: number) => void) | undefined;
  const mouseEnabled = isSlashPopupMouseEnabled();

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
    mouse: mouseEnabled,
    interactive: true,
    vi: false,
    itemHoverEffects: { bg: THEME.pink, fg: THEME.text, bold: true },
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.pink },
      item: {
        hover: { bg: THEME.pink, fg: THEME.text, bold: true },
      },
      selected: { bg: THEME.pink, fg: THEME.text, bold: true },
    },
  }) as SlashList;

  const formatItem = (s: SlashSuggestion): string => {
    const desc =
      s.description.length > 48 ? `${s.description.slice(0, 45)}…` : s.description;
    return `{bold}${s.label}{/bold} {gray-fg}${desc}{/gray-fg}`;
  };

  const highlightIndex = (idx: number): void => {
    if (idx < 0 || idx >= list.items.length) return;
    selectedIndex = idx;
    list.select(idx);
    screen.render();
  };

  const pickIndex = (idx: number): void => {
    if (!visible || idx < 0) return;
    highlightIndex(idx);
    onPickHandler?.(idx);
  };

  const wireListItemMouse = (item: ListItem, idx: number): void => {
    if (!mouseEnabled || item.__slashMouseWired) return;
    item.__slashMouseWired = true;

    item.on("mouseover", () => {
      if (!visible || selectedIndex === idx) return;
      highlightIndex(idx);
    });

    // Blessed list only emits `select` on a second click — pick on first click.
    item.on("click", () => {
      pickIndex(idx);
    });
  };

  const wireAllItems = (): void => {
    if (!mouseEnabled) return;
    for (let i = 0; i < list.items.length; i++) {
      const item = list.items[i] as ListItem | undefined;
      if (item) wireListItemMouse(item, i);
    }
  };

  const activateMouse = (): void => {
    if (!mouseEnabled) return;
    list.mouse = true;
    screen.enableMouse(list);
  };

  list.on("add item", () => {
    const idx = list.items.length - 1;
    const item = list.items[idx] as ListItem | undefined;
    if (item) wireListItemMouse(item, idx);
  });

  list.on("set items", () => {
    wireAllItems();
  });

  const moveSelection = (delta: number, total: number): number => {
    selectedIndex = stepListIndex(selectedIndex, delta, total);
    list.select(selectedIndex);
    screen.render();
    return selectedIndex;
  };

  const whenVisible = (handler: () => void): (() => void) => () => {
    if (!visible) return;
    handler();
  };

  // Mouse click can move focus onto the list; handle arrows/enter here too.
  bindFocusedKey(screen, list, ["up", "k"], whenVisible(() => moveSelection(-1, list.items.length)));
  bindFocusedKey(screen, list, ["down", "j"], whenVisible(() => moveSelection(1, list.items.length)));
  bindFocusedKey(screen, list, ["enter", "C-m"], whenVisible(() => pickIndex(selectedIndex)));

  return {
    show(suggestions: SlashSuggestion[], index: number) {
      if (isModalOverlayActive()) {
        return;
      }
      selectedIndex = Math.min(index, Math.max(0, suggestions.length - 1));
      if (suggestions.length === 0) {
        list.hide();
        visible = false;
        screen.render();
        return;
      }

      activateMouse();
      list.setItems(suggestions.map(formatItem));
      wireAllItems();
      list.select(selectedIndex);
      list.setFront();
      list.show();
      visible = true;
      screen.render();
    },
    hide() {
      list.hide();
      visible = false;
      screen.render();
    },
    isVisible() {
      return visible;
    },
    moveSelection,
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
    setOnPick(handler) {
      onPickHandler = handler;
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

  if (suggestion.connectProvider) {
    return `/provider ${suggestion.connectProvider} `;
  }

  const spaceIdx = currentValue.indexOf(" ");
  if (spaceIdx === -1) return currentValue;
  const prefix = currentValue.slice(0, spaceIdx + 1);
  return `${prefix}${suggestion.value} `;
}