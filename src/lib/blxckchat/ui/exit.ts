import type blessed from "blessed";

import { teardownBlessedScreen } from "./tty.js";

let exiting = false;

/** Tear down blessed and leave the terminal — safe to call multiple times. */
export function gracefulTuiExit(screen: blessed.Widgets.Screen, code = 0): void {
  if (exiting) return;
  exiting = true;

  teardownBlessedScreen(screen);
  process.exit(code);
}

type KeyableElement = {
  key: (keys: string | string[], listener: () => void) => void;
};

export interface BindExitKeysOptions {
  /** Delay SIGINT/SIGTERM exit until the TUI has finished its first render. */
  deferSignalMs?: number;
}

/** Bind Ctrl+C / Ctrl+D / Esc exit to every focusable widget. */
export function bindExitKeys(
  screen: blessed.Widgets.Screen,
  elements: KeyableElement[],
  onEscape?: () => boolean,
  options: BindExitKeysOptions = {},
): () => void {
  const deferMs = options.deferSignalMs ?? 400;
  let signalsArmed = false;

  const exit = (): void => gracefulTuiExit(screen, 0);

  const handleEscape = (): void => {
    if (onEscape?.()) return;
    exit();
  };

  for (const el of elements) {
    el.key(["C-c", "C-d"], exit);
    el.key(["escape"], handleEscape);
  }

  const armTimer = setTimeout(() => {
    signalsArmed = true;
  }, deferMs);

  const onSigint = (): void => {
    if (!signalsArmed) return;
    exit();
  };
  const onSigterm = (): void => {
    if (!signalsArmed) return;
    gracefulTuiExit(screen, 0);
  };

  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  const cleanup = (): void => {
    clearTimeout(armTimer);
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  };
  process.once("exit", cleanup);

  return exit;
}

/** Reset module exit guard (tests only). */
export function resetExitGuardForTests(): void {
  exiting = false;
}