import assert from "node:assert/strict";
import * as fs from "fs";
import { test } from "node:test";

import {
  buildStatusBarPlain,
  buildTopBarPlain,
  buildTuISnapshot,
  buildWelcomeBannerPlain,
  framePanel,
  frameTransmitInput,
  stripBlessedTags,
} from "../lib/blxckchat/ui/renderer/plain-text.js";
import { getSnapshotPath, writeSnapshot } from "../lib/blxckchat/ui/session/tui-snapshot.js";

test("stripBlessedTags removes blessed inline tags", () => {
  const out = stripBlessedTags("{bold}Hi{/bold} {#ec4899-fg}there{/}");
  assert.equal(out, "Hi there");
});

test("buildWelcomeBannerPlain renders copyable welcome box", () => {
  const out = buildWelcomeBannerPlain("alice@example.com", 5);
  assert.match(out, /Kingdom feed online/);
  assert.match(out, /alice@example\.com/);
  assert.match(out, /5 tools/);
  assert.match(out, /╭/);
});

test("buildTopBarPlain renders CRT header lines", () => {
  const out = buildTopBarPlain(72, "ollama/gemma4:31b-cloud");
  assert.match(out, /▄▀ BLXCKCHAT │ ollama\/gemma4:31b-cloud/);
  assert.match(out, /▮ LIVE ▀▄/);
});

test("framePanel wraps content in box borders", () => {
  const out = framePanel("Hello\nworld", 40);
  assert.match(out, /^┌/);
  assert.match(out, /│Hello/);
  assert.match(out, /│world/);
  assert.match(out, /└/);
});

test("frameTransmitInput matches transmit box chrome", () => {
  const out = frameTransmitInput("/hel", 50);
  assert.match(out, /┌─ transmit ─/);
  assert.match(out, /│\/hel/);
});

test("buildStatusBarPlain adds glitch ornaments", () => {
  const out = buildStatusBarPlain(60, "Ctrl+Y copy");
  assert.match(out, /^░ Ctrl\+Y copy/);
  assert.match(out, /[░▒▓█▄▀]/);
});

test("buildTuISnapshot assembles full TUI plain text", () => {
  const out = buildTuISnapshot({
    width: 60,
    topBar: buildTopBarPlain(60, "test-model"),
    messages: framePanel("Hello", 60),
    statusBar: buildStatusBarPlain(60, "Ctrl+Y copy"),
    input: frameTransmitInput("", 60),
  });
  assert.match(out, /BLXCKCHAT │ test-model/);
  assert.match(out, /Hello/);
  assert.match(out, /Ctrl\+Y copy/);
  assert.match(out, /transmit/);
  assert.match(out, /┌/);
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
  assert.match(saved, /Kingdom feed online/);
});