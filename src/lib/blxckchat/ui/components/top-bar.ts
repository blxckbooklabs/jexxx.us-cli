import blessed from "blessed";

export interface TopBarHandle {
  element: blessed.Widgets.BoxElement;
  setSubtitle: (text: string) => void;
  getPlainText: () => string;
}

export interface TopBarOptions {
  onUpdate?: () => void;
}

export function createTopBar(
  screen: blessed.Widgets.Screen,
  options: TopBarOptions = {},
): TopBarHandle {
  let subtitle = "Welcome to the kingdom.";

  const bar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      fg: "white",
      bg: "#0a0a0a",
      bold: true,
    },
    content: "",
  });

  const getPlainText = (): string => {
    const cols = screen.width as number;
    const closeHint = cols > 50 ? "  ✕" : "";
    const title = `BLXCKCHAT — ${subtitle}`;
    const pad = Math.max(1, cols - title.length - closeHint.length);
    return `${title}${" ".repeat(pad)}${closeHint}`;
  };

  const render = (): void => {
    const cols = screen.width as number;
    const closeHint = cols > 50 ? "  ✕" : "";
    const title = `{#ec4899-fg}BLXCKCHAT{/} — {gray-fg}${subtitle}{/gray-fg}`;
    const pad = Math.max(1, cols - title.replace(/\{[^}]+\}/g, "").length - closeHint.length);
    bar.setContent(`${title}${" ".repeat(pad)}${closeHint}`);
    screen.render();
    options.onUpdate?.();
  };

  render();

  return {
    element: bar,
    setSubtitle(text: string) {
      subtitle = text;
      render();
    },
    getPlainText,
  };
}