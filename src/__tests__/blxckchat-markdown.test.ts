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

test("markdownToBlessed survives a pathologically deep nested list without crashing", () => {
  // Regression test: a broken/looping model turn (free-tier/quantized
  // models are the usual culprit) can emit thousands of nested list levels
  // instead of terminating normally. marked.lexer()'s recursive-descent
  // list parser has no depth limit of its own -- confirmed directly that a
  // 5,000-level nested list blows the stack/heap before our own renderer
  // even runs. This must not crash the whole turn ("Maximum call stack
  // size exceeded"), just degrade gracefully.
  let deeplyNested = "";
  for (let i = 0; i < 3000; i++) {
    deeplyNested += "  ".repeat(i) + "- item " + i + "\n";
  }
  const out = markdownToBlessed(deeplyNested);
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});

test("markdownToBlessed truncates absurdly long input rather than parsing it whole", () => {
  const huge = "a".repeat(500_000);
  const out = markdownToBlessed(huge);
  assert.ok(out.length < huge.length);
  assert.match(out, /truncated/);
});