import * as fs from "fs";
import * as path from "path";
import {
  assertAllowedVeilPublicBaseUrl,
  assertSafeArticlePostsDir,
  readPublicMarkdownFile,
} from "./veil-security.js";
import { resolveVeilArticlesPath, resolveVeilRepoPath } from "./path-resolver.js";

/**
 * Read-only access to **public** VEIL articles — the same content published on
 * veil.jexxx.us. Never reads internal Obsidian VEIL docs (architecture, AEO
 * playbooks, deployment guides). Operators with a local clone use
 * content/posts; everyone else falls back to the public RSS feed.
 */

export const VEIL_DEFAULT_BASE_URL = "https://veil.jexxx.us";

function getRepoRootPaths(): string[] {
  const repo = resolveVeilRepoPath();
  return repo ? [repo] : [];
}

function getObsidianArticlePaths(): string[] {
  const articles = resolveVeilArticlesPath();
  return articles ? [articles] : [];
}

export interface VeilPublicEndpoints {
  site: string;
  articlesIndex: string;
  feed: string;
  sitemap: string;
  robots: string;
  llms: string;
  rssChannelTitle: string;
  rssChannelDescription: string;
}

export interface VeilArticleMeta {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  author?: string;
  authorSlug?: string;
  category?: string;
  categorySlug?: string;
  url: string;
  source: "local" | "rss";
}

export interface VeilArticle extends VeilArticleMeta {
  body: string;
  bodyFormat: "markdown" | "html";
}

interface ParsedFrontmatter {
  data: Record<string, string>;
  body: string;
}

interface LocalAuthor {
  slug: string;
  name: string;
}

interface LocalCategory {
  slug: string;
  name: string;
}

let rssCache: { fetchedAt: number; articles: VeilArticle[] } | null = null;
const RSS_CACHE_MS = 5 * 60 * 1000;

export type VeilContentSource = "veil-repo" | "obsidian-mirror" | "public-rss";

export interface VeilContentSourceInfo {
  source: VeilContentSource;
  detail: string;
}

export function getVeilPublicBaseUrl(): string {
  const raw = process.env.VEIL_PUBLIC_BASE_URL?.trim();
  const candidate = raw && raw.startsWith("http") ? raw : VEIL_DEFAULT_BASE_URL;
  return assertAllowedVeilPublicBaseUrl(candidate);
}

/** Reports which public-only source BLXCKCHAT is reading (for operator transparency). */
export function getVeilContentSourceInfo(): VeilContentSourceInfo {
  for (const root of getRepoRootPaths()) {
    const postsDir = path.join(root, "content", "posts");
    if (fs.existsSync(postsDir)) {
      return {
        source: "veil-repo",
        detail: `${root}/content/posts (official veil.jexxx.us publish tree)`,
      };
    }
  }
  for (const articlesDir of getObsidianArticlePaths()) {
    if (fs.existsSync(articlesDir)) {
      return {
        source: "obsidian-mirror",
        detail: `${articlesDir} (public article mirror only)`,
      };
    }
  }
  return {
    source: "public-rss",
    detail: `${getVeilPublicBaseUrl()}/feed.xml (remote public feed)`,
  };
}

export function getVeilPublicEndpoints(
  baseUrl: string = getVeilPublicBaseUrl(),
): VeilPublicEndpoints {
  return {
    site: baseUrl,
    articlesIndex: `${baseUrl}/articles`,
    feed: `${baseUrl}/feed.xml`,
    sitemap: `${baseUrl}/sitemap.xml`,
    robots: `${baseUrl}/robots.txt`,
    llms: `${baseUrl}/llms.txt`,
    rssChannelTitle: "VEIL | by JEXXXUS",
    rssChannelDescription:
      "Dark Christian erotica, confessions, and holy corruption — original articles from VEIL.",
  };
}

export function slugifyVeil(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .trim()
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw.startsWith("---\n")) {
    return { data: {}, body: raw };
  }

  let end = raw.indexOf("\n---\n", 4);
  let bodyStart = end + 5;
  if (end === -1) {
    const eofClose = raw.match(/\n---\s*$/);
    if (!eofClose || eofClose.index === undefined) {
      return { data: {}, body: raw };
    }
    end = eofClose.index;
    bodyStart = raw.length;
  }

  const data: Record<string, string> = {};
  for (const line of raw.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[match[1]!] = value;
  }

  return { data, body: raw.slice(bodyStart) };
}

