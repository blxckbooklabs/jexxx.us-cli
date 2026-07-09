import assert from "node:assert/strict";
import * as fs from "fs";
import { test } from "node:test";

import {
  buildTuISnapshot,
  buildWelcomeBannerPlain,
  stripBlessedTags,
} from "../lib/blxckchat/ui/renderer/plain-text.js";
import { getSnapshotPath, writeSnapshot } from "../lib/blxckchat/ui/session/tui-snapshot.js";

test("stripBlessedTags removes blessed inline tags", () => {
  const out = stripBlessedTags("{bold}Hi{/bold} {#ec4899-fg}there{/}");
  assert.equal(out, "Hi there");
});

test("buildWelcomeBannerPlain renders copyable welcome box", () => {
  const out = buildWelcomeBannerPlain("alice@example.com", 5);
  assert.match(out, /Welcome to the kingdom/);
  assert.match(out, /authenticated as alice@example\.com/);
  assert.match(out, /5 tools/);
  assert.match(out, /╔/);
});

test("buildTuISnapshot assembles full TUI plain text", () => {
  const out = buildTuISnapshot({
    width: 60,
    topBar: "BLXCKCHAT — test",
    messages: "Hello",
    statusBar: "Ctrl+Y copy",
    input: "> _",
  });
  assert.match(out, /BLXCKCHAT — test/);
  assert.match(out, /Hello/);
  assert.match(out, /Ctrl\+Y copy/);
  assert.match(out, /> _/);
  assert.match(out, /─{40,}/);
});

test("writeSnapshot persists plain TUI to disk", () => {
  const text = buildTuISnapshot({
    width: 40,
    topBar: "BLXCKCHAT",
    messages: buildWelcomeBannerPlain("dev@test", 3),
    statusBar: "ready",
    input: "> ",
  });
  const written = writeSnapshot(text);
  assert.equal(written, getSnapshotPath());
  const saved = fs.readFileSync(getSnapshotPath(), "utf-8");
  assert.equal(saved, text);
  assert.match(saved, /Welcome to the kingdom/);
});