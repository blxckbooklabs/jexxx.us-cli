import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as readline from "readline";
import chalk from "chalk";

export interface Credentials {
  userId: string;
  email: string;
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
const PENDING_PATH = path.join(CREDS_DIR, "pending.json");
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

/**
 * Load credentials from ~/.jexxxus/credentials.json
 */
export function loadCredentials(): Credentials | null {
  try {
    if (!fs.existsSync(CREDS_PATH)) {
      return null;
    }

    const stat = fs.statSync(CREDS_PATH);
    const mode = stat.mode & parseInt("0o777", 8);
    if (mode !== 0o600) {
      console.warn(
        chalk.yellow(
          `⚠️  Warning: ~/.jexxxus/credentials.json has mode ${mode.toString(8)}, expected 0600. Fixing...`,
        ),
      );
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

  const content = JSON.stringify(creds, null, 2);
  fs.writeFileSync(CREDS_PATH, content, { mode: 0o600 });
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
 * Check if token needs refresh (expires in < 5 minutes)
 */
export function shouldRefreshToken(creds: Credentials): boolean {
  const expiresAt = new Date(creds.expiresAt);
  const now = new Date();
  const minutesLeft = (expiresAt.getTime() - now.getTime()) / 60000;
  return minutesLeft < 5;
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
 * Ensure token is valid, auto-refresh if needed
 */
export async function ensureValidToken(
  refreshFn?: (refreshToken: string) => Promise<Credentials>,
): Promise<Credentials> {
  const creds = loadCredentials();

  if (!creds) {
    throw new Error(
      "Not authenticated. Run: " + chalk.cyan("jexxxus auth login"),
    );
  }

  if (!isTokenValid(creds)) {
    throw new Error(
      "Token expired. Run: " +
        chalk.cyan("jexxxus auth login") +
        " to re-authenticate.",
    );
  }

  if (shouldRefreshToken(creds) && refreshFn) {
    try {
      const newCreds = await refreshFn(creds.refreshToken);
      saveCredentials(newCreds);
      return newCreds;
    } catch (err) {
      console.warn(
        chalk.yellow("⚠️  Failed to auto-refresh token:"),
        String(err),
      );
      // Fall back to current creds if refresh fails
      return creds;
    }
  }

  return creds;
}

/**
 * Save device auth pending state to poll file
 */
export function savePendingDeviceAuth(
  codeVerifier: string,
  pollUntilSeconds: number = 30,
): void {
  ensureCredsDir();
  const pollUntil = new Date(Date.now() + pollUntilSeconds * 1000).toISOString();
  const pending = { codeVerifier, pollUntil };
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2), {
    mode: 0o600,
  });
}

/**
 * Load pending device auth state
 */
export function loadPendingDeviceAuth(): { codeVerifier: string; pollUntil: string } | null {
  try {
    if (!fs.existsSync(PENDING_PATH)) {
      return null;
    }
    const content = fs.readFileSync(PENDING_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Delete pending device auth file
 */
export function deletePendingDeviceAuth(): void {
  if (fs.existsSync(PENDING_PATH)) {
    fs.unlinkSync(PENDING_PATH);
  }
}

/**
 * Poll ~/jexxxus/pending.json for device auth completion (fallback method)
 * Returns credentials when file is updated with refreshToken
 */
export async function pollDeviceAuthFile(
  timeoutSeconds: number = 30,
): Promise<Credentials> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  const pollIntervalMs = 500;

  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const pending = loadPendingDeviceAuth();

      if (!pending) {
        // File was deleted (auth completed or timed out)
        clearInterval(interval);
        reject(new Error("Device auth file missing"));
        return;
      }

      // Try to load completed credentials
      const creds = loadCredentials();
      if (creds && new Date(creds.refreshedAt) > new Date(startTime)) {
        clearInterval(interval);
        deletePendingDeviceAuth();
        resolve(creds);
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        deletePendingDeviceAuth();
        reject(new Error(`Device auth timeout after ${timeoutSeconds}s`));
      }
    }, pollIntervalMs);
  });
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
