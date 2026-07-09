/** Scroll math shared by message-box and tests (blessed line units). */

/** Pi TUI coalesces rapid stream renders (~60fps). */
export const STREAM_RENDER_INTERVAL_MS = 16;

/** OpenCode defers sticky-bottom until layout settles. */
export const SCROLL_LAYOUT_DEFER_MS = 50;

export function scrollPercent(
  scroll: number,
  viewport: number,
  contentHeight: number,
): number {
  const maxScroll = Math.max(0, contentHeight - viewport);
  if (maxScroll <= 0) return 100;
  return Math.round(Math.min(100, Math.max(0, (scroll / maxScroll) * 100)));
}

export function isNearBottom(
  scroll: number,
  viewport: number,
  contentHeight: number,
  threshold = 3,
): boolean {
  if (contentHeight <= viewport) return true;
  return scroll + viewport >= contentHeight - threshold;
}

/** After setContent: only follow the tail when the user was already pinned. */
export function scrollPercentAfterContent(
  pinnedToBottom: boolean,
  savedPercent: number,
): number {
  return pinnedToBottom ? 100 : Math.min(100, Math.max(0, savedPercent));
}

/** OpenCode restores absolute scrollTop; clamp when content height changes. */
export function restoreScrollOffset(
  savedScroll: number,
  viewport: number,
  contentHeight: number,
): number {
  const maxScroll = Math.max(0, contentHeight - viewport);
  return Math.min(Math.max(0, savedScroll), maxScroll);
}

/** OpenCode page up/down: half the message viewport. */
export function pageScrollDelta(viewport: number): number {
  return Math.max(5, Math.floor(viewport / 2));
}

/** OpenCode half-page: quarter of the message viewport. */
export function halfPageScrollDelta(viewport: number): number {
  return Math.max(5, Math.floor(viewport / 4));
}

/** OpenCode line scroll is ±1; override with BLXCKCHAT_SCROLL_LINES. */
export function lineScrollStep(): number {
  const raw = process.env.BLXCKCHAT_SCROLL_LINES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}