import * as fs from "fs";
import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { promisify } from "node:util";

import { getCredentialsDir } from "../../../auth.js";

export function getSnapshotPath(): string {
  return `${getCredentialsDir()}/tui-snapshot.txt`;
}

export function getChromeDigestPath(): string {
  return `${getCredentialsDir()}/chrome-digest.txt`;
}

function writeSnapshotFile(target: string, text: string): string {
  const dir = getCredentialsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(target, text, { encoding: "utf-8", mode: 0o600 });
  return target;
}

/** Persist the latest plain-text TUI snapshot for debugging. */
export function writeSnapshot(text: string): string {
  return writeSnapshotFile(getSnapshotPath(), text);
}

/** Persist the latest chrome digest (text indicators only). */
export function writeChromeDigest(text: string): string {
  return writeSnapshotFile(getChromeDigestPath(), text);
}

const execFileAsync = promisify(execFile);

/** Normalize clipboard text for single-line secret inputs (API keys). */
export function normalizeSecretClipboardPaste(text: string): string {
  return text.replace(/\r?\n/g, "").replace(/\t/g, "").trim();
}

/** macOS pasteboard — explicit path; spawn('pbpaste') can fail in some PATH contexts. */
export async function readClipboardRobust(): Promise<string> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("/usr/bin/pbpaste", [], {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
      });
      return stdout;
    } catch {
      return readClipboard();
    }
  }
  return readClipboard();
}

/** Read plain text from the system clipboard (best-effort). */
export function readClipboard(): Promise<string> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[] = [];

    if (platform === "darwin") {
      cmd = "pbpaste";
    } else if (platform === "win32") {
      cmd = "powershell";
      args = ["-command", "Get-Clipboard"];
    } else {
      cmd = "xclip";
      args = ["-selection", "clipboard", "-o"];
    }

    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
    let data = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf-8");
    });
    proc.on("error", () => resolve(""));
    proc.on("close", () => resolve(data));
  });
}

/** OSC 52 — clipboard over SSH/tmux (OpenCode parity). */
export function writeClipboardOsc52(text: string): void {
  if (!process.stdout.isTTY || !text) return;
  const sequence = `\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`;
  const wrapped =
    process.env.TMUX || process.env.STY ? `\x1bPtmux;\x1b${sequence}\x1b\\` : sequence;
  process.stdout.write(wrapped);
}

/**
 * True when the native clipboard command (pbcopy/xclip) can silently fail to
 * reach the *outer* terminal — e.g. inside tmux/screen without
 * reattach-to-user-namespace, or over a bare SSH session. In that case we
 * need the OSC 52 fallback even if the native command exits 0.
 */
function nativeClipboardMayNotReachHostTerminal(): boolean {
  return Boolean(
    process.env.JEXXXUS_EMBEDDED === "1" ||
      process.env.TMUX ||
      process.env.STY ||
      process.env.SSH_TTY ||
      process.env.SSH_CONNECTION,
  );
}

/** Copy plain text to the system clipboard (best-effort). */
export function copyToClipboard(text: string): Promise<boolean> {
  if (process.env.JEXXXUS_EMBEDDED === "1") {
    // Electron PTY: pbcopy/xclip often hang or target the wrong clipboard.
    // OSC 52 is intercepted by jexxx.us-desktop and written to the host OS.
    writeClipboardOsc52(text);
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[] = [];

    if (platform === "darwin") {
      cmd = "pbcopy";
    } else if (platform === "win32") {
      cmd = "clip";
    } else {
      cmd = "xclip";
      args = ["-selection", "clipboard"];
    }

    const finish = (nativeSucceeded: boolean): void => {
      if (!nativeSucceeded || nativeClipboardMayNotReachHostTerminal()) {
        // Native copy failed, or we're in a session (tmux/screen/SSH) where
        // it can succeed locally without reaching the host terminal's real
        // clipboard — OSC 52 is the only way to be sure in that case.
        writeClipboardOsc52(text);
      }
      resolve(nativeSucceeded || nativeClipboardMayNotReachHostTerminal());
    };

    const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
    proc.on("error", () => finish(false));
    proc.on("close", (code) => finish(code === 0));
    proc.stdin?.write(text);
    proc.stdin?.end();
  });
}