function resolveLocalPostsDir(): string | null {
  for (const root of getRepoRootPaths()) {
    const postsDir = path.join(root, "content", "posts");
    if (fs.existsSync(postsDir)) {
      return postsDir;
    }
  }
  for (const articlesDir of getObsidianArticlePaths()) {
    if (fs.existsSync(articlesDir)) {
      return articlesDir;
    }
  }
  return null;
}

function resolveLocalContentRoot(): string | null {
  for (const root of getRepoRootPaths()) {
    const contentDir = path.join(root, "content");
    if (fs.existsSync(contentDir)) {
      return contentDir;
    }
  }
  return null;
}

function loadLocalAuthors(contentRoot: string): Map<string, LocalAuthor> {
  const authorsDir = path.join(contentRoot, "authors");
  const map = new Map<string, LocalAuthor>();
  if (!fs.existsSync(authorsDir)) return map;

  for (const file of fs.readdirSync(authorsDir).filter((f) => f.endsWith(".md"))) {
    const { data } = parseFrontmatter(readPublicMarkdownFile(authorsDir, file));
    const base = file.replace(/\.md$/, "");
    const slug = data.slug ? slugifyVeil(data.slug) : slugifyVeil(base);
    map.set(slug, { slug, name: data.name || slug });
  }
  return map;
}

function loadLocalCategories(contentRoot: string): Map<string, LocalCategory> {
  const categoriesDir = path.join(contentRoot, "categories");
  const map = new Map<string, LocalCategory>();
  if (!fs.existsSync(categoriesDir)) return map;

  for (const file of fs.readdirSync(categoriesDir).filter((f) => f.endsWith(".md"))) {
    const { data } = parseFrontmatter(readPublicMarkdownFile(categoriesDir, file));
    const base = file.replace(/\.md$/, "");
    const slug = data.slug ? slugifyVeil(data.slug) : slugifyVeil(base);
    map.set(slug, { slug, name: data.name || slug });
  }
  return map;
}

function articleSlugFromFilename(filename: string, data: Record<string, string>): string {
  const baseName = filename.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
  return data.slug ? slugifyVeil(data.slug) : slugifyVeil(baseName);
}

function buildArticleMeta(
  slug: string,
  data: Record<string, string>,
  authors: Map<string, LocalAuthor>,
  categories: Map<string, LocalCategory>,
  baseUrl: string,
): VeilArticleMeta {
  const authorSlug = data.author ? slugifyVeil(data.author) : undefined;
  const categorySlug = data.category ? slugifyVeil(data.category) : undefined;

  const meta: VeilArticleMeta = {
    slug,
    title: data.title || slug,
    description: data.description || "",
    publishedAt: data.publishedAt || "",
    url: `${baseUrl}/articles/${slug}`,
    source: "local",
  };
  if (authorSlug) {
    meta.authorSlug = authorSlug;
    meta.author = authors.get(authorSlug)?.name ?? authorSlug;
  }
  if (categorySlug) {
    meta.categorySlug = categorySlug;
    meta.category = categories.get(categorySlug)?.name ?? categorySlug;
  }
  return meta;
}

function loadLocalArticles(): VeilArticle[] | null {
  const postsDir = resolveLocalPostsDir();
  if (!postsDir) return null;

  assertSafeArticlePostsDir(postsDir);

  const contentRoot = resolveLocalContentRoot();
  const authors = contentRoot ? loadLocalAuthors(contentRoot) : new Map();
  const categories = contentRoot ? loadLocalCategories(contentRoot) : new Map();
  const baseUrl = getVeilPublicBaseUrl();

  const articles: VeilArticle[] = [];
  for (const file of fs.readdirSync(postsDir).filter((f) => f.endsWith(".md"))) {
    const raw = readPublicMarkdownFile(postsDir, file);
    const { data, body } = parseFrontmatter(raw);
    const slug = articleSlugFromFilename(file, data);
    articles.push({
      ...buildArticleMeta(slug, data, authors, categories, baseUrl),
      body: body.trim(),
      bodyFormat: "markdown",
    });
  }

  articles.sort(
    (a, b) =>
      new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime(),
  );
  return articles;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractXmlTag(block: string, tag: string): string | undefined {
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) {
      return decodeXmlEntities(match[1].trim());
    }
  }
  return undefined;
}

function slugFromArticleUrl(url: string, baseUrl: string): string {
  const prefix = `${baseUrl.replace(/\/$/, "")}/articles/`;
  if (url.startsWith(prefix)) {
    return url.slice(prefix.length).replace(/\/$/, "");
  }
  const parts = url.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? slugifyVeil(url);
}

