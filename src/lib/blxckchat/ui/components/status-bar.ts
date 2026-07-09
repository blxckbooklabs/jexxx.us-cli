import blessed from "blessed";

export interface StatusBarHandle {
  element: blessed.Widgets.BoxElement;
  setMessage: (text: string) => void;
}

export function createStatusBar(screen: blessed.Widgets.Screen): StatusBarHandle {
  let message =
    "Ctrl+C/Q/Esc exit · ↑↓ scroll/history · Space toggle thinking · Ctrl+S save";

  const bar = blessed.box({
    parent: screen,
    bottom: 2,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      fg: "gray",
      bg: "#0a0a0a",
    },
    content: "",
  });

  const render = (): void => {
    bar.setContent(`{gray-fg}${message}{/gray-fg}`);
    screen.render();
  };

  render();

  return {
    element: bar,
    setMessage(text: string) {
      message = text;
      render();
    },
  };
}