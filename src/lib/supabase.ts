import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { OperatorEnv } from "./env.js";

export type DashboardTarget = "blxckbook" | "nxt";

const SCHEMA_MAP: Record<DashboardTarget, string> = {
  blxckbook: "api",
  nxt: "public",
};

export function createOperatorClient(
  env: OperatorEnv,
  target: DashboardTarget = "blxckbook",
): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    db: { schema: SCHEMA_MAP[target] },
  });
}

export function createEcosystemClient(env: OperatorEnv): {
  blxckbook: SupabaseClient;
  nxt: SupabaseClient;
} {
  return {
    blxckbook: createOperatorClient(env, "blxckbook"),
    nxt: createOperatorClient(env, "nxt"),
  };
}