/** Parse a public VEIL RSS feed (used by remote fallback and tests). */
export function parseVeilRssFeed(xml: string, baseUrl: string = getVeilPublicBaseUrl()): VeilArticle[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const articles: VeilArticle[] = [];

  for (const item of items) {
    const title = extractXmlTag(item, "title");
    const link = extractXmlTag(item, "link");
    if (!title || !link) continue;

    const slug = slugFromArticleUrl(link, baseUrl);
    const description = extractXmlTag(item, "description") ?? "";
    const pubDate = extractXmlTag(item, "pubDate") ?? "";
    const author = extractXmlTag(item, "dc:creator");
    const category = extractXmlTag(item, "category");
    const encoded = extractXmlTag(item, "content:encoded");

    const entry: VeilArticle = {
      slug,
      title,
      description,
      publishedAt: pubDate,
      url: link,
      source: "rss",
      body: encoded ?? description,
      bodyFormat: encoded ? "html" : "markdown",
    };
    if (author) {
      entry.author = author;
      entry.authorSlug = slugifyVeil(author);
    }
    if (category) {
      entry.category = category;
      entry.categorySlug = slugifyVeil(category);
    }
    articles.push(entry);
  }

  return articles;
}

async function fetchPublicRssArticles(force = false): Promise<VeilArticle[]> {
  const now = Date.now();
  if (!force && rssCache && now - rssCache.fetchedAt < RSS_CACHE_MS) {
    return rssCache.articles;
  }

  const baseUrl = getVeilPublicBaseUrl();
  const feedUrl = `${baseUrl}/feed.xml`;
  const response = await fetch(feedUrl, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!response.ok) {
    throw new Error(`[VEIL] Failed to fetch public feed (${response.status}): ${feedUrl}`);
  }

  const xml = await response.text();
  const articles = parseVeilRssFeed(xml, baseUrl);
  rssCache = { fetchedAt: now, articles };
  return articles;
}

/** Load all public VEIL articles (local posts when available, else RSS). */
export async function listVeilArticles(): Promise<VeilArticleMeta[]> {
  const local = loadLocalArticles();
  if (local) {
    return local.map(({ body: _body, bodyFormat: _fmt, ...meta }) => meta);
  }
  const remote = await fetchPublicRssArticles();
  return remote.map(({ body: _body, bodyFormat: _fmt, ...meta }) => meta);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function articleMatchesQuery(article: VeilArticleMeta, query: string): boolean {
  const needle = normalizeSearchText(query);
  const haystack = normalizeSearchText(
    [article.title, article.description, article.slug, article.author, article.category]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(needle);
}

export function searchVeilArticles(
  articles: VeilArticleMeta[],
  query: string,
  limit = 10,
): VeilArticleMeta[] {
  const trimmed = query.trim();
  if (!trimmed) return articles.slice(0, limit);

  const exactSlug = slugifyVeil(trimmed);
  const exact = articles.find((a) => a.slug === exactSlug);
  if (exact) return [exact];

  return articles.filter((a) => articleMatchesQuery(a, trimmed)).slice(0, limit);
}

export async function getVeilArticle(slugOrQuery: string): Promise<VeilArticle | null> {
  const local = loadLocalArticles();
  const baseUrl = getVeilPublicBaseUrl();
  const slug = slugifyVeil(slugOrQuery);

  if (local) {
    const direct = local.find((a) => a.slug === slug);
    if (direct) return direct;
    const matches = searchVeilArticles(local, slugOrQuery, 1);
    if (matches[0]) {
      return local.find((a) => a.slug === matches[0]!.slug) ?? null;
    }
    return null;
  }

  const remote = await fetchPublicRssArticles();
  const direct = remote.find((a) => a.slug === slug);
  if (direct) return direct;
  const matches = searchVeilArticles(remote, slugOrQuery, 1);
  return remote.find((a) => a.slug === matches[0]?.slug) ?? null;
}

export async function getVeilArticleMeta(slugOrQuery: string): Promise<VeilArticleMeta | null> {
  const article = await getVeilArticle(slugOrQuery);
  if (!article) return null;
  const { body: _body, bodyFormat: _fmt, ...meta } = article;
  return meta;
}

/** Reset RSS cache — for tests only. */
export function resetVeilRssCacheForTests(): void {
  rssCache = null;
}