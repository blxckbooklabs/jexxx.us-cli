import * as fs from "fs";
import { spawn } from "node:child_process";

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

/** Copy plain text to the system clipboard (best-effort). */
export function copyToClipboard(text: string): Promise<boolean> {
  writeClipboardOsc52(text);
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

    const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
    proc.stdin?.write(text);
    proc.stdin?.end();
  });
}