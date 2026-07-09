import blessed from "blessed";

export interface SearchOverlayHandle {
  open: () => void;
  close: () => void;
  isVisible: () => boolean;
  getQuery: () => string;
}

export function createSearchOverlay(
  screen: blessed.Widgets.Screen,
  onSearch: (query: string) => void,
): SearchOverlayHandle {
  let visible = false;

  const box = blessed.textbox({
    parent: screen,
    top: 1,
    left: 0,
    width: "100%",
    height: 3,
    border: { type: "line" },
    label: " Search ",
    tags: true,
    hidden: true,
    inputOnFocus: true,
    style: {
      fg: "white",
      bg: "#1a1a1a",
      border: { fg: "cyan" },
    },
  });

  const close = (): void => {
    box.hide();
    visible = false;
    screen.render();
  };

  box.on("submit", (value: string) => {
    onSearch(value.trim());
    close();
  });

  box.key(["escape", "C-c"], () => close());

  return {
    open() {
      box.setValue("");
      box.show();
      box.focus();
      visible = true;
      screen.render();
    },
    close,
    isVisible() {
      return visible;
    },
    getQuery() {
      return box.getValue();
    },
  };
}