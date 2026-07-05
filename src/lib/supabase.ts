import { createClient } from '@supabase/supabase-js';

import type { OperatorEnv } from './env.js';

export function createOperatorClient(env: OperatorEnv) {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    db: { schema: 'api' },
  });
}