/** Canonical kingdom surface URLs collected from tool/prefetch output. */
export interface KingdomUrlEntry {
  url: string;
  slug: string;
  title?: string;
  surface: "tv" | "veil";
}

const KINGDOM_TV_URL = /https?:\/\/(?:tv|wv|tw)\.jexxx\.us\/video\/[a-z0-9-]+/gi;
const KINGDOM_VEIL_URL = /https?:\/\/veil\.jexxx\.us\/articles\/[a-z0-9-]+/gi;
const TV_LINE_URL = /^\s*https?:\/\/tv\.jexxx\.us\/video\/([a-z0-9-]+)\s*$/im;
const VEIL_LINE_URL = /^\s*https?:\/\/veil\.jexxx\.us\/articles\/([a-z0-9-]+)\s*$/im;

/** Split URLs glued without separators (common small-model failure). */
export function splitGluedKingdomUrls(text: string): string {
  let out = text;
  out = out.replace(
    /(https?:\/\/(?:veil\.jexxx\.us\/articles|tv\.jexxx\.us\/video)\/[a-z0-9-]+)(?=https?:\/\/)/gi,
    "$1\n",
  );
  out = out.replace(
    /([a-z0-9-])(https?:\/\/(?:veil\.jexxx\.us|tv\.jexxx\.us)\/)/gi,
    "$1\n$2",
  );
  return out;
}

function extractSlug(url: string, surface: "tv" | "veil"): string {
  const prefix =
    surface === "tv"
      ? /https?:\/\/(?:tv|wv|tw)\.jexxx\.us\/video\//i
      : /https?:\/\/veil\.jexxx\.us\/articles\//i;
  return url.replace(prefix, "").replace(/\s+/g, "").toLowerCase();
}

/** Pull canonical TV/VEIL URLs from tool results or prefetch blocks. */
export function extractKingdomUrlsFromText(text: string): KingdomUrlEntry[] {
  const seen = new Set<string>();
  const entries: KingdomUrlEntry[] = [];

  const add = (surface: "tv" | "veil", url: string, slug: string, title?: string): void => {
    const key = `${surface}:${slug}`;
    if (seen.has(key)) return;
    seen.add(key);
    const entry: KingdomUrlEntry = { surface, url, slug };
    if (title) entry.title = title;
    entries.push(entry);
  };

  const lines = splitGluedKingdomUrls(text).split("\n");
  let pendingTitle: string | undefined;
  for (const line of lines) {
    const numbered = line.match(/^\d+\.\s+(.+)$/);
    if (numbered?.[1]) pendingTitle = numbered[1].trim();

    const tvLine = line.match(TV_LINE_URL);
    if (tvLine?.[1]) {
      add("tv", `https://tv.jexxx.us/video/${tvLine[1]}`, tvLine[1], pendingTitle);
      pendingTitle = undefined;
      continue;
    }

    const veilLine = line.match(VEIL_LINE_URL);
    if (veilLine?.[1]) {
      add("veil", `https://veil.jexxx.us/articles/${veilLine[1]}`, veilLine[1], pendingTitle);
      pendingTitle = undefined;
    }
  }

  const split = splitGluedKingdomUrls(text);
  for (const url of split.match(KINGDOM_TV_URL) ?? []) {
    const slug = extractSlug(url, "tv");
    add("tv", `https://tv.jexxx.us/video/${slug}`, slug);
  }
  for (const url of split.match(KINGDOM_VEIL_URL) ?? []) {
    const slug = extractSlug(url, "veil");
    add("veil", `https://veil.jexxx.us/articles/${slug}`, slug);
  }

  return entries;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length +  1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0) as number[]);
  for (let i = 0; i < rows; i++) matrix[i]![0] = i;
  for (let j = 0; j < cols; j++) matrix[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

function closestCatalogSlug(
  compact: string,
  catalog: KingdomUrlEntry[],
  surface: "tv" | "veil",
): string {
  const exact = catalog.find((e) => e.surface === surface && e.slug === compact);
  if (exact) return exact.slug;

  let best: string | null = null;
  let bestDist = Infinity;
  for (const entry of catalog) {
    if (entry.surface !== surface) continue;
    const dist = levenshtein(compact, entry.slug);
    const threshold = Math.max(4, Math.floor(entry.slug.length * 0.12));
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = entry.slug;
    }
  }
  return best ?? compact;
}

