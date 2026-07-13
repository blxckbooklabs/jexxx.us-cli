import * as fs from "fs";
import * as path from "path";
import { fetchVerseFromWeb } from "./bible-web.js";
import { resolveBibleVaultPath } from "./path-resolver.js";

/**
 * Bible lookup library for verse-level retrieval from the obsidian-bible vault.
 * Supports hierarchical queries: section → book → chapter → verse.
 * Vault location resolved via JEXXXUS_BIBLE_VAULT_PATH env var; returns null if unavailable
 * (caller handles graceful fallback to web queries).
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

function getVaultPath(): string | null {
  return resolveBibleVaultPath();
}

export function hasLocalBibleVault(): boolean {
  return getVaultPath() !== null;
}

export function getBibleSections(): string[] {
  const vaultPath = getVaultPath();
  if (!vaultPath) return [];
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
  if (!vaultPath) return [];
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
  if (!vaultPath) return [];
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
  if (!vaultPath) return [];
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
  if (!vaultPath) {
    throw new Error(
      "[Bible] Local vault not configured. Set JEXXXUS_BIBLE_VAULT_PATH or use bible_query action=query for web lookup.",
    );
  }
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

/** Normalize book names for vault folder lookup ("1 Samuel" → "1samuel", "1Samuel" → "1samuel"). */
export function normalizeBookLookupKey(bookName: string): string {
  return bookName
    .toLowerCase()
    .replace(/^\d{2}-/, "")
    .replace(/['.]/g, "")
    .replace(/\s+/g, "");
}

export function findBook(bookName: string): {
  section: string;
  book: string;
} | null {
  if (!getVaultPath()) return null;
  const sections = getBibleSections();
  const queryKey = normalizeBookLookupKey(bookName);

  for (const section of sections) {
    const books = getBibleBooks(section);
    for (const book of books) {
      const cleanName = book.replace(/^\d{2}-/, "");
      if (normalizeBookLookupKey(cleanName) === queryKey) {
        return { section, book };
      }
    }
  }
  return null;
}

/** True when query looks like "Genesis 1:1" / "1 John 1 9" — not a video title or series name. */
export function looksLikeVerseReference(query: string): boolean {
  return parseVerseReference(query) !== null;
}

/** Parse Book Chapter:Verse references including numbered books (1 John, 2 Peter). */
export function parseVerseReference(
  query: string,
): { bookName: string; chapter: number; verse: number } | null {
  const trimmed = query.trim();
  const match = trimmed.match(
    /^((?:\d+\s+)?[A-Za-z][A-Za-z0-9\s.'-]*?)\s+(\d+)\s*[: ]\s*(\d+)\s*$/,
  );
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const chapter = Number.parseInt(match[2], 10);
  const verse = Number.parseInt(match[3], 10);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
  return { bookName: match[1].trim(), chapter, verse };
}

export function findVerse(query: string): BibleVerse | null {
  return findVerseFromLocalVault(query);
}

function findVerseFromLocalVault(query: string): BibleVerse | null {
  const parsed = parseVerseReference(query);
  if (!parsed) return null;

  const { bookName, chapter: chapterNum, verse: verseNum } = parsed;

  const bookInfo = findBook(bookName);
  if (!bookInfo) return null;

  const chapter = `Chapter ${chapterNum}`;

  try {
    const verses = getBibleVerses(
      bookInfo.section,
      bookInfo.book,
      chapter,
    );
    const verseFile = verses.find((v) =>
      v.startsWith(`${chapterNum}-${verseNum}`),
    );
    if (!verseFile) return null;
    return getVerse(bookInfo.section, bookInfo.book, chapter, verseFile);
  } catch {
    return null;
  }
}

/** Local obsidian vault first, then bible.jexxx.us web API when vault is absent. */
export async function findVerseWithFallback(
  query: string,
): Promise<BibleVerse | null> {
  const local = findVerseFromLocalVault(query);
  if (local) return local;

  const parsed = parseVerseReference(query);
  if (!parsed) return null;

  return fetchVerseFromWeb(
    parsed.bookName,
    parsed.chapter,
    parsed.verse,
  );
}
