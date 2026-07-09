import assert from "node:assert/strict";
import { test } from "node:test";

import {
  markdownToAnsi,
  normalizeAgentMarkup,
  stripAnsi,
  STREAM_CURSOR,
} from "../lib/blxckchat/ui/renderer/markdown-ansi.js";

test("normalizeAgentMarkup converts model blessed tags to markdown", () => {
  const out = normalizeAgentMarkup("{italic}warn{/italic} and {bold}stop{/bold}");
  assert.match(out, /_warn_/);
  assert.match(out, /\*\*stop\*\*/);
  assert.doesNotMatch(out, /\{italic\}/);
});

test("markdownToAnsi renders paragraphs with left indent", () => {
  const out = markdownToAnsi("Hello kingdom.\n\nSecond paragraph.");
  const plain = stripAnsi(out);
  assert.match(plain, /^\s{2}Hello kingdom\./m);
  assert.match(plain, /^\s{2}Second paragraph\./m);
});

test("markdownToAnsi renders bold and italic with ANSI codes", () => {
  const out = markdownToAnsi("**bold** and _italic_");
  assert.match(out, /\x1b\[/);
  assert.match(stripAnsi(out), /bold/);
  assert.match(stripAnsi(out), /italic/);
});

test("markdownToAnsi renders list items on one line", () => {
  const out = markdownToAnsi("- BLXCKBOOK dashboard\n- NXT memory journal");
  const plain = stripAnsi(out);
  assert.match(plain, /• BLXCKBOOK dashboard/);
  assert.match(plain, /• NXT memory journal/);
  assert.doesNotMatch(plain, /•\s*$/m);
});

test("markdownToAnsi converts echoed blessed italic tags", () => {
  const out = markdownToAnsi(
    "⚠️ {italic}Writes to production data{/italic}",
  );
  assert.doesNotMatch(stripAnsi(out), /\{italic\}/);
  assert.match(stripAnsi(out), /Writes to production data/);
});

test("STREAM_CURSOR is pink ANSI glyph", () => {
  assert.match(STREAM_CURSOR, /▌/);
  assert.match(STREAM_CURSOR, /\x1b\[/);
});