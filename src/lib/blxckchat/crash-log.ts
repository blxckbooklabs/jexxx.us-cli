import * as fs from "fs";
import * as path from "path";

import { getCredentialsDir } from "../auth.js";

const CRASH_LOG_PATH = path.join(getCredentialsDir(), "crash.log");

/**
 * Append a full stack trace (not just err.message) to ~/.jexxxus/crash.log.
 * The TUI's top-level catch only ever showed err.message to the user —
 * useful for expected errors, but it silently discards the stack for
 * anything unexpected (e.g. a genuine bug like a stack overflow), making
 * those effectively undiagnosable after the fact. Call this alongside
 * (not instead of) the existing user-facing error message.
 */
export function logCrash(context: string, err: unknown): void {
  try {
    const dir = getCredentialsDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    const entry = `[${new Date().toISOString()}] ${context}\n${stack}\n\n`;
    fs.appendFileSync(CRASH_LOG_PATH, entry, { mode: 0o600 });
  } catch {
    // Logging must never itself throw and mask the original error.
  }
}

export function getCrashLogPath(): string {
  return CRASH_LOG_PATH;
}
