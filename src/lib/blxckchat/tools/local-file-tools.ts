import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { BlxckchatTool } from "./types.js";

/**
 * Read/write/edit tools are scoped to ~/.jexxxus/{exports,imports,workspace}
 * by default — this is not a general coding agent, and letting it touch
 * arbitrary paths would blur that line. A path outside this directory is
 * still allowed (the user may ask to save an export somewhere specific),
 * but every write/edit still goes through the same y/n confirmation as any
 * other write tool, and the tool description surfaces the distinction so
 * the model can warn the user when a path falls outside the managed dir.
 */
const MANAGED_ROOT = path.join(os.homedir(), ".jexxxus");
const MANAGED_SUBDIRS = ["exports", "imports", "workspace"] as const;

function ensureManagedDirs(): void {
  for (const sub of MANAGED_SUBDIRS) {
    const dir = path.join(MANAGED_ROOT, sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { mode: 0o700, recursive: true });
    }
  }
}

function isInsideManagedRoot(resolved: string): boolean {
  const rel = path.relative(MANAGED_ROOT, resolved);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function resolvePath(rawPath: string): { resolved: string; managed: boolean } {
  const expanded = rawPath.startsWith("~")
    ? path.join(os.homedir(), rawPath.slice(1))
    : rawPath;
  const resolved = path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.join(MANAGED_ROOT, "workspace", expanded);
  return { resolved, managed: isInsideManagedRoot(resolved) };
}

const MAX_READ_BYTES = 512_000;

export const readLocalFileTool: BlxckchatTool = {
  name: "read_local_file",
  description:
    "Read a local file's contents. Relative paths resolve inside " +
    "~/.jexxxus/workspace; absolute paths anywhere on disk are also allowed " +
    "for reading (e.g. a previous export in a custom folder), but writes/edits " +
    "to paths outside ~/.jexxxus still require the same confirmation as any " +
    "other write.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path (relative or absolute)" },
    },
    required: ["path"],
  },
  requiresConfirmation: false,
  async execute(args) {
    const rawPath = String(args.path ?? "");
    if (!rawPath) return "Error: path is required.";
    ensureManagedDirs();
    const { resolved } = resolvePath(rawPath);
    if (!fs.existsSync(resolved)) {
      return `Error: file not found at ${resolved}.`;
    }
    const stat = fs.statSync(resolved);
    if (stat.size > MAX_READ_BYTES) {
      return `Error: file is ${stat.size} bytes, exceeds the ${MAX_READ_BYTES}-byte read limit.`;
    }
    return fs.readFileSync(resolved, "utf-8");
  },
};

export const writeLocalFileTool: BlxckchatTool = {
  name: "write_local_file",
  description:
    "Write (create or overwrite) a local file with the given content. Relative " +
    "paths resolve inside ~/.jexxxus/workspace. Absolute paths outside " +
    "~/.jexxxus are allowed (e.g. a user-specified export folder) but the " +
    "confirmation prompt will flag that the destination is outside the " +
    "managed directory.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path (relative or absolute)" },
      content: { type: "string", description: "Full file content to write" },
    },
    required: ["path", "content"],
  },
  requiresConfirmation: true,
  async execute(args) {
    const rawPath = String(args.path ?? "");
    const content = String(args.content ?? "");
    if (!rawPath) return "Error: path is required.";
    ensureManagedDirs();
    const { resolved, managed } = resolvePath(rawPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(resolved, content, { mode: 0o600 });
    const warning = managed ? "" : " (outside ~/.jexxxus)";
    return `Wrote ${content.length} bytes to ${resolved}${warning}.`;
  },
};

export const editLocalFileTool: BlxckchatTool = {
  name: "edit_local_file",
  description:
    "Apply an exact text replacement inside an existing local file — oldText " +
    "must match a unique, exact substring of the file's current content; " +
    "newText replaces it. Fails if oldText isn't found or matches more than " +
    "once (use a longer, more specific oldText to disambiguate). Same path " +
    "scoping as write_local_file.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path (relative or absolute)" },
      oldText: { type: "string", description: "Exact existing text to replace" },
      newText: { type: "string", description: "Replacement text" },
    },
    required: ["path", "oldText", "newText"],
  },
  requiresConfirmation: true,
  async execute(args) {
    const rawPath = String(args.path ?? "");
    const oldText = String(args.oldText ?? "");
    const newText = String(args.newText ?? "");
    if (!rawPath) return "Error: path is required.";
    if (!oldText) return "Error: oldText is required.";
    ensureManagedDirs();
    const { resolved, managed } = resolvePath(rawPath);
    if (!fs.existsSync(resolved)) {
      return `Error: file not found at ${resolved}.`;
    }
    const current = fs.readFileSync(resolved, "utf-8");
    const occurrences = current.split(oldText).length - 1;
    if (occurrences === 0) {
      return "Error: oldText not found in file — no changes made.";
    }
    if (occurrences > 1) {
      return `Error: oldText matches ${occurrences} times — provide more surrounding context to make it unique.`;
    }
    const updated = current.replace(oldText, newText);
    fs.writeFileSync(resolved, updated, { mode: 0o600 });
    const warning = managed ? "" : " (outside ~/.jexxxus)";
    return `Edited ${resolved}${warning}.`;
  },
};
