#!/usr/bin/env node
import { Command } from 'commander';
import { createClient, type PostgrestError } from '@supabase/supabase-js';

import * as fs from 'fs';
import { parse } from 'csv-parse';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    chalk.red('[ERROR] Missing operator credentials. Copy .env.example to .env and configure locally.')
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'api' },
});

/**
 * Insert shape for `api.contacts` (live BLXCKBOOK data plane).
 *
 * NOTE: the CLI runs headless with operator credentials that BYPASS RLS —
 * `user_id` is therefore not inferred from a session and MUST be set
 * explicitly so rows are owned by (and visible to) the right vault account.
 */
type ContactInsert = {
  name: string;
  notes?: string;
  tags?: string[];
  user_id: string;
};

type CsvRow = Record<string, string | undefined>;

const jexxxusArt = figlet.textSync('JEXXXUS', { font: 'Slant' });
console.log(gradient(['#FF1A8C', '#FFB6C1', '#E11D8A', '#FF69B4'])(jexxxusArt));
console.log(gradient(['#FF1A8C', '#FFB6C1'])('                            Welcome to the Vault.\n'));

function isDuplicateError(error: PostgrestError): boolean {
  return (
    error.code === '23505' ||
    error.message.toLowerCase().includes('duplicate') ||
    error.message.toLowerCase().includes('unique')
  );
}

function sanitizeDbError(error: PostgrestError): string {
  if (isDuplicateError(error)) {
    return 'Duplicate entry detected by database constraints.';
  }
  if (error.code) {
    return `Database error (${error.code}). Check operator logs or MAMAbase status.`;
  }
  return 'Database error. Check operator logs or MAMAbase status.';
}

function splitList(value: unknown): string[] {
  return typeof value === 'string'
    ? value.split(',').map((tag) => tag.trim()).filter(Boolean)
    : [];
}

function rowToContact(row: CsvRow, userId: string): ContactInsert | null {
  const name = (row.Name || row.name || '').trim();
  if (!name) return null;

  const notes = (row.Notes || row.notes || row.Bio || row.bio || '').trim();
  const tags = splitList(row.Interests || row.interests || row.Tags || row.tags);

  const contact: ContactInsert = { name, user_id: userId };
  if (notes) contact.notes = notes;
  if (tags.length > 0) contact.tags = tags;
  return contact;
}

async function insertOne(contact: ContactInsert): Promise<'ok' | 'duplicate' | 'failed'> {
  const { error } = await supabase.from('contacts').insert(contact);
  if (!error) return 'ok';
  if (isDuplicateError(error)) return 'duplicate';
  console.error(chalk.red(`[ERROR] ${sanitizeDbError(error)}`));
  return 'failed';
}

async function importContacts(payload: ContactInsert[], force: boolean): Promise<number> {
  if (payload.length === 0) {
    console.log(chalk.yellow('[WARN] No valid contacts to import.'));
    return 0;
  }

  const { error, data } = await supabase.from('contacts').insert(payload).select();

  if (!error) {
    return data?.length ?? payload.length;
  }

  if (!isDuplicateError(error)) {
    console.error(chalk.red(`[ERROR] Import failed: ${sanitizeDbError(error)}`));
    return 0;
  }

  console.log(chalk.yellow('[WARN] Duplicate entry detected in batch import.'));

  if (!force) {
    console.log(chalk.yellow('Use --force to skip duplicates and import the rest.'));
    return 0;
  }

  let imported = 0;
  let skipped = 0;

  for (const contact of payload) {
    const result = await insertOne(contact);
    if (result === 'ok') imported += 1;
    else if (result === 'duplicate') skipped += 1;
    else return imported;
  }

  if (skipped > 0) {
    console.log(chalk.yellow(`[WARN] Skipped ${skipped} duplicate row(s).`));
  }

  return imported;
}

const program = new Command();

program
  .name('jexxxus')
  .description('JEXXXUS CLI for BLXCKBOOK Ecosystem')
  .version('1.0.0');

program
  .command('import')
  .description('Import contacts from a CSV file into the BLXCKBOOK Vault')
  .argument('<file>', 'Path to the CSV file')
  .option('-f, --force', 'Skip duplicate rows and import the rest')
  .option(
    '-u, --user <userId>',
    'Vault account (user_id) to own the imported profiles. Required for production imports.',
    'SYSTEM'
  )
  .option('--allow-system-user', 'Permit the default SYSTEM owner (dev/test only)')
  .action(async (file, options) => {
    if (!fs.existsSync(file)) {
      console.error(chalk.red(`[ERROR] File not found: ${file}`));
      process.exit(1);
    }

    if (options.user === 'SYSTEM' && !options.allowSystemUser) {
      console.error(
        chalk.red(
          '[ERROR] Refusing import with default SYSTEM owner. Pass --user <clerk_user_id> or --allow-system-user for dev.'
        )
      );
      process.exit(1);
    }

    const records: CsvRow[] = [];

    try {
      const parser = fs.createReadStream(file).pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
        })
      );

      for await (const record of parser) {
        records.push(record as CsvRow);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown parse error';
      console.error(chalk.red(`[ERROR] Error parsing CSV: ${message}`));
      process.exit(1);
    }

    console.log(chalk.blue(`[INFO] Parsed ${records.length} CSV row(s). Importing to MAMAbase...`));

    const payload: ContactInsert[] = [];
    let skippedInvalid = 0;

    for (const row of records) {
      const contact = rowToContact(row, options.user);
      if (contact) payload.push(contact);
      else skippedInvalid += 1;
    }

    if (skippedInvalid > 0) {
      console.log(chalk.yellow(`[WARN] Skipped ${skippedInvalid} row(s) with empty Name.`));
    }

    const imported = await importContacts(payload, Boolean(options.force));

    if (imported > 0) {
      console.log(chalk.green(`[SUCCESS] Imported ${imported} contact(s) into api.contacts.`));
      process.exit(0);
    }

    process.exit(1);
  });

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : 'Unexpected CLI failure';
  console.error(chalk.red(`[ERROR] ${message}`));
  process.exit(1);
});