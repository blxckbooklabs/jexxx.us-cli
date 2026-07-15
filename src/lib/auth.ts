import { exec } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as readline from "readline";
import chalk from "chalk";

/**
 * Overridable for local dev/testing against a non-production secure.jexxx.us
 * deploy. Read lazily (not as a module-load-time constant) so tests can set
 * JEXXXUS_SECURE_URL after this module has already been imported.
 */
export function getSecureBaseUrl(): string {
  return process.env.JEXXXUS_SECURE_URL?.trim() || "https://secure.jexxx.us";
}

export interface Credentials {
  userId: string;
  email: string;
  /** Clerk display name from secure.jexxx.us (optional until re-login/refresh). */
  fullName?: string;
  username?: string | null;
  imageUrl?: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshedAt: string;
}

export interface CredentialsFile {
  providers?: unknown; // For backward compat with BLXCKCHAT provider config if needed
  credentials?: Credentials;
}

const CREDS_DIR = path.join(os.homedir(), ".jexxxus");
const CREDS_PATH = path.join(CREDS_DIR, "credentials.json");
const DEBUG_LOG = path.join(CREDS_DIR, "debug.log");

export function getCredentialsDir(): string {
  return CREDS_DIR;
}

export function getCredentialsPath(): string {
  return CREDS_PATH;
}

/**
 * Ensure ~/.jexxxus directory exists with correct permissions
 */
export function ensureCredsDir(): void {
  if (!fs.existsSync(CREDS_DIR)) {
    fs.mkdirSync(CREDS_DIR, { mode: 0o700, recursive: true });
  }
}

export interface LoadCredentialsOptions {
  /** Suppress chmod warnings — use when blessed TUI owns stdout. */
  quiet?: boolean;
}

/**
 * Load credentials from ~/.jexxxus/credentials.json
 */
