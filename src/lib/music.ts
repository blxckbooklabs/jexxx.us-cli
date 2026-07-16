/**
 * Read-only access to public JEXXXUS Music surfaces — music.jexxx.us (Crucifly
 * Records), docs.jexxx.us/music, Traktrain beat store, and artist link hubs.
 * No private catalog API exists; beats/kits are embedded via Traktrain widgets.
 */

export const MUSIC_DEFAULT_BASE_URL = "https://music.jexxx.us";
export const MUSIC_DOCS_URL = "https://docs.jexxx.us/music";

export interface MusicPublicEndpoints {
  site: string;
  docs: string;
  feed: string;
  sitemap: string;
  robots: string;
  llms: string;
}

export interface MusicCatalogEntry {
  slug: string;
  title: string;
  description: string;
  category: string;
  url: string;
  tags?: string[];
}

/** Curated catalog from music.jexxx.us, public llms.txt, and docs.jexxx.us/music. */
export const MUSIC_CATALOG: readonly MusicCatalogEntry[] = [
  {
    slug: "home",
    title: "Crucifly Records — Home",
    description:
      "Christian hip-hop beats and gospel rap production from Memphis, TN. Garden home base for JEXXXUS Music.",
    category: "page",
    url: "https://music.jexxx.us/",
    tags: ["crucifly", "memphis", "garden", "jexxxus music"],
  },
  {
    slug: "beats",
    title: "Instrumentals — Beat Store",
    description:
      "Lease or exclusive Christian hip-hop instrumentals. Traktrain-embedded beat store on music.jexxx.us.",
    category: "beats",
    url: "https://music.jexxx.us/#beats",
    tags: ["beats", "instrumentals", "lease", "exclusive", "traktrain", "hip-hop"],
  },
  {
    slug: "kits",
    title: "Sound Kits & Sample Packs",
    description:
      "Gospel rap production kits — drum kits, melody loops, and sound design tools.",
    category: "kits",
    url: "https://music.jexxx.us/#kits",
    tags: ["kits", "sample packs", "drums", "loops", "production"],
  },
  {
    slug: "traktrain-store",
    title: "Crucifly Records on Traktrain",
    description: "Full beat catalog — buy and lease faith-based instrumentals.",
    category: "distribution",
    url: "https://traktrain.com/a/cruciflyrecords",
    tags: ["traktrain", "beats", "license", "crucifly records"],
  },
  {
    slug: "walk-on-wavs-kits",
    title: "Walk on WAVs — Browse Kits",
    description: "Sound kits and sample packs (Walk on WAVs / Prod. by Jesus series).",
    category: "kits",
    url: "https://linktr.ee/walkonwavs",
    tags: ["walk on wavs", "kits", "prod by jesus"],
  },
  {
    slug: "crucifly-records-label",
    title: "Crucifly Records — Label",
    description:
      "Independent Memphis label — electronic, experimental, hip-hop, ambient. Masters retained by artists.",
    category: "label",
    url: "https://linktr.ee/cruciflyrecords",
    tags: ["crucifly records", "label", "memphis", "indie"],
  },
  {
    slug: "song-of-dylan",
    title: "Song of Dylan",
    description:
      "Solo electronic/ambient/experimental project — Notion hub, Linktree, SoundCloud.",
    category: "artist",
    url: "https://linktr.ee/songofdylan",
    tags: ["song of dylan", "electronic", "ambient", "lo-fi", "solo"],
  },
  {
    slug: "lil-bible",
    title: "Lil' Bible",
    description: "Artist within the JEXXXUS garden — Linktree hub.",
    category: "artist",
    url: "https://linktr.ee/jexxxus",
    tags: ["lil bible", "artist", "crucifly"],
  },
  {
    slug: "docs-music",
    title: "JEXXXUS Music — Documentation",
    description:
      "Architecture and garden context for Crucifly Records, Song of Dylan, and music × technology.",
    category: "docs",
    url: "https://docs.jexxx.us/music",
    tags: ["docs", "architecture", "crucifly", "song of dylan", "technology"],
  },
  {
    slug: "soundcloud",
    title: "Crucifly Records on SoundCloud",
    description: "Primary streaming and discovery for label releases.",
    category: "streaming",
    url: "https://soundcloud.com/cruciflyrecords",
    tags: ["soundcloud", "stream", "crucifly"],
  },
  {
    slug: "instagram",
    title: "Crucifly Records on Instagram",
    description: "Visual identity and release updates.",
    category: "social",
    url: "https://instagram.com/cruciflyrecords",
    tags: ["instagram", "social", "crucifly"],
  },
] as const;

