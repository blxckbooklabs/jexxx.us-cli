/** JEXXXUS BLXCKCHAT — pink retro TV / CRT glitch design tokens. */
export const THEME = {
  pink: "#ec4899",
  pinkDim: "#9d174d",
  pinkGlow: "#f472b6",
  magenta: "#d946ef",
  bg: "#050505",
  bgPanel: "#0a0a0a",
  bgElevated: "#111111",
  bgInset: "#080808",
  text: "#f5f5f5",
  textMuted: "#a3a3a3",
  textDim: "#525252",
  scanline: "#1a1a1a",
  cyan: "#67e8f9",
  success: "#4ade80",
  warning: "#facc15",
  error: "#f87171",
  glitch: "░▒▓█▄▀▌▐",
} as const;

/** Blessed inline color tags (hex fg). */
export const TAG = {
  pink: `{#ec4899-fg}`,
  pinkEnd: `{/}`,
  pinkBold: `{#ec4899-fg}{bold}`,
  pinkBoldEnd: `{/bold}{/}`,
  muted: `{gray-fg}`,
  mutedEnd: `{/gray-fg}`,
  dim: `{#525252-fg}`,
  dimEnd: `{/}`,
  cyan: `{#67e8f9-fg}`,
  cyanEnd: `{/}`,
  white: `{white-fg}`,
  whiteEnd: `{/white-fg}`,
} as const;

const GLITCH = THEME.glitch;

/** Deterministic static noise strip (retro TV signal bar). */
export function glitchNoise(width: number, seed = 0): string {
  const w = Math.max(8, width);
  let out = "";
  for (let i = 0; i < w; i++) {
    out += GLITCH[(i * 7 + seed * 13) % GLITCH.length];
  }
  return out;
}

/** Short corner ornament for CRT frames. */
export function crtCorner(which: "tl" | "tr" | "bl" | "br"): string {
  switch (which) {
    case "tl":
      return "▄▀";
    case "tr":
      return "▀▄";
    case "bl":
      return "▌░";
    case "br":
      return "░▐";
  }
}

/** Pi/Codex-style role pill label. */
export function rolePill(role: "you" | "blxckchat" | "system"): string {
  switch (role) {
    case "you":
      return `${TAG.pinkBold} you ${TAG.pinkBoldEnd}`;
    case "blxckchat":
      return `${TAG.cyan} blxckchat ${TAG.cyanEnd}`;
    case "system":
      return `${TAG.muted} signal ${TAG.mutedEnd}`;
  }
}

/** Horizontal rule with glitch fade at edges. */
export function glitchRule(width: number): string {
  const inner = Math.max(4, width - 4);
  const noise = glitchNoise(Math.min(6, inner), 2);
  const line = "─".repeat(Math.max(0, inner - noise.length));
  return `${TAG.dim}──${TAG.dimEnd}${TAG.pink}${noise}${TAG.pinkEnd}${TAG.dim}${line}${TAG.dimEnd}`;
}