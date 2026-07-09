import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { fetchBlxckbookExport } from "./blxckbook-export.js";
import { fetchNxtExport } from "./nxt-export.js";
import { resolveAuthenticatedAccountSession } from "./session.js";

const EXPORTS_DIR = path.join(os.homedir(), ".jexxxus", "exports");

function ensureExportsDir(): string {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { mode: 0o700, recursive: true });
  }
  return EXPORTS_DIR;
}

function writeExportFile(filename: string, payload: unknown): string {
  const dir = ensureExportsDir();
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  return filePath;
}

export type VaultExportTarget = "blxckbook" | "nxt" | "all";

export async function exportVaultToDisk(
  target: VaultExportTarget,
): Promise<{ paths: string[]; error?: string }> {
  const resolved = await resolveAuthenticatedAccountSession();
  if (!resolved.ok) {
    return { paths: [], error: resolved.message };
  }
  const session = resolved.session;

  const date = new Date().toISOString().slice(0, 10);
  const paths: string[] = [];
  const { creds } = session;

  if (target === "blxckbook" || target === "all") {
    const payload = await fetchBlxckbookExport(
      session.blxckbook,
      creds.userId,
      creds.email,
    );
    paths.push(
      writeExportFile(`blxckbook-export-${date}.json`, payload),
    );
  }

  if (target === "nxt" || target === "all") {
    const payload = await fetchNxtExport(session.nxt, creds.userId);
    paths.push(writeExportFile(`nxt-export-${date}.json`, payload));
  }

  return { paths };
}