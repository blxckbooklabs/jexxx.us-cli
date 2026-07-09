import assert from "node:assert/strict";
import path from "node:path";
import { test, afterEach } from "node:test";

import {
  getTvPublicEndpoints,
  getTvVideo,
  getTvVideoMeta,
  listTvCategories,
  listTvVideos,
  parseTvLlmsFullText,
  parseTvLlmsText,
  parseTvRssFeed,
  resetTvRemoteCacheForTests,
  searchTvVideos,
  slugifyTv,
} from "../lib/tv.js";
import { tvTool } from "../lib/blxckchat/tools/tv-tools.js";
import { assertAllowedTvPublicBaseUrl } from "../lib/tv-security.js";

const FIXTURE_ROOT = path.join(process.cwd(), "src/__tests__/fixtures/tv");

afterEach(() => {
  delete process.env.TV_CONTENT_PATH;
  resetTvRemoteCacheForTests();
});

test("slugifyTv produces URL-safe slugs", () => {
  assert.equal(slugifyTv("Pastor's Wife Confession"), "pastor-s-wife-confession");
});

test("assertAllowedTvPublicBaseUrl permits tv.jexxx.us", () => {
  assert.equal(
    assertAllowedTvPublicBaseUrl("https://tv.jexxx.us/"),
    "https://tv.jexxx.us",
  );
});

test("assertAllowedTvPublicBaseUrl blocks internal SSRF hosts", () => {
  assert.throws(
    () => assertAllowedTvPublicBaseUrl("https://169.254.169.254/"),
    /not allowed/i,
  );
});

test("listTvVideos loads local videos.json with canonical watch URLs", async () => {
  process.env.TV_CONTENT_PATH = FIXTURE_ROOT;
  const videos = await listTvVideos();
  assert.equal(videos.length, 1);
  assert.equal(videos[0]?.slug, "sample-tv-ritual");
  assert.match(videos[0]?.url ?? "", /\/video\/sample-tv-ritual$/);
  assert.deepEqual(videos[0]?.categories, ["Nuns", "Sin"]);
});

test("getTvVideo returns description without embed URLs", async () => {
  process.env.TV_CONTENT_PATH = FIXTURE_ROOT;
  const video = await getTvVideo("sample-tv-ritual");
  assert.ok(video);
  assert.match(video.body, /sample biblio-erotic ritual/i);
  assert.doesNotMatch(JSON.stringify(video), /embed_url|r2\.tv/);
});

test("searchTvVideos finds by category", async () => {
  process.env.TV_CONTENT_PATH = FIXTURE_ROOT;
  const videos = await listTvVideos();
  const hits = searchTvVideos(videos, "nuns");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.slug, "sample-tv-ritual");
});

test("parseTvLlmsFullText extracts watch URLs and descriptions", () => {
  const text = `### Sample TV Ritual
- URL: https://tv.jexxx.us/video/sample-tv-ritual
- Duration: 12:00
- Categories: Nuns
- Description: Full agent-readable description.`;
  const videos = parseTvLlmsFullText(text, "https://tv.jexxx.us");
  assert.equal(videos.length, 1);
  assert.equal(videos[0]?.slug, "sample-tv-ritual");
  assert.equal(videos[0]?.body, "Full agent-readable description.");
});

test("parseTvLlmsText supports edge compact format", () => {
  const text = `- Dark Confession [Nuns]: https://tv.jexxx.us/video/dark-confession`;
  const videos = parseTvLlmsText(text, "https://tv.jexxx.us");
  assert.equal(videos.length, 1);
  assert.equal(videos[0]?.slug, "dark-confession");
  assert.deepEqual(videos[0]?.categories, ["Nuns"]);
});

test("parseTvRssFeed extracts video links", () => {
  const xml = `<?xml version="1.0"?>
<rss><channel>
<item>
  <title>RSS Video</title>
  <link>https://tv.jexxx.us/video/rss-video</link>
  <description>RSS description</description>
</item>
</channel></rss>`;
  const videos = parseTvRssFeed(xml, "https://tv.jexxx.us");
  assert.equal(videos.length, 1);
  assert.equal(videos[0]?.slug, "rss-video");
});

test("getTvPublicEndpoints exposes TV AEO URLs", () => {
  const endpoints = getTvPublicEndpoints("https://tv.jexxx.us");
  assert.equal(endpoints.feed, "https://tv.jexxx.us/feed.xml");
  assert.equal(endpoints.llmsFull, "https://tv.jexxx.us/llms-full.txt");
  assert.equal(endpoints.sitemapVideo, "https://tv.jexxx.us/sitemap-video.xml");
});

test("listTvCategories aggregates unique categories", async () => {
  process.env.TV_CONTENT_PATH = FIXTURE_ROOT;
  const videos = await listTvVideos();
  const cats = listTvCategories(videos);
  assert.deepEqual(cats, ["Nuns", "Sin"]);
});

test("tv_query tool list action returns readable video lines", async () => {
  process.env.TV_CONTENT_PATH = FIXTURE_ROOT;
  const raw = await tvTool.execute({ action: "list" });
  assert.match(raw, /JEXXXUS \| TV videos \(1 shown\)/);
  assert.match(raw, /Sample TV Ritual/);
  assert.match(raw, /\/video\/sample-tv-ritual/);
  assert.match(raw, /llms-full\.txt: https:\/\/tv\.jexxx\.us\/llms-full\.txt/);
  assert.doesNotMatch(raw, /embed_url/);
});

test("tv_query tool meta action returns canonical URL", async () => {
  process.env.TV_CONTENT_PATH = FIXTURE_ROOT;
  const raw = await tvTool.execute({ action: "meta", slug: "sample-tv-ritual" });
  assert.match(raw, /URL: https:\/\/tv\.jexxx\.us\/video\/sample-tv-ritual/);
  assert.match(raw, /Video sitemap: https:\/\/tv\.jexxx\.us\/sitemap-video\.xml/);
});

test("tv_query meta without slug explains next step", async () => {
  const raw = await tvTool.execute({ action: "meta" });
  assert.match(raw, /slug.*required/i);
  assert.match(raw, /list or action=search/i);
});

test("getTvVideoMeta resolves by title fragment", async () => {
  process.env.TV_CONTENT_PATH = FIXTURE_ROOT;
  const meta = await getTvVideoMeta("Sample TV");
  assert.ok(meta);
  assert.equal(meta.slug, "sample-tv-ritual");
});