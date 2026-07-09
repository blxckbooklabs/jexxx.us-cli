import blessed from "blessed";

import { THEME } from "../theme.js";

export interface CrtBackdropHandle {
  element: blessed.Widgets.BoxElement;
  setGlitchSeed: (_seed: number) => void;
}

export interface CrtBackdropOptions {
  top: number;
  bottom: number;
}

/** Inset CRT/TV frame behind the message scroll area. */
export function createCrtBackdrop(
  screen: blessed.Widgets.Screen,
  options: CrtBackdropOptions,
): CrtBackdropHandle {
  const frame = blessed.box({
    parent: screen,
    top: options.top,
    left: 0,
    width: "100%",
    bottom: options.bottom,
    tags: true,
    border: { type: "line" },
    style: {
      fg: THEME.pinkDim,
      bg: THEME.bgInset,
      border: { fg: THEME.pinkDim },
    },
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
    content: "",
  });

  return {
    element: frame,
    setGlitchSeed() {
      // Frame border only — no inner noise (keeps chat readable while scrolling).
    },
  };
}