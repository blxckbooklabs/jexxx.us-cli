import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { UserEnv } from "./env.js";
import type { DashboardTarget } from "./supabase.js";

const SCHEMA_MAP: Record<DashboardTarget, string> = {
  blxckbook: "api",
  nxt: "public",
};

/**
 * Authenticated, RLS-scoped Supabase client for the signed-in CLI user —
 * mirrors the `accessToken` callback pattern dxsh.blxckbook.jexxx.us and
 * dxsh.nxt.jexxx.us's browser clients use (each repo's src/lib/supabase.ts),
 * so account-data reads go through the exact same RLS path the dashboards
 * rely on. Uses the anon key + the user's own Clerk JWT — never the
 * service-role key `createOperatorClient()` uses. RLS (`user_id =
 * auth.jwt() ->> 'sub'`, see supabase/migrations/20260705000000_...) is the
 * only gate; there is no `--user` override in this path.
 *
 * Unlike the dashboards' clients, this does NOT exchange the Clerk JWT for
 * a Supabase-signed Realtime token (see getExchangedToken() in
 * dxsh.blxckbook.jexxx.us/src/lib/supabase.ts) — the CLI's account-data
 * reads are one-shot REST `select` calls with no Realtime subscription, so
 * the raw Clerk JWT (which PostgREST verifies directly against Supabase's
 * configured Clerk JWKS — the same verification every RLS policy's
 * `auth.jwt() ->> 'sub'` depends on) is sufficient.
 *
 * `getAccessToken` should be a closure over `ensureValidToken()` from
 * ./auth.js so the token is refreshed automatically before it goes stale;
 * supabase-js calls this callback lazily on each request, so passing a
 * function (not a resolved token string) is required.
 */
export function createUserSupabaseClient(
  env: UserEnv,
  getAccessToken: () => Promise<string>,
  target: DashboardTarget = "blxckbook",
): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    db: { schema: SCHEMA_MAP[target] },
    accessToken: getAccessToken,
  }) as SupabaseClient;
}
