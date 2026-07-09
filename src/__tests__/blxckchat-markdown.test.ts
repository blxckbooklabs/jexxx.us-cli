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

test("markdownToBlessed keeps list items on one line with author names intact", () => {
  const out = markdownToBlessed(
    "- Lil' Bible, Jezebel, Bathsheba\n- Corruption, Confessions, The Altar",
  );
  assert.match(out, /Lil' Bible, Jezebel, Bathsheba/);
  assert.doesNotMatch(out, /,rJezebel/);
  assert.doesNotMatch(out, /\x1b\[/);
});

test("markdownToBlessed normalizes model blessed tags without scattering", () => {
  const out = markdownToBlessed(
    "**Stats**\n\n- {italic}Corruption{/italic} and _Confessions_",
  );
  assert.match(out, /Stats/);
  assert.match(out, /Corruption/);
  assert.doesNotMatch(out, /\{italic\}/);
  assert.doesNotMatch(out, /\x1b\[/);
});

test("renderUserMessageBox wraps content in pink border", () => {
  const out = renderUserMessageBox("hello kingdom");
  assert.match(out, /\{#ec4899-fg\}/);
  assert.match(out, /you/);
  assert.match(out, /hello kingdom/);
  assert.match(out, /╭/);
});