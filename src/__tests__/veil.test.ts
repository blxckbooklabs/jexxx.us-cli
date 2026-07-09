import assert from "node:assert/strict";
import path from "node:path";
import { test, afterEach } from "node:test";

import {
  getVeilArticle,
  getVeilArticleMeta,
  getVeilPublicEndpoints,
  listVeilArticles,
  parseVeilRssFeed,
  resetVeilRssCacheForTests,
  searchVeilArticles,
  slugifyVeil,
} from "../lib/veil.js";
import { veilTool } from "../lib/blxckchat/tools/veil-tools.js";

const FIXTURE_ROOT = path.join(process.cwd(), "src/__tests__/fixtures/veil");

afterEach(() => {
  delete process.env.VEIL_CONTENT_PATH;
  delete process.env.VEIL_ARTICLES_PATH;
  resetVeilRssCacheForTests();
});

test("slugifyVeil produces URL-safe slugs", () => {
  assert.equal(slugifyVeil("How Becoming a Christian Made Me a Better Hoebag"), "how-becoming-a-christian-made-me-a-better-hoebag");
});

test("listVeilArticles loads local published posts with canonical URLs", async () => {
  process.env.VEIL_CONTENT_PATH = FIXTURE_ROOT;
  const articles = await listVeilArticles();
  assert.equal(articles.length, 1);
  assert.equal(articles[0]?.slug, "sample-veil-article");
  assert.match(articles[0]?.url ?? "", /\/articles\/sample-veil-article$/);
  assert.equal(articles[0]?.author, "Hannah");
  assert.equal(articles[0]?.category, "Corruption");
});

test("getVeilArticle returns full markdown body for quoting", async () => {
  process.env.VEIL_CONTENT_PATH = FIXTURE_ROOT;
  const article = await getVeilArticle("sample-veil-article");
  assert.ok(article);
  assert.equal(article.bodyFormat, "markdown");
  assert.match(article.body, /First paragraph/);
});

test("getVeilArticleMeta includes SEO fields", async () => {
  process.env.VEIL_CONTENT_PATH = FIXTURE_ROOT;
  const meta = await getVeilArticleMeta("Sample VEIL Article");
  assert.ok(meta);
  assert.equal(meta.title, "Sample VEIL Article");
  assert.match(meta.url, /veil\.jexxx\.us\/articles\//);
});

test("searchVeilArticles finds by title fragment", async () => {
  process.env.VEIL_CONTENT_PATH = FIXTURE_ROOT;
  const articles = await listVeilArticles();
  const hits = searchVeilArticles(articles, "hooky public");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.slug, "sample-veil-article");
});

test("parseVeilRssFeed extracts links and HTML bodies from public feed XML", () => {
  const xml = `<?xml version="1.0"?>
<rss><channel>
<item>
  <title>RSS Article</title>
  <link>https://veil.jexxx.us/articles/rss-article</link>
  <description>SEO description</description>
  <pubDate>Sat, 29 Mar 2026 00:00:00 GMT</pubDate>
  <dc:creator>Hannah</dc:creator>
  <category>Corruption</category>
  <content:encoded><![CDATA[<p>Body</p>]]></content:encoded>
</item>
</channel></rss>`;

  const articles = parseVeilRssFeed(xml, "https://veil.jexxx.us");
  assert.equal(articles.length, 1);
  assert.equal(articles[0]?.slug, "rss-article");
  assert.equal(articles[0]?.url, "https://veil.jexxx.us/articles/rss-article");
  assert.equal(articles[0]?.bodyFormat, "html");
});

test("getVeilPublicEndpoints exposes RSS and sitemap URLs", () => {
  const endpoints = getVeilPublicEndpoints("https://veil.jexxx.us");
  assert.equal(endpoints.feed, "https://veil.jexxx.us/feed.xml");
  assert.equal(endpoints.sitemap, "https://veil.jexxx.us/sitemap.xml");
  assert.equal(endpoints.llms, "https://veil.jexxx.us/llms.txt");
});

test("veil_query tool discover action returns public endpoints", async () => {
  process.env.VEIL_CONTENT_PATH = FIXTURE_ROOT;
  const raw = await veilTool.execute({ action: "discover" });
  const payload = JSON.parse(raw) as { feed: string; articleCount: number };
  assert.equal(payload.feed, "https://veil.jexxx.us/feed.xml");
  assert.equal(payload.articleCount, 1);
});

test("veil_query tool meta action returns canonical URL", async () => {
  process.env.VEIL_CONTENT_PATH = FIXTURE_ROOT;
  const raw = await veilTool.execute({ action: "meta", slug: "sample-veil-article" });
  const payload = JSON.parse(raw) as { url: string; seo: { canonicalUrl: string } };
  assert.equal(payload.url, payload.seo.canonicalUrl);
  assert.match(payload.url, /sample-veil-article/);
});