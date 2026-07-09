import type { BlxckchatTool } from "./types.js";
import {
  getBibleSections,
  getBibleBooks,
  getBibleChapters,
  findBook,
  findVerse,
  looksLikeVerseReference,
} from "../../bible.js";
import { formatBibleVerseForChat } from "../bible-format.js";

/**
 * Read-only wrapper around lib/bible.ts. Consolidated into a single tool
 * (rather than one-tool-per-function) to keep the tool surface small for
 * the model to reason about; the `action` param dispatches internally.
 */
export const bibleTool: BlxckchatTool = {
  name: "bible_query",
  description:
    "Query the JEXXXUS Bible vault for SCRIPTURE ONLY. action='query' requires a verse " +
    "reference like 'Genesis 1:1' or '1 John 1:9' (Book Chapter:Verse). Do NOT use for video " +
    "titles, TV channels/series/tags (e.g. 'Forgive Me Father'), or article topics — use tv_query " +
    "or veil_query instead. action='sections' lists canon sections; action='books' needs section; " +
    "action='chapters' needs section + book.",
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
    const wantsBooks =
      rawAction === "books" || (rawAction.includes("book") && !bookArg && !rawAction.includes("chapter"));
    const wantsChapters =
      rawAction === "chapters" ||
      (rawAction.includes("chapter") && Boolean(section) && Boolean(bookArg));
    const wantsVerse = Boolean(query) || rawAction === "query" || rawAction.includes("verse");

    if (wantsSections) {
      return JSON.stringify(getBibleSections());
    }

    if (wantsBooks) {
      if (!section) return "Error: 'section' is required to list books.";
      return JSON.stringify(getBibleBooks(section));
    }

    if (wantsChapters) {
      if (!section || !bookArg) {
        return (
          "Error: chapter listing requires section + book. For a single verse use action=query " +
          "with Book Chapter:Verse (e.g. '1 John 1:9')."
        );
      }
      const bookInfo = findBook(bookArg);
      const bookFolder = bookInfo?.book ?? bookArg;
      const chapters = getBibleChapters(section, bookFolder);
      return (
        `Chapter list for ${bookArg} (navigation only — not verse text):\n` +
        `${chapters.join(", ")}\n\n` +
        `Use action=query with a full reference like "${bookArg} 1:1" to fetch verse text.`
      );
    }

    if (wantsVerse) {
      if (!query) return "Error: 'query' is required, e.g. 'Genesis 1:1'.";
      if (!looksLikeVerseReference(query)) {
        return (
          `This does not look like a scripture reference (expected Book Chapter:Verse, e.g. "1 John 1:9"). ` +
          `For video channels, series, or titles like "${query}", use tv_query with action=search instead. ` +
          `For VEIL articles, use veil_query.`
        );
      }
      const verse = findVerse(query);
      if (!verse) {
        return (
          `No verse found matching "${query}". If the user meant a JEXXXUS | TV video or channel, ` +
          `call tv_query with action=search instead of retrying bible_query.`
        );
      }
      return formatBibleVerseForChat(verse);
    }

    return (
      `Error: could not determine what to look up from action="${rawAction}". ` +
      `Provide a 'query' like "Genesis 1:1" to fetch a verse.`
    );
  },
};
