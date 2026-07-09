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

export type UserEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

/**
 * Anon key + user-JWT env, distinct from OperatorEnv's service-role key.
 * This is the *public* anon key (same one shipped to dxsh.blxckbook.jexxx.us
 * / dxsh.nxt.jexxx.us browser bundles as VITE_SUPABASE_ANON_KEY) — safe to
 * read from a plain .env since RLS, not secrecy of this key, is what
 * scopes access. Never conflate this with SUPABASE_KEY (service role,
 * bypasses RLS) from loadOperatorEnv() above.
 */
export function loadUserEnv(envPath = resolve(__dirname, '../../.env')): UserEnv | null {
  dotenv.config({ path: envPath });

  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}