import blessed from "blessed";

import { TAG, THEME, glitchNoise } from "../theme.js";

const LETTERS = ["J", "E", "X", "X", "X", "U", "S"] as const;
const SPARKLES = ["✦", "˖", "⁺", "∗", "·", "✧", "˗"] as const;
const LETTER_COLORS = [
  "ec4899",
  "f472b6",
  "d946ef",
  "67e8f9",
  "f9a8d4",
  "ec4899",
  "f472b6",
] as const;

export interface JexxxusSplashHandle {
  element: blessed.Widgets.BoxElement;
  /** Run sparkle animation; resolves when the splash is dismissed. */
  play: () => Promise<void>;
  destroy: () => void;
}

export interface JexxxusSplashOptions {
  top: number;
  bottom: number;
  /** Total animation frames before dismiss (default 18 ≈ 3.6s). */
  frames?: number;
  frameMs?: number;
}

/** Build one centered sparkle frame (plain blessed tags, no screen). */
export function renderJexxxusSplashFrame(tick: number, width: number): string {
  const w = Math.max(40, width);
  const lines: string[] = [];

  const padV = "\n".repeat(2);
  lines.push(padV);

  const dance = LETTERS.map((letter, i) => {
    const color = LETTER_COLORS[(i + tick) % LETTER_COLORS.length];
    const bounce = (tick + i) % 3 === 0 ? "▄" : (tick + i) % 3 === 1 ? " " : "▀";
    const sparkleL = SPARKLES[(tick + i * 2) % SPARKLES.length];
    const sparkleR = SPARKLES[(tick + i * 3 + 1) % SPARKLES.length];
    const glow = tick % 4 === i % 4 ? `{bold}` : "";
    const glowEnd = glow ? `{/bold}` : "";
    return `${TAG.dim}${sparkleL}${TAG.dimEnd}${bounce}{#${color}-fg}${glow}${letter}${glowEnd}{/}${bounce}${TAG.pink}${sparkleR}${TAG.pinkEnd}`;
  });

  const word = dance.join("");
  const plainLen = LETTERS.length * 3 + (LETTERS.length - 1);
  const leftPad = Math.max(0, Math.floor((w - plainLen) / 2));
  lines.push(`${" ".repeat(leftPad)}${word}`);

  const subtitle = tick % 2 === 0 ? "KINGDOM FEED" : "BLXCKCHAT";
  const subPad = Math.max(0, Math.floor((w - subtitle.length) / 2));
  lines.push(
    `${" ".repeat(subPad)}${TAG.muted}─ ${TAG.pink}${subtitle}${TAG.pinkEnd} ${TAG.muted}─${TAG.mutedEnd}`,
  );

  const noiseW = Math.min(w - 8, 36);
  const noise = glitchNoise(noiseW, tick);
  const noisePad = Math.max(0, Math.floor((w - noiseW) / 2));
  lines.push(`${" ".repeat(noisePad)}${TAG.pink}${noise}${TAG.pinkEnd}`);

  lines.push("\n".repeat(2));
  return lines.join("\n");
}

export function createJexxxusSplash(
  screen: blessed.Widgets.Screen,
  options: JexxxusSplashOptions,
): JexxxusSplashHandle {
  const totalFrames = options.frames ?? 18;
  const frameMs = options.frameMs ?? 200;

  const overlay = blessed.box({
    parent: screen,
    top: options.top,
    left: 1,
    width: "100%-2",
    bottom: options.bottom,
    tags: true,
    style: {
      fg: THEME.text,
      bg: THEME.bg,
    },
    border: { type: "line" },
    label: " ░░░ ",
    content: "",
  });

  const renderFrame = (tick: number): void => {
    const cols = Math.max(40, (screen.width as number) || 80);
    overlay.setContent(renderJexxxusSplashFrame(tick, cols - 4));
    screen.render();
  };

  return {
    element: overlay,
    play() {
      return new Promise((resolve) => {
        let tick = 0;
        renderFrame(0);
        const timer = setInterval(() => {
          tick++;
          if (tick >= totalFrames) {
            clearInterval(timer);
            overlay.hide();
            screen.render();
            resolve();
            return;
          }
          renderFrame(tick);
        }, frameMs);
      });
    },
    destroy() {
      overlay.destroy();
    },
  };
}