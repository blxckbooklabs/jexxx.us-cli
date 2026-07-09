import type blessed from "blessed";

export interface TtyCheckResult {
  ok: boolean;
  reason?: string;
}

const MIN_COLS = 40;

/** Blessed requires both stdin and stdout attached to a real terminal. */
export function canRunBlessedTui(): TtyCheckResult {
  if (!process.stdin.isTTY) {
    return { ok: false, reason: "stdin is not a TTY (try a real terminal, not a pipe)" };
  }
  if (!process.stdout.isTTY) {
    return { ok: false, reason: "stdout is not a TTY" };
  }
  const cols = process.stdout.columns ?? 0;
  if (cols > 0 && cols < MIN_COLS) {
    return { ok: false, reason: `terminal too narrow (${cols} cols, need ${MIN_COLS}+)` };
  }
  return { ok: true };
}

function parseMouseEnv(): string {
  return process.env.BLXCKCHAT_MOUSE?.trim().toLowerCase() ?? "";
}

/**
 * Mouse for chat scrollbar drag, wheel scroll, and overlays.
 * On by default (accessibility). Set BLXCKCHAT_MOUSE=0 to disable all tracking.
 */
export function isBlessedMouseEnabled(): boolean {
  return isSlashPopupMouseEnabled();
}

/** Alias — slash popup and chat history share the same mouse policy. */
export function isSlashPopupMouseEnabled(): boolean {
  const raw = parseMouseEnv();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}

export function prepareStdinForTui(): void {
  if (!process.stdin.isTTY) return;
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
}

type BlessedProgramTeardown = {
  disableMouse?: () => void;
  clear: () => void;
  showCursor: () => void;
  normalBuffer: () => void;
};

type BlessedProgramPause = {
  pause: () => (() => void) | undefined;
  resume: () => void;
  sigtstp: (callback?: () => void) => void;
};

function blessedProgram(screen: blessed.Widgets.Screen): BlessedProgramPause & BlessedProgramTeardown {
  return screen.program as unknown as BlessedProgramPause & BlessedProgramTeardown;
}

/**
 * Release the alternate screen and cooked TTY so console.log / readline can run.
 * Returns a function that restores the blessed session (call in finally).
 */
export function pauseBlessedForConsole(screen: blessed.Widgets.Screen): () => void {
  const program = blessedProgram(screen);
  const resume = program.pause?.();
  return () => {
    if (typeof resume === "function") {
      resume();
      return;
    }
    program.resume?.();
  };
}

/** Ctrl+Z style suspend — uses blessed program.sigtstp when available. */
export function suspendBlessedToShell(
  screen: blessed.Widgets.Screen,
  onResume?: () => void,
): void {
  const program = blessedProgram(screen);
  if (typeof program.sigtstp === "function") {
    program.sigtstp(onResume);
    return;
  }
  const resume = pauseBlessedForConsole(screen);
  process.kill(process.pid, "SIGTSTP");
  process.once("SIGCONT", () => {
    resume();
    onResume?.();
  });
}

/** ANSI belt-and-suspenders when blessed teardown is partial or unavailable. */
export function writeTerminalResetSequences(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(
    "\x1b[?25h" + // show cursor
      "\x1b[?1000l" + // disable mouse click tracking
      "\x1b[?1002l" + // disable cell motion tracking
      "\x1b[?1003l" + // disable all motion tracking
      "\x1b[?1006l" + // disable SGR extended mouse mode
      "\x1b[?1049l", // leave alternate screen
  );
}

/** Tear down a blessed screen and restore a normal cooked TTY for readline / shell. */
export function teardownBlessedScreen(screen?: blessed.Widgets.Screen): void {
  if (screen) {
    try {
      const program = blessedProgram(screen);
      program.disableMouse?.();
      program.clear();
      program.showCursor();
      program.normalBuffer();
    } catch {
      // Terminal may already be torn down
    }
    try {
      screen.destroy();
    } catch {
      // ignore
    }
  }

  writeTerminalResetSequences();

  if (process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    if (typeof process.stdin.setRawMode === "function") {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // ignore
      }
    }
    process.stdin.resume();
  }
}

/** Prepare stdin/stdout after a failed or skipped blessed session. */
export function restoreTerminalForReadline(screen?: blessed.Widgets.Screen): void {
  teardownBlessedScreen(screen);
}