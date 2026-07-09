import assert from "node:assert/strict";
import { test } from "node:test";

import {
  looksLikeVerseReference,
  parseVerseReference,
} from "../lib/bible.js";
import { bibleTool } from "../lib/blxckchat/tools/bible-tools.js";

test("parseVerseReference accepts numbered books", () => {
  assert.deepEqual(parseVerseReference("1 John 1:9"), {
    bookName: "1 John",
    chapter: 1,
    verse: 9,
  });
  assert.deepEqual(parseVerseReference("Genesis 1 1"), {
    bookName: "Genesis",
    chapter: 1,
    verse: 1,
  });
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