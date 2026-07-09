import type blessed from "blessed";

/**
 * Blessed registers element.key() on the shared program — every handler
 * fires unless gated. Only run when this element owns focus.
 */
export function bindFocusedKey(
  screen: blessed.Widgets.Screen,
  element: blessed.Widgets.Node,
  keys: string | string[],
  handler: () => void,
): void {
  const target = element as blessed.Widgets.Node & {
    key: (key: string | string[], listener: () => void) => void;
  };
  target.key(keys, () => {
    if (screen.focused !== element) return;
    handler();
  });
}