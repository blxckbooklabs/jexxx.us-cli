import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  readLocalFileTool,
  writeLocalFileTool,
  editLocalFileTool,
} from "../lib/blxckchat/tools/local-file-tools.js";

const MANAGED_WORKSPACE = path.join(os.homedir(), ".jexxxus", "workspace");

function cleanupWorkspaceFile(name: string): void {
  const p = path.join(MANAGED_WORKSPACE, name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

test("write_local_file creates a relative-path file inside ~/.jexxxus/workspace", async () => {
  const name = `blxckchat-test-${Date.now()}.txt`;
  try {
    const result = await writeLocalFileTool.execute({ path: name, content: "hello" });
    assert.match(result, /Wrote 5 bytes/);
    assert.ok(!result.includes("outside ~/.jexxxus"));
    const written = fs.readFileSync(path.join(MANAGED_WORKSPACE, name), "utf-8");
    assert.equal(written, "hello");
  } finally {
    cleanupWorkspaceFile(name);
  }
});

test("read_local_file reads back what write_local_file wrote", async () => {
  const name = `blxckchat-test-${Date.now()}.txt`;
  try {
    await writeLocalFileTool.execute({ path: name, content: "round trip" });
    const content = await readLocalFileTool.execute({ path: name });
    assert.equal(content, "round trip");
  } finally {
    cleanupWorkspaceFile(name);
  }
});

test("read_local_file reports a clear error for a missing file", async () => {
  const result = await readLocalFileTool.execute({ path: "definitely-does-not-exist-12345.txt" });
  assert.match(result, /not found/i);
});

test("edit_local_file replaces a unique exact match", async () => {
  const name = `blxckchat-test-${Date.now()}.txt`;
  try {
    await writeLocalFileTool.execute({ path: name, content: "the quick brown fox" });
    const editResult = await editLocalFileTool.execute({
      path: name,
      oldText: "brown",
      newText: "red",
    });
    assert.match(editResult, /Edited/);
    const content = await readLocalFileTool.execute({ path: name });
    assert.equal(content, "the quick red fox");
  } finally {
    cleanupWorkspaceFile(name);
  }
});

test("edit_local_file refuses when oldText is not found", async () => {
  const name = `blxckchat-test-${Date.now()}.txt`;
  try {
    await writeLocalFileTool.execute({ path: name, content: "hello world" });
    const result = await editLocalFileTool.execute({
      path: name,
      oldText: "nonexistent-string",
      newText: "x",
    });
    assert.match(result, /not found/i);
  } finally {
    cleanupWorkspaceFile(name);
  }
});

test("edit_local_file refuses an ambiguous (multi-match) oldText", async () => {
  const name = `blxckchat-test-${Date.now()}.txt`;
  try {
    await writeLocalFileTool.execute({ path: name, content: "aaa bbb aaa" });
    const result = await editLocalFileTool.execute({
      path: name,
      oldText: "aaa",
      newText: "z",
    });
    assert.match(result, /matches 2 times/);
  } finally {
    cleanupWorkspaceFile(name);
  }
});

test("write_local_file flags an absolute path outside ~/.jexxxus", async () => {
  const outsidePath = path.join(os.tmpdir(), `blxckchat-outside-test-${Date.now()}.txt`);
  try {
    const result = await writeLocalFileTool.execute({ path: outsidePath, content: "x" });
    assert.match(result, /outside ~\/\.jexxxus/);
  } finally {
    if (fs.existsSync(outsidePath)) fs.unlinkSync(outsidePath);
  }
});
