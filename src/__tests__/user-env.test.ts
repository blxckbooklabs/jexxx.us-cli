import assert from "node:assert/strict";
import { test } from "node:test";

import { describeMissingUserEnv, loadUserEnv } from "../lib/env.js";

test("loadUserEnv accepts SUPABASE_ANON_KEY alias names", () => {
  const original = { ...process.env };
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "";
    process.env.VITE_SUPABASE_ANON_KEY = "anon-test-key";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

    const env = loadUserEnv("/nonexistent-path-so-dotenv-no-op");
    assert.ok(env);
    assert.equal(env?.supabaseAnonKey, "anon-test-key");
    assert.equal(env?.supabaseUrl, "https://example.supabase.co");
  } finally {
    process.env = original;
  }
});

test("describeMissingUserEnv mentions anon key when URL is set", () => {
  const original = { ...process.env };
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "";
    process.env.VITE_SUPABASE_ANON_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

    const msg = describeMissingUserEnv();
    assert.match(msg, /SUPABASE_ANON_KEY/i);
    assert.match(msg, /VITE_SUPABASE_ANON_KEY/i);
  } finally {
    process.env = original;
  }
});