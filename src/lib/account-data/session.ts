import {
  ensureValidToken,
  loadCredentials,
  refreshAccessTokenViaServer,
  type Credentials,
} from "../auth.js";
import { describeMissingUserEnv, loadOperatorEnv, loadUserEnv } from "../env.js";
import { isSuperAdminClerkUser } from "../super-admin.js";
import { createUserSupabaseClient } from "../user-supabase.js";
import { createOperatorClient, type DashboardTarget } from "../supabase.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OperatorClients {
  blxckbook: SupabaseClient;
  nxt: SupabaseClient;
  /** api schema — JEXXXUS | TV playlists */
  tv: SupabaseClient;
}

export interface AuthenticatedAccountSession {
  creds: Credentials;
  blxckbook: SupabaseClient;
  nxt: SupabaseClient;
  /** api schema — private TV custom playlists (RLS-scoped) */
  tv: SupabaseClient;
  isSuperAdmin: boolean;
  /** Service-role clients — only when super-admin + SUPABASE_KEY in .env */
  operator?: OperatorClients;
}

export type AccountSessionFailure =
  | "not_signed_in"
  | "missing_user_env"
  | "token_invalid";

export type AccountSessionResult =
  | { ok: true; session: AuthenticatedAccountSession }
  | { ok: false; reason: AccountSessionFailure; message: string };

/**
 * Optional host override (e.g. blxckchat.jexxx.us Clerk cookie session).
 * When set, resolveAuthenticatedAccountSession() delegates here instead of ~/.jexxxus creds.
 */
let accountSessionResolverOverride: (() => Promise<AccountSessionResult>) | null =
  null;

export function setAccountSessionResolver(
  resolver: (() => Promise<AccountSessionResult>) | null,
): void {
  accountSessionResolverOverride = resolver;
}

/**
 * Resolve a signed-in user's RLS-scoped Supabase clients for both dashboards.
 */
export async function resolveAuthenticatedAccountSession(): Promise<AccountSessionResult> {
  if (accountSessionResolverOverride) {
    return accountSessionResolverOverride();
  }

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

    const isSuperAdmin = isSuperAdminClerkUser(creds.userId);
    const operatorEnv = isSuperAdmin ? loadOperatorEnv() : null;

    const session: AuthenticatedAccountSession = {
      creds,
      blxckbook: createUserSupabaseClient(env, getAccessToken, "blxckbook"),
      nxt: createUserSupabaseClient(env, getAccessToken, "nxt"),
      tv: createUserSupabaseClient(env, getAccessToken, "blxckbook"),
      isSuperAdmin,
    };

    if (isSuperAdmin && operatorEnv) {
      session.operator = {
        blxckbook: createOperatorClient(operatorEnv, "blxckbook"),
        nxt: createOperatorClient(operatorEnv, "nxt"),
        tv: createOperatorClient(operatorEnv, "blxckbook"),
      };
    }

    return { ok: true, session };
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

/**
 * Resolve the Supabase client for vault reads. Defaults to RLS-scoped user
 * clients; super-admins may pass asUserId to read another user's rows via
 * service-role operator clients (still filtered by user_id).
 */
export function resolveVaultClient(
  session: AuthenticatedAccountSession,
  target: DashboardTarget,
  asUserId?: string,
): { client: SupabaseClient; effectiveUserId: string; elevated: boolean } {
  const effectiveUserId = asUserId?.trim() || session.creds.userId;
  const wantsElevation =
    Boolean(asUserId?.trim()) && asUserId!.trim() !== session.creds.userId;

  if (wantsElevation) {
    if (!session.isSuperAdmin || !session.operator) {
      throw new Error(
        "Cross-user vault access requires JEXXXUS super-admin credentials and SUPABASE_KEY in .env.",
      );
    }
    const client =
      target === "nxt" ? session.operator.nxt : session.operator.blxckbook;
    return { client, effectiveUserId, elevated: true };
  }

  return {
    client: clientForTarget(session, target),
    effectiveUserId,
    elevated: false,
  };
}

export function resolveTvClient(
  session: AuthenticatedAccountSession,
  asUserId?: string,
): { client: SupabaseClient; effectiveUserId: string; elevated: boolean } {
  const effectiveUserId = asUserId?.trim() || session.creds.userId;
  const wantsElevation =
    Boolean(asUserId?.trim()) && asUserId!.trim() !== session.creds.userId;

  if (wantsElevation) {
    if (!session.isSuperAdmin || !session.operator) {
      throw new Error(
        "Cross-user TV playlist access requires JEXXXUS super-admin credentials and SUPABASE_KEY in .env.",
      );
    }
    return {
      client: session.operator.tv,
      effectiveUserId,
      elevated: true,
    };
  }

  return { client: session.tv, effectiveUserId, elevated: false };
}