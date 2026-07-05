import { loadOperatorEnv } from './env.js';
import { createOperatorClient } from './supabase.js';

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

export async function probeMamabase(supabase: DoctorClient): Promise<DoctorCheck> {
  const { error } = await supabase.from('contacts').select('id', { head: true, count: 'exact' });

  if (!error) {
    return {
      name: 'mamabase',
      ok: true,
      detail: 'api.contacts is reachable (read-only probe).',
    };
  }

  return {
    name: 'mamabase',
    ok: false,
    detail: 'Could not reach api.contacts. Verify project URL, operator key, and network.',
  };
}

export async function runDoctorFromEnv(): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const env = loadOperatorEnv();

  checks.push({
    name: 'credentials',
    ok: Boolean(env),
    detail: env
      ? 'SUPABASE_URL and SUPABASE_KEY are configured locally.'
      : 'Missing operator credentials. Copy .env.example to .env.',
  });

  if (!env) {
    return { ok: false, checks };
  }

  const supabase = createOperatorClient(env);
  const mamabaseCheck = await probeMamabase(supabase);
  checks.push(mamabaseCheck);

  return { ok: checks.every((check) => check.ok), checks };
}