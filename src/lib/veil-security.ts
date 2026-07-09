import * as fs from "fs";
import * as path from "path";

/** Only these hosts may be fetched for public VEIL RSS/content mirrors. */
const ALLOWED_PUBLIC_HOSTS = new Set([
  "veil.jexxx.us",
  "localhost",
  "127.0.0.1",
]);

/**
 * Validates a public base URL before any outbound fetch. HTTPS required except
 * localhost dev. Host must be veil.jexxx.us or loopback — blocks SSRF to
 * internal networks via VEIL_PUBLIC_BASE_URL.
 */
export function assertAllowedVeilPublicBaseUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[VEIL] Invalid public base URL: ${rawUrl}`);
  }

  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!isLoopback && parsed.protocol !== "https:") {
    throw new Error("[VEIL] Public VEIL base URL must use HTTPS.");
  }

  if (!ALLOWED_PUBLIC_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `[VEIL] Public base URL host not allowed: ${parsed.hostname}. ` +
        "Only veil.jexxx.us (or localhost for dev) is permitted.",
    );
  }

  return rawUrl.replace(/\/$/, "");
}

/** Read a single markdown file from an approved directory — no traversal. */
export function readPublicMarkdownFile(dir: string, filename: string): string {
  if (
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    !filename.endsWith(".md")
  ) {
    throw new Error(`[VEIL] Blocked unsafe content path: ${filename}`);
  }

  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(resolvedDir, filename);
  if (!resolvedFile.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new Error(`[VEIL] Blocked path escape for: ${filename}`);
  }

  return fs.readFileSync(resolvedFile, "utf-8");
}

/** Posts/articles directory must be a real directory with only flat .md files. */
export function assertSafeArticlePostsDir(postsDir: string): void {
  const resolved = path.resolve(postsDir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`[VEIL] Article posts directory not found: ${postsDir}`);
  }

  for (const entry of fs.readdirSync(resolved)) {
    const entryPath = path.join(resolved, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      throw new Error(`[VEIL] Nested content blocked in posts dir: ${entry}`);
    }
  }
}