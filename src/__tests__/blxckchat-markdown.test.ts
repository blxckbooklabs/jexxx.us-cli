import assert from "node:assert/strict";
import { test } from "node:test";

import {
  escapeBlessed,
  markdownToBlessed,
  renderUserMessageBox,
} from "../lib/blxckchat/ui/renderer/markdown.js";

test("escapeBlessed escapes blessed tag delimiters", () => {
  assert.equal(escapeBlessed("{bold}"), "{open}bold{close}");
  assert.equal(escapeBlessed("a}b"), "a{close}b");
  assert.equal(escapeBlessed("a@b"), "a@b");
});

test("markdownToBlessed converts headings and bold", () => {
  const out = markdownToBlessed("## Hello\n\n**world**");
  assert.match(out, /\{bold\}Hello\{\/bold\}/);
  assert.match(out, /\{bold\}world\{\/bold\}/);
});

test("markdownToBlessed renders code blocks with gray styling", () => {
  const out = markdownToBlessed("```\nconst x = 1;\n```");
  assert.match(out, /┌/);
  assert.match(out, /\{gray-fg\}const x = 1;\{\/gray-fg\}/);
});

test("markdownToBlessed renders links as label [url]", () => {
  const out = markdownToBlessed("[Docs](https://jexxx.us)");
  assert.match(out, /Docs/);
  assert.match(out, /\[https:\/\/jexxx\.us\]/);
});

test("renderUserMessageBox wraps content in pink border", () => {
  const out = renderUserMessageBox("hello kingdom");
  assert.match(out, /\{#ec4899-fg\}/);
  assert.match(out, /you/);
  assert.match(out, /hello kingdom/);
  assert.match(out, /╭/);
});