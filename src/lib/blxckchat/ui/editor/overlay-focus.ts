import type blessed from "blessed";

type FocusableNode = blessed.Widgets.Node & {
  _done?: (err: unknown, value?: string | null) => void;
};

/** Pause transmit readInput without submit/cancel, then focus an overlay widget. */
export function takeOverlayFocus(
  screen: blessed.Widgets.Screen,
  target: blessed.Widgets.Node,
): void {
  const focused = screen.focused as FocusableNode | undefined;
  if (focused?._done) {
    focused._done("stop");
  }
  screen.saveFocus();
  (target as blessed.Widgets.Node & { focus: () => void }).focus();
}

/** Restore focus after an overlay closes (e.g. back to transmit). */
export function releaseOverlayFocus(screen: blessed.Widgets.Screen): void {
  screen.restoreFocus();
}