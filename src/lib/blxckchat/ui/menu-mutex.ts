/**
 * Ensures only one transient menu is active (slash suggestions OR modal overlay).
 * Picker overlays call dismissSlashMenuBeforeOverlay() on open; transmit blocks
 * slash refresh while any modal overlay is visible.
 */

let dismissSlashMenu: (() => void) | undefined;
let isOverlayActive: (() => boolean) | undefined;

export function registerSlashMenuDismiss(handler: () => void): void {
  dismissSlashMenu = handler;
}

export function registerOverlayActiveCheck(check: () => boolean): void {
  isOverlayActive = check;
}

/** Hide slash /commands suggestions before showing a modal picker or prompt. */
export function dismissSlashMenuBeforeOverlay(): void {
  dismissSlashMenu?.();
}

export function isModalOverlayActive(): boolean {
  return isOverlayActive?.() ?? false;
}