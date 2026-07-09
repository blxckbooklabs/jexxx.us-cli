import {
  ensureValidToken,
  loadCredentials,
  refreshAccessTokenViaServer,
  type Credentials,
} from "../auth.js";
import { loadUserEnv } from "../env.js";
import { createUserSupabaseClient } from "../user-supabase.js";
import type { DashboardTarget } from "../supabase.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthenticatedAccountSession {
  creds: Credentials;
  blxckbook: SupabaseClient;
  nxt: SupabaseClient;
}

/**
 * Resolve a signed-in user's RLS-scoped Supabase clients for both dashboards.
 * Returns null when credentials, user env (anon key), or token refresh fails.
 */
export async function createAuthenticatedAccountSession(): Promise<AuthenticatedAccountSession | null> {
  if (!loadCredentials({ quiet: true })) {
    return null;
  }

  const env = loadUserEnv();
  if (!env) {
    return null;
  }

  try {
    const creds = await ensureValidToken(refreshAccessTokenViaServer);
    const getAccessToken = async () => creds.accessToken;

    return {
      creds,
      blxckbook: createUserSupabaseClient(env, getAccessToken, "blxckbook"),
      nxt: createUserSupabaseClient(env, getAccessToken, "nxt"),
    };
  } catch {
    return null;
  }
}

export function clientForTarget(
  session: AuthenticatedAccountSession,
  target: DashboardTarget,
): SupabaseClient {
  return target === "nxt" ? session.nxt : session.blxckbook;
}