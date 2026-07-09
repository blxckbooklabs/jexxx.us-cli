import type { BlxckchatTool } from "./types.js";
import {
  getLawPolicy,
  getLawPolicyMeta,
  getLawPublicEndpoints,
  listLawPolicies,
  searchLawPolicies,
} from "../../law.js";
import {
  formatLawDiscover,
  formatLawPolicyFull,
  formatLawPolicyMeta,
  formatLawPolicyList,
} from "./law-format.js";

type LawAction = "list" | "get" | "search" | "meta" | "discover";

function resolveLawAction(raw: string): LawAction | null {
  const action = raw.toLowerCase().trim();
  if (action === "list") return "list";
  if (action === "get") return "get";
  if (action === "search") return "search";
  if (action === "meta") return "meta";
  if (action === "discover" || action === "feed" || action === "rss") return "discover";
  return null;
}

/**
 * Read-only access to public legal policies on law.jexxx.us (Terms, Privacy,
 * Refunds, DMCA) via the public RSS feed — the canonical source for these
 * pages since they render from component templates, not markdown files.
 */
export const lawTool: BlxckchatTool = {
  name: "law_query",
  description:
    "Query public JEXXXUS legal policies on law.jexxx.us (Terms of Service, Privacy Policy, " +
    "Refund Policy, DMCA Policy) via the public RSS feed. " +
    "action=list — titles+URLs (default limit 10). " +
    "action=search — find by title/topic (e.g. 'refund', 'data deletion', 'DMCA'). " +
    "action=get — full policy text (requires slug, e.g. 'privacy', 'terms', 'refunds', 'dmca'). " +
    "action=meta — canonical URL + SEO (requires slug). " +
    "action=discover — feed/sitemap endpoints only. " +
    "Never fabricate legal terms — only report tool output, and point users to the canonical URL " +
    "for anything binding.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "search", "meta", "discover"],
        description: "Which Law lookup to perform",
      },
      slug: {
        type: "string",
        description: "Policy slug from list/search (required for get/meta), e.g. privacy, terms, refunds, dmca",
      },
      query: {
        type: "string",
        description: "Search text (search), or slug alias for get/meta",
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
    const action = resolveLawAction(String(args.action ?? ""));
    const slug = typeof args.slug === "string" ? args.slug.trim() : "";
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = typeof args.limit === "number"
      ? Math.min(Math.max(1, args.limit), 25)
      : 10;

    if (!action) {
      return `Error: unknown action "${String(args.action)}". Use list, get, search, meta, or discover.`;
    }

    const allPolicies = await listLawPolicies();
    const endpoints = getLawPublicEndpoints();

    switch (action) {
      case "discover": {
        return formatLawDiscover(endpoints, allPolicies.length, allPolicies.slice(0, 5));
      }

      case "list": {
        const filtered = query
          ? searchLawPolicies(allPolicies, query, limit)
          : allPolicies.slice(0, limit);
        const body = formatLawPolicyList(filtered, allPolicies.length);
        return `${body}\n\nPublic discovery:\nRSS: ${endpoints.feed}\nSitemap: ${endpoints.sitemap}\nllms.txt: ${endpoints.llms}`;
      }

      case "search": {
        if (!query) return "Error: 'query' is required for search.";
        const hits = searchLawPolicies(allPolicies, query, limit);
        return formatLawPolicyList(hits, allPolicies.length);
      }

      case "meta": {
        const key = slug || query;
        if (!key) {
          return (
            "Error: 'slug' or 'query' is required for meta. " +
            "Run action=list or action=search first, then pass the policy slug."
          );
        }
        const meta = await getLawPolicyMeta(key);
        if (!meta) return `No Law policy found matching "${key}".`;
        return formatLawPolicyMeta(meta, getLawPublicEndpoints());
      }

      case "get": {
        const key = slug || query;
        if (!key) {
          return (
            "Error: 'slug' or 'query' is required for get. " +
            "Run action=list or action=search first, then pass the policy slug."
          );
        }
        const policy = await getLawPolicy(key);
        if (!policy) return `No Law policy found matching "${key}".`;
        return formatLawPolicyFull(policy);
      }

      default:
        return `Error: unsupported action "${action}".`;
    }
  },
};
