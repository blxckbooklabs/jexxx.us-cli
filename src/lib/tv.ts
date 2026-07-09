import * as fs from "fs";
import * as path from "path";
import { resolveTvRepoPath } from "./path-resolver.js";
import {
  assertAllowedTvPublicBaseUrl,
  readPublicJsonCatalog,
  readPublicLlmsFile,
} from "./tv-security.js";

/**
 * Read-only access to **public** JEXXXUS | TV videos — the same catalog on
 * tv.jexxx.us. Never reads internal Obsidian TV docs, Supabase credentials,
 * or raw stream/embed URLs. Operators with a local clone use videos.json;
 * remote users use public llms-full.txt / feed.xml.
 */

export const TV_DEFAULT_BASE_URL = "https://tv.jexxx.us";

export interface TvPublicEndpoints {
  site: string;
  feed: string;
  sitemap: string;
  sitemapVideo: string;
  robots: string;
  llms: string;
  llmsFull: string;
  playlists: string;
  subscription: string;
}

export interface TvVideoMeta {
  slug: string;
  title: string;
  description: string;
  url: string;
  duration?: string;
  uploadDate?: string;
  channel?: string;
  categories: string[];
  tags: string[];
  thumbnail?: string;
  source: "local" | "llms-full" | "llms" | "rss";
}

export interface TvVideo extends TvVideoMeta {
  body: string;
}

export type TvContentSource = "tv-repo" | "tv-llms-full" | "public-llms-full" | "public-llms" | "public-rss";

export interface TvContentSourceInfo {
  source: TvContentSource;
  detail: string;
}

interface RawVideoRow {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  duration?: string;
  uploadDate?: string;
  channel?: string;
  category?: string | string[];
  tags?: string[];
  embed_url?: string;
  native_url?: string;
}

let remoteCache: { fetchedAt: number; videos: TvVideo[] } | null = null;
const REMOTE_CACHE_MS = 5 * 60 * 1000;

function getRepoRootPath(): string | null {
  const resolved = resolveTvRepoPath();
  if (!resolved) {
    // Log helpful message for users without local TV repo
    console.debug(
      "[TV] Local TV repo not configured. Set JEXXXUS_TV_REPO_PATH env var for local catalog, or use remote endpoints."
    );
  }
  return resolved;
}

export function getTvPublicBaseUrl(): string {
  const raw = process.env.TV_PUBLIC_BASE_URL?.trim();
  const candidate = raw && raw.startsWith("http") ? raw : TV_DEFAULT_BASE_URL;
  return assertAllowedTvPublicBaseUrl(candidate);
}

export function getTvPublicEndpoints(
  baseUrl: string = getTvPublicBaseUrl(),
): TvPublicEndpoints {
  return {
    site: baseUrl,
    feed: `${baseUrl}/feed.xml`,
    sitemap: `${baseUrl}/sitemap.xml`,
    sitemapVideo: `${baseUrl}/sitemap-video.xml`,
    robots: `${baseUrl}/robots.txt`,
    llms: `${baseUrl}/llms.txt`,
    llmsFull: `${baseUrl}/llms-full.txt`,
    playlists: `${baseUrl}/playlists`,
    subscription: `${baseUrl}/subscription`,
  };
}

