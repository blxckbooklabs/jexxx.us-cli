import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { fetchBlxckbookExport } from "./blxckbook-export.js";
import { fetchNxtExport } from "./nxt-export.js";
import {
  fetchAccountExportViaApi,
  getJexxxusApiBaseUrl,
  type AccountExportTarget,
} from "./jexxxus-api-client.js";
import { resolveAuthenticatedAccountSession } from "./session.js";

const DEFAULT_EXPORTS_DIR = path.join(os.homedir(), ".jexxxus", "exports");

function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  }
  return dir;
}

function writeExportFile(dir: string, filename: string, payload: unknown): string {
  const filePath = path.join(ensureDir(dir), filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  return filePath;
}

export type VaultExportTarget = AccountExportTarget;

export async function exportVaultToDisk(
  target: VaultExportTarget,
  destinationDir?: string,
): Promise<{ paths: string[]; error?: string }> {
  const resolved = await resolveAuthenticatedAccountSession();
  if (!resolved.ok) {
    return { paths: [], error: resolved.message };
  }
  const session = resolved.session;

  const dir = destinationDir
    ? destinationDir.startsWith("~")
      ? path.join(os.homedir(), destinationDir.slice(1))
      : path.resolve(destinationDir)
    : DEFAULT_EXPORTS_DIR;

  const date = new Date().toISOString().slice(0, 10);
  const paths: string[] = [];
  const { creds } = session;

  if (getJexxxusApiBaseUrl()) {
    try {
      const payload = await fetchAccountExportViaApi(session, { target });
      if (target === "blxckbook" || target === "all") {
        if (payload.blxckbook !== undefined) {
          paths.push(
            writeExportFile(dir, `blxckbook-export-${date}.json`, payload.blxckbook),
          );
        }
      }
      if (target === "nxt" || target === "all") {
        if (payload.nxt !== undefined) {
          paths.push(writeExportFile(dir, `nxt-export-${date}.json`, payload.nxt));
        }
      }
      if (paths.length > 0) {
        return { paths };
      }
      throw new Error("JEXXXUS | API export response missing vault payload.");
    } catch (err) {
      console.warn(
        "[account] JEXXXUS | API export failed — falling back to direct Supabase:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (target === "blxckbook" || target === "all") {
    const payload = await fetchBlxckbookExport(
      session.blxckbook,
      creds.userId,
      creds.email,
    );
    paths.push(writeExportFile(dir, `blxckbook-export-${date}.json`, payload));
  }

  if (target === "nxt" || target === "all") {
    const payload = await fetchNxtExport(session.nxt, creds.userId);
    paths.push(writeExportFile(dir, `nxt-export-${date}.json`, payload));
  }

  return { paths };
}
