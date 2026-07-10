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
- **Command swap (July 2026):** bare `jexxxus` (no subcommand) is now the default entry point for
  BLXCKCHAT — it shares one `launchBlxckchat()` implementation with the explicit `jexxxus blxckchat`
  subcommand in `index.ts` (both call the same function; keep them in sync, don't duplicate logic).
  `jexxxus shell` is new and replaces the old bare-invocation behavior (prints `program.outputHelp()`
  non-interactively). The `preAction` hook's banner-suppression check (blessed TUI owns the screen)
  now matches on `actionCommand.name() === "blxckchat" || actionCommand.name() === "jexxxus"` — if you
  add another entry point that launches the interactive TUI, extend that condition too. The agent's
  system prompt (`SYSTEM_PROMPT_BASE` in `agent-loop.ts`) explicitly enumerates the shell's
  non-interactive command surface so it can answer "what can I do in this terminal" accurately — keep
  that list in sync with `index.ts` when commands are added/removed/renamed.
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
- BLXCKCHAT `lib/bible.ts` `findBook()` normalizes numbered book names (`1 Samuel` ↔ vault folder `09-1Samuel`).
- BLXCKCHAT `account_query` reads **signed-in user's** BLXCKBOOK + NXT vault data and private
  JEXXXUS | TV playlists (`api.playlists`, RLS-scoped Clerk JWT from `/auth login` via
  `createUserSupabaseClient` + `SUPABASE_ANON_KEY`). Operator identity (Clerk name, email,
  profile image URL, vault/TV snapshot) injects into every signed-in system prompt via
  `operator-identity.ts`. JEXXXUS super-admin Clerk IDs (`super-admin.ts`, default includes
  `user_3AH8ufbCQvjfxL0RkA75RDDGYsy`) may pass `asUserId` for elevated cross-user reads when
  `SUPABASE_KEY` (service role) is in `.env` — personal vault questions still default to RLS.
  Routing: `account-routing.ts` (collision table, same pattern as TV/VEIL). Export parity:
  `account-data/blxckbook-export.ts` (SettingsView schema), `nxt-export.ts` (workspace JSON),
  `account-data/tv-playlists.ts` (TV custom playlists). Slash: `/account status`, `/account export`.
  Query catalog: Obsidian `Account-Data-Query-Catalog.md`. Tests: `account-routing.test.ts`,
  `account-data.test.ts`, `super-admin.test.ts`.
- **BLXCKCHAT vault writes (July 2026):** `update_contact`/`add_journal_entry`/`manage_playlist`
  (`tools/vault-write-tools.ts`) call into `account-data/mutations.ts`, which reuses
  `resolveVaultClient()`/`resolveTvClient()` from `session.ts` with **no `asUserId` parameter ever**
  — unlike `account_query`, these tools have no super-admin write-on-behalf-of-another-user path by
  design. RLS on `api.contacts`/`api.journal_entries`/`public.vessels`/`public.contact_events`/
  `public.playlists`/`public.playlist_items` already permits full CRUD for the row owner (verified
  against `supabase/supabase/migrations/20260708223504_remote_schema.sql`) — no new RLS policies or
  Realtime wiring were needed, the CLI just uses the same authenticated write path the dashboards do.
  `mutations.ts`'s `sanitizeContactUpdates()` hard-blocks `id`/`user_id`/`created_at` regardless of
  what the model tries to pass. `export_vault`/`sync_export_file`
  (`account-data/export-to-disk.ts`, `mutations.ts#syncBlxckbookExport`) support the
  export-edit-reupload workflow — sync matches by `id`, creates rows without one, never deletes.
- **BLXCKCHAT local file tools (`tools/local-file-tools.ts`):** `read_local_file`/
  `write_local_file`/`edit_local_file` default relative paths to `~/.jexxxus/workspace`; absolute
  paths outside `~/.jexxxus` are permitted but flagged in the tool's return message. `edit_local_file`
  requires an exact, unique `oldText` match (pi/opencode parity) — refuses on zero or multiple
  matches rather than guessing. These are intentionally narrow (vault-data roundtrip use case), not
  general filesystem access — do not widen scope to arbitrary project/code editing without
  revisiting "not a general coding agent" in the system prompt. Tests: `blxckchat-local-file-tools.test.ts`.
- BLXCKCHAT kingdom/garden routing (`src/lib/blxckchat/kingdom-routing.ts`) plans multi-tool replies:
  thematic TV/VEIL asks also get `companionVerses` (explicit Book Ch:V refs) and `tvSearchQuery`
  (e.g. `Forgive Me Father`) — never pass series titles as bible queries. `garden-prefetch.ts`
  pre-loads scripture + TV/VEIL search into the system prompt for smaller models. Routing scans
  recent conversation history for short persona follow-ups (Proverbs 31, drafts, corruption beats).
  `kingdom-url-sanitize.ts` repairs model-hallucinated URLs on final replies. Regression tests:
  `src/__tests__/kingdom-routing.test.ts`, `src/__tests__/kingdom-url-sanitize.test.ts`.
- BLXCKCHAT **Docs/Law routing** (`kingdom-surfaces.ts`, `kingdom-routing.ts`): prompts like
  "tell me about Docs and Law" must not hit `account_query` contact lookup — use RAG docs context
  + `law_query` instead.
- **Breaking rename (July 2026):** internal `Empire*` identifiers/files under `src/lib/blxckchat/`
  were renamed to `Kingdom*`/`Garden*` to match the linguistic style guide ("empire" is retired as
  a brand descriptor everywhere, including code identifiers not just prose). Old paths
  `empire-routing.ts`/`empire-url-sanitize.ts` → `kingdom-routing.ts`/`kingdom-url-sanitize.ts`;
  `empire-prefetch.ts`/`empire-synthesis.ts` → `garden-prefetch.ts`/`garden-synthesis.ts`. No
  external API or cookie contract changed — this is source-only, scoped to `jexxx.us-cli`. Cross-repo
  shared infra (`empire-theme.ts`, `EmpireThemeClerkBridge`, `jexxxus-theme` cookie, `empire_navigate`
  analytics event) is **out of scope** here and still pending a coordinated rollout across
  VEIL/TV/Law/Docs/BLXCKBOOK — do not rename those without updating all consuming repos in lockstep.
- BLXCKCHAT TUI **startup LLM resolution** (`resolveStartupProvider` in `config.ts`):
  pinned default (`isDefault` from provider setup **y**) beats `lastUsed` profile;
  without a pin, reopens with the last active provider/model from the previous session.
  `saveLastUsedProvider` runs on model/provider change and TUI exit (Ctrl+C).
- **Open-source security prep:** repo `SECURITY.md` is the public disclosure + threat-model entry;
  full audit findings live in Obsidian `JEXXXUS CLI/Open-Source-Security-Audit.md`. Before any
  public release: remove hardcoded super-admin Clerk IDs from `super-admin.ts`, strip dev default
  paths, add Bible vault prefix guards, run secret scan on git history.
- BLXCKCHAT TUI streams LLM **thinking in real time** (Pi/OpenCode parity): gray `[▼ think]`
  block via `stream-thinking.ts` (`StreamThinkingParser` for `<think>`/API reasoning deltas;
  `formatThinkingWaitState` between tool passes). Toggle collapsed blocks: `Space` / `Ctrl+T`.
  Tests: `blxckchat-stream-thinking.test.ts`.

## 6. Child DOX Index

- (None)
