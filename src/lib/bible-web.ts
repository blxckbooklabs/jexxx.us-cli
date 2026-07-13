import type { BibleVerse } from "./bible.js";

const BOOK_TO_SLUG: Record<string, string> = {
  Genesis: "genesis",
  Exodus: "exodus",
  Leviticus: "leviticus",
  Numbers: "numbers",
  Deuteronomy: "deuteronomy",
  Joshua: "joshua",
  Judges: "judges",
  Ruth: "ruth",
  "1 Samuel": "1-samuel",
  "2 Samuel": "2-samuel",
  "1 Kings": "1-kings",
  "2 Kings": "2-kings",
  "1 Chronicles": "1-chronicles",
  "2 Chronicles": "2-chronicles",
  Ezra: "ezra",
  Nehemiah: "nehemiah",
  Esther: "esther",
  Job: "job",
  Psalms: "psalms",
  Proverbs: "proverbs",
  Ecclesiastes: "ecclesiastes",
  "Song of Solomon": "song-of-solomon",
  Isaiah: "isaiah",
  Jeremiah: "jeremiah",
  Lamentations: "lamentations",
  Ezekiel: "ezekiel",
  Daniel: "daniel",
  Hosea: "hosea",
  Joel: "joel",
  Amos: "amos",
  Obadiah: "obadiah",
  Jonah: "jonah",
  Micah: "micah",
  Nahum: "nahum",
  Habakkuk: "habakkuk",
  Zephaniah: "zephaniah",
  Haggai: "haggai",
  Zechariah: "zechariah",
  Malachi: "malachi",
  Matthew: "matthew",
  Mark: "mark",
  Luke: "luke",
  John: "john",
  Acts: "acts",
  Romans: "romans",
  "1 Corinthians": "1-corinthians",
  "2 Corinthians": "2-corinthians",
  Galatians: "galatians",
  Ephesians: "ephesians",
  Philippians: "philippians",
  Colossians: "colossians",
  "1 Thessalonians": "1-thessalonians",
  "2 Thessalonians": "2-thessalonians",
  "1 Timothy": "1-timothy",
  "2 Timothy": "2-timothy",
  Titus: "titus",
  Philemon: "philemon",
  Hebrews: "hebrews",
  James: "james",
  "1 Peter": "1-peter",
  "2 Peter": "2-peter",
  "1 John": "1-john",
  "2 John": "2-john",
  "3 John": "3-john",
  Jude: "jude",
  Revelation: "revelation",
  Jubilees: "jubilees",
  "Enoch (1 Enoch)": "1-enoch",
  "Gospel of Thomas": "gospel-of-thomas",
};

function bibleApiBaseUrl(): string {
  return (
    process.env.JEXXXUS_BIBLE_API_BASE_URL?.trim() ||
    process.env.BIBLE_JEXXXUS_API_BASE_URL?.trim() ||
    "https://bible.jexxx.us"
  ).replace(/\/$/, "");
}

function bookSlug(bookName: string): string {
  return (
    BOOK_TO_SLUG[bookName] ??
    bookName.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "")
  );
}

type WebVerseRow = { verse?: number; text?: string };

/** Fetch a single verse via bible.jexxx.us (or JEXXXUS_BIBLE_API_BASE_URL). */
export async function fetchVerseFromWeb(
  bookName: string,
  chapter: number,
  verse: number,
  translation = "KJV",
): Promise<BibleVerse | null> {
  const slug = bookSlug(bookName);
  const base = bibleApiBaseUrl();
  const url = `${base}/api/bible?book=${encodeURIComponent(slug)}&chapter=${chapter}&translation=${encodeURIComponent(translation)}`;

  const rows = await fetchChapterVerses(url);
  if (rows) {
    const hit = rows.find((row) => row.verse === verse) ?? rows[verse - 1];
    const text = hit?.text?.replace(/\s+/g, " ").trim();
    if (text) {
      return {
        id: `${slug}-${chapter}-${verse}`,
        book: bookName,
        chapter,
        verse,
        text,
        sourceType: "web",
      };
    }
  }

  return fetchVerseFromBibleApiCom(slug, bookName, chapter, verse, translation);
}

async function fetchChapterVerses(
  url: string,
): Promise<WebVerseRow[] | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      success?: boolean;
      error?: string;
      data?: { verses?: WebVerseRow[] };
      verses?: WebVerseRow[];
    };

    if (data.success === false) return null;

    return (
      (data.success && data.data?.verses) ||
      data.data?.verses ||
      data.verses ||
      null
    );
  } catch {
    return null;
  }
}

async function fetchVerseFromBibleApiCom(
  slug: string,
  bookName: string,
  chapter: number,
  verse: number,
  translation: string,
): Promise<BibleVerse | null> {
  let transParam = "web";
  const t = translation.toUpperCase();
  if (t === "KJV") transParam = "kjv";

  const url = `https://bible-api.com/${slug}+${chapter}?translation=${transParam}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      verses?: Array<{ verse?: number; text?: string }>;
      text?: string;
      reference?: string;
    };

    const rows = data.verses ?? [];
    const hit = rows.find((row) => row.verse === verse) ?? rows[verse - 1];
    const text = (hit?.text ?? (verse === 1 ? data.text : undefined))
      ?.replace(/\s+/g, " ")
      .trim();
    if (!text) return null;

    return {
      id: `${slug}-${chapter}-${verse}`,
      book: bookName,
      chapter,
      verse,
      text,
      sourceType: "bible-api.com",
    };
  } catch {
    return null;
  }
}