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
- **BLXCKCHAT vault writes (July 2026) — full CRUD:** `update_contact`/`delete_contact`,
  `add_journal_entry`/`update_journal_entry`/`delete_journal_entry`, `manage_contact_event`
  (create/update/delete), `manage_playlist` (`tools/vault-write-tools.ts`) call into
  `account-data/mutations.ts`, which reuses `resolveVaultClient()`/`resolveTvClient()` from
  `session.ts` with **no `asUserId` parameter ever** — unlike `account_query`, these tools have no
  super-admin write-on-behalf-of-another-user path by design. RLS on `api.contacts`/
  `api.journal_entries`/`public.vessels`/`public.contact_events`/`public.playlists`/
  `public.playlist_items` already permits full CRUD for the row owner (verified against
  `supabase/supabase/migrations/20260708223504_remote_schema.sql`) — no new RLS policies or Realtime
  wiring were needed, the CLI just uses the same authenticated write path the dashboards do.
  `mutations.ts`'s `sanitizeContactUpdates()` hard-blocks `id`/`user_id`/`created_at` regardless of
  what the model tries to pass. `export_vault`/`sync_export_file`
  (`account-data/export-to-disk.ts`, `mutations.ts#syncBlxckbookExport`) support the
  export-edit-reupload workflow — sync matches by `id`, creates rows without one, never deletes.
  **`public.contact_events` columns are `vessel_id`/`event_type`, not `contact_id`/`kind`** — the
  first implementation guessed wrong and only surfaced when tested live against a real (throwaway)
  row; `addContactEvent`/`updateContactEvent` in `mutations.ts` use the correct names now. Lesson:
  when adding a new table to `mutations.ts`, verify column names against
  `supabase/supabase/migrations/20260708223504_remote_schema.sql` directly rather than inferring from
  a sibling table's naming convention.
- **BLXCKCHAT cross-user connections (`tools/connection-tools.ts`, `account-data/connections.ts`,
  July 2026):** `list_notifications`/`connect_contact_back`/`get_relationship_status` mirror
  dxsh.blxckbook.jexxx.us's `handleAddBack()` (App.tsx) and `relationship-tiers.ts` exactly — same
  merge-aware contact insert, same `restore_relationship` RPC call, same reciprocal
  `contact_notifications` row. **Schema split, confirmed live (not just from the migration file):**
  `contacts` is in the `api` schema (`resolveVaultClient(session, "blxckbook")`), but
  `contact_notifications`/`event_invites`/`relationship_tiers`/`point_transactions` and the RPCs
  (`fn_user_tier_with_contact`/`restore_relationship`/`cancel_relationship`/
  `award_relationship_points`) are all in `public` (`resolveVaultClient(session, "nxt")` — same
  schema NXT uses). Calling an RPC or table on the wrong schema client fails loudly
  ("Could not find the function api.fn_user_tier_with_contact ... in the schema cache"), which is how
  the first draft's mistake was caught — connections.ts uses two separate `resolveVaultClient()`
  calls (one per schema) rather than one, on purpose.
  `connect_contact_back` deliberately never offers to merge two *already-existing* duplicate
  contacts — that's the manual-merge feature in dxsh.blxckbook.jexxx.us's ContactDetailPanel (see
  the fix in that repo's App.tsx, July 2026: `onMerge` was dropping `linked_ecosystem_id` when the
  Clerk-linked contact wasn't picked as "keep", silently severing a real connection while leaving an
  orphaned name-only row). The CLI's system prompt explicitly tells the agent to point users to that
  web UI for existing duplicates rather than attempting `update_contact` + `delete_contact` as a
  workaround, which would reproduce the same bug class.
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
- **Mouse click-drag text selection (July 2026 fix):** blessed 0.1.81's default `enableMouse()`
  picks legacy UTF-8 mouse mode (`\x1b[?1005h`) for any TERM matching xterm/screen/key_mouse — which
  is most modern terminals (iTerm2, Terminal.app, Warp, Kitty, VS Code). That mode's motion
  (drag) reporting is unreliable on those terminals, so click-drag silently never fired
  `mousemove` — nothing highlighted, nothing copied, only Cmd+A (native OS select-all,
  independent of blessed) worked. `tty.ts#forceSgrMouseMode()` overrides this to SGR mode
  (`\x1b[?1006h`) right after all mouse-enabled components (topBar/messageBox/statusBar/inputBox)
  have registered their first listener in `terminal.ts` — must run there and not earlier, since
  blessed's `Screen._listenMouse()` calls `program.enableMouse()` exactly once, on the *first*
  mouse-listener registration, and would silently stomp an earlier override back to UTF-8 mode.
  Text selection then flows through the existing `attach-blessed-text-selection.ts` (mousedown →
  highlight → mouseup → copy → pink toast) unchanged — the bug was purely in which mouse protocol
  blessed negotiated with the terminal, not in the selection/copy logic itself.
- **"Maximum call stack size exceeded" crash on some LLM turns (July 2026 fix):** free/quantized
  reasoning models (reported with `opencode-zen/deepseek-v4-flash-free`) can loop/degrade mid-turn
  and emit thousands of nested markdown list levels instead of terminating normally. Confirmed
  directly: `marked.lexer()`'s recursive-descent list parser has no depth limit — a 5,000-level
  nested list blows the V8 stack/heap before our own `renderBlock`/`renderListItem` mutual
  recursion even runs. `markdown.ts#markdownToBlessed()` now (1) caps input at
  `MAX_MARKDOWN_INPUT_CHARS` (200k) before parsing, and (2) wraps the parse+render in a try/catch
  that falls back to plain escaped text on any failure (stack overflow or otherwise), so a
  pathological turn degrades gracefully instead of crashing the whole agent. Regression tests in
  `blxckchat-markdown.test.ts` reproduce the exact 3,000-level nested-list and 500k-char inputs
  that previously required a fatal OOM/stack-overflow to occur. Also added `crash-log.ts` —
  `logCrash()` now runs alongside every top-level error path (`terminal.ts`, `repl-ui.ts`,
  `index.ts`'s `program.parseAsync().catch`) and appends the *full* `err.stack` to
  `~/.jexxxus/crash.log`, since the UI only ever showed `err.message` before, discarding the trace
  needed to diagnose anything unexpected.
- **`add_contact` (July 2026):** creates a brand-new contact, always via a single insert into
  `api.contacts` (BLXCKBOOK) — never writes to `public.vessels` (NXT) directly. The existing
  `trg_sync_contact_to_vessel`/`trg_sync_vessel_to_contact` Postgres triggers (bidirectional,
  `AFTER INSERT OR DELETE OR UPDATE`) already mirror the row between both tables automatically —
  confirmed live: inserting into `api.contacts` produces a matching `public.vessels` row with the
  same `id` within the same transaction, and deleting the contact removes the vessel too. Writing
  to both tables from the CLI would race the trigger and risk exactly the kind of two-rows-for-one-
  person bug already fixed once this session (the manual-merge bug in dxsh.blxckbook.jexxx.us).
  `addContact()` in `mutations.ts` also fuzzy-matches existing contacts first and refuses to create
  a duplicate — same discipline as `connect_contact_back`.

## 6. Child DOX Index

- (None)
