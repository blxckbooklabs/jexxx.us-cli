import {
  ensureValidToken,
  loadCredentials,
  refreshAccessTokenViaServer,
  type Credentials,
} from "../auth.js";
import { describeMissingUserEnv, loadUserEnv } from "../env.js";
import { createUserSupabaseClient } from "../user-supabase.js";
import type { DashboardTarget } from "../supabase.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthenticatedAccountSession {
  creds: Credentials;
  blxckbook: SupabaseClient;
  nxt: SupabaseClient;
}

export type AccountSessionFailure =
  | "not_signed_in"
  | "missing_user_env"
  | "token_invalid";

export type AccountSessionResult =
  | { ok: true; session: AuthenticatedAccountSession }
  | { ok: false; reason: AccountSessionFailure; message: string };

/**
 * Resolve a signed-in user's RLS-scoped Supabase clients for both dashboards.
 */
export async function resolveAuthenticatedAccountSession(): Promise<AccountSessionResult> {
  if (!loadCredentials({ quiet: true })) {
    return {
      ok: false,
      reason: "not_signed_in",
      message:
        "Not signed in to JEXXXUS. Run /auth login or `jexxxus auth login` " +
        "(secure.jexxx.us device flow), then retry.",
    };
  }

  const env = loadUserEnv();
  if (!env) {
    return {
      ok: false,
      reason: "missing_user_env",
      message: describeMissingUserEnv(),
    };
  }

  try {
    const quiet = { quiet: true } as const;
    const creds = await ensureValidToken(refreshAccessTokenViaServer, quiet);
    const getAccessToken = async () => {
      const fresh = await ensureValidToken(refreshAccessTokenViaServer, quiet);
      return fresh.accessToken;
    };

    return {
      ok: true,
      session: {
        creds,
        blxckbook: createUserSupabaseClient(env, getAccessToken, "blxckbook"),
        nxt: createUserSupabaseClient(env, getAccessToken, "nxt"),
      },
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "token_invalid",
      message: `Clerk session could not be refreshed: ${detail}. Try /auth refresh or /auth login.`,
    };
  }
}

/** @deprecated Prefer resolveAuthenticatedAccountSession for actionable errors. */
export async function createAuthenticatedAccountSession(): Promise<AuthenticatedAccountSession | null> {
  const result = await resolveAuthenticatedAccountSession();
  return result.ok ? result.session : null;
}

export function clientForTarget(
  session: AuthenticatedAccountSession,
  target: DashboardTarget,
): SupabaseClient {
  return target === "nxt" ? session.nxt : session.blxckbook;
}