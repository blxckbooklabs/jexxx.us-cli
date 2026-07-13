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
  dotenv.config({ path: envPath, quiet: true });

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
function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function loadUserEnv(envPath = resolve(__dirname, '../../.env')): UserEnv | null {
  dotenv.config({ path: envPath, quiet: true });

  const supabaseUrl = firstNonEmpty(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const supabaseAnonKey = firstNonEmpty(
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

/** Human-readable reason when loadUserEnv() returns null (for TUI / account_query). */
export function describeMissingUserEnv(): string {
  dotenv.config({ path: resolve(__dirname, '../../.env'), quiet: true });
  const hasUrl = Boolean(
    firstNonEmpty(
      process.env.SUPABASE_URL,
      process.env.VITE_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
  );
  const hasAnon = Boolean(
    firstNonEmpty(
      process.env.SUPABASE_ANON_KEY,
      process.env.VITE_SUPABASE_ANON_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  );

  if (!hasUrl && !hasAnon) {
    if (process.env.JEXXXUS_EMBEDDED === "1") {
      return (
        "Missing MAMAbase public credentials in the embedded JEXXXUS | CLI session. " +
        "Restart the app or sign in again — the desktop shell should inject SUPABASE_URL " +
        "and SUPABASE_ANON_KEY automatically."
      );
    }
    return (
      "Missing SUPABASE_URL and SUPABASE_ANON_KEY in jexxx.us-cli/.env. " +
      "Copy VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from dxsh.blxckbook.jexxx.us/.env " +
      "(same MAMAbase project as the dashboards)."
    );
  }
  if (!hasAnon) {
    return (
      "Missing SUPABASE_ANON_KEY in jexxx.us-cli/.env. " +
      "Add the public anon key (not SUPABASE_KEY service role) — same value as " +
      "VITE_SUPABASE_ANON_KEY in dxsh.blxckbook.jexxx.us/.env."
    );
  }
  return "Missing SUPABASE_URL in jexxx.us-cli/.env.";
}