import blessed from "blessed";

export interface InputBoxHandle {
  element: blessed.Widgets.TextboxElement;
  focus: () => void;
  clear: () => void;
  getHistory: () => string[];
}

export function createInputBox(
  screen: blessed.Widgets.Screen,
  onSubmit: (line: string) => void,
): InputBoxHandle {
  const history: string[] = [];
  let historyIndex = -1;
  let draft = "";

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

  input.on("submit", (value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      history.push(trimmed);
      historyIndex = history.length;
    }
    draft = "";
    input.clearValue();
    onSubmit(trimmed);
    input.focus();
  });

  input.key("up", () => {
    if (history.length === 0) return;
    if (historyIndex === history.length) {
      draft = input.getValue();
    }
    if (historyIndex > 0) {
      historyIndex--;
      input.setValue(history[historyIndex] ?? "");
      screen.render();
    }
  });

  input.key("down", () => {
    if (history.length === 0) return;
    if (historyIndex < history.length - 1) {
      historyIndex++;
      input.setValue(history[historyIndex] ?? "");
    } else {
      historyIndex = history.length;
      input.setValue(draft);
    }
    screen.render();
  });

  return {
    element: input,
    focus() {
      input.focus();
    },
    clear() {
      input.clearValue();
      draft = "";
      historyIndex = history.length;
    },
    getHistory() {
      return [...history];
    },
  };
}