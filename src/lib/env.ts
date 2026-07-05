import * as dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type OperatorEnv = {
  supabaseUrl: string;
  supabaseKey: string;
};

export function loadOperatorEnv(envPath = resolve(__dirname, '../../.env')): OperatorEnv | null {
  dotenv.config({ path: envPath });

  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '';
  const supabaseKey = process.env.SUPABASE_KEY?.trim() ?? '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return { supabaseUrl, supabaseKey };
}