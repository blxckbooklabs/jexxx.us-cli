import * as fs from 'fs';
import { parse } from 'csv-parse';

import type { ContactInsert, CsvRow } from './types.js';

export function splitList(value: unknown): string[] {
  return typeof value === 'string'
    ? value.split(',').map((tag) => tag.trim()).filter(Boolean)
    : [];
}

export function rowToContact(row: CsvRow, userId: string): ContactInsert | null {
  const name = (row.Name || row.name || '').trim();
  if (!name) return null;

  const notes = (row.Notes || row.notes || row.Bio || row.bio || '').trim();
  const tags = splitList(row.Interests || row.interests || row.Tags || row.tags);

  const contact: ContactInsert = { name, user_id: userId };
  if (notes) contact.notes = notes;
  if (tags.length > 0) contact.tags = tags;
  return contact;
}

export function rowsToContacts(rows: CsvRow[], userId: string): {
  contacts: ContactInsert[];
  skippedInvalid: number;
} {
  const contacts: ContactInsert[] = [];
  let skippedInvalid = 0;

  for (const row of rows) {
    const contact = rowToContact(row, userId);
    if (contact) contacts.push(contact);
    else skippedInvalid += 1;
  }

  return { contacts, skippedInvalid };
}

export async function parseCsvFile(filePath: string): Promise<CsvRow[]> {
  const records: CsvRow[] = [];
  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
  );

  for await (const record of parser) {
    records.push(record as CsvRow);
  }

  return records;
}