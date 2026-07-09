import { spawn } from "node:child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Open draft in $EDITOR / $VISUAL and return edited text (codex Ctrl+G). */
export async function openExternalEditor(initial = ""): Promise<string | null> {
  const editor = process.env.VISUAL?.trim() || process.env.EDITOR?.trim();
  if (!editor) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "blxckchat-edit-"));
  const tmpFile = path.join(tmpDir, "draft.md");
  fs.writeFileSync(tmpFile, initial, "utf-8");

  const parts = editor.split(/\s+/);
  const cmd = parts[0] ?? editor;
  const args = [...parts.slice(1), tmpFile];

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: false });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });

  try {
    if (exitCode !== 0) return null;
    return fs.readFileSync(tmpFile, "utf-8").trimEnd();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}