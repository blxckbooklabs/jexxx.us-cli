import type { BlxckchatTool } from "./types.js";
import {
  getVeilArticle,
  getVeilArticleMeta,
  getVeilPublicEndpoints,
  listVeilArticles,
  searchVeilArticles,
} from "../../veil.js";
import {
  formatVeilArticleFull,
  formatVeilArticleList,
  formatVeilArticleMeta,
  formatVeilDiscover,
} from "./veil-format.js";

type VeilAction = "list" | "get" | "search" | "meta" | "discover";

function resolveVeilAction(raw: string): VeilAction | null {
  const action = raw.toLowerCase().trim();
  if (action === "list") return "list";
  if (action === "get") return "get";
  if (action === "search") return "search";
  if (action === "meta") return "meta";
  if (action === "discover" || action === "feed" || action === "rss") return "discover";
  return null;
}

/**
 * Read-only access to public VEIL articles on veil.jexxx.us — full text,
 * canonical URLs, and RSS/AEO discovery endpoints. Does not expose internal
 * Obsidian or operator documentation.
 */
export const veilTool: BlxckchatTool = {
  name: "veil_query",
  description:
    "Query public VEIL articles on veil.jexxx.us. action=list (titles+URLs, default limit 10). " +
    "action=search with query (find by title). action=get with slug (full article text). " +
    "action=meta with slug (canonical URL + SEO/RSS fields). action=discover (feed/sitemap/llms). " +
    "slug comes from list/search output — meta and get always require slug or query.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "search", "meta", "discover"],
        description: "Which VEIL lookup to perform",
      },
      slug: {
        type: "string",
        description: "Article slug from list/search (required for get/meta)",
      },
      query: {
        type: "string",
        description: "Search text (search), or title/slug alias for get/meta",
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
    const action = resolveVeilAction(String(args.action ?? ""));
    const slug = typeof args.slug === "string" ? args.slug.trim() : "";
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = typeof args.limit === "number"
      ? Math.min(Math.max(1, args.limit), 25)
      : 10;

    if (!action) {
      return `Error: unknown action "${String(args.action)}". Use list, get, search, meta, or discover.`;
    }

    const allArticles = await listVeilArticles();

    switch (action) {
      case "discover": {
        const endpoints = getVeilPublicEndpoints();
        return formatVeilDiscover(endpoints, allArticles.length, allArticles.slice(0, 5));
      }

      case "list": {
        const filtered = query
          ? searchVeilArticles(allArticles, query, limit)
          : allArticles.slice(0, limit);
        return formatVeilArticleList(filtered, allArticles.length);
      }

      case "search": {
        if (!query) return "Error: 'query' is required for search.";
        const hits = searchVeilArticles(allArticles, query, limit);
        return formatVeilArticleList(hits, allArticles.length);
      }

      case "meta": {
        const key = slug || query;
        if (!key) {
          return (
            "Error: 'slug' or 'query' is required for meta. " +
            "Run action=list or action=search first, then pass the article slug."
          );
        }
        const meta = await getVeilArticleMeta(key);
        if (!meta) return `No VEIL article found matching "${key}".`;
        return formatVeilArticleMeta(meta, getVeilPublicEndpoints());
      }

      case "get": {
        const key = slug || query;
        if (!key) {
          return (
            "Error: 'slug' or 'query' is required for get. " +
            "Run action=list or action=search first, then pass the article slug."
          );
        }
        const article = await getVeilArticle(key);
        if (!article) return `No VEIL article found matching "${key}".`;
        return formatVeilArticleFull(article);
      }

      default:
        return `Error: unsupported action "${action}".`;
    }
  },
};