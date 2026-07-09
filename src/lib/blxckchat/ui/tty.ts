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

export function prepareStdinForTui(): void {
  if (!process.stdin.isTTY) return;
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
}