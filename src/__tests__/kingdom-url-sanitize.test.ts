import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compactKingdomBulletLinks,
  extractKingdomUrlsFromText,
  repairMarkdownUrlBlobs,
  sanitizeKingdomUrls,
  splitGluedKingdomUrls,
  type KingdomUrlEntry,
} from "../lib/blxckchat/kingdom-url-sanitize.js";

const TV_CATALOG: KingdomUrlEntry[] = [
  {
    surface: "tv",
    slug: "sexy-nanny-gets-fired-so-she-needs-the-extra-cash",
    url: "https://tv.jexxx.us/video/sexy-nanny-gets-fired-so-she-needs-the-extra-cash",
    title: "SEXY Nanny gets fired so she needs the EXTRA cash",
  },
];

const VEIL_CATALOG: KingdomUrlEntry[] = [
  {
    surface: "veil",
    slug: "10-christian-excuses-that-actually-mean-come-fuck-me-after-service",
    url: "https://veil.jexxx.us/articles/10-christian-excuses-that-actually-mean-come-fuck-me-after-service",
  },
  {
    surface: "veil",
    slug: "why-pastor-s-wives-make-the-best-sluts-a-deep-theological-filthy-breakdown",
    url: "https://veil.jexxx.us/articles/why-pastor-s-wives-make-the-best-sluts-a-deep-theological-filthy-breakdown",
  },
];

test("extractKingdomUrlsFromText parses tv list lines", () => {
  const text = [
    "1. SEXY Nanny gets fired so she needs the EXTRA cash",
    "   https://tv.jexxx.us/video/sexy-nanny-gets-fired-so-she-needs-the-extra-cash",
  ].join("\n");
  const urls = extractKingdomUrlsFromText(text);
  assert.equal(urls.length, 1);
  assert.equal(urls[0]?.slug, "sexy-nanny-gets-fired-so-she-needs-the-extra-cash");
});

test("sanitizeKingdomUrls fixes wv host and spaced slugs", () => {
  const broken =
    "🎬 Watch: SEXY Nanny [https://wv.jexxx.us/video/sexy-na ny-gets-fir d-so-she-needs-the-extra-cash]";
  const fixed = sanitizeKingdomUrls(broken, TV_CATALOG);
  assert.match(fixed, /https:\/\/tv\.jexxx\.us\/video\/sexy-nanny-gets-fired-so-she-needs-the-extra-cash/);
  assert.doesNotMatch(fixed, /wv\.jexxx/);
  assert.doesNotMatch(fixed, /sexy-na ny/);
});

test("splitGluedKingdomUrls separates concatenated VEIL links", () => {
  const glued =
    "https://veil.jexxx.us/articles/10-christian-excuses-that-actually-mean-come-fuck-me-after-servicehttps://veil.jexxx.us/articles/why-pastor-s-wives-make-the-best-sluts-a-deep-theological-filthy-breakdown";
  const split = splitGluedKingdomUrls(glued);
  assert.match(split, /after-service\nhttps:\/\/veil/);
  assert.equal((split.match(/https:\/\/veil\.jexxx\.us\/articles\//g) ?? []).length, 2);
});

test("sanitizeKingdomUrls repairs glued VEIL URLs from user regression", () => {
  const glued =
    "https://veil.jexxx.us/articles/10-christian-excuses-that-actually-mean-come-fuck-me-after-servicehttps://veil.jexxx.us/articles/why-pastor-s-wives-make-the-best-sluts-a-deep-theological-filthy-breakdown";
  const fixed = sanitizeKingdomUrls(glued, VEIL_CATALOG);
  assert.match(fixed, /after-service\nhttps:\/\/veil\.jexxx\.us\/articles\/why-pastor/);
  assert.doesNotMatch(fixed, /servicehttps/);
});

test("repairMarkdownUrlBlobs expands bracketed glued URLs to bullets", () => {
  const input =
    "[https://veil.jexxx.us/articles/one\nhttps://veil.jexxx.us/articles/two]";
  const out = repairMarkdownUrlBlobs(input);
  assert.match(out, /• https:\/\/veil\.jexxx\.us\/articles\/one/);
  assert.match(out, /• https:\/\/veil\.jexxx\.us\/articles\/two/);
  assert.doesNotMatch(out, /\[https/);
});

test("compactKingdomBulletLinks converts Title [url] to markdown links", () => {
  const input =
    "• I Turned a Rachel Into a Leah [https://veil.jexxx.us/articles/i-turned-a-rachel-into-a-leah]";
  const out = compactKingdomBulletLinks(input);
  assert.match(out, /\[I Turned a Rachel Into a Leah\]\(https:\/\/veil\.jexxx\.us/);
  assert.doesNotMatch(out, /\[https:\/\/veil/);
});

test("extractKingdomUrlsFromText extracts multiple glued veil URLs", () => {
  const glued =
    "https://veil.jexxx.us/articles/10-christian-excuses-that-actually-mean-come-fuck-me-after-servicehttps://veil.jexxx.us/articles/why-pastor-s-wives-make-the-best-sluts-a-deep-theological-filthy-breakdown";
  const urls = extractKingdomUrlsFromText(glued);
  assert.equal(urls.length, 2);
});