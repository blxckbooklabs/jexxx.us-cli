import * as fs from "fs";
import { spawn } from "node:child_process";

import { getCredentialsDir } from "../../../auth.js";

export function getSnapshotPath(): string {
  return `${getCredentialsDir()}/tui-snapshot.txt`;
}

/** Persist the latest plain-text TUI snapshot for debugging. */
export function writeSnapshot(text: string): string {
  const target = getSnapshotPath();
  const dir = getCredentialsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(target, text, { encoding: "utf-8", mode: 0o600 });
  return target;
}

/** Copy plain text to the system clipboard (best-effort). */
export function copyToClipboard(text: string): Promise<boolean> {
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