let llmsCache: { fetchedAt: number; text: string } | null = null;
const LLMS_CACHE_MS = 10 * 60 * 1000;

export function getMusicPublicBaseUrl(): string {
  const raw = process.env.MUSIC_PUBLIC_BASE_URL?.trim();
  return raw && raw.startsWith("http") ? raw.replace(/\/+$/, "") : MUSIC_DEFAULT_BASE_URL;
}

export function getMusicPublicEndpoints(
  baseUrl: string = getMusicPublicBaseUrl(),
): MusicPublicEndpoints {
  return {
    site: baseUrl,
    docs: MUSIC_DOCS_URL,
    feed: `${baseUrl}/feed.xml`,
    sitemap: `${baseUrl}/sitemap.xml`,
    robots: `${baseUrl}/robots.txt`,
    llms: `${baseUrl}/llms.txt`,
  };
}

export function listMusicCatalog(limit = 25): MusicCatalogEntry[] {
  return MUSIC_CATALOG.slice(0, Math.min(Math.max(1, limit), MUSIC_CATALOG.length));
}

export function getMusicEntry(slugOrQuery: string): MusicCatalogEntry | null {
  const key = slugOrQuery.toLowerCase().trim();
  if (!key) return null;

  const bySlug = MUSIC_CATALOG.find((e) => e.slug === key);
  if (bySlug) return bySlug;

  const hits = searchMusicCatalog(key, 1);
  return hits[0] ?? null;
}

export function searchMusicCatalog(query: string, limit = 10): MusicCatalogEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return listMusicCatalog(limit);

  const scored = MUSIC_CATALOG.map((entry) => {
    const haystack = [
      entry.slug,
      entry.title,
      entry.description,
      entry.category,
      ...(entry.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    if (entry.slug.includes(q) || entry.title.toLowerCase().includes(q)) score += 10;
    if (haystack.includes(q)) score += 5;
    for (const token of q.split(/\s+/).filter(Boolean)) {
      if (haystack.includes(token)) score += 2;
    }
    return { entry, score };
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((row) => row.entry);
}

export async function fetchMusicLlmsTxt(): Promise<string | null> {
  const now = Date.now();
  if (llmsCache && now - llmsCache.fetchedAt < LLMS_CACHE_MS) {
    return llmsCache.text;
  }

  const endpoints = getMusicPublicEndpoints();
  try {
    const res = await fetch(endpoints.llms, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (text) llmsCache = { fetchedAt: now, text };
    return text || null;
  } catch {
    return null;
  }
}

export function getMusicDocsSummary(): string {
  return [
    "The Sound of the Garden — Music is the heartbeat beneath the code.",
    "",
    "Crucifly Records: independent Memphis label (electronic, experimental, hip-hop, ambient).",
    "Distribution: SoundCloud, Spotify, Apple Music, Bandcamp. Web: music.jexxx.us",
    "Philosophy: no algorithmic playlist chasing; artists retain masters.",
    "",
    "Song of Dylan: solo electronic/ambient/experimental — Notion hub, Linktree, SoundCloud.",
    "",
    "Music × Technology: Chatterbox TTS (vocal processing), Supabase (release metadata),",
    "Vercel (music.jexxx.us hosting), VEIL CMS (reviews/liner notes), future $EROS tokens.",
    "",
    `Full docs: ${MUSIC_DOCS_URL}`,
  ].join("\n");
}