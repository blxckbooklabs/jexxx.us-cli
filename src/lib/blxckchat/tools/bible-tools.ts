import type { BlxckchatTool } from "./types.js";
import {
  getBibleSections,
  getBibleBooks,
  getBibleChapters,
  findBook,
  findVerse,
} from "../../bible.js";

/**
 * Read-only wrapper around lib/bible.ts. Consolidated into a single tool
 * (rather than one-tool-per-function) to keep the tool surface small for
 * the model to reason about; the `action` param dispatches internally.
 */
export const bibleTool: BlxckchatTool = {
  name: "bible_query",
  description:
    "Query the JEXXXUS Bible vault. Use action='query' with a natural verse reference " +
    "(e.g. 'Genesis 1:1' or 'John 3 16') to fetch a specific verse. Use action='sections' " +
    "to list major canon sections, action='books' with a section to list books, or " +
    "action='chapters' with a section and book to list chapters.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["query", "sections", "books", "chapters"],
        description: "Which Bible lookup operation to perform",
      },
      query: {
        type: "string",
        description: "Verse reference, e.g. 'Genesis 1:1' (required for action='query')",
      },
      section: {
        type: "string",
        description: "Section folder name, e.g. '01-Torah' (required for books/chapters)",
      },
      book: {
        type: "string",
        description: "Book name, e.g. 'Genesis' (required for action='chapters')",
      },
    },
    required: ["action"],
  },
  requiresConfirmation: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const rawAction = String(args.action ?? "").toLowerCase();
    const query = args.query as string | undefined;
    const section = args.section as string | undefined;
    const bookArg = args.book as string | undefined;

    // Smaller/local models frequently don't respect enum constraints exactly
    // (e.g. "get_verse" instead of "query"). Normalize by intent rather than
    // failing on an unrecognized literal — the presence of specific params
    // is a more reliable signal than the exact action string chosen.
    const wantsSections = rawAction.includes("section");
    const wantsBooks = rawAction.includes("book") && !bookArg;
    const wantsChapters = rawAction.includes("chapter") || (section && bookArg && !query);
    const wantsVerse = query || rawAction.includes("verse") || rawAction.includes("query");

    if (wantsSections) {
      return JSON.stringify(getBibleSections());
    }

    if (wantsBooks) {
      if (!section) return "Error: 'section' is required to list books.";
      return JSON.stringify(getBibleBooks(section));
    }

    if (wantsChapters) {
      if (!section || !bookArg)
        return "Error: 'section' and 'book' are required to list chapters.";
      const bookInfo = findBook(bookArg);
      const bookFolder = bookInfo?.book ?? bookArg;
      return JSON.stringify(getBibleChapters(section, bookFolder));
    }

    if (wantsVerse) {
      if (!query) return "Error: 'query' is required, e.g. 'Genesis 1:1'.";
      const verse = findVerse(query);
      if (!verse) return `No verse found matching "${query}".`;
      return JSON.stringify(verse);
    }

    return (
      `Error: could not determine what to look up from action="${rawAction}". ` +
      `Provide a 'query' like "Genesis 1:1" to fetch a verse.`
    );
  },
};