export function slugifyTv(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .trim()
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function videoUrl(slug: string, baseUrl: string): string {
  return `${baseUrl}/video/${slug}`;
}

function normalizeCategories(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function rowToMeta(
  row: RawVideoRow,
  baseUrl: string,
  source: TvVideoMeta["source"],
): TvVideoMeta | null {
  const slug = row.slug ? slugifyTv(row.slug) : row.id ? slugifyTv(row.id) : "";
  const title = row.title?.trim();
  if (!slug || !title) return null;

  const meta: TvVideoMeta = {
    slug,
    title,
    description: row.description?.trim() || title,
    url: videoUrl(slug, baseUrl),
    categories: normalizeCategories(row.category),
    tags: row.tags ?? [],
    source,
  };
  if (row.duration) meta.duration = row.duration;
  if (row.uploadDate) meta.uploadDate = row.uploadDate;
  if (row.channel) meta.channel = row.channel;
  if (row.thumbnail) meta.thumbnail = row.thumbnail;
  return meta;
}

function resolveLocalVideosJsonPath(): string | null {
  const root = getRepoRootPath();
  if (!root) return null;
  const jsonPath = path.join(root, "src", "data", "videos.json");
  return fs.existsSync(jsonPath) ? jsonPath : null;
}

function resolveLocalLlmsFullPath(): string | null {
  const root = getRepoRootPath();
  if (!root) return null;
  const llmsPath = path.join(root, "public", "llms-full.txt");
  return fs.existsSync(llmsPath) ? llmsPath : null;
}

function loadLocalVideosJson(): TvVideo[] | null {
  const jsonPath = resolveLocalVideosJsonPath();
  if (!jsonPath) return null;

  const baseUrl = getTvPublicBaseUrl();
  const raw = JSON.parse(readPublicJsonCatalog(jsonPath)) as RawVideoRow[];
  if (!Array.isArray(raw)) return null;

  const videos: TvVideo[] = [];
  for (const row of raw) {
    const meta = rowToMeta(row, baseUrl, "local");
    if (!meta) continue;
    videos.push({ ...meta, body: meta.description });
  }

  videos.sort(
    (a, b) =>
      new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime(),
  );
  return videos;
}

function loadLocalLlmsFull(): TvVideo[] | null {
  const root = getRepoRootPath();
  if (!root) return null;
  const publicDir = path.join(root, "public");
  const llmsPath = path.join(publicDir, "llms-full.txt");
  if (!fs.existsSync(llmsPath)) return null;
  const text = readPublicLlmsFile(publicDir, "llms-full.txt");
  return parseTvLlmsFullText(text, getTvPublicBaseUrl(), "llms-full");
}

/** Parse public llms-full.txt (prebuild artifact on tv.jexxx.us). */
export function parseTvLlmsFullText(
  text: string,
  baseUrl: string = getTvPublicBaseUrl(),
  source: TvVideoMeta["source"] = "llms-full",
): TvVideo[] {
  const videos: TvVideo[] = [];
  const blocks = text.includes("\n### ")
    ? text.split(/\n### /).slice(1)
    : text.trimStart().startsWith("### ")
      ? [text.trimStart().slice(4)]
      : [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const title = lines[0]?.trim();
    if (!title) continue;

    let url = "";
    let duration = "";
    let uploadDate = "";
    let description = title;
    const categories: string[] = [];
    const tags: string[] = [];

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- URL:")) {
        url = trimmed.slice(6).trim();
      } else if (trimmed.startsWith("- Duration:")) {
        duration = trimmed.slice(11).trim();
      } else if (trimmed.startsWith("- Upload Date:")) {
        uploadDate = trimmed.slice(14).trim();
      } else if (trimmed.startsWith("- Categories:")) {
        categories.push(
          ...trimmed
            .slice(13)
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        );
      } else if (trimmed.startsWith("- Tags:")) {
        tags.push(
          ...trimmed
            .slice(7)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        );
      } else if (trimmed.startsWith("- Description:")) {
        description = trimmed.slice(14).trim();
      }
    }

    const slug = slugFromVideoUrl(url, baseUrl) ?? slugifyTv(title);
    if (!slug) continue;

    const meta: TvVideoMeta = {
      slug,
      title,
      description,
      url: url || videoUrl(slug, baseUrl),
      categories,
      tags,
      source,
    };
    if (duration) meta.duration = duration;
    if (uploadDate) meta.uploadDate = uploadDate;
    videos.push({ ...meta, body: description });
  }

  return videos;
}

/** Parse compact llms.txt (edge or static prebuild). */
export function parseTvLlmsText(
  text: string,
  baseUrl: string = getTvPublicBaseUrl(),
): TvVideo[] {
  const videos: TvVideo[] = [];
  const lines = text.split("\n");
  let pending: TvVideo | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^- (.+): (https?:\/\/.+)$/);
    if (bullet) {
      if (pending) videos.push(pending);
      const titlePart = bullet[1]!;
      const url = bullet[2]!;
      const bracket = titlePart.match(/^(.+?) \[(.+)\]$/);
      const title = bracket ? bracket[1]!.trim() : titlePart.trim();
      const categories = bracket ? [bracket[2]!.trim()] : [];
      const slug = slugFromVideoUrl(url, baseUrl) ?? slugifyTv(title);
      pending = {
        slug,
        title,
        description: title,
        url,
        categories,
        tags: [],
        source: "llms",
        body: title,
      };
      continue;
    }

    if (pending) {
      if (trimmed.startsWith("- Categories:")) {
        pending.categories = trimmed
          .slice(13)
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
      } else if (trimmed.startsWith("- Tags:")) {
        pending.tags = trimmed
          .slice(7)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }
  }

  if (pending) videos.push(pending);
  return videos;
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
    if (match?.[1]) return decodeXmlEntities(match[1].trim());
  }
  return undefined;
}

function slugFromVideoUrl(url: string, baseUrl: string): string | undefined {
  const prefix = `${baseUrl.replace(/\/$/, "")}/video/`;
  if (url.startsWith(prefix)) {
    return url.slice(prefix.length).replace(/\/$/, "");
  }
  const parts = url.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? slugifyTv(last) : undefined;
}

