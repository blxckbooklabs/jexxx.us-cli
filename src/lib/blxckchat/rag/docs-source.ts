import * as fs from "fs";
import * as path from "path";

/**
 * Locates and reads docs.jexxx.us/src/content/*.md — the ONLY source this
 * RAG index ever reads from. Obsidian vault content (internal incident
 * writeups, unreleased plans) is intentionally never referenced here; see
 * jexxx.us-obsidian/JEXXXUS CLI/BLXCKCHAT-Agent.md for the documented
 * security rationale. Path resolution mirrors lib/bible.ts's pattern.
 */

const DOCS_PATHS = [
  process.env.DOCS_VAULT_PATH || "",
  "/Users/dylanroberts/Documents/non-music/Dev/GitHub/JEXXXUS/docs.jexxx.us",
].filter(Boolean);

export interface DocFile {
  filename: string;
  content: string;
}

function getDocsContentPath(): string {
  for (const basePath of DOCS_PATHS) {
    const contentPath = path.join(basePath, "src", "content");
    if (fs.existsSync(contentPath)) {
      return contentPath;
    }
  }
  throw new Error(
    `[BLXCKCHAT] docs.jexxx.us content not found. Set DOCS_VAULT_PATH env var. Tried: ${DOCS_PATHS.join(", ")}`
  );
}

export function loadDocsContent(): DocFile[] {
  const contentPath = getDocsContentPath();
  const entries = fs.readdirSync(contentPath);

  return entries
    .filter((e) => e.endsWith(".md"))
    .map((filename) => ({
      filename,
      content: fs.readFileSync(path.join(contentPath, filename), "utf-8"),
    }));
}

/** Content hash used to invalidate the cached index when docs change. */
export function docsContentHash(files: DocFile[]): string {
  const combined = files
    .map((f) => `${f.filename}:${f.content.length}`)
    .sort()
    .join("|");
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 31 + combined.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}
