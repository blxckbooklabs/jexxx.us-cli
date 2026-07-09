/** Only these hosts may be fetched for public Law RSS/content mirrors. */
const ALLOWED_PUBLIC_HOSTS = new Set([
  "law.jexxx.us",
  "localhost",
  "127.0.0.1",
]);

/**
 * Validates a public base URL before any outbound fetch. HTTPS required except
 * localhost dev. Host must be law.jexxx.us or loopback — blocks SSRF to
 * internal networks via LAW_PUBLIC_BASE_URL.
 */
export function assertAllowedLawPublicBaseUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[Law] Invalid public base URL: ${rawUrl}`);
  }

  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!isLoopback && parsed.protocol !== "https:") {
    throw new Error("[Law] Public Law base URL must use HTTPS.");
  }

  if (!ALLOWED_PUBLIC_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `[Law] Public base URL host not allowed: ${parsed.hostname}. ` +
        "Only law.jexxx.us (or localhost for dev) is permitted.",
    );
  }

  return rawUrl.replace(/\/$/, "");
}
