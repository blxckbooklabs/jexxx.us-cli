import assert from "node:assert/strict";
import { test } from "node:test";
import * as http from "node:http";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  generateDeviceCode,
  generateCodeVerifier,
  generateCodeChallenge,
  isTokenValid,
  shouldRefreshToken,
  getTokenExpiryMinutes,
  startDeviceAuth,
  pollDeviceAuth,
  refreshAccessTokenViaServer,
  type Credentials,
} from "../lib/auth.js";

/** Spins up a local HTTP server standing in for secure.jexxx.us, pointed at
 * via JEXXXUS_SECURE_URL, so the device-auth HTTP functions can be tested
 * without a real deployment or network access. */
async function withMockSecureServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      (req as http.IncomingMessage & { parsedBody?: unknown }).parsedBody =
        body ? JSON.parse(body) : {};
      handler(req, res);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  const previousEnv = process.env.JEXXXUS_SECURE_URL;
  process.env.JEXXXUS_SECURE_URL = baseUrl;

  try {
    await fn(baseUrl);
  } finally {
    if (previousEnv === undefined) {
      delete process.env.JEXXXUS_SECURE_URL;
    } else {
      process.env.JEXXXUS_SECURE_URL = previousEnv;
    }
    // fetch()'s undici keep-alive sockets otherwise keep this connection
    // open, and server.close() waits for existing connections to finish —
    // without this, each test using the mock server pays Node's ~5s socket
    // idle timeout on shutdown.
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

test("generateDeviceCode creates 8-char alphanumeric codes", () => {
  const code1 = generateDeviceCode();
  const code2 = generateDeviceCode();

  assert.equal(code1.length, 8);
  assert.equal(code2.length, 8);
  assert.match(code1, /^[A-Z0-9]{8}$/);
  assert.match(code2, /^[A-Z0-9]{8}$/);
  // Codes should be different (very unlikely to match with random generation)
  assert.notEqual(code1, code2);
});

test("generateCodeVerifier creates 128-char base64url strings", () => {
  const verifier = generateCodeVerifier();
  assert.equal(verifier.length, 128);
  // base64url should only contain [A-Za-z0-9_-]
  assert.match(verifier, /^[A-Za-z0-9_-]{128}$/);
});

test("generateCodeChallenge creates SHA256 hash of verifier", () => {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  // Challenge should be base64url encoded
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  // Challenge length for SHA256 should be ~43 chars when base64url encoded
  assert(challenge.length > 40 && challenge.length < 50);
  // Different verifiers should produce different challenges
  const verifier2 = generateCodeVerifier();
  const challenge2 = generateCodeChallenge(verifier2);
  assert.notEqual(challenge, challenge2);
});

test("isTokenValid returns true for future expiry, false for past", () => {
  const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
  const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago

  const futureCreds: Credentials = {
    userId: "user123",
    email: "test@example.com",
    accessToken: "token123",
    refreshToken: "refresh123",
    expiresAt: futureDate,
    refreshedAt: new Date().toISOString(),
  };

  const pastCreds: Credentials = {
    userId: "user123",
    email: "test@example.com",
    accessToken: "token123",
    refreshToken: "refresh123",
    expiresAt: pastDate,
    refreshedAt: new Date().toISOString(),
  };

  assert.equal(isTokenValid(futureCreds), true);
  assert.equal(isTokenValid(pastCreds), false);
  assert.equal(isTokenValid(null), false);
});

test("shouldRefreshToken detects < 45s to expiry", () => {
  const soon = new Date(Date.now() + 30000).toISOString(); // 30 seconds from now
  const later = new Date(Date.now() + 120000).toISOString(); // 2 minutes from now

  const soonCreds: Credentials = {
    userId: "user123",
    email: "test@example.com",
    accessToken: "token123",
    refreshToken: "refresh123",
    expiresAt: soon,
    refreshedAt: new Date().toISOString(),
  };

  const laterCreds: Credentials = {
    userId: "user123",
    email: "test@example.com",
    accessToken: "token123",
    refreshToken: "refresh123",
    expiresAt: later,
    refreshedAt: new Date().toISOString(),
  };

  assert.equal(shouldRefreshToken(soonCreds), true);
  assert.equal(shouldRefreshToken(laterCreds), false);
});

test("getTokenExpiryMinutes calculates remaining time", () => {
  const fiveMinFromNow = new Date(Date.now() + 300000).toISOString();
  const creds: Credentials = {
    userId: "user123",
    email: "test@example.com",
    accessToken: "token123",
    refreshToken: "refresh123",
    expiresAt: fiveMinFromNow,
    refreshedAt: new Date().toISOString(),
  };

  const minutes = getTokenExpiryMinutes(creds);
  // Should be approximately 5 minutes (allow 1 minute variance for test execution)
  assert(minutes >= 4 && minutes <= 6);
});

test("startDeviceAuth posts codeChallenge and returns a verificationUrl", async () => {
  await withMockSecureServer(
    (req, res) => {
      const body = (req as http.IncomingMessage & { parsedBody: { codeChallenge?: string } })
        .parsedBody;
      assert.equal(req.url, "/api/auth/cli/device/start");
      assert.ok(body.codeChallenge, "codeChallenge should be present");
      sendJson(res, 200, { userCode: "ABCD1234", expiresIn: 300 });
    },
    async (baseUrl) => {
      const result = await startDeviceAuth();
      assert.equal(result.userCode, "ABCD1234");
      assert.equal(result.expiresIn, 300);
      assert.equal(result.verificationUrl, `${baseUrl}/auth/cli?code=ABCD1234`);
      assert.equal(result.codeVerifier.length, 128);
    },
  );
});

test("pollDeviceAuth resolves credentials once status is consumed", async () => {
  let callCount = 0;
  await withMockSecureServer(
    (_req, res) => {
      callCount++;
      if (callCount < 2) {
        sendJson(res, 200, { status: "pending" });
        return;
      }
      sendJson(res, 200, {
        status: "consumed",
        accessToken: "at_123",
        refreshToken: "rt_456",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        userId: "user_abc",
        email: "test@example.com",
      });
    },
    async () => {
      const creds = await pollDeviceAuth("ABCD1234", "verifier", 30, 10);
      assert.equal(creds.accessToken, "at_123");
      assert.equal(creds.refreshToken, "rt_456");
      assert.equal(creds.userId, "user_abc");
      assert.equal(creds.email, "test@example.com");
      assert.equal(callCount, 2);
    },
  );
});

test("pollDeviceAuth throws when the user denies authorization", async () => {
  await withMockSecureServer(
    (_req, res) => sendJson(res, 200, { status: "denied" }),
    async () => {
      await assert.rejects(
        () => pollDeviceAuth("ABCD1234", "verifier", 30, 10),
        /denied/i,
      );
    },
  );
});

test("pollDeviceAuth throws when the device code expires", async () => {
  await withMockSecureServer(
    (_req, res) => sendJson(res, 200, { status: "expired" }),
    async () => {
      await assert.rejects(
        () => pollDeviceAuth("ABCD1234", "verifier", 30, 10),
        /expired/i,
      );
    },
  );
});

test("refreshAccessTokenViaServer exchanges refreshToken for a fresh access token", async () => {
  await withMockSecureServer(
    (req, res) => {
      const body = (req as http.IncomingMessage & { parsedBody: { refreshToken?: string } })
        .parsedBody;
      assert.equal(body.refreshToken, "rt_456");
      sendJson(res, 200, {
        accessToken: "at_new",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        userId: "user_abc",
        email: "test@example.com",
      });
    },
    async () => {
      const creds = await refreshAccessTokenViaServer("rt_456");
      assert.equal(creds.accessToken, "at_new");
      assert.equal(creds.refreshToken, "rt_456");
      assert.equal(creds.userId, "user_abc");
    },
  );
});

test("refreshAccessTokenViaServer throws on server error", async () => {
  await withMockSecureServer(
    (_req, res) => sendJson(res, 401, { error: "Invalid refresh token" }),
    async () => {
      await assert.rejects(
        () => refreshAccessTokenViaServer("bad_token"),
        /Invalid refresh token/,
      );
    },
  );
});

test("credential file permissions are 0600", () => {
  const testDir = path.join(os.tmpdir(), "jexxxus-test-auth");
  const credsPath = path.join(testDir, "credentials.json");

  try {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { mode: 0o700, recursive: true });
    }

    const creds = { userId: "test", email: "test@example.com", accessToken: "token", refreshToken: "refresh", expiresAt: new Date().toISOString(), refreshedAt: new Date().toISOString() };
    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2), { mode: 0o600 });

    const stat = fs.statSync(credsPath);
    // eslint-disable-next-line no-bitwise
    const mode = stat.mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    if (fs.existsSync(credsPath)) {
      fs.unlinkSync(credsPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  }
});
