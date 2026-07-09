import type { BlxckchatTool } from "./types.js";
import {
  getVeilArticle,
  getVeilArticleMeta,
  getVeilPublicEndpoints,
  listVeilArticles,
  searchVeilArticles,
} from "../../veil.js";

/**
 * Read-only access to public VEIL articles on veil.jexxx.us — full text,
 * canonical URLs, and RSS/AEO discovery endpoints. Does not expose internal
 * Obsidian or operator documentation.
 */
export const veilTool: BlxckchatTool = {
  name: "veil_query",
  description:
    "Query public VEIL articles published on veil.jexxx.us. Use action='list' to list articles " +
    "with titles and canonical URLs. Use action='get' with slug or title to fetch full article " +
    "text for quoting in chat. Use action='search' with query to find articles. Use action='meta' " +
    "for SEO fields (title, description, url, publishedAt, author, category). Use action='discover' " +
    "for public RSS/sitemap/llms.txt endpoints.",
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
        description: "Article slug or title fragment (for get/meta)",
      },
      query: {
        type: "string",
        description: "Search text (for search; optional filter for list)",
      },
      limit: {
        type: "number",
        description: "Max results for list/search (default 20)",
      },
    },
    required: ["action"],
  },
  requiresConfirmation: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const rawAction = String(args.action ?? "").toLowerCase();
    const slug = args.slug as string | undefined;
    const query = args.query as string | undefined;
    const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;

    const wantsDiscover = rawAction.includes("discover") || rawAction.includes("feed") || rawAction.includes("rss");
    const wantsList = rawAction.includes("list");
    const wantsSearch = rawAction.includes("search") || Boolean(query && !slug);
    const wantsMeta = rawAction.includes("meta") || rawAction.includes("link") || rawAction.includes("url");
    const wantsGet = rawAction.includes("get") || rawAction.includes("article") || Boolean(slug);

    if (wantsDiscover) {
      const endpoints = getVeilPublicEndpoints();
      const articles = await listVeilArticles();
      return JSON.stringify({
        ...endpoints,
        articleCount: articles.length,
        sampleArticles: articles.slice(0, 5).map((a) => ({
          title: a.title,
          url: a.url,
          publishedAt: a.publishedAt,
        })),
      });
    }

    if (wantsList) {
      const articles = await listVeilArticles();
      const filtered = query ? searchVeilArticles(articles, query, limit) : articles.slice(0, limit);
      return JSON.stringify(filtered);
    }

    if (wantsSearch) {
      if (!query) return "Error: 'query' is required for search.";
      const articles = await listVeilArticles();
      return JSON.stringify(searchVeilArticles(articles, query, limit));
    }

    if (wantsMeta) {
      if (!slug && !query) {
        return "Error: 'slug' (or 'query') is required for meta — e.g. how-becoming-a-christian-made-me-a-better-hoebag.";
      }
      const meta = await getVeilArticleMeta(slug ?? query!);
      if (!meta) return `No VEIL article found matching "${slug ?? query}".`;
      const endpoints = getVeilPublicEndpoints();
      return JSON.stringify({
        ...meta,
        seo: {
          canonicalUrl: meta.url,
          openGraphUrl: meta.url,
          rssFeed: endpoints.feed,
          sitemap: endpoints.sitemap,
          llmsTxt: endpoints.llms,
        },
      });
    }

    if (wantsGet) {
      if (!slug && !query) {
        return "Error: 'slug' (or 'query') is required for get — article slug or title.";
      }
      const article = await getVeilArticle(slug ?? query!);
      if (!article) return `No VEIL article found matching "${slug ?? query}".`;
      return JSON.stringify(article);
    }

    return (
      `Error: could not determine VEIL action from "${rawAction}". ` +
      `Use list, get, search, meta, or discover.`
    );
  },
};