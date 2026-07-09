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

/** Opt-in mouse for all blessed widgets (chat scroll, etc.). */
export function isBlessedMouseEnabled(): boolean {
  const raw = parseMouseEnv();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Mouse on slash-command popup — on by default for hover/click picks.
 * Set BLXCKCHAT_MOUSE=0 to disable all TUI mouse tracking.
 */
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
      const program = screen.program as unknown as BlessedProgramTeardown;
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