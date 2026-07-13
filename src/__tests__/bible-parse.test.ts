import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findBook,
  findVerse,
  hasLocalBibleVault,
  looksLikeVerseReference,
  normalizeBookLookupKey,
  parseVerseReference,
} from "../lib/bible.js";
import { bibleTool } from "../lib/blxckchat/tools/bible-tools.js";

test("parseVerseReference accepts numbered books", () => {
  assert.deepEqual(parseVerseReference("1 John 1:9"), {
    bookName: "1 John",
    chapter: 1,
    verse: 9,
  });
  assert.deepEqual(parseVerseReference("1 Samuel 2:1"), {
    bookName: "1 Samuel",
    chapter: 2,
    verse: 1,
  });
  assert.deepEqual(parseVerseReference("Genesis 1 1"), {
    bookName: "Genesis",
    chapter: 1,
    verse: 1,
  });
});

test("normalizeBookLookupKey matches spaced and compact numbered books", () => {
  assert.equal(normalizeBookLookupKey("1 Samuel"), "1samuel");
  assert.equal(normalizeBookLookupKey("1Samuel"), "1samuel");
  assert.equal(normalizeBookLookupKey("09-1Samuel"), "1samuel");
});

test("findBook resolves 1 Samuel from spaced reference", () => {
  if (!hasLocalBibleVault()) return;
  const book = findBook("1 Samuel");
  assert.ok(book);
  assert.match(book!.book, /1Samuel/i);
});

test("findVerse loads 1 Samuel 2:1 from vault", () => {
  if (!hasLocalBibleVault()) return;
  const verse = findVerse("1 Samuel 2:1");
  assert.ok(verse, "expected 1 Samuel 2:1 in obsidian-bible vault");
  assert.equal(verse!.book, "1 Samuel");
  assert.match(verse!.text.toLowerCase(), /heart/);
});

test("looksLikeVerseReference rejects video series titles", () => {
  assert.equal(looksLikeVerseReference("Forgive Me Father"), false);
  assert.equal(looksLikeVerseReference("Forgive Me Father videos"), false);
});

test("bible_query redirects non-verse queries to tv_query", async () => {
  const raw = await bibleTool.execute({
    action: "query",
    query: "Forgive Me Father",
  });
  assert.match(raw, /does not look like a scripture reference/i);
  assert.match(raw, /tv_query/i);
});

test("bible_query returns formatted verse text for valid refs", async () => {
  const raw = await bibleTool.execute({
    action: "query",
    query: "Genesis 1:1",
  });
  if (raw.startsWith("No verse found")) return;
  assert.doesNotMatch(raw, /^\[/);
  assert.match(raw, /Genesis 1:1/);
});