/** Parse public TV RSS feed (latest videos). */
export function parseTvRssFeed(xml: string, baseUrl: string = getTvPublicBaseUrl()): TvVideo[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const videos: TvVideo[] = [];

  for (const item of items) {
    const title = extractXmlTag(item, "title");
    const link = extractXmlTag(item, "link");
    if (!title || !link) continue;

    const slug = slugFromVideoUrl(link, baseUrl) ?? slugifyTv(title);
    const description = extractXmlTag(item, "description") ?? title;
    const pubDate = extractXmlTag(item, "pubDate") ?? "";

    videos.push({
      slug,
      title,
      description,
      url: link,
      uploadDate: pubDate,
      categories: [],
      tags: [],
      source: "rss",
      body: description,
    });
  }

  return videos;
}

async function fetchRemoteText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/plain, application/xml, application/rss+xml, */*" },
  });
  if (!response.ok) {
    throw new Error(`[TV] Failed to fetch ${url} (${response.status})`);
  }
  return response.text();
}

async function fetchPublicRemoteVideos(force = false): Promise<TvVideo[]> {
  const now = Date.now();
  if (!force && remoteCache && now - remoteCache.fetchedAt < REMOTE_CACHE_MS) {
    return remoteCache.videos;
  }

  const baseUrl = getTvPublicBaseUrl();
  const endpoints = getTvPublicEndpoints(baseUrl);

  try {
    const full = await fetchRemoteText(endpoints.llmsFull);
    const parsed = parseTvLlmsFullText(full, baseUrl, "llms-full");
    if (parsed.length > 0) {
      remoteCache = { fetchedAt: now, videos: parsed };
      return parsed;
    }
  } catch {
    // fall through
  }

  try {
    const llms = await fetchRemoteText(endpoints.llms);
    const parsed = parseTvLlmsText(llms, baseUrl);
    if (parsed.length > 0) {
      remoteCache = { fetchedAt: now, videos: parsed };
      return parsed;
    }
  } catch {
    // fall through
  }

  const xml = await fetchRemoteText(endpoints.feed);
  const parsed = parseTvRssFeed(xml, baseUrl);
  remoteCache = { fetchedAt: now, videos: parsed };
  return parsed;
}

export function getTvContentSourceInfo(): TvContentSourceInfo {
  if (resolveLocalVideosJsonPath()) {
    return {
      source: "tv-repo",
      detail: `${resolveLocalVideosJsonPath()} (official tv.jexxx.us prebuild catalog)`,
    };
  }
  if (resolveLocalLlmsFullPath()) {
    return {
      source: "tv-llms-full",
      detail: `${resolveLocalLlmsFullPath()} (public llms-full.txt mirror)`,
    };
  }
  return {
    source: "public-llms-full",
    detail: `${getTvPublicEndpoints().llmsFull} (remote public catalog)`,
  };
}

async function loadAllVideos(): Promise<TvVideo[]> {
  const local = loadLocalVideosJson();
  if (local && local.length > 0) return local;

  const localLlms = loadLocalLlmsFull();
  if (localLlms && localLlms.length > 0) return localLlms;

  return fetchPublicRemoteVideos();
}

/** Load all public TV videos (local catalog when available, else public llms/RSS). */
export async function listTvVideos(): Promise<TvVideoMeta[]> {
  const videos = await loadAllVideos();
  return videos.map(({ body: _body, ...meta }) => meta);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function videoMatchesQuery(video: TvVideoMeta, query: string): boolean {
  const needle = normalizeSearchText(query);
  const haystack = normalizeSearchText(
    [
      video.title,
      video.description,
      video.slug,
      video.channel,
      ...video.categories,
      ...video.tags,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(needle);
}

export function searchTvVideos(
  videos: TvVideoMeta[],
  query: string,
  limit = 10,
): TvVideoMeta[] {
  const trimmed = query.trim();
  if (!trimmed) return videos.slice(0, limit);

  const exactSlug = slugifyTv(trimmed);
  const exact = videos.find((v) => v.slug === exactSlug);
  if (exact) return [exact];

  return videos.filter((v) => videoMatchesQuery(v, trimmed)).slice(0, limit);
}

export async function getTvVideo(slugOrQuery: string): Promise<TvVideo | null> {
  const videos = await loadAllVideos();
  const slug = slugifyTv(slugOrQuery);

  const direct = videos.find((v) => v.slug === slug);
  if (direct) return direct;

  const matches = searchTvVideos(videos, slugOrQuery, 1);
  if (!matches[0]) return null;
  return videos.find((v) => v.slug === matches[0]!.slug) ?? null;
}

export async function getTvVideoMeta(slugOrQuery: string): Promise<TvVideoMeta | null> {
  const video = await getTvVideo(slugOrQuery);
  if (!video) return null;
  const { body: _body, ...meta } = video;
  return meta;
}

/** List distinct categories across the catalog. */
export function listTvCategories(videos: TvVideoMeta[]): string[] {
  const set = new Set<string>();
  for (const video of videos) {
    for (const cat of video.categories) set.add(cat);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Reset remote cache — for tests only. */
export function resetTvRemoteCacheForTests(): void {
  remoteCache = null;
}