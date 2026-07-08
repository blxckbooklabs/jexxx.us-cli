import type { DocFile } from "./docs-source.js";

export interface DocChunk {
  source: string;
  heading: string;
  text: string;
}

/**
 * Splits a doc file on `## ` (H2) heading boundaries — matches the
 * consistent H2 sectioning confirmed across docs.jexxx.us content
 * (architecture.md, jexxxus-cli.md, etc.). Keeps everything between one
 * H2 and the next as a single chunk, so tables/code blocks stay intact.
 */
export function chunkDocFile(file: DocFile): DocChunk[] {
  const lines = file.content.split("\n");
  const chunks: DocChunk[] = [];

  let currentHeading = file.filename.replace(/\.md$/, "");
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      chunks.push({ source: file.filename, heading: currentHeading, text });
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentHeading = line.replace(/^##\s+/, "").trim();
    }
    currentLines.push(line);
  }
  flush();

  return chunks;
}

export function chunkAllDocs(files: DocFile[]): DocChunk[] {
  return files.flatMap(chunkDocFile);
}
