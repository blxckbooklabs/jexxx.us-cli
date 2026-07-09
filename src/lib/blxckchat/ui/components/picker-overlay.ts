import blessed from "blessed";

import {
  createModalLineInput,
  insertModalLinePaste,
  type ModalLineInputHandle,
} from "../editor/modal-line-input.js";
import { createModalKeypress, type BlessedKey } from "../editor/modal-keypress.js";
import { readClipboard } from "../session/tui-snapshot.js";
import { releaseOverlayFocus, takeOverlayFocus } from "../editor/overlay-focus.js";
import { isSlashPopupMouseEnabled } from "../tty.js";
import { dismissSlashMenuBeforeOverlay } from "../menu-mutex.js";
import { THEME } from "../theme.js";
import { stepListIndex } from "./slash-popup.js";

export interface PickerItem {
  id: string;
  label: string;
  description?: string;
}

/** Filter picker rows by label, id, or description (case-insensitive). */
export function filterPickerItems(items: readonly PickerItem[], query: string): PickerItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q) ?? false),
  );
}

export interface PickerOpenOptions {
  title?: string;
  selectedIndex?: number;
  /** Hide the filter row (compact menus such as /auth). */
  hideFilter?: boolean;
  /** Status lines shown above the list when hideFilter is true. */
  statusHeader?: string;
}

export interface PickerOverlayHandle {
  open: (items: PickerItem[], options?: PickerOpenOptions) => void;
  close: () => void;
  isVisible: () => boolean;
  setOnPick: (handler: ((item: PickerItem) => void) | undefined) => void;
  setOnCancel: (handler: (() => void) | undefined) => void;
}

type ListItem = blessed.Widgets.BoxElement & { __pickerMouseWired?: boolean };

type PickerList = blessed.Widgets.ListElement & {
  items: ListItem[];
  mouse: boolean;
};

