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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const jexxxusArt = figlet.textSync('JEXXXUS', { font: 'Slant' });
// Glistening pink aesthetic using hot pink, light pink, and magenta
console.log(gradient(['#FF1493', '#FFB6C1', '#E11D8A', '#FF69B4'])(jexxxusArt));
console.log(gradient(['#E11D8A', '#FFB6C1'])('                            Welcome to the Vault.\n'));

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
      
      const newVessels = records.map(r => ({
        // Assuming the CSV has Name, Bio, Tags headers
        name: r.Name || r.name,
        bio: r.Bio || r.bio || r.Notes || r.notes || '',
        tags: r.Tags ? r.Tags.split(',').map((t: string) => t.trim()) : (r.tags ? r.tags.split(',').map((t: string) => t.trim()) : []),
        metadata: { source: 'cli-import' }
      }));

      // In a real CLI, we might want to attach this to a specific user, or default to SYSTEM
      // Let's assume user_id is handled by the trigger or defaults if nullable, or we set a mock ID for CLI imports if unauthenticated.
      // We will assign a default 'SYSTEM' user_id since CLI operates autonomously.
      const payload = newVessels.map(v => ({ ...v, user_id: 'SYSTEM' }));

      const { error, data } = await supabase.from('vessels').insert(payload).select();

      if (error) {
        const isDupError = error.message.toLowerCase().includes('duplicate') || error.message.includes('check_vessel_duplicate');
        if (isDupError) {
          console.log(chalk.yellow(`[WARN] Import failed due to duplicate entry detected by Database.`));
          if (!options.force) {
            console.log(chalk.yellow(`Use --force flag to bypass (if logic permits).`));
          }
        } else {
          console.log(chalk.red(`[ERROR] Import failed: ${error.message}`));
        }
      } else {
        console.log(chalk.green(`[SUCCESS] Imported ${data.length} vessel profiles into the Vault.`));
      }
    });
  });

program.parse();