function canonicalizeUrl(raw: string, catalog: KingdomUrlEntry[]): string {
  const tv = raw.match(/^https?:\/\/(?:tv|wv|tw)\.jexxx\.us\/video\/([a-z0-9-]+)$/i);
  if (tv?.[1]) {
    const slug = closestCatalogSlug(tv[1].toLowerCase(), catalog, "tv");
    return `https://tv.jexxx.us/video/${slug}`;
  }
  const veil = raw.match(/^https?:\/\/veil\.jexxx\.us\/articles\/([a-z0-9-]+)$/i);
  if (veil?.[1]) {
    const slug = closestCatalogSlug(veil[1].toLowerCase(), catalog, "veil");
    return `https://veil.jexxx.us/articles/${slug}`;
  }
  return raw;
}

/** `• Title [https://veil...]` → `• [Title](https://veil...)` for shorter TUI wraps. */
export function compactKingdomBulletLinks(text: string): string {
  return text.replace(
    /^(\s*[•*-]\s+)(.+?)\s*\[(https?:\/\/(?:veil|tv)\.jexxx\.us\/[^\]\n]+)\]\s*$/gm,
    (_full, bullet: string, title: string, url: string) =>
      `${bullet}[${title.trim()}](${url.replace(/\s+/g, "")})`,
  );
}

/** Turn `[url1\nurl2]` blobs into one bullet per URL. */
export function repairMarkdownUrlBlobs(text: string): string {
  return text.replace(/\[((?:https?:\/\/[^\]\n]+(?:\nhttps?:\/\/[^\]\n]+)*))\]/g, (_full, inner: string) => {
    const urls = inner
      .split(/\n+/)
      .map((line: string) => line.trim())
      .filter((line: string) => /^https?:\/\//i.test(line));
    if (urls.length <= 1) return `[${inner}]`;
    return urls.map((url: string) => `• ${url}`).join("\n");
  });
}

/**
 * Repair model-hallucinated kingdom URLs (wv host, spaced/glued slugs) using
 * canonical URLs from the same turn's tool/prefetch output.
 */
export function sanitizeKingdomUrls(response: string, catalog: KingdomUrlEntry[]): string {
  if (!response.trim()) return response;

  let out = splitGluedKingdomUrls(response);
  out = out.replace(/https?:\/\/wv\.jexxx\.us/gi, "https://tv.jexxx.us");
  out = out.replace(/https?:\/\/tw\.jexxx\.us/gi, "https://tv.jexxx.us");

  out = out.replace(
    /https?:\/\/(?:tv|wv|tw)\.jexxx\.us\/video\/([a-z0-9][a-z0-9\s-]*[a-z0-9]|[a-z0-9])(?=[\s\]\),.;!?]|$)/gi,
    (_full, slugPart: string) => {
      const slug = closestCatalogSlug(slugPart.replace(/\s+/g, "").toLowerCase(), catalog, "tv");
      return `https://tv.jexxx.us/video/${slug}`;
    },
  );
  out = out.replace(KINGDOM_TV_URL, (url) => canonicalizeUrl(url.replace(/\s+/g, ""), catalog));
  out = out.replace(
    /https?:\/\/veil\.jexxx\.us\/articles\/([a-z0-9][a-z0-9\s-]*[a-z0-9]|[a-z0-9])(?=[\s\]\),.;!?]|$)/gi,
    (_full, slugPart: string) => {
      const slug = closestCatalogSlug(slugPart.replace(/\s+/g, "").toLowerCase(), catalog, "veil");
      return `https://veil.jexxx.us/articles/${slug}`;
    },
  );
  out = out.replace(KINGDOM_VEIL_URL, (url) => canonicalizeUrl(url.replace(/\s+/g, ""), catalog));

  out = repairMarkdownUrlBlobs(out);
  out = compactKingdomBulletLinks(out);
  return out;
}