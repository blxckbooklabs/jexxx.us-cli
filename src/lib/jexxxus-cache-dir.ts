import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NEXT_RUNTIME ||
      process.env.VERCEL_ENV,
  );
}

/** Writable JEXXXUS state directory — ~/.jexxxus locally, /tmp on serverless. */
export function resolveJexxxusDir(): string {
  const override = process.env.JEXXXUS_CACHE_DIR?.trim();
  if (override) return override;

  if (isServerlessRuntime()) {
    return path.join(os.tmpdir(), ".jexxxus");
  }

  return path.join(os.homedir(), ".jexxxus");
}

/** Best-effort mkdir; returns false when the filesystem is read-only. */
export function ensureJexxxusDir(dir = resolveJexxxusDir()): boolean {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    return true;
  } catch {
    return false;
  }
}

export function jexxxusFile(...segments: string[]): string {
  return path.join(resolveJexxxusDir(), ...segments);
}