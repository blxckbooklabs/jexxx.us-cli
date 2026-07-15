import type { BlxckchatTool } from "./types.js";
import { searchDocs } from "../rag/index.js";

/**
 * Read-only BM25 search over docs.jexxx.us + law.jexxx.us public content.
 * Same RAG source BLXCKCHAT injects into the agent loop — exposed as a named
 * tool for Hermes / JEXXXUS | API tool proxy parity.
 */
export const docsTool: BlxckchatTool = {
  name: "docs_query",
  description:
    "Search public JEXXXUS documentation on docs.jexxx.us (architecture, CLI, platform " +
    "guides) plus law.jexxx.us policy excerpts indexed for RAG. " +
    "Returns ranked text chunks with source filenames — never fabricate docs content. " +
    "Use for operator how-to, ecosystem architecture, and platform behavior questions. " +
    "For full legal policy text, prefer law_query action=get with a slug.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural-language search query",
      },
      limit: {
        type: "number",
        description: "Max chunks to return (default 5, max 10)",
      },
    },
    required: ["query"],
  },
  requiresConfirmation: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      return "Error: 'query' is required.";
    }

    const limit =
      typeof args.limit === "number"
        ? Math.min(Math.max(1, Math.floor(args.limit)), 10)
        : 5;

    const chunks = await searchDocs(query, limit);
    if (chunks.length === 0) {
      return JSON.stringify({ query, results: [], message: "No matching documentation chunks." });
    }

    return JSON.stringify(
      {
        query,
        results: chunks.map((c) => ({
          source: c.source,
          heading: c.heading,
          text: c.text,
        })),
      },
      null,
      2,
    );
  },
};