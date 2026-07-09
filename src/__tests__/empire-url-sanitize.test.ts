import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractEmpireUrlsFromText,
  sanitizeEmpireUrls,
  type EmpireUrlEntry,
} from "../lib/blxckchat/empire-url-sanitize.js";

const CATALOG: EmpireUrlEntry[] = [
  {
    surface: "tv",
    slug: "sexy-nanny-gets-fired-so-she-needs-the-extra-cash",
    url: "https://tv.jexxx.us/video/sexy-nanny-gets-fired-so-she-needs-the-extra-cash",
    title: "SEXY Nanny gets fired so she needs the EXTRA cash",
  },
];

test("extractEmpireUrlsFromText parses tv list lines", () => {
  const text = [
    "1. SEXY Nanny gets fired so she needs the EXTRA cash",
    "   https://tv.jexxx.us/video/sexy-nanny-gets-fired-so-she-needs-the-extra-cash",
  ].join("\n");
  const urls = extractEmpireUrlsFromText(text);
  assert.equal(urls.length, 1);
  assert.equal(urls[0]?.slug, "sexy-nanny-gets-fired-so-she-needs-the-extra-cash");
});

test("sanitizeEmpireUrls fixes wv host and spaced slugs", () => {
  const broken =
    "🎬 Watch: SEXY Nanny [https://wv.jexxx.us/video/sexy-na ny-gets-fir d-so-she-needs-the-extra-cash]";
  const fixed = sanitizeEmpireUrls(broken, CATALOG);
  assert.match(fixed, /https:\/\/tv\.jexxx\.us\/video\/sexy-nanny-gets-fired-so-she-needs-the-extra-cash/);
  assert.doesNotMatch(fixed, /wv\.jexxx/);
  assert.doesNotMatch(fixed, /sexy-na ny/);
});