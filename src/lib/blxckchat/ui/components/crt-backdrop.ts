import blessed from "blessed";

import { THEME, glitchNoise, TAG } from "../theme.js";

export interface CrtBackdropHandle {
  element: blessed.Widgets.BoxElement;
  setGlitchSeed: (seed: number) => void;
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
  let seed = 0;

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

  const render = (): void => {
    const cols = Math.max(40, (screen.width as number) || 80);
    const noise = glitchNoise(Math.min(cols - 4, 48), seed);
    frame.setContent(
      `${TAG.dim}${noise}${TAG.dimEnd}`,
    );
    screen.render();
  };

  render();

  return {
    element: frame,
    setGlitchSeed(next: number) {
      seed = next;
      render();
    },
  };
}