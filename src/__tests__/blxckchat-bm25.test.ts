import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBm25Index, searchBm25 } from "../lib/blxckchat/rag/bm25.js";
import { chunkAllDocs, chunkDocFile } from "../lib/blxckchat/rag/chunker.js";
import type { DocFile } from "../lib/blxckchat/rag/docs-source.js";

test("chunkDocFile splits on H2 headings", () => {
  const file: DocFile = {
    filename: "test.md",
    content: "# Title\nintro text\n\n## Section A\ncontent a\n\n## Section B\ncontent b",
  };
  const chunks = chunkDocFile(file);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[1]?.heading, "Section A");
  assert.match(chunks[1]?.text ?? "", /content a/);
  assert.equal(chunks[2]?.heading, "Section B");
});

test("chunkAllDocs flattens multiple files", () => {
  const files: DocFile[] = [
    { filename: "a.md", content: "## X\nfoo" },
    { filename: "b.md", content: "## Y\nbar" },
  ];
  const chunks = chunkAllDocs(files);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.source, "a.md");
  assert.equal(chunks[1]?.source, "b.md");
});

test("searchBm25 ranks the most relevant chunk first", () => {
  const files: DocFile[] = [
    {
      filename: "notify.md",
      content: "## Notify Command\nThe notify command pushes a system notification to a user's bell.",
    },
    {
      filename: "bible.md",
      content: "## Bible Lookup\nQuery verses by book, chapter, and verse number.",
    },
  ];
  const chunks = chunkAllDocs(files);
  const index = buildBm25Index(chunks);
  const results = searchBm25(index, "what does the notify command do", 3);

  assert.ok(results.length > 0);
  assert.equal(results[0]?.source, "notify.md");
});

test("searchBm25 returns empty array for no matches", () => {
  const files: DocFile[] = [{ filename: "a.md", content: "## Foo\nbar baz" }];
  const chunks = chunkAllDocs(files);
  const index = buildBm25Index(chunks);
  const results = searchBm25(index, "zzzznonexistentqqqq", 3);
  assert.equal(results.length, 0);
});
