# DOX framework - jexxx.us-cli

## 1. Purpose

Native headless CLI agent (`jexxxus`) for the JEXXXUS ecosystem — unified
operator control plane for BLXCKBOOK and NXT dashboards. Provides bulk
import/automation and connectivity diagnostics against MAMAbase (Supabase).

## 2. Ownership

Owned by the JEXXXUS platform / tooling team.

## 3. Local Contracts

- Domain types come from the canonical `@blxckbook/shared-types` at
  `<JEXXXUS root>/packages/shared-types`, wired via tsconfig `paths` pointing
  at the package's built `dist/index.d.ts`. Imports MUST be type-only
  (`import type`) so they erase at compile time — the published CLI has no
  runtime dependency on the package. Rebuild the canonical package
  (`tsc -p packages/shared-types/tsconfig.json`) after changing its types.
- The CLI authenticates with operator-only credentials (service-role key in
  local `.env`), which BYPASSES RLS. Production imports must pass `--user`
  with the target Clerk user ID; default `SYSTEM` is blocked unless
  `--allow-system-user` is set for dev/test.
- The `--target` flag routes commands to the correct schema:
  - `--target blxckbook` (default): writes to **`api.contacts`** (`db.schema: 'api'`)
  - `--target nxt`: writes to **`public.vessels`** (`db.schema: 'public'`)
- Both targets share the same Supabase project. The `doctor` command checks
  connectivity for both schemas when `--target` is omitted.
- CSV columns `name`, `notes`/`bio`, `tags`/`interests` map consistently
  across both targets. Legacy header aliases (Bio, Interests) map to `notes`/`tags`.

## 4. Work Guidance

- Refer to the root `AGENTS.md` for brand spelling (`JEXXXUS`, `wing6`,
  `BLXCKBOOK`, `NTX`) and conventions.
- `src/lib/supabase.ts` exports `createOperatorClient(env, target)` and
  `createEcosystemClient(env)` — the latter provides both BLXCKBOOK and NXT
  clients simultaneously for cross-schema operations.
- `src/lib/doctor.ts` exports `probeMamabase()`, `probeNxtVessels()`,
  `probeNxtEvents()` — each targets a different schema/table for read-only
  health checks.

## 5. Verification

- `npx tsc --noEmit` must pass, and `dist/index.js` must contain no
  `@blxckbook/shared-types` import after build.
- `npm test` must pass (CSV parsing, duplicate handling, SYSTEM guard).
- `jexxxus doctor` must perform read-only connectivity checks only.
- `jexxxus doctor --target nxt` must probe `public.vessels` and
  `public.contact_events` (not `api.contacts`).
- `jexxxus import --target nxt` must write to `public.vessels` schema.
- Vault operator docs live in `jexxx.us-obsidian/CLI/`; public mirror in
  `docs.jexxx.us/src/content/jexxxus-cli.md`. Keep both aligned.
- BLXCKCHAT `/divinities` loads personas from `jexxx.us-obsidian/Divinities`
  (`DIVINITIES_VAULT_PATH` override). Persona extracts inject the system prompt;
  RAG docs index remains `docs.jexxx.us` only.
- BLXCKCHAT `veil_query` reads **public** VEIL articles only. Canonical local source is the
  official `veil.jexxx.us/content/posts` tree (`VEIL_CONTENT_PATH`); Obsidian `VEIL/articles`
  is a mirror fallback; remote users use `https://veil.jexxx.us/feed.xml` only. Outbound fetch
  is host-locked to `veil.jexxx.us` (or localhost dev). No `.env`, `src/`, or internal Obsidian
  VEIL docs are ever read. Env: `VEIL_CONTENT_PATH`, `VEIL_ARTICLES_PATH`, `VEIL_PUBLIC_BASE_URL`.
- BLXCKCHAT `tv_query` reads **public** JEXXXUS | TV videos only. Canonical local source is
  `tv.jexxx.us/src/data/videos.json` (`TV_CONTENT_PATH`); `public/llms-full.txt` is a local
  mirror fallback; remote users use `https://tv.jexxx.us/llms-full.txt` (then `llms.txt`,
  `feed.xml`). Outbound fetch is host-locked to `tv.jexxx.us` (or localhost dev). Never exposes
  `embed_url`/stream URLs, Supabase, or internal Obsidian TV docs. Env: `TV_CONTENT_PATH`,
  `TV_PUBLIC_BASE_URL`.
- BLXCKCHAT empire routing (`src/lib/blxckchat/empire-routing.ts`) plans multi-tool replies:
  thematic TV/VEIL asks also get `companionVerses` (explicit Book Ch:V refs) and `tvSearchQuery`
  (e.g. `Forgive Me Father`) — never pass series titles as bible queries. `empire-prefetch.ts`
  pre-loads scripture + TV/VEIL search into the system prompt for smaller models. Routing scans
  recent conversation history for short persona follow-ups (Proverbs 31, drafts, corruption beats).
  `empire-url-sanitize.ts` repairs model-hallucinated URLs on final replies. Regression tests:
  `src/__tests__/empire-routing.test.ts`, `src/__tests__/empire-url-sanitize.test.ts`.

## 6. Child DOX Index

- (None)