export function createPickerOverlay(screen: blessed.Widgets.Screen): PickerOverlayHandle {
  let visible = false;
  let selectedIndex = 0;
  let allItems: PickerItem[] = [];
  let filteredItems: PickerItem[] = [];
  let filterFocused = false;
  const filterInput: ModalLineInputHandle = createModalLineInput();
  let onPickHandler: ((item: PickerItem) => void) | undefined;
  let onCancelHandler: (() => void) | undefined;
  const mouseEnabled = isSlashPopupMouseEnabled();
  const modalKeys = createModalKeypress(screen);

  const container = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "78%",
    height: 18,
    border: { type: "line" },
    label: " picker ",
    tags: true,
    hidden: true,
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.pink },
    },
  });

  const filterBox = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 3,
    border: { type: "line" },
    label: " filter ",
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

  const statusBox = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 5,
    tags: true,
    hidden: true,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    style: { fg: THEME.text, bg: THEME.bgInset },
  });

  const footer = blessed.box({
    parent: container,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    tags: true,
    content: "",
    style: { fg: THEME.textDim, bg: THEME.bgElevated },
  });

  const list = blessed.list({
    parent: container,
    top: 3,
    left: 0,
    width: "100%-2",
    height: "100%-5",
    border: { type: "line" },
    label: " items ",
    tags: true,
    keys: false,
    mouse: mouseEnabled,
    interactive: true,
    vi: false,
    itemHoverEffects: { bg: THEME.pink, fg: THEME.text, bold: true },
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.pinkDim },
      item: {
        hover: { bg: THEME.pink, fg: THEME.text, bold: true },
      },
      selected: { bg: THEME.pink, fg: THEME.text, bold: true },
    },
  }) as PickerList;

  const formatItem = (item: PickerItem): string => {
    const desc = item.description
      ? item.description.length > 52
        ? `${item.description.slice(0, 49)}…`
        : item.description
      : "";
    return desc
      ? `{bold}${item.label}{/bold} {gray-fg}${desc}{/gray-fg}`
      : `{bold}${item.label}{/bold}`;
  };

  const filterViewWidth = (): number =>
    Math.max(8, ((filterBox.width as number) || 60) - 4);

  const renderFilter = (): void => {
    const borderFg = filterFocused ? THEME.pinkGlow : THEME.cyan;
    filterBox.style.border = { fg: borderFg };
    const query = filterInput.getText();
    if (query || filterFocused) {
      filterBox.setContent(filterInput.formatDisplay(filterViewWidth()));
    } else {
      filterBox.setContent(
        "{gray-fg} Tab or click here · type to filter · ⌥←→ word · ⌥⇧←→ select{/gray-fg}",
      );
    }
  };

  let filterHidden = false;

  const layoutList = (): void => {
    if (filterHidden) {
      const statusVisible = !statusBox.hidden;
      if (statusVisible) {
        statusBox.top = 0;
        list.top = 5;
        list.height = "100%-6";
      } else {
        list.top = 0;
        list.height = "100%-3";
      }
      return;
    }
    statusBox.hide();
    filterBox.show();
    list.top = 3;
    list.height = "100%-5";
  };

  const renderFooter = (): void => {
    const mouseHint = mouseEnabled ? " · click select" : "";
    if (filterHidden) {
      footer.setContent(
        `{gray-fg}↑↓ navigate · Enter select${mouseHint} · Esc cancel{/gray-fg}`,
      );
      return;
    }
    const filterHint = filterFocused
      ? "Type to filter · Tab → list"
      : "Tab/click filter · type to filter";
    footer.setContent(
      `{gray-fg}↑↓ navigate · Enter select${mouseHint} · ${filterHint} · Esc cancel{/gray-fg}`,
    );
  };

  const applyFilter = (query: string): void => {
    filteredItems = filterPickerItems(allItems, query);
    selectedIndex = Math.min(selectedIndex, Math.max(0, filteredItems.length - 1));
    list.setItems(filteredItems.map(formatItem));
    if (filteredItems.length > 0) {
      list.select(selectedIndex);
    }
    renderFilter();
    renderFooter();
    screen.render();
  };

  const focusFilter = (): void => {
    filterFocused = true;
    filterBox.focus();
    renderFilter();
    renderFooter();
    screen.render();
  };

  const focusList = (): void => {
    filterFocused = false;
    list.focus();
    renderFilter();
    renderFooter();
    screen.render();
  };

  const pickIndex = (idx: number): void => {
    const item = filteredItems[idx];
    if (!item) return;
    onPickHandler?.(item);
    close();
  };

  const highlightIndex = (idx: number): void => {
    if (idx < 0 || idx >= filteredItems.length) return;
    selectedIndex = idx;
    list.select(idx);
    screen.render();
  };

  const wireListItemMouse = (item: ListItem, idx: number): void => {
    if (!mouseEnabled || item.__pickerMouseWired) return;
    item.__pickerMouseWired = true;
    item.on("mouseover", () => {
      if (!visible || selectedIndex === idx) return;
      highlightIndex(idx);
    });
    item.on("click", () => pickIndex(idx));
  };

  const wireAllItems = (): void => {
    if (!mouseEnabled) return;
    for (let i = 0; i < list.items.length; i++) {
      const item = list.items[i] as ListItem | undefined;
      if (item) wireListItemMouse(item, i);
    }
  };

  list.on("add item", () => {
    const idx = list.items.length - 1;
    const item = list.items[idx] as ListItem | undefined;
    if (item) wireListItemMouse(item, idx);
  });

  list.on("set items", () => wireAllItems());

  const cancel = (): void => {
    onCancelHandler?.();
    close();
  };

  const navigateList = (delta: number): void => {
    highlightIndex(stepListIndex(selectedIndex, delta, filteredItems.length));
  };

  const applyFilterInputKey = async (ch: string, key: BlessedKey): Promise<void> => {
    if (!filterFocused) focusFilter();

    const result = filterInput.handleKey(ch, key);
    if (result.action === "paste-request") {
      const clip = await readClipboard();
      insertModalLinePaste(filterInput, clip);
      applyFilter(filterInput.getText());
      return;
    }
    if (result.action === "updated") {
      applyFilter(filterInput.getText());
    }
  };

  const handleKeypress = (ch: string, key: BlessedKey): void => {
    if (!visible) return;

    if (key.name === "escape" || key.name === "C-c" || key.name === "q") {
      cancel();
      return;
    }

    if (key.name === "tab") {
      if (filterHidden) {
        focusList();
        return;
      }
      if (filterFocused) focusList();
      else focusFilter();
      return;
    }

    if (key.name === "up" || key.name === "k") {
      navigateList(-1);
      return;
    }

    if (key.name === "down" || key.name === "j") {
      navigateList(1);
      return;
    }

    if (key.name === "enter" || key.name === "return") {
      pickIndex(selectedIndex);
      return;
    }

    if (filterInput.isEditingKey(ch, key)) {
      void applyFilterInputKey(ch, key);
    }
  };

  const close = (): void => {
    container.hide();
    visible = false;
    filterInput.setText("");
    filterFocused = false;
    filterHidden = false;
    filterBox.show();
    statusBox.hide();
    layoutList();
    modalKeys.stop();
    releaseOverlayFocus(screen);
    screen.render();
  };

  if (mouseEnabled) {
    filterBox.on("click", () => {
      if (!visible) return;
      focusFilter();
    });
    list.on("click", () => {
      if (!visible) return;
      focusList();
    });
    screen.enableMouse(filterBox);
  }

  return {
    open(items, options) {
      dismissSlashMenuBeforeOverlay();
      allItems = items;
      filteredItems = [...items];
      selectedIndex = options?.selectedIndex ?? 0;
      filterInput.setText("");
      filterFocused = false;
      filterHidden = options?.hideFilter === true;
      if (filterHidden) {
        filterBox.hide();
        if (options?.statusHeader?.trim()) {
          statusBox.setContent(options.statusHeader);
          statusBox.show();
        } else {
          statusBox.hide();
        }
      } else {
        filterBox.show();
        statusBox.hide();
      }
      layoutList();
      if (options?.title) {
        container.setLabel(` ${options.title} `);
      }
      list.setItems(filteredItems.map(formatItem));
      wireAllItems();
      if (filteredItems.length > 0) {
        list.select(Math.min(selectedIndex, filteredItems.length - 1));
      }
      container.setFront();
      container.show();
      if (mouseEnabled) {
        list.mouse = true;
        screen.enableMouse(list);
      }
      takeOverlayFocus(screen, list);
      modalKeys.start(handleKeypress);
      visible = true;
      renderFilter();
      renderFooter();
      screen.render();
    },
    close,
    isVisible() {
      return visible;
    },
    setOnPick(handler) {
      onPickHandler = handler;
    },
    setOnCancel(handler) {
      onCancelHandler = handler;
    },
  };
}