export function loadCredentials(options: LoadCredentialsOptions = {}): Credentials | null {
  try {
    if (!fs.existsSync(CREDS_PATH)) {
      return null;
    }

    const stat = fs.statSync(CREDS_PATH);
    const mode = stat.mode & parseInt("0o777", 8);
    if (mode !== 0o600) {
      if (!options.quiet) {
        console.warn(
          chalk.yellow(
            `⚠️  Warning: ~/.jexxxus/credentials.json has mode ${mode.toString(8)}, expected 0600. Fixing...`,
          ),
        );
      }
      fs.chmodSync(CREDS_PATH, 0o600);
    }

    const content = fs.readFileSync(CREDS_PATH, "utf-8");
    const data = JSON.parse(content) as CredentialsFile;

    // Support both direct credentials and nested credentials field
    const creds = (data as Credentials).accessToken ? (data as Credentials) : data.credentials;

    if (!creds) {
      return null;
    }

    return creds;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Save credentials to ~/.jexxxus/credentials.json with 0600 permissions
 */
export function saveCredentials(creds: Credentials): void {
  ensureCredsDir();

  let existing: CredentialsFile = {};
  if (fs.existsSync(CREDS_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(CREDS_PATH, "utf-8")) as CredentialsFile;
    } catch {
      existing = {};
    }
  }

  const content = JSON.stringify(
    {
      ...existing,
      credentials: creds,
      providers: existing.providers,
    },
    null,
    2,
  );
  fs.writeFileSync(CREDS_PATH, content, { mode: 0o600 });
  try {
    fs.chmodSync(CREDS_PATH, 0o600);
  } catch {
    // Best-effort — some filesystems ignore mode on write
  }
}

/**
 * Delete credentials file securely (overwrite then delete)
 */
export function deleteCredentials(): void {
  if (!fs.existsSync(CREDS_PATH)) {
    return;
  }

  const size = fs.statSync(CREDS_PATH).size;
  // Overwrite with random bytes before deletion
  fs.writeFileSync(CREDS_PATH, crypto.randomBytes(size));
  fs.unlinkSync(CREDS_PATH);
}

/**
 * Generate a random device code (6-8 character alphanumeric)
 */
export function generateDeviceCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const length = 8;
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Generate PKCE code verifier (RFC 7636, 128-char random)
 */
export function generateCodeVerifier(): string {
  const bytes = crypto.randomBytes(96); // 96 bytes = 128 base64url chars
  return bytes.toString("base64url");
}

/**
 * Generate PKCE code challenge from verifier (SHA256(verifier))
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return Buffer.from(hash).toString("base64url");
}

/**
 * Check if credentials are still valid (not expired)
 */
export function isTokenValid(creds: Credentials | null): boolean {
  if (!creds) {
    return false;
  }
  const expiresAt = new Date(creds.expiresAt);
  return expiresAt > new Date();
}

/**
 * Check if token needs refresh. Clerk session JWTs from secure.jexxx.us are
 * often ~60s TTL — refresh when fewer than 45 seconds remain.
 */
export function shouldRefreshToken(creds: Credentials): boolean {
  const expiresAt = new Date(creds.expiresAt);
  const now = new Date();
  const secondsLeft = (expiresAt.getTime() - now.getTime()) / 1000;
  return secondsLeft < 45;
}

/**
 * Get time in minutes until token expires
 */
export function getTokenExpiryMinutes(creds: Credentials): number {
  const expiresAt = new Date(creds.expiresAt);
  const now = new Date();
  return (expiresAt.getTime() - now.getTime()) / 60000;
}

/**
 * Ensure token is valid — refreshes via secure.jexxx.us when expired or
 * expiring within 5 minutes (Clerk session JWTs are often ~60s TTL).
 */
export async function ensureValidToken(
  refreshFn?: (refreshToken: string) => Promise<Credentials>,
  options: LoadCredentialsOptions = {},
): Promise<Credentials> {
  const creds = loadCredentials(options);

  if (!creds) {
    throw new Error(
      "Not authenticated. Run: " + chalk.cyan("jexxxus auth login"),
    );
  }

  const expired = !isTokenValid(creds);
  const expiringSoon = shouldRefreshToken(creds);

  if ((expired || expiringSoon) && refreshFn) {
    try {
      const newCreds = await refreshFn(creds.refreshToken);
      saveCredentials(newCreds);
      return newCreds;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (expired) {
        throw new Error(
          `Token expired and refresh failed: ${detail}. Run /auth login or ` +
            chalk.cyan("jexxxus auth login") +
            " to re-authenticate.",
        );
      }
      if (!options.quiet) {
        console.warn(
          chalk.yellow("⚠️  Failed to auto-refresh token:"),
          detail,
        );
      }
      return creds;
    }
  }

  if (expired) {
    throw new Error(
      "Token expired. Run /auth refresh, /auth login, or " +
        chalk.cyan("jexxxus auth login") +
        " to re-authenticate.",
    );
  }

  return creds;
}

interface DeviceStartResponse {
  userCode: string;
  expiresIn: number;
}

interface PollResponse {
  status:
    | "pending"
    | "authorized"
    | "consumed"
    | "denied"
    | "expired"
    | "not_found";
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: string;
  userId?: string;
  email?: string;
  fullName?: string;
  username?: string | null;
  imageUrl?: string | null;
}

interface TokenResponse {
  accessToken: string;
  expiresAt: string;
  userId: string;
  email: string;
  fullName?: string;
  username?: string | null;
  imageUrl?: string | null;
}

interface AuthProfileFields {
  fullName?: string | undefined;
  username?: string | null | undefined;
  imageUrl?: string | null | undefined;
}

function mergeAuthProfile(
  existing: Partial<Credentials>,
  profile: AuthProfileFields,
): Partial<Pick<Credentials, "fullName" | "username" | "imageUrl">> {
  const merged: Partial<Pick<Credentials, "fullName" | "username" | "imageUrl">> = {};
  const fullName = profile.fullName ?? existing.fullName;
  if (fullName) merged.fullName = fullName;
  const username = profile.username !== undefined ? profile.username : existing.username;
  if (username !== undefined) merged.username = username;
  const imageUrl = profile.imageUrl !== undefined ? profile.imageUrl : existing.imageUrl;
  if (imageUrl !== undefined) merged.imageUrl = imageUrl;
  return merged;
}

function credentialsFromAuthResponse(
  data: {
    userId: string;
    email: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  } & AuthProfileFields,
  existing: Partial<Credentials> = {},
): Credentials {
  const now = new Date().toISOString();
  return {
    userId: data.userId,
    email: data.email,
    ...mergeAuthProfile(existing, data),
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    refreshedAt: now,
  };
}

/** Human-readable auth status for TUI / slash /status output. */
export function formatAuthStatusLines(creds: Credentials | null): string[] {
  if (!creds) {
    return [
      "JEXXXUS account: not signed in",
      "Run /auth login or: jexxxus auth login",
      "Gateway: secure.jexxx.us (device authorization)",
    ];
  }

  const expiryMinutes = getTokenExpiryMinutes(creds);
  const expiryLabel =
    expiryMinutes < 0
      ? "EXPIRED"
      : expiryMinutes < 5
        ? `${Math.floor(expiryMinutes)}m remaining (refresh soon)`
        : `${Math.floor(expiryMinutes)}m remaining`;

  const lines = [
    "JEXXXUS account: signed in",
    creds.fullName ? `Name: ${creds.fullName}` : null,
    `Email: ${creds.email}`,
    creds.username ? `Username: ${creds.username}` : null,
    `User ID: ${creds.userId}`,
    creds.imageUrl ? `Profile image: ${creds.imageUrl}` : null,
    `Token: ${expiryLabel}`,
    `Last refreshed: ${new Date(creds.refreshedAt).toLocaleString()}`,
  ].filter((line): line is string => Boolean(line));

  return lines;
}

/**
 * Shared device-login flow for `jexxxus auth login` and BLXCKCHAT `/auth login`.
 * Prints instructions to stdout and polls secure.jexxx.us until allow/deny/timeout.
 */
export async function runInteractiveDeviceLogin(): Promise<Credentials> {
  ensureCredsDir();

  const { userCode, codeVerifier, expiresIn, verificationUrl } =
    await startDeviceAuth();

  console.log(chalk.cyan("\n[AUTH] To authorize this CLI:\n"));
  console.log(`Visit:   ${chalk.bold.underline(verificationUrl)}`);
  console.log(`Enter:   ${chalk.bold.bgMagenta.black(` ${userCode} `)}`);
  console.log(chalk.dim(`Expires: ${Math.floor(expiresIn / 60)} minutes\n`));

  openDeviceAuthBrowser(verificationUrl);

  console.log(chalk.dim("Waiting for authorization..."));

  return pollDeviceAuth(userCode, codeVerifier, expiresIn);
}

/** Open the secure.jexxx.us device consent page in the system browser. */
export function openDeviceAuthBrowser(verificationUrl: string): void {
  try {
    const openCommand =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    exec(`${openCommand} "${verificationUrl}"`);
  } catch {
    // Headless / SSH — user opens the URL manually
  }
}

/**
 * Step 1 of `jexxxus auth login`: register a new device session with
 * secure.jexxx.us. Sends only the PKCE code_challenge — the code_verifier
 * this function generates stays local until poll time. Returns the URL
 * without the code — user enters code manually on the page for security.
 */
export async function startDeviceAuth(): Promise<{
  userCode: string;
  codeVerifier: string;
  expiresIn: number;
  verificationUrl: string;
}> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const response = await fetch(`${getSecureBaseUrl()}/api/auth/cli/device/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codeChallenge }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? `Device auth start failed (${response.status})`);
  }

  const data = (await response.json()) as DeviceStartResponse;

  return {
    userCode: data.userCode,
    codeVerifier,
    expiresIn: data.expiresIn,
    verificationUrl: `${getSecureBaseUrl()}/auth/cli`,
  };
}

/**
 * Step 2: poll secure.jexxx.us until the browser-side consent screen
 * resolves (allow, deny, or the device code expires). Returns full
 * Credentials once the user grants access.
 */
export async function pollDeviceAuth(
  userCode: string,
  codeVerifier: string,
  timeoutSeconds: number,
  pollIntervalMs: number = 2000,
): Promise<Credentials> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${getSecureBaseUrl()}/api/auth/cli/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCode, codeVerifier }),
    });

    const data = (await response.json().catch(() => ({}))) as Partial<PollResponse>;

    if (data.status === "consumed" && data.accessToken && data.refreshToken) {
      const now = new Date().toISOString();
      return credentialsFromAuthResponse({
        userId: data.userId ?? "",
        email: data.email ?? "",
        fullName: data.fullName,
        username: data.username,
        imageUrl: data.imageUrl,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt ?? now,
      });
    }

    if (data.status === "denied") {
      throw new Error("Authorization was denied.");
    }

    if (data.status === "expired" || data.status === "not_found") {
      throw new Error("Device code expired. Run 'jexxxus auth login' again.");
    }

    // status === "pending" (or transient "authorized" mid-consume) — keep polling
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for authorization after ${timeoutSeconds}s.`);
}

/**
 * Refresh: exchange the stored refresh_token for a fresh access token via
 * secure.jexxx.us. The server mints this server-side against the user's
 * Clerk session — no browser interaction needed.
 */
export async function refreshAccessTokenViaServer(
  refreshToken: string,
): Promise<Credentials> {
  const response = await fetch(`${getSecureBaseUrl()}/api/auth/cli/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body?.error ?? `Token refresh failed (${response.status}). Run 'jexxxus auth login' again.`,
    );
  }

  const data = (await response.json()) as TokenResponse;
  const existing = loadCredentials({ quiet: true }) ?? {};

  return credentialsFromAuthResponse(
    {
      userId: data.userId,
      email: data.email,
      fullName: data.fullName,
      username: data.username,
      imageUrl: data.imageUrl,
      accessToken: data.accessToken,
      refreshToken,
      expiresAt: data.expiresAt,
    },
    existing,
  );
}

/**
 * Append entry to debug log
 */
export function logDebug(message: string): void {
  ensureCredsDir();
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(DEBUG_LOG, entry, { mode: 0o600 });
}

/**
 * Interactive readline prompt for y/n confirmation
 */
export async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.cyan(`${question} (y/N): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}
