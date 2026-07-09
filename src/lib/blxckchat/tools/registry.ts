import type { BlxckchatTool } from "./types.js";
import { bibleTool } from "./bible-tools.js";
import { veilTool } from "./veil-tools.js";
import { doctorTool, notifyTool, importContactsTool } from "./dashboard-tools.js";
import { shellTool } from "./shell-tool.js";

export function buildToolRegistry(allowShell: boolean): BlxckchatTool[] {
  const tools: BlxckchatTool[] = [
    bibleTool,
    veilTool,
    doctorTool,
    notifyTool,
    importContactsTool,
  ];

  if (allowShell) {
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
