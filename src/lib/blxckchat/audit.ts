import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const AUDIT_LOG_PATH = path.join(os.homedir(), ".jexxxus", "blxckchat-audit.log");

export interface AuditEntry {
  timestamp: string;
  toolName: string;
  arguments: Record<string, unknown>;
  confirmed: boolean;
  outcome: "executed" | "declined" | "blocked" | "error";
  resultPreview?: string;
}

/** Append-only JSONL audit trail of every tool call BLXCKCHAT attempts. */
export function recordAudit(entry: Omit<AuditEntry, "timestamp">): void {
  const dir = path.dirname(AUDIT_LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const fullEntry: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(fullEntry) + "\n", {
    mode: 0o600,
  });
}
