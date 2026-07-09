import blessed from "blessed";

import { isSlashPopupMouseEnabled } from "../tty.js";
import { THEME } from "../theme.js";
import { stepListIndex } from "./slash-popup.js";

export interface PickerItem {
  id: string;
  label: string;
  description?: string;
}

export interface PickerOverlayHandle {
  open: (items: PickerItem[], options?: { title?: string; selectedIndex?: number }) => void;
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
  let onPickHandler: ((item: PickerItem) => void) | undefined;
  let onCancelHandler: (() => void) | undefined;
  const mouseEnabled = isSlashPopupMouseEnabled();

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

  const filterBox = blessed.textbox({
    parent: container,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 3,
    border: { type: "line" },
    label: " filter ",
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
    parent: container,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    tags: true,
    content: mouseEnabled
      ? "{gray-fg}↑↓ navigate · Enter or click select · Tab filter · Esc cancel{/gray-fg}"
      : "{gray-fg}↑↓ navigate · Enter select · Tab filter · Esc cancel{/gray-fg}",
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

  const applyFilter = (query: string): void => {
    const q = query.trim().toLowerCase();
    filteredItems = q
      ? allItems.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.id.toLowerCase().includes(q) ||
            (item.description?.toLowerCase().includes(q) ?? false),
        )
      : [...allItems];
    selectedIndex = Math.min(selectedIndex, Math.max(0, filteredItems.length - 1));
    list.setItems(filteredItems.map(formatItem));
    if (filteredItems.length > 0) {
      list.select(selectedIndex);
    }
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

  list.key(["up", "k"], () => {
    highlightIndex(stepListIndex(selectedIndex, -1, filteredItems.length));
  });

  list.key(["down", "j"], () => {
    highlightIndex(stepListIndex(selectedIndex, 1, filteredItems.length));
  });

  list.key(["enter", "C-m"], () => pickIndex(selectedIndex));

  const cancel = (): void => {
    onCancelHandler?.();
    close();
  };

  const navigateList = (delta: number): void => {
    highlightIndex(stepListIndex(selectedIndex, delta, filteredItems.length));
  };

  filterBox.key(["escape", "C-c"], cancel);
  list.key(["escape", "C-c", "q"], cancel);

  filterBox.key(["up", "k"], () => navigateList(-1));
  filterBox.key(["down", "j"], () => navigateList(1));
  filterBox.key(["enter", "C-m"], () => pickIndex(selectedIndex));

  list.key(["tab"], () => filterBox.focus());

  filterBox.on("keypress", (_ch, key) => {
    if (key.name === "tab") {
      list.focus();
      return;
    }
    setTimeout(() => applyFilter(filterBox.getValue()), 0);
  });

  const close = (): void => {
    container.hide();
    visible = false;
    filterBox.setValue("");
    screen.render();
  };

  return {
    open(items, options) {
      allItems = items;
      filteredItems = [...items];
      selectedIndex = options?.selectedIndex ?? 0;
      if (options?.title) {
        container.setLabel(` ${options.title} `);
      }
      filterBox.setValue("");
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
      list.focus();
      visible = true;
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