import blessed from "blessed";

import { buildTopBarPlain } from "../renderer/plain-text.js";
import { THEME, TAG, glitchNoise, crtCorner } from "../theme.js";

export interface TopBarHandle {
  element: blessed.Widgets.BoxElement;
  setSubtitle: (text: string) => void;
  getPlainText: () => string;
  tickGlitch: () => void;
}

export interface TopBarOptions {
  onUpdate?: () => void;
}

export function createTopBar(
  screen: blessed.Widgets.Screen,
  options: TopBarOptions = {},
): TopBarHandle {
  let subtitle = "Welcome to the kingdom.";
  let glitchSeed = 0;
  const bar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 2,
    tags: true,
    style: {
      fg: THEME.text,
      bg: THEME.bg,
      bold: true,
    },
    content: "",
  });

  const getPlainText = (): string =>
    buildTopBarPlain((screen.width as number) || 80, subtitle, glitchSeed);

  const render = (): void => {
    const cols = screen.width as number;
    const noise = glitchNoise(Math.min(cols - 2, 64), glitchSeed);
    const model =
      subtitle.length > cols - 28
        ? `${subtitle.slice(0, Math.max(8, cols - 31))}…`
        : subtitle;

    const line1Left = `${crtCorner("tl")} ${TAG.pinkBold}BLXCKCHAT${TAG.pinkBoldEnd} ${TAG.dim}│${TAG.dimEnd} ${TAG.muted}${model}${TAG.mutedEnd}`;
    const line1PlainLen = `BLXCKCHAT │ ${model}`.length;
    const livePad = Math.max(2, cols - line1PlainLen - 6);
    const line1 = `${line1Left}${" ".repeat(livePad)}${TAG.pink}▮ LIVE${TAG.pinkEnd} ${crtCorner("tr")}`;

    const line2 = `${TAG.pink}${noise}${TAG.pinkEnd}`;

    bar.setContent(`${line1}\n${line2}`);
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
    tickGlitch() {
      glitchSeed = (glitchSeed + 1) % 9;
      render();
    },
  };
}