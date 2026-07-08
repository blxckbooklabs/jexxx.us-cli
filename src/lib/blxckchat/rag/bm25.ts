import type { DocChunk } from "./chunker.js";

/**
 * Minimal BM25 lexical scorer. Deliberately not a vector/embedding index —
 * embeddings would require every configured provider (including local
 * Ollama installs without an embedding model pulled) to expose an
 * embedding endpoint. BM25 needs only tokenization, works identically
 * regardless of which LLM provider is active, and builds instantly with
 * zero network calls.
 */

const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export interface Bm25Index {
  chunks: DocChunk[];
  docTokens: string[][];
  docFreq: Map<string, number>;
  avgDocLength: number;
}

export function buildBm25Index(chunks: DocChunk[]): Bm25Index {
  const docTokens = chunks.map((c) => tokenize(`${c.heading} ${c.text}`));
  const docFreq = new Map<string, number>();

  for (const tokens of docTokens) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    }
  }

  const totalLength = docTokens.reduce((sum, t) => sum + t.length, 0);
  const avgDocLength = docTokens.length > 0 ? totalLength / docTokens.length : 0;

  return { chunks, docTokens, docFreq, avgDocLength };
}

export function searchBm25(
  index: Bm25Index,
  query: string,
  k: number = 5
): DocChunk[] {
  const queryTokens = tokenize(query);
  const n = index.chunks.length;
  const scores: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const tokens = index.docTokens[i];
    if (!tokens) continue;
    const docLength = tokens.length;
    const termCounts = new Map<string, number>();
    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
    }

    let score = 0;
    for (const qToken of queryTokens) {
      const tf = termCounts.get(qToken) ?? 0;
      if (tf === 0) continue;
      const df = index.docFreq.get(qToken) ?? 0;
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
      const numerator = tf * (K1 + 1);
      const denominator =
        tf + K1 * (1 - B + (B * docLength) / (index.avgDocLength || 1));
      score += idf * (numerator / denominator);
    }
    scores[i] = score;
  }

  return scores
    .map((score, i) => ({ score, chunk: index.chunks[i] }))
    .filter((entry): entry is { score: number; chunk: DocChunk } => Boolean(entry.chunk) && entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((entry) => entry.chunk);
}
