import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadDocsContent, docsContentHash } from "./docs-source.js";
import { chunkAllDocs, type DocChunk } from "./chunker.js";
import { buildBm25Index, searchBm25, type Bm25Index } from "./bm25.js";

const CACHE_PATH = path.join(os.homedir(), ".jexxxus", "docs-index.json");

interface CachedIndex {
  hash: string;
  chunks: DocChunk[];
}

function loadCache(): CachedIndex | null {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as CachedIndex;
  } catch {
    return null;
  }
}

function saveCache(cache: CachedIndex): void {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

/**
 * Builds (or loads from cache) the BM25 index over docs.jexxx.us content.
 * Rebuilds automatically when doc content changes (content-hash check),
 * so operators never need a manual "reindex" step.
 */
export function buildOrLoadIndex(): Bm25Index {
  const files = loadDocsContent();
  const hash = docsContentHash(files);
  const cached = loadCache();

  if (cached && cached.hash === hash) {
    return buildBm25Index(cached.chunks);
  }

  const chunks = chunkAllDocs(files);
  saveCache({ hash, chunks });
  return buildBm25Index(chunks);
}

export function searchDocs(query: string, k: number = 5): DocChunk[] {
  const index = buildOrLoadIndex();
  return searchBm25(index, query, k);
}
