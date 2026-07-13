import * as fs from "fs";
import { ensureJexxxusDir, jexxxusFile } from "../../jexxxus-cache-dir.js";
import { loadDocsContent, docsContentHash, type DocFile } from "./docs-source.js";
import { listLawPolicies } from "../../law.js";
import { htmlToMarkdownish } from "./html-to-markdown.js";
import { chunkAllDocs, type DocChunk } from "./chunker.js";
import { buildBm25Index, searchBm25, type Bm25Index } from "./bm25.js";

const CACHE_PATH = jexxxusFile("docs-index.json");

interface CachedIndex {
  hash: string;
  chunks: DocChunk[];
}

let memoryCache: CachedIndex | null = null;

function loadCache(): CachedIndex | null {
  if (memoryCache) return memoryCache;
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as CachedIndex;
    memoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(cache: CachedIndex): void {
  memoryCache = cache;
  if (!ensureJexxxusDir()) return;
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
  } catch {
    // Serverless / read-only FS — in-memory cache only for this invocation.
  }
}

/** Law policies (RSS-only) folded into DocFile shape so they share the H2 chunker. */
async function loadLawAsDocFiles(): Promise<DocFile[]> {
  try {
    const policies = await listLawPolicies();
    const { getLawPolicy } = await import("../../law.js");
    const files: DocFile[] = [];
    for (const meta of policies) {
      const full = await getLawPolicy(meta.slug);
      if (!full) continue;
      files.push({
        filename: `law-${meta.slug}.md`,
        content: `# ${full.title}\n\n${htmlToMarkdownish(full.body)}`,
      });
    }
    return files;
  } catch {
    // Law feed unreachable (offline, DNS, etc.) — degrade gracefully, docs-only index.
    return [];
  }
}

/**
 * Builds (or loads from cache) the BM25 index over docs.jexxx.us + law.jexxx.us
 * content. Rebuilds automatically when content changes (content-hash check),
 * so operators never need a manual "reindex" step.
 */
export async function buildOrLoadIndex(): Promise<Bm25Index> {
  const [docFiles, lawFiles] = await Promise.all([loadDocsContent(), loadLawAsDocFiles()]);
  const files = [...docFiles, ...lawFiles];
  const hash = docsContentHash(files);
  const cached = loadCache();

  if (cached && cached.hash === hash) {
    return buildBm25Index(cached.chunks);
  }

  const chunks = chunkAllDocs(files);
  saveCache({ hash, chunks });
  return buildBm25Index(chunks);
}

export async function searchDocs(query: string, k: number = 5): Promise<DocChunk[]> {
  const index = await buildOrLoadIndex();
  return searchBm25(index, query, k);
}