import { exec } from "child_process";
import { promisify } from "util";
import type { BlxckchatTool } from "./types.js";

const execAsync = promisify(exec);

/**
 * Patterns that are refused outright, regardless of user confirmation.
 * This is a defense-in-depth backstop, not the primary safety mechanism —
 * the primary mechanism is that this tool only exists in the registry when
 * the user passes --shell, and every call still requires confirmation.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  /\brm\s+-(?=[a-z]*r)(?=[a-z]*f)[a-z]+\b/i, // rm -rf, rm -fr, rm -Rf, rm -rfv, etc.
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bgit\s+push\s+.*-f\b/i,
  /\bsudo\b/i,
  /\bmkfs\b/i,
  /\bdd\s+.*of=\/dev/i,
  /curl.*\|\s*(sh|bash)\b/i,
  /wget.*\|\s*(sh|bash)\b/i,
  />\s*\/dev\/(sd|nvme|disk)/i,
  /\b:\(\)\{.*:\|:.*&.*\};:/, // fork bomb
];

export function isBlockedCommand(command: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Shell execution tool. Only registered when the user passes --shell to
 * `jexxxus blxckchat` (see tools/registry.ts) — off by default. Every
 * invocation still requires interactive confirmation (see confirm.ts) on
 * top of the hard blocklist above, which cannot be overridden by confirming.
 */
export const shellTool: BlxckchatTool = {
  name: "run_shell",
  description:
    "Execute a shell command on the operator's local machine. Destructive patterns " +
    "(rm -rf, DROP TABLE, git push --force, sudo, etc.) are hard-blocked and cannot be run " +
    "even if confirmed. Use only when the user's request genuinely requires shell access.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
    },
    required: ["command"],
  },
  requiresConfirmation: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const command = args.command as string;

    if (isBlockedCommand(command)) {
      return `Error: command blocked by BLXCKCHAT safety policy (destructive pattern detected): ${command}`;
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      return stderr ? `${stdout}\n[stderr]: ${stderr}` : stdout || "(no output)";
    } catch (err) {
      return `Error executing command: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
