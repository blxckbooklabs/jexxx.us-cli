import type { BlxckchatTool } from "./types.js";
import { bibleTool } from "./bible-tools.js";
import { veilTool } from "./veil-tools.js";
import { tvTool } from "./tv-tools.js";
import { lawTool } from "./law-tools.js";
import { doctorTool, notifyTool, importContactsTool } from "./dashboard-tools.js";
import { accountQueryTool } from "./account-tools.js";
import { shellTool } from "./shell-tool.js";
import {
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
      updateContactTool,
      deleteContactTool,
      addJournalEntryTool,
      updateJournalEntryTool,
      deleteJournalEntryTool,
      manageContactEventTool,
      managePlaylistTool,
      exportVaultTool,
      syncExportFileTool,
    );
  }

  if (options.allowShell) {
    tools.push(shellTool);
  }

  return tools;
}

export function findTool(
  tools: BlxckchatTool[],
  name: string
): BlxckchatTool | undefined {
  return tools.find((t) => t.name === name);
}
