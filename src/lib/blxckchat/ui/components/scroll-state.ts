/** Scroll math shared by message-box and tests (blessed line units). */

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