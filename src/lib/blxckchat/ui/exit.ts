import type blessed from "blessed";

let exiting = false;

/** Tear down blessed and leave the terminal — safe to call multiple times. */
export function gracefulTuiExit(screen: blessed.Widgets.Screen, code = 0): void {
  if (exiting) return;
  exiting = true;

  try {
    screen.program.clear();
    screen.program.showCursor();
    screen.program.normalBuffer();
  } catch {
    // Terminal may already be torn down
  }

  try {
    screen.destroy();
  } catch {
    // ignore
  }

  process.exit(code);
}

type KeyableElement = {
  key: (keys: string | string[], listener: () => void) => void;
};

/** Bind Ctrl+C / Ctrl+D / Esc exit to every focusable widget. */
export function bindExitKeys(
  screen: blessed.Widgets.Screen,
  elements: KeyableElement[],
  onEscape?: () => boolean,
): () => void {
  const exit = (): void => gracefulTuiExit(screen, 0);

  const handleEscape = (): void => {
    if (onEscape?.()) return;
    exit();
  };

  for (const el of elements) {
    el.key(["C-c", "C-d"], exit);
    el.key(["escape"], handleEscape);
  }

  // Raw-mode TUI often swallows Ctrl+C before blessed routes it — catch SIGINT too.
  const onSigint = (): void => exit();
  const onSigterm = (): void => gracefulTuiExit(screen, 0);

  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  return exit;
}