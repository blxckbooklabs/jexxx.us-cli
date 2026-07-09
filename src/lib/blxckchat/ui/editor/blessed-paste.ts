import type blessed from "blessed";

import { readClipboard } from "../session/tui-snapshot.js";

type BlessedKey = {
  name?: string;
  meta?: boolean;
  ctrl?: boolean;
};

/** Wire Cmd/Ctrl+V (and Shift+Insert) to insert clipboard text into a blessed textbox. */
export function attachBlessedPaste(
  input: blessed.Widgets.TextboxElement,
  screen: blessed.Widgets.Screen,
): void {
  input.on("keypress", (_ch, key: BlessedKey) => {
    const isPaste =
      ((key.meta || key.ctrl) && key.name === "v") ||
      (key.name === "insert" && Boolean((key as { shift?: boolean }).shift));
    if (!isPaste) return;

    void readClipboard().then((clip) => {
      const normalized = clip.replace(/\r?\n/g, " ").replace(/\t/g, " ");
      if (!normalized) return;
      const current = input.getValue() ?? "";
      input.setValue(current + normalized);
      screen.render();
    });
  });
}