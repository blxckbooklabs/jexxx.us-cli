import type { BlxckchatTool } from "./types.js";
import {
  fetchMusicLlmsTxt,
  getMusicDocsSummary,
  getMusicEntry,
  getMusicPublicEndpoints,
  listMusicCatalog,
  MUSIC_CATALOG,
  searchMusicCatalog,
} from "../../music.js";
import {
  formatMusicCatalogList,
  formatMusicDiscover,
  formatMusicEntryFull,
  formatMusicEntryMeta,
} from "./music-format.js";

type MusicAction = "list" | "get" | "search" | "meta" | "discover" | "docs";

function resolveMusicAction(raw: string): MusicAction | null {
  const action = raw.toLowerCase().trim();
  if (action === "list") return "list";
  if (action === "get") return "get";
  if (action === "search") return "search";
  if (action === "meta") return "meta";
  if (action === "discover" || action === "feed" || action === "rss") return "discover";
  if (action === "docs" || action === "about") return "docs";
  return null;
}

/**
 * Read-only access to JEXXXUS Music — Crucifly Records (music.jexxx.us),
 * beat/kits surfaces, Traktrain licensing, and docs.jexxx.us/music.
 */
export const musicTool: BlxckchatTool = {
  name: "music_query",
  description:
    "Query JEXXXUS Music — Crucifly Records on music.jexxx.us, gospel/Christian hip-hop beats, " +
    "sound kits, Song of Dylan, and artist link hubs. Beats are sold via Traktrain (no public track JSON). " +
    "action=list — curated catalog titles+URLs (default limit 10). " +
    "action=search — find by artist, beats, kits, label, platform (e.g. 'traktrain', 'song of dylan', 'kits'). " +
    "action=get — full entry detail (requires slug from list/search, e.g. 'beats', 'kits', 'song-of-dylan'). " +
    "action=meta — canonical URL + discovery endpoints (requires slug). " +
    "action=discover — music.jexxx.us llms.txt, RSS, and key URLs. " +
    "action=docs — garden architecture summary from docs.jexxx.us/music. " +
    "Never fabricate beat titles or streaming links — only report tool output.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "search", "meta", "discover", "docs"],
        description: "Which Music lookup to perform",
      },
      slug: {
        type: "string",
        description:
          "Catalog slug from list/search (required for get/meta), e.g. beats, kits, song-of-dylan, traktrain-store",
      },
      query: {
        type: "string",
        description: "Search text (search/list filter), or slug alias for get/meta",
      },
      limit: {
        type: "number",
        description: "Max results for list/search (default 10, max 25)",
      },
    },
    required: ["action"],
  },
  requiresConfirmation: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = resolveMusicAction(String(args.action ?? ""));
    const slug = typeof args.slug === "string" ? args.slug.trim() : "";
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit =
      typeof args.limit === "number"
        ? Math.min(Math.max(1, args.limit), 25)
        : 10;

    if (!action) {
      return `Error: unknown action "${String(args.action)}". Use list, get, search, meta, discover, or docs.`;
    }

    const endpoints = getMusicPublicEndpoints();
    const all = [...MUSIC_CATALOG];

    switch (action) {
      case "docs": {
        return getMusicDocsSummary();
      }

      case "discover": {
        const llms = await fetchMusicLlmsTxt();
        return formatMusicDiscover(
          endpoints,
          all.length,
          all.slice(0, 6),
          llms,
        );
      }

      case "list": {
        const filtered = query ? searchMusicCatalog(query, limit) : listMusicCatalog(limit);
        const body = formatMusicCatalogList(filtered, all.length);
        return `${body}\n\nPublic discovery:\nRSS: ${endpoints.feed}\nllms.txt: ${endpoints.llms}\nDocs: ${endpoints.docs}`;
      }

      case "search": {
        if (!query) return "Error: 'query' is required for search.";
        const hits = searchMusicCatalog(query, limit);
        return formatMusicCatalogList(hits, all.length);
      }

      case "meta": {
        const key = slug || query;
        if (!key) {
          return (
            "Error: 'slug' or 'query' is required for meta. " +
            "Run action=list or action=search first, then pass the catalog slug."
          );
        }
        const entry = getMusicEntry(key);
        if (!entry) return `No JEXXXUS Music entry found matching "${key}".`;
        return formatMusicEntryMeta(entry, endpoints);
      }

      case "get": {
        const key = slug || query;
        if (!key) {
          return (
            "Error: 'slug' or 'query' is required for get. " +
            "Run action=list or action=search first, then pass the catalog slug."
          );
        }
        const entry = getMusicEntry(key);
        if (!entry) return `No JEXXXUS Music entry found matching "${key}".`;
        return formatMusicEntryFull(entry);
      }

      default:
        return `Error: unsupported action "${action}".`;
    }
  },
};