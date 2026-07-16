import type { BlxckchatTool } from "./types.js";
import {
  getTvContentSourceInfo,
  getTvPublicEndpoints,
  getTvVideo,
  getTvVideoMeta,
  listTvCategories,
  listTvVideos,
  searchTvVideos,
} from "../../tv.js";
import { recommendTvVideos } from "../../tv-algorithm.js";
import {
  formatTvDiscover,
  formatTvVideoFull,
  formatTvVideoList,
  formatTvVideoMeta,
} from "./tv-format.js";

type TvAction = "list" | "get" | "search" | "meta" | "discover";

function resolveTvAction(raw: string): TvAction | null {
  const action = raw.toLowerCase().trim();
  if (action === "list") return "list";
  if (action === "get") return "get";
  if (action === "search") return "search";
  if (action === "meta") return "meta";
  if (action === "discover" || action === "feed" || action === "rss") return "discover";
  return null;
}

/**
 * Read-only access to public JEXXXUS | TV videos on tv.jexxx.us — titles,
 * descriptions, canonical watch URLs, and AEO discovery endpoints. Does not
 * expose stream/embed URLs, Supabase, or internal operator documentation.
 */
export const tvTool: BlxckchatTool = {
  name: "tv_query",
  description:
    "Query public JEXXXUS | TV videos on tv.jexxx.us (official videos.json or public llms-full/RSS only). " +
    "Use for watch recommendations and anything on TV — channels/series/tags like 'Forgive Me Father', " +
    "'Mormon Girlz', 'Deviante', category names (Nuns, Pastor/Priest), or video titles. " +
    "action=list — titles+watch URLs (default limit 10; includes RSS/sitemap links in footer). " +
    "action=search — find by title, channel, tag, category, or description. " +
    "action=get — full video description (requires slug). " +
    "action=meta — canonical URL + SEO (requires slug). " +
    "action=discover — feed/sitemap/llms endpoints only (skip if list already answered). " +
    "Never call discover and list for the same user question.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "search", "meta", "discover"],
        description: "Which TV lookup to perform",
      },
      slug: {
        type: "string",
        description: "Video slug from list/search (required for get/meta)",
      },
      query: {
        type: "string",
        description: "Search text (search), category name, or title/slug alias for get/meta",
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
    const action = resolveTvAction(String(args.action ?? ""));
    const slug = typeof args.slug === "string" ? args.slug.trim() : "";
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = typeof args.limit === "number"
      ? Math.min(Math.max(1, args.limit), 25)
      : 10;

    if (!action) {
      return `Error: unknown action "${String(args.action)}". Use list, get, search, meta, or discover.`;
    }

    const allVideos = await listTvVideos();
    const sourceInfo = getTvContentSourceInfo();
    const endpoints = getTvPublicEndpoints();
    const categories = listTvCategories(allVideos);

    switch (action) {
      case "discover": {
        return formatTvDiscover(
          endpoints,
          allVideos.length,
          allVideos.slice(0, 5),
          categories,
          sourceInfo,
        );
      }

      case "list": {
        // No query = a bare "recommend me some videos" ask, not a lookup
        // for something specific — run the same DevotionRank shuffle the
        // live site's homepage feed uses instead of always returning
        // whatever sorts first in the source catalog (previously a static
        // `allVideos.slice(0, limit)`, which meant every "recommend" turn
        // surfaced the identical top-of-catalog videos).
        const filtered = query
          ? searchTvVideos(allVideos, query, limit)
          : recommendTvVideos(allVideos, limit);
        const body = formatTvVideoList(filtered, allVideos.length, sourceInfo);
        return `${body}\n\nPublic discovery:\nRSS: ${endpoints.feed}\nVideo sitemap: ${endpoints.sitemapVideo}\nllms-full.txt: ${endpoints.llmsFull}`;
      }

      case "search": {
        if (!query) return "Error: 'query' is required for search.";
        const hits = searchTvVideos(allVideos, query, limit);
        return formatTvVideoList(hits, allVideos.length, sourceInfo);
      }

      case "meta": {
        const key = slug || query;
        if (!key) {
          return (
            "Error: 'slug' or 'query' is required for meta. " +
            "Run action=list or action=search first, then pass the video slug."
          );
        }
        const meta = await getTvVideoMeta(key);
        if (!meta) return `No JEXXXUS | TV video found matching "${key}".`;
        return formatTvVideoMeta(meta, endpoints);
      }

      case "get": {
        const key = slug || query;
        if (!key) {
          return (
            "Error: 'slug' or 'query' is required for get. " +
            "Run action=list or action=search first, then pass the video slug."
          );
        }
        const video = await getTvVideo(key);
        if (!video) return `No JEXXXUS | TV video found matching "${key}".`;
        return formatTvVideoFull(video);
      }

      default:
        return `Error: unsupported action "${action}".`;
    }
  },
};