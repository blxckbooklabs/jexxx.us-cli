import { loadCredentials } from "../../auth.js";
import type { BlxckchatTool } from "./types.js";
import { bibleTool } from "./bible-tools.js";
import { veilTool } from "./veil-tools.js";
import { tvTool } from "./tv-tools.js";
import { lawTool } from "./law-tools.js";
import { musicTool } from "./music-tools.js";
import { docsTool } from "./docs-tools.js";
import { doctorTool, notifyTool, importContactsTool } from "./dashboard-tools.js";
import { accountQueryTool } from "./account-tools.js";
import { shellTool } from "./shell-tool.js";
import {
  addContactTool,
  updateContactTool,
  deleteContactTool,
  addJournalEntryTool,
  updateJournalEntryTool,
  deleteJournalEntryTool,
  manageContactEventTool,
  managePlaylistTool,
  exportVaultTool,
  syncExportFileTool,
} from "./vault-write-tools.js";
import {
  readLocalFileTool,
  writeLocalFileTool,
  editLocalFileTool,
} from "./local-file-tools.js";
import {
  listNotificationsTool,
  connectContactBackTool,
  getRelationshipStatusTool,
} from "./connection-tools.js";

export interface BuildToolRegistryOptions {
  allowShell?: boolean;
  /** Include account_query when user has ~/.jexxxus credentials (vault perks). */
  includeAccountQuery?: boolean;
}

export function buildToolRegistry(
  allowShellOrOptions: boolean | BuildToolRegistryOptions = false,
): BlxckchatTool[] {
  const options =
    typeof allowShellOrOptions === "boolean"
      ? { allowShell: allowShellOrOptions }
      : allowShellOrOptions;

  const tools: BlxckchatTool[] = [
    bibleTool,
    veilTool,
    tvTool,
    lawTool,
    musicTool,
    docsTool,
    doctorTool,
    notifyTool,
    importContactsTool,
    readLocalFileTool,
    writeLocalFileTool,
    editLocalFileTool,
  ];

  if (options.includeAccountQuery) {
    tools.push(
      accountQueryTool,
      addContactTool,
      updateContactTool,
      deleteContactTool,
      addJournalEntryTool,
      updateJournalEntryTool,
      deleteJournalEntryTool,
      manageContactEventTool,
      managePlaylistTool,
      exportVaultTool,
      syncExportFileTool,
      listNotificationsTool,
      connectContactBackTool,
      getRelationshipStatusTool,
    );
  }

  if (options.allowShell) {
    tools.push(shellTool);
  }

  return tools;
}

/** Fresh registry each call — picks up /auth login mid-session. */
export function resolveBlxckchatTools(
  options: Omit<BuildToolRegistryOptions, "includeAccountQuery"> = {},
): BlxckchatTool[] {
  return buildToolRegistry({
    ...options,
    includeAccountQuery: Boolean(loadCredentials({ quiet: true })),
  });
}

export function findTool(
  tools: BlxckchatTool[],
  name: string
): BlxckchatTool | undefined {
  return tools.find((t) => t.name === name);
}
