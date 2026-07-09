import * as fs from "fs";
import * as path from "path";

/** Only these hosts may be fetched for public JEXXXUS | TV mirrors. */
const ALLOWED_PUBLIC_HOSTS = new Set([
  "tv.jexxx.us",
  "localhost",
  "127.0.0.1",
]);

/**
 * Validates a public base URL before any outbound fetch. HTTPS required except
 * localhost dev. Host must be tv.jexxx.us or loopback — blocks SSRF via
 * TV_PUBLIC_BASE_URL.
 */
export function assertAllowedTvPublicBaseUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[TV] Invalid public base URL: ${rawUrl}`);
  }

  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!isLoopback && parsed.protocol !== "https:") {
    throw new Error("[TV] Public TV base URL must use HTTPS.");
  }

  if (!ALLOWED_PUBLIC_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `[TV] Public base URL host not allowed: ${parsed.hostname}. ` +
        "Only tv.jexxx.us (or localhost for dev) is permitted.",
    );
  }

  return rawUrl.replace(/\/$/, "");
}

/** Read a single approved JSON catalog file — no traversal. */
export function readPublicJsonCatalog(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!resolved.endsWith(".json")) {
    throw new Error(`[TV] Blocked non-JSON catalog path: ${filePath}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`[TV] Catalog file not found: ${filePath}`);
  }
  return fs.readFileSync(resolved, "utf-8");
}

/** Read llms-full.txt or llms.txt from an approved public/ directory. */
export function readPublicLlmsFile(publicDir: string, filename: "llms-full.txt" | "llms.txt"): string {
  if (filename !== "llms-full.txt" && filename !== "llms.txt") {
    throw new Error(`[TV] Blocked llms filename: ${filename}`);
  }
  const resolvedDir = path.resolve(publicDir);
  const resolvedFile = path.resolve(resolvedDir, filename);
  if (!resolvedFile.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new Error(`[TV] Blocked path escape for: ${filename}`);
  }
  if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
    throw new Error(`[TV] llms file not found: ${resolvedFile}`);
  }
  return fs.readFileSync(resolvedFile, "utf-8");
}