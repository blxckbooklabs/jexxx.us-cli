/** Canonical empire surface URLs collected from tool/prefetch output. */
export interface EmpireUrlEntry {
  url: string;
  slug: string;
  title?: string;
  surface: "tv" | "veil";
}

const TV_VIDEO_URL =
  /https?:\/\/(?:tv|wv|tw)\.jexxx\.us\/video\/([a-zA-Z0-9][a-zA-Z0-9\s-]*[a-zA-Z0-9]|[a-zA-Z0-9])/gi;
const VEIL_ARTICLE_URL =
  /https?:\/\/veil\.jexxx\.us\/articles\/([a-zA-Z0-9][a-zA-Z0-9\s-]*[a-zA-Z0-9]|[a-zA-Z0-9])/gi;
const TV_LINE_URL = /^\s*https?:\/\/tv\.jexxx\.us\/video\/([a-z0-9-]+)\s*$/im;

/** Pull canonical TV/VEIL URLs from tool results or prefetch blocks. */
export function extractEmpireUrlsFromText(text: string): EmpireUrlEntry[] {
  const seen = new Set<string>();
  const entries: EmpireUrlEntry[] = [];

  const add = (surface: "tv" | "veil", url: string, slug: string, title?: string): void => {
    const key = `${surface}:${slug}`;
    if (seen.has(key)) return;
    seen.add(key);
    const entry: EmpireUrlEntry = { surface, url, slug };
    if (title) entry.title = title;
    entries.push(entry);
  };

  const lines = text.split("\n");
  let pendingTitle: string | undefined;
  for (const line of lines) {
    const numbered = line.match(/^\d+\.\s+(.+)$/);
    if (numbered?.[1]) pendingTitle = numbered[1].trim();

    const tvLine = line.match(TV_LINE_URL);
    if (tvLine?.[1]) {
      const slug = tvLine[1];
      add("tv", `https://tv.jexxx.us/video/${slug}`, slug, pendingTitle);
      pendingTitle = undefined;
    }
  }

  let match: RegExpExecArray | null;
  const tvRe = /https?:\/\/tv\.jexxx\.us\/video\/([a-z0-9-]+)/gi;
  while ((match = tvRe.exec(text)) !== null) {
    if (match[1]) add("tv", `https://tv.jexxx.us/video/${match[1]}`, match[1]);
  }

  const veilRe = /https?:\/\/veil\.jexxx\.us\/articles\/([a-z0-9-]+)/gi;
  while ((match = veilRe.exec(text)) !== null) {
    if (match[1]) add("veil", `https://veil.jexxx.us/articles/${match[1]}`, match[1]);
  }

  return entries;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
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

function resolveTvSlug(brokenSlug: string, catalog: EmpireUrlEntry[]): string {
  const compact = brokenSlug.replace(/\s+/g, "").toLowerCase();
  const exact = catalog.find((e) => e.surface === "tv" && e.slug === compact);
  if (exact) return exact.slug;

  let best: string | null = null;
  let bestDist = Infinity;
  for (const entry of catalog) {
    if (entry.surface !== "tv") continue;
    const dist = levenshtein(compact, entry.slug);
    const threshold = Math.max(4, Math.floor(entry.slug.length * 0.12));
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = entry.slug;
    }
  }
  return best ?? compact;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findByTitleFragment(text: string, catalog: EmpireUrlEntry[]): EmpireUrlEntry | null {
  const window = text.slice(0, 200);
  for (const entry of catalog) {
    if (!entry.title || entry.surface !== "tv") continue;
    const norm = normalizeTitle(entry.title);
    if (norm.length < 12) continue;
    if (normalizeTitle(window).includes(norm) || normalizeTitle(text).includes(norm)) {
      return entry;
    }
  }
  return null;
}

/**
 * Repair model-hallucinated empire URLs (wv.jexxx.us, spaced slugs) using
 * canonical URLs from the same turn's tool/prefetch output.
 */
export function sanitizeEmpireUrls(response: string, catalog: EmpireUrlEntry[]): string {
  if (!response.trim()) return response;

  let out = response.replace(/https?:\/\/wv\.jexxx\.us/gi, "https://tv.jexxx.us");
  out = out.replace(/https?:\/\/tw\.jexxx\.us/gi, "https://tv.jexxx.us");

  out = out.replace(TV_VIDEO_URL, (full, slugPart: string) => {
    const fixed = resolveTvSlug(slugPart, catalog);
    return `https://tv.jexxx.us/video/${fixed}`;
  });

  out = out.replace(VEIL_ARTICLE_URL, (full, slugPart: string) => {
    const compact = slugPart.replace(/\s+/g, "").toLowerCase();
    const exact = catalog.find((e) => e.surface === "veil" && e.slug === compact);
    return exact?.url ?? `https://veil.jexxx.us/articles/${compact}`;
  });

  const titleMatch = findByTitleFragment(out, catalog);
  if (titleMatch) {
    const brokenTv = new RegExp(
      `https?:\\/\\/(?:tv|wv)\\.jexxx\\.us\\/video\\/[a-zA-Z0-9\\s-]+`,
      "i",
    );
    if (brokenTv.test(out) && !out.includes(titleMatch.url)) {
      out = out.replace(brokenTv, titleMatch.url);
    }
  }

  return out;
}