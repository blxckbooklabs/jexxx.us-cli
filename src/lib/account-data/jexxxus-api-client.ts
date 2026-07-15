import type { AccountQueryArgs, AccountSummary } from "./account-query.js";
import type { AuthenticatedAccountSession } from "./session.js";

export type AccountExportTarget = "blxckbook" | "nxt" | "all";

export interface AccountExportPayload {
  exported_at?: string;
  live?: boolean;
  source?: string;
  user?: { id: string; email: string };
  elevated?: boolean;
  blxckbook?: unknown;
  nxt?: unknown;
  tv?: unknown;
}

const DISABLED = new Set(["off", "false", "0", "disabled", "none"]);

export function getJexxxusApiBaseUrl(): string | null {
  const flag = process.env.JEXXXUS_ACCOUNT_API?.trim().toLowerCase();
  if (flag && DISABLED.has(flag)) return null;

  const url =
    process.env.JEXXXUS_API_URL?.trim() ||
    process.env.JEXXXUS_ACCOUNT_API_URL?.trim() ||
    "https://api.jexxx.us";

  if (DISABLED.has(url.toLowerCase())) return null;
  return url.replace(/\/$/, "");
}

async function resolveAccessToken(
  session: AuthenticatedAccountSession,
): Promise<string> {
  if (session.resolveAccessToken) {
    const token = await session.resolveAccessToken();
    if (token) return token;
  }
  const token = session.creds.accessToken?.trim();
  if (!token) {
    throw new Error("No Clerk access token available for JEXXXUS | API.");
  }
  return token;
}

async function accountApiFetch<T>(
  session: AuthenticatedAccountSession,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = getJexxxusApiBaseUrl();
  if (!base) {
    throw new Error("JEXXXUS | API routing is disabled (JEXXXUS_ACCOUNT_API=off).");
  }

  const token = await resolveAccessToken(session);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach JEXXXUS | API at ${base} (${detail}). ` +
        "Start the Mac API (port 8787) or set JEXXXUS_ACCOUNT_API=off for direct Supabase.",
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `JEXXXUS | API ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`,
    );
  }

  if (!text.trim()) {
    throw new Error(`JEXXXUS | API returned empty body for ${path}.`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`JEXXXUS | API returned non-JSON for ${path}.`);
  }
}

export async function fetchAccountSummaryViaApi(
  session: AuthenticatedAccountSession,
  asUserId?: string,
): Promise<AccountSummary> {
  const qs = asUserId ? `?asUserId=${encodeURIComponent(asUserId)}` : "";
  const payload = await accountApiFetch<{
    data: AccountSummary;
  }>(session, `/api/v1/account/summary${qs}`);
  if (!payload?.data) {
    throw new Error("JEXXXUS | API summary response missing data.");
  }
  return payload.data;
}

export async function executeAccountQueryViaApi(
  session: AuthenticatedAccountSession,
  args: AccountQueryArgs,
): Promise<string> {
  const payload = await accountApiFetch<{
    result?: string;
    data?: unknown;
    action?: string;
  }>(session, "/api/v1/account/query", {
    method: "POST",
    body: JSON.stringify(args),
  });

  if (typeof payload.result === "string") return payload.result;
  if (payload.data !== undefined) {
    return JSON.stringify(payload.data, null, 2);
  }
  return JSON.stringify(payload, null, 2);
}

export async function fetchAccountExportViaApi(
  session: AuthenticatedAccountSession,
  options: {
    target: AccountExportTarget;
    includeTv?: boolean;
    asUserId?: string;
  },
): Promise<AccountExportPayload> {
  const params = new URLSearchParams();
  params.set("target", options.target);
  if (options.includeTv) {
    params.set("includeTv", "true");
  }
  if (options.asUserId?.trim()) {
    params.set("asUserId", options.asUserId.trim());
  }

  return accountApiFetch<AccountExportPayload>(
    session,
    `/api/v1/account/export?${params.toString()}`,
  );
}