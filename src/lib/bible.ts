import * as fs from "fs";
import * as path from "path";

/**
 * Bible lookup library for verse-level retrieval from the obsidian-bible vault.
 * Supports hierarchical queries: section → book → chapter → verse.
 * Vault location resolved via BIBLE_VAULT_PATH env var or default path.
 */

export interface BibleVerse {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  canon?: string | undefined;
  sourceType?: string | undefined;
}

export interface BibleChapter {
  book: string;
  chapter: number;
  verseCount: number;
}

const VAULT_PATHS = [
  process.env.BIBLE_VAULT_PATH || "",
  "/Users/dylanroberts/Documents/non-music/Dev/GitHub/Crucifly, LLC/obsidian-bible",
  "../../../Crucifly\\ LLC/obsidian-bible",
].filter(Boolean);

function getVaultPath(): string {
  for (const vaultPath of VAULT_PATHS) {
    if (fs.existsSync(vaultPath)) {
      return vaultPath;
    }
  }
  throw new Error(
    `[Bible] Obsidian vault not found. Set BIBLE_VAULT_PATH env var. Tried: ${VAULT_PATHS.join(", ")}`
  );
}

export function getBibleSections(): string[] {
  const vaultPath = getVaultPath();
  const entries = fs.readdirSync(vaultPath);
  return entries
    .filter(
      (e) =>
        fs.statSync(path.join(vaultPath, e)).isDirectory() &&
        /^\d{2}-/.test(e)
    )
    .sort();
}

export function getBibleBooks(section: string): string[] {
  const vaultPath = getVaultPath();
  const sectionPath = path.join(vaultPath, section);
  if (!fs.existsSync(sectionPath)) {
    throw new Error(`[Bible] Section not found: ${section}`);
  }
  const entries = fs.readdirSync(sectionPath);
  return entries
    .filter(
      (e) =>
        fs.statSync(path.join(sectionPath, e)).isDirectory() &&
        /^\d{2}-/.test(e)
    )
    .sort();
}

export function getBibleChapters(section: string, book: string): string[] {
  const vaultPath = getVaultPath();
  const bookPath = path.join(vaultPath, section, book);
  if (!fs.existsSync(bookPath)) {
    throw new Error(`[Bible] Book not found: ${section}/${book}`);
  }
  const entries = fs.readdirSync(bookPath);
  return entries
    .filter((e) => fs.statSync(path.join(bookPath, e)).isDirectory())
    .sort((a, b) => {
      const aNum = parseInt(a.replace("Chapter ", ""));
      const bNum = parseInt(b.replace("Chapter ", ""));
      return aNum - bNum;
    });
}

export function getBibleVerses(
  section: string,
  book: string,
  chapter: string
): string[] {
  const vaultPath = getVaultPath();
  const chapterPath = path.join(vaultPath, section, book, chapter);
  if (!fs.existsSync(chapterPath)) {
    throw new Error(
      `[Bible] Chapter not found: ${section}/${book}/${chapter}`
    );
  }
  const entries = fs.readdirSync(chapterPath);
  return entries
    .filter((e) => e.endsWith(".md"))
    .sort((a, b) => {
      const aParts = a.split("-");
      const bParts = b.split("-");
      const aNum = aParts[1] ? parseInt(aParts[1]) : 0;
      const bNum = bParts[1] ? parseInt(bParts[1]) : 0;
      return aNum - bNum;
    });
}

function parseVerseFrontmatter(content: string): {
  [key: string]: string | number | undefined;
} {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};

  const fm: { [key: string]: string | number | undefined } = {};
  if (fmMatch[1]) {
    fmMatch[1].split("\n").forEach((line) => {
      const colonIndex = line.indexOf(": ");
      if (colonIndex === -1) return;
      const key = line.substring(0, colonIndex);
      const value = line.substring(colonIndex + 2).trim();
      if (key && value) {
        if (!isNaN(Number(value))) {
          fm[key.trim()] = Number(value);
        } else {
          fm[key.trim()] = value;
        }
      }
    });
  }
  return fm;
}

export function getVerse(
  section: string,
  book: string,
  chapter: string,
  verseFile: string
): BibleVerse {
  const vaultPath = getVaultPath();
  const versePath = path.join(vaultPath, section, book, chapter, verseFile);

  if (!fs.existsSync(versePath)) {
    throw new Error(
      `[Bible] Verse not found: ${section}/${book}/${chapter}/${verseFile}`
    );
  }

  const content = fs.readFileSync(versePath, "utf-8");
  const fm = parseVerseFrontmatter(content);

  // Extract text (everything after frontmatter)
  const textMatch = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)/);
  const text = textMatch && textMatch[1] ? textMatch[1].trim() : "";

  const verseParts = verseFile.split("-");
  const verseNum = verseParts[1] ? parseInt(verseParts[1]) : 1;

  return {
    id: fm.id ? String(fm.id) : "",
    book: fm.book ? String(fm.book) : book,
    chapter: fm.chapter ? Number(fm.chapter) : parseInt(chapter.replace("Chapter ", "")),
    verse: fm.verse ? Number(fm.verse) : verseNum,
    text,
    canon: fm.canon ? String(fm.canon) : undefined,
    sourceType: fm.source_type ? String(fm.source_type) : undefined,
  };
}

export function getChapter(
  section: string,
  book: string,
  chapter: string
): BibleVerse[] {
  const verses = getBibleVerses(section, book, chapter);
  return verses.map((verseFile) => getVerse(section, book, chapter, verseFile));
}

export function findBook(bookName: string): {
  section: string;
  book: string;
} | null {
  const sections = getBibleSections();
  const lowerBookName = bookName.toLowerCase();

  for (const section of sections) {
    const books = getBibleBooks(section);
    for (const book of books) {
      // Extract book name from folder (e.g., "01-Genesis" → "Genesis")
      const cleanName = book.replace(/^\d{2}-/, "");
      if (cleanName.toLowerCase() === lowerBookName) {
        return { section, book };
      }
    }
  }
  return null;
}

export function findVerse(query: string): BibleVerse | null {
  // Query format: "Genesis 1:1" or "Genesis 1 1"
  const match = query.match(
    /^([A-Za-z\s]+?)\s+(\d+)[:\s]+(\d+)$/
  );
  if (!match || !match[1] || !match[2] || !match[3]) {
    console.error("[Bible] Invalid verse query format. Expected: Book Chapter:Verse");
    return null;
  }

  const bookName = match[1];
  const chapterStr = match[2];
  const verseStr = match[3];

  const bookInfo = findBook(bookName.trim());
  if (!bookInfo) {
    console.error(`[Bible] Book not found: ${bookName}`);
    return null;
  }

  const chapterNum = parseInt(chapterStr);
  const verseNum = parseInt(verseStr);
  const chapter = `Chapter ${chapterNum}`;

  try {
    const verses = getBibleVerses(
      bookInfo.section,
      bookInfo.book,
      chapter
    );
    const verseFile = verses.find((v) =>
      v.startsWith(`${chapterNum}-${verseNum}`)
    );
    if (!verseFile) {
      console.error(
        `[Bible] Verse not found: ${bookName} ${chapterNum}:${verseNum}`
      );
      return null;
    }
    return getVerse(bookInfo.section, bookInfo.book, chapter, verseFile);
  } catch (err) {
    console.error(`[Bible] Error fetching verse:`, err);
    return null;
  }
}
