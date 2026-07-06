import { loadOperatorEnv } from "./env.js";
import { createOperatorClient, createEcosystemClient } from "./supabase.js";
import type { DashboardTarget } from "./supabase.js";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type DoctorReport = {
  ok: boolean;
  checks: DoctorCheck[];
};

type DoctorClient = ReturnType<typeof createOperatorClient>;

export async function probeMamabase(
  supabase: DoctorClient,
  schema: string,
): Promise<DoctorCheck> {
  const { error } = await supabase
    .from("contacts")
    .select("id", { head: true, count: "exact" });

  if (!error) {
    return {
      name: `mamabase.${schema}.contacts`,
      ok: true,
      detail: `${schema}.contacts is reachable (read-only probe).`,
    };
  }

  return {
    name: `mamabase.${schema}.contacts`,
    ok: false,
    detail: `Could not reach ${schema}.contacts. Verify project URL, operator key, and network.`,
  };
}

export async function probeNxtVessels(
  supabase: DoctorClient,
): Promise<DoctorCheck> {
  const { error } = await supabase
    .from("vessels")
    .select("id", { head: true, count: "exact" });

  if (!error) {
    return {
      name: "mamabase.public.vessels",
      ok: true,
      detail: "public.vessels (NXT) is reachable (read-only probe).",
    };
  }

  return {
    name: "mamabase.public.vessels",
    ok: false,
    detail:
      "Could not reach public.vessels (NXT). Verify project URL, operator key, and network.",
  };
}

export async function probeNxtEvents(
  supabase: DoctorClient,
): Promise<DoctorCheck> {
  const { error } = await supabase
    .from("contact_events")
    .select("id", { head: true, count: "exact" });

  if (!error) {
    return {
      name: "mamabase.public.contact_events",
      ok: true,
      detail: "public.contact_events (NXT) is reachable (read-only probe).",
    };
  }

  return {
    name: "mamabase.public.contact_events",
    ok: false,
    detail:
      "Could not reach public.contact_events (NXT). Verify project URL, operator key, and network.",
  };
}

export async function runDoctorFromEnv(
  target?: DashboardTarget,
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const env = loadOperatorEnv();

  checks.push({
    name: "credentials",
    ok: Boolean(env),
    detail: env
      ? "SUPABASE_URL and SUPABASE_KEY are configured locally."
      : "Missing operator credentials. Copy .env.example to .env.",
  });

  if (!env) {
    return { ok: false, checks };
  }

  if (target) {
    const supabase = createOperatorClient(env, target);
    if (target === "nxt") {
      checks.push(await probeNxtVessels(supabase));
      checks.push(await probeNxtEvents(supabase));
    } else {
      checks.push(await probeMamabase(supabase, "api"));
    }
  } else {
    const clients = createEcosystemClient(env);
    checks.push(await probeMamabase(clients.blxckbook, "api"));
    checks.push(await probeNxtVessels(clients.nxt));
    checks.push(await probeNxtEvents(clients.nxt));
  }

  return { ok: checks.every((check) => check.ok), checks };
}
