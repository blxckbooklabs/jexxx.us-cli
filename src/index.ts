#!/usr/bin/env node
import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';

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
  console.log(chalk.red('[ERROR] SUPABASE_URL and SUPABASE_KEY must be set in .env'));
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'api' },
});

/**
 * Insert shape for `api.contacts` (live BLXCKBOOK data plane).
 *
 * NOTE: the CLI runs headless with a service-role key, which BYPASSES RLS —
 * `user_id` is therefore not inferred from a session and MUST be set
 * explicitly so rows are owned by (and visible to) the right vault account.
 */
type ContactInsert = {
  name: string;
  notes?: string;
  tags?: string[];
  user_id: string;
};

const jexxxusArt = figlet.textSync('JEXXXUS', { font: 'Slant' });
// Glistening pink aesthetic using hot pink, light pink, and magenta
console.log(gradient(['#FF1A8C', '#FFB6C1', '#E11D8A', '#FF69B4'])(jexxxusArt));
console.log(gradient(['#FF1A8C', '#FFB6C1'])('                            Welcome to the Vault.\n'));

const program = new Command();

program
  .name('jexxxus')
  .description('JEXXXUS CLI for BLXCKBOOK Ecosystem')
  .version('1.0.0');

program
  .command('import')
  .description('Import contacts from a CSV file into the BLXCKBOOK Vault')
  .argument('<file>', 'Path to the CSV file')
  .option('-f, --force', 'Force import even if duplicates are detected')
  .option(
    '-u, --user <userId>',
    'Vault account (user_id) to own the imported profiles. The CLI uses a service-role key (RLS bypassed), so ownership must be explicit.',
    'SYSTEM'
  )
  .action((file, options) => {
    if (!fs.existsSync(file)) {
      console.log(chalk.red(`[ERROR] File not found: ${file}`));
      process.exit(1);
    }

    const records: any[] = [];
    const parser = fs.createReadStream(file).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
      })
    );

    parser.on('readable', function () {
      let record;
      while ((record = parser.read()) !== null) {
        records.push(record);
      }
    });

    parser.on('error', function (err) {
      console.error(chalk.red('[ERROR] Error parsing CSV:'), err.message);
    });

    parser.on('end', async function () {
      console.log(chalk.blue(`[INFO] Parsed ${records.length} records. Importing to MAMAbase...`));
      
      // CSV headers: Name; Notes/Bio; Tags/Interests → api.contacts columns.
      const splitList = (v: unknown): string[] =>
        typeof v === 'string' ? v.split(',').map((t) => t.trim()).filter(Boolean) : [];

      const payload: ContactInsert[] = records.map((r) => ({
        name: r.Name || r.name || '',
        notes: r.Notes || r.notes || r.Bio || r.bio || '',
        tags: splitList(r.Interests || r.interests || r.Tags || r.tags),
        user_id: options.user,
      }));

      const { error, data } = await supabase.from('contacts').insert(payload).select();

      if (error) {
        const isDupError = error.message.toLowerCase().includes('duplicate');
        if (isDupError) {
          console.log(chalk.yellow(`[WARN] Import failed due to duplicate entry detected by Database.`));
          if (!options.force) {
            console.log(chalk.yellow(`Use --force flag to bypass (if logic permits).`));
          }
        } else {
          console.log(chalk.red(`[ERROR] Import failed: ${error.message}`));
        }
      } else {
        console.log(chalk.green(`[SUCCESS] Imported ${data.length} contacts into api.contacts.`));
      }
    });
  });

program.parse();
