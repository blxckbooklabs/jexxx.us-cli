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
  `connect_contact_back` deliberately never offers to merge two _already-existing_ duplicate
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
  - `law_query` instead.
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
- **Dye TUI — keyboard shortcuts (July 2026):** `Ctrl+G` opens `$EDITOR` (VISUAL/EDITOR env) with the current input as draft — returns edited text on save+quit, null on cancel. `Ctrl+Z` suspends the TUI to shell (SIGTSTP). `Ctrl+B` toggles message-scroll focus mode (up/down navigates thinking blocks if they exist, otherwise scrolls messages; pageup/home/end scroll as usual); `Escape` or `Ctrl+B` again exits focus mode, indicated by `▓ FOCUS ▓` on the status bar. `/` at input start triggers the slash command autocomplete popup (`SlashPopup.tsx`, keyboard-only, positioned above input line via absolute layout), filtered by `getCommandSuggestions()` with fuzzy matching; `Enter`/`Tab` applies the selected suggestion, `Escape` dismisses. Alt+b/f word-nav and Alt+d word-delete are handled in `InputView.tsx`. `Ctrl+S` exports the current session to `~/.jexxxus/session-export-<timestamp>.json`. `Ctrl+N` clears the session and starts fresh. `TopBar` displays `BLXCKCHAT │ <model> ▮ LIVE`.
- **InputView keyboard text selection (July 2026):** `Shift+Left/Right` selects character-by-character. `Alt+Shift+Left/Right` selects word-by-word (Option+Shift+arrows on macOS; also catches CSI modifier encoding `\x1b[1;4D`/`\x1b[1;4C`). `Shift+Home`/`Shift+End` selects to start/end of line. `Ctrl+Shift+Left/Right` selects to line start/end (nearest to macOS Cmd+Shift+Left/Right behavior). `Alt+Left`/`Alt+Right` (Option+arrows) just **navigate** by word (clears selection, moves cursor) — does NOT select. Selected text is highlighted with pink inverse. On selection release (200ms debounce after last selection keypress), the selected text auto-copies to clipboard via `copyToClipboard`. Selection-aware operations: `Backspace`/`Delete` removes selection, typing replaces it, `Ctrl+K`/`Ctrl+W`/`Alt+D` operate on selection if active, `Escape` clears selection. `Ctrl+C` with no selection still exits (pass-through). TUI root Box uses `height={termHeight}` (explicit row count) instead of `height="100%"` to guarantee full-terminal layout. `TopBar` has `marginTop={1}` for breathing room. Mouse selection no longer clears immediately after copy — highlight persists until next click. `ToastView` uses ref-wrapped callback to avoid timer reset from inline `onDismiss` reference changes. Hero block (JEXXXUS logo + model/user/tool info + prompt text) is vertically centered via dynamic margin calculation inside `MessageView.tsx:buildRenderLines()` using `termHeight`. Auto-copy on mouse selection requires min 3 chars (`selectedText.length >= 3`) to avoid false positives from accidental clicks.
- **Mouse click-drag text selection (July 2026 fix):** blessed 0.1.81's default `enableMouse()`
  picks legacy UTF-8 mouse mode (`\x1b[?1005h`) for any TERM matching xterm/screen/key_mouse — which
  is most modern terminals (iTerm2, Terminal.app, Warp, Kitty, VS Code). That mode's motion
  (drag) reporting is unreliable on those terminals, so click-drag silently never fired
  `mousemove` — nothing highlighted, nothing copied, only Cmd+A (native OS select-all,
  independent of blessed) worked. `tty.ts#forceSgrMouseMode()` overrides this to SGR mode
  (`\x1b[?1006h`) right after all mouse-enabled components (topBar/messageBox/statusBar/inputBox)
  have registered their first listener in `terminal.ts` — must run there and not earlier, since
  blessed's `Screen._listenMouse()` calls `program.enableMouse()` exactly once, on the _first_
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
  `index.ts`'s `program.parseAsync().catch`) and appends the _full_ `err.stack` to
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
- **Emoji corruption recurred with new emoji (July 2026, second pass):** the VS16-stripping fix
  above only covers base+VS16 pairs — plain emoji that are _already_ wide/emoji-presentation by
  default (🔗 U+1F517, 💎 U+1F48E, no VS16 needed) still corrupt blessed's column tracking the same
  way. `markdown.ts#escapeBlessed()` now strips the emoji Unicode blocks themselves
  (`EMOJI_RANGES`: Misc Symbols & Pictographs, Emoticons, Transport & Map, Supplemental Symbols,
  Dingbats, Regional Indicators/flags, Variation Selectors) rather than just VS16 — this is the
  actual fix, VS16-stripping alone was necessary but not sufficient. Normal accented/non-Latin text
  (café, ünïcode) is unaffected; only emoji ranges are stripped.
- **Terminal title (July 2026):** `index.ts#setTerminalTitle()` writes OSC 2 (`\x1b]2;JEXXXUS\x07`)
  as early as possible (before `Command` construction) so the terminal tab/window reads "JEXXXUS"
  instead of "node" from the moment `jexxxus` is invoked — same technique OpenCode uses. Blessed's
  own `screen({ title: ... })` option in `terminal.ts` sets the title again on TUI entry (blessed
  does this internally regardless), so it must match ("JEXXXUS", not the old "BLXCKCHAT") or it
  would silently revert the title moments after the CLI-level write.
- **Text selection/copy — investigated OpenCode's implementation directly, does not port
  cleanly (July 2026):** OpenCode's TUI is `@opentui/core` + SolidJS
  (`/packages/tui` in their repo) — a fundamentally different, modern terminal rendering engine,
  not blessed (blessed is unmaintained since ~2015). Its `clipboard.ts` uses the same
  OSC-52-alongside-native-copy pattern our `tui-snapshot.ts` already does. The reliability
  difference is the underlying rendering engine's mouse/unicode handling, not a specific trick that
  can be ported into blessed with a small patch — a real fix would mean migrating off blessed
  entirely, which is out of scope for an incremental change. `attach-blessed-text-selection.ts` and
  `text-selection.ts`'s own logic were re-audited and are correct (confirmed the `mouseToTextCell`/
  `applySelectionHighlight`/copy-on-mouseup chain has no logic bugs); the forced SGR mouse mode
  (`tty.ts#forceSgrMouseMode()`) is also confirmed correctly changing the negotiated protocol.
  Whether this is finally reliable depends on the specific terminal emulator's SGR motion-event
  support, which varies. `Ctrl+O` (`copyLastReply()` in `terminal.ts`) copies the full last
  assistant reply and does not depend on mouse events at all — the reliable fallback today.
- **Per-block thinking toggle — fully implemented in messageFocus mode (July 2026):** `Space` in messageFocus mode (Ctrl+B) now toggles the **focused** thinking block via `store.toggleFocusedThinking()` instead of all blocks. Up/Down arrows navigate between thinking blocks via `store.moveFocusedThinking(±1)` when thinking blocks exist (wraps around), otherwise fall back to scroll. The focused block is indicated by a `▸` marker. In normal mode, Space still correctly types a space in InputView. `message-store.ts` added: `getThinkingBlockCount()`, `moveFocusedThinking(delta)`.
- **Cursor jump bug fixed (July 2026):** `InputView.tsx:43-45` — the `useEffect` that ran `setCursorPos(value.length)` on every `value` change was resetting the cursor to end-of-line after typing mid-line following `Alt+Left` word navigation. Changed to clamp-only: `setCursorPos((prev) => Math.min(prev, value.length))`.
- **`Alt+Left/Right` changed to navigation only (July 2026):** After user feedback, `Alt+Left`/`Alt+Right` (Option+arrows on macOS) now call `clearSel()` before moving word-by-word — they do NOT set a selection anchor. Use `Option+Shift+Left/Right` for word selection (already handled by `meta+shift+B`/`meta+shift+F` handlers at `InputView.tsx:183-199`).
- **Hero dynamic vertical centering (July 2026):** `MessageView.tsx` now dynamically centers the hero block based on `termHeight` instead of a fixed 6 blank lines. `buildRenderLines()` receives `termHeight`, calculates `viewHeight = termHeight - 6`, `totalHeroHeight = ROWS + extraLines.length`, and sets `topMargin = Math.max(2, Math.floor((viewHeight - totalHeroHeight) / 2))`. Also removed "JEXXXUS │" prefix from TopBar — header shows just `BLXCKCHAT │ <model>`.
- **Auto-copy minimum length guard (July 2026):** `DyeApp.tsx:191` now requires `selectedText.length >= 3` before auto-copying on mouseup. Prevents "Copied to clipboard" toasts from accidental single-character clicks.
- **Blessed tags leaking during streaming — fixed (July 2026):** `MessageView.tsx` assistant body rendering now always calls `stripTags(block.content)` regardless of `block.isStreaming`. Previously the streaming path skipped `stripTags`, so blessed format tags like `{#525252-fg}`, `{#ec4899-fg}`, `{/}` leaked through as visible text. Also added `normalizeText()` helper that replaces Dye/blessed special Unicode chars (`▌`→`|`, `◇`→`*`, `▶`→`>`, `▼`→`v`, `…`→`...`) in assistant body text only.
- **Pink selection overlay (July 2026):** Patched `node_modules/@sauerapple/dye/build/selection-overlay.js` to use pink background (`SGR 48;2;236;72;153`, JEXXXUS pink `#ec4899`) instead of inverse (`SGR 7`) for the text selection highlight. The `applySelectionOverlay` function now replaces the cell's background color with pink and strips any existing inverse/bg codes. This makes mouse click-drag selection visible as a pink highlight across the entire TUI (message area, input box, etc.). **Now persisted via `patch-package`** — `patches/@sauerapple+dye+0.1.0-alpha.0.patch` + `"postinstall": "patch-package"` in `package.json`. This whole Dye migration (the entire `src/lib/blxckchat/ui/dye/` tree, this patch, the `@sauerapple/dye` dependency) had never been committed until this pass — it was sitting entirely in the working tree, one `git clean`/`rm -rf` away from being lost.
- **Hero screen no longer hugs the top (July 2026 fix):** the idle hero (ASCII logo + subtitle) used to be built as blank leading lines mixed into `MessageView.tsx`'s scrollable render-line array, with `topMargin` hand-computed from a *guessed* `termHeight - 6` — but the actual available height is whatever the parent's real `flexGrow={1}` Box resolves to at render time (DyeApp.tsx wraps `MessageView` in one), which the guess never matched, so the hero always sat too close to the top regardless of terminal size. Fixed by giving the hero its own path: `MessageView.tsx`'s `HeroCentered` component renders in a dedicated `Box flexGrow={1} justifyContent="center" alignItems="center"` — real Yoga flexbox centering, using the real available space, no arithmetic. Only reachable when `store.blocks` is exactly `[heroBlock]` (i.e. before the first user message — `message-store.ts#appendUser` always calls `dismissHero()` first, so hero can never coexist with other blocks); the old per-turn `buildRenderLines()` hero case is now unreachable dead code, kept only as a `break` for exhaustiveness.
- **Overlay/modal centering was broken everywhere (July 2026 fix):** `ConfirmModal.tsx`, `PickerOverlay.tsx`, `PromptOverlay.tsx`, `DeviceLoginOverlay.tsx`, and `HotkeysOverlay.tsx` all used `position="absolute" top="50%" left="50%"` to "center" the panel. Confirmed directly in `node_modules/@sauerapple/dye/build/styles.js`: percentage `top`/`left` resolve via Yoga's `setPositionPercent()` — a literal offset of that edge from the parent's edge, with **no** auto-subtraction of the panel's own size (no CSS `transform: translate(-50%,-50%)` equivalent exists in Dye/Yoga). So every modal's top-left corner sat at the screen's midpoint, pushing the whole panel into the bottom-right quadrant — exactly what the "picker offset toward the edge" screenshot showed. Fixed with a new shared `OverlayCenter.tsx`: a full-screen `position="absolute" top={0} left={0} width="100%" height="100%"` Box with `justifyContent="center" alignItems="center"`, wrapping each panel (now a plain non-positioned child, still using percent `width`/fixed `height` — those are fine, only `top`/`left` percent centering was broken). Apply this wrapper to any new centered overlay — do not reach for `top="50%" left="50%"` again.
- **Picker/slash-popup selection highlight looked "dispersed" (July 2026 fix):** `PickerOverlay.tsx` and `SlashPopup.tsx` row `Box`es had `backgroundColor={isSel ? THEME.pink : undefined}` but no explicit `width` — Ink/Dye only fills the background across a Box's own resolved width, which without `flexGrow`/`width="100%"` shrinks to the row's intrinsic text content width, not the panel's full width. Selected rows highlighted only under their own text, leaving a "broken up" pink patch instead of one clean full-width bar. Fixed by adding `width="100%"` to each row `Box`. Also gave `PickerOverlay`'s outer panel an explicit `backgroundColor={THEME.bgElevated}` (previously unset, letting whatever was behind it bleed through row-by-row — the black/gray "striping" in the screenshot) — same pattern `SlashPopup` already used correctly.
- **Hero subtitle info (model/user/tool count, "type a message", /help, ? hotkeys) looked
  right-aligned, not centered (July 2026 fix):** in `HeroCentered` (`MessageView.tsx`), the ASCII
  logo rows and the subtitle lines were both plain `<Text>` children of one Box with
  `alignItems="center"`. The multi-segment logo rows happened to center correctly; the
  single-string subtitle lines did not — Ink/Dye's bare `Text` nodes don't reliably shrink-wrap to
  their own content width inside a column flex container the way `alignItems="center"` assumes, so
  centering had no visible effect on them specifically. Fixed by wrapping *every* line (logo rows
  and subtitle lines alike) in its own `<Box width="100%" justifyContent="center">` — this
  guarantees each row is definitely full-width and definitely centers its `Text` child via
  `justifyContent` on a row-direction Box, sidestepping any ambiguity in how Ink measures bare Text
  width. Don't go back to relying on a parent's `alignItems="center"` alone for centering `Text`
  children in this codebase — wrap each line explicitly.
- **Option/Alt+Shift+Left/Right word-select did nothing (July 2026 fix):** `InputView.tsx`'s
  word-selection handler checked `key.meta && key.shift && input === "B"` / `"F"` — but a real
  arrow-key press (confirmed directly in
  `node_modules/@sauerapple/dye/build/parse-keypress.js`'s `fnKeyRe` branch and
  `hooks/use-input.js`'s `leftArrow: keypress.name === 'left'` mapping) comes through as
  `key.leftArrow`/`key.rightArrow` booleans with `key.meta`/`key.shift` set from the terminal's CSI
  modifier byte — never as `input === "B"/"F"` (that only matches a literal Option+Shift+B/F
  *letter* keypress, an unrelated shortcut). The condition could never fire for an actual arrow-key
  press. Fixed to check `key.meta && key.shift && key.leftArrow` / `key.rightArrow`, mirroring the
  already-correct plain-`Shift+Arrow` single-char-select clause a few lines above it.
- **Click-drag text selection never visually highlighted, even though copy-to-clipboard worked
  (July 2026 fix) — root cause was in `@sauerapple/dye` itself, not app code:** traced through
  Dye's actual render pipeline (`renderer.js`, `output.js`, `ink.js`) and found a real architecture
  bug. `Output.get()` builds TWO parallel representations of the same frame in one pass: a plain 2D
  character grid (which the returned `output` STRING — what actually gets written to the terminal
  — is serialized from) and a separately-packed `Screen` buffer (interned charId/styleId cells,
  used by `SelectionManager`/`applySelectionOverlay` for selection tracking and the pink-highlight
  patch). `ink.js#doRender()` calls `applySelectionOverlay(screen, sel)` to mutate the `Screen`
  buffer pink — but this happens *after* `output.get()` already returned the finalized `output`
  string for that frame, built from the OTHER (unmutated) representation. The mutation has zero
  effect on what's written to the terminal that frame, or any frame, ever — `screen.stylePool
  .resolve()`/`getCellCharId()` reads (used by `getSelectedText()` for copy/clipboard) still see
  the correct mutated cell content, which is exactly why copy-to-clipboard + the toast always
  worked while the visual highlight silently never rendered. Confirmed via a direct unit-level
  test (construct a `Screen`, call `applySelectionOverlay`, serialize before/after) that no pink
  SGR code (`48;2;236;72;153`) ever reached the pre-existing string-generation path.
  **Fix:** added `node_modules/@sauerapple/dye/build/screen-to-styled-string.js` — a proper
  styled-string serializer using `StylePool.transition(fromId, toId)` (the pool's own cached
  style-transition escape generator, same one used internally by the rest of Dye) to walk the
  mutated `Screen` buffer row/cell by row/cell and emit a correctly-styled ANSI string, skipping
  `CellWidth.SpacerTail` cells for wide characters. Patched `ink.js#doRender()` to call this
  function and reassign `output`/`outputHeight` whenever `applySelectionOverlay` reports a mutation
  (`output`'s destructure changed `const` → `let` to allow this). Verified functionally, not just
  architecturally: constructed a real `Screen`+selection, confirmed the serialized string contains
  no pink code before the overlay and does contain `48;2;236;72;153` wrapping exactly the selected
  range after — both before AND after a full `patch-package` reinstall cycle (fresh install →
  `npm run postinstall` → re-verify). **Patch-package gotcha:** the patch file must be generated via
  `git diff --no-color` (commit pristine → overwrite with patched → diff), not a raw `diff -ruN` —
  patch-package uses its own internal patch parser/applier (`applyPatches.js`'s `executeEffects`,
  not `git apply`/native `patch`), which is strict about matching `git diff`'s exact header/hunk
  format; a manually-built `diff -ruN`-style patch applies fine via plain `git apply` but is
  silently rejected by patch-package's own applier.
- **Click-drag copy fired mid-drag instead of on release (July 2026 fix, same investigation as
  above):** the original auto-copy effect (`DyeApp.tsx`) used a 200ms "no selection change" timer
  as a mouseup proxy — it fired whenever the user paused dragging for a beat, well before actually
  releasing the mouse, showing the "Copied to clipboard" toast mid-selection. Root cause: Dye's
  `SelectionManager.handleMouseRelease()` (`selection-manager.js`) only ever set a private
  `dragging` field to `false` — it never called `notify()`, and `dragging` was never part of the
  snapshot `useSelection()` exposes, so there was **no way** for app code to observe "mouse
  released" at all; a timer was the only option available. Patched `selection-manager.js` to
  include `dragging` in the snapshot (`refreshSnapshot()`) and to call `refreshSnapshot()` +
  `notify()` from `handleMouseRelease()` too; patched `hooks/use-selection.js` (+ both packages'
  `.d.ts` files) to expose `dragging` from the hook. `DyeApp.tsx`'s effect now fires copy+toast
  exactly on the `dragging: true → false` transition (tracked via a ref), not a timer. Verified via
  a direct `SelectionManager` press/drag/release sequence: `dragging` correctly transitions
  true→true→false and each step notifies subscribers — confirmed both before and after a full
  `patch-package` reinstall cycle.
- **Input box: clicking or arrowing showed a pink block unrelated to the actual cursor position, and
  "click 11 places past 5 typed characters" was possible (July 2026 fix):** `InputView.tsx` has no
  mouse handling of its own — Dye's *global* `SelectionManager` (the same one wired via
  `<AlternateScreen mouseTracking>` in `DyeApp.tsx`) intercepts every click/drag on screen,
  including over the input box, and paints its own pink cell-selection overlay at the raw clicked
  screen coordinate — entirely independent of `InputView`'s own `cursorPos`/`selectionAnchor`
  React state. Confirmed this couldn't be `InputView`'s own rendering: when `value.length === 0`
  (the reported screenshot's case), the render path is `isPlaceholder ? <Text>{placeholder}</Text>
  : ...` — plain text, no cursor block possible in that branch at all. Fixed two ways: (1) added
  `onClick` (Dye's `Box` supports it, giving `event.localCol` relative to the component) to map the
  click to a real text index — accounting for the 1-cell border + `paddingLeft={1}` — and set
  `cursorPos` there, clamped to `[0, value.length]`; (2) routed every existing `clearSel()` call
  site (arrow keys, home/end, escape, submit) through Dye's own `clearSelection()` too (via
  `useSelection()`), so a stale click-selection from earlier doesn't keep rendering its own pink
  block even after the user moves the cursor with the keyboard. A prior pass (by a different model,
  commit `2320de1`) had diagnosed this as a `displayText.length` vs `value.length` cursor-clamping
  bug in `InputView.tsx`'s own render — that fix was harmless but didn't touch the actual cause
  (Dye's global overlay), since the affected render branch is unreachable when the box is empty.
- **`list_notifications` now flags `alreadyConnected` (July 2026):** a "someone added you"
  notification persists in `contact_notifications` forever — nothing marks it resolved once
  `connect_contact_back` runs (from the CLI, the web dashboard, or a prior session). Without a
  check, the same notification would surface as actionable indefinitely, and the agent would offer
  to reconnect a contact that's already linked (confirmed live: this happened with Luna Verde).
  `listNotifications()` in `connections.ts` now cross-references each notification's
  `actor_user_id` against the signed-in user's existing `linked_ecosystem_id` contacts and computes
  `alreadyConnected` per row (not stored — computed fresh on every call, since it can change
  between calls). The tool's own formatted output surfaces "[already connected — do not offer to
  reconnect]" directly so the model doesn't need to reason about it or make an extra tool call.

## 6. Child DOX Index

- (None)
- **Picker overlay navigation + highlight (July 2026 fix):** The Dye-based picker had two bugs. (1) Arrow keys clamped to the full unfiltered item list — after filtering to e.g. "Ollama", up from index 0 stopped instead of wrapping to the bottom. Fixed by wrapping against `pickerItemsFiltered(state).length` (same behavior as slash suggestions). (2) `selectedIndex` was an index into the full unfiltered list, but the render loop compared it against positions in the filtered list — no item ever matched `isSel`, so no pink highlight appeared after filtering. Fixed with identity-based lookup: `PickerOverlay.tsx` resolves `filtered[selectedIndex]?.id` and compares by `item.id`. Applies to provider, model, divinity, and auth pickers.
- **Prompt overlay paste broken on macOS (July 2026 fix):** On macOS, terminal emulators intercept Cmd+V at the OS level — blessed never receives the `"key C-v"` event, so `pasteFromClipboard()` (which reads clipboard via pbpaste) was never triggered. Additionally, blessed 0.1.81 doesn't handle bracketed paste mode (`\x1b[?2004h`), which modern terminals enable by default — pasted text wrapped in `\x1b[200~...\x1b[201~` markers could lose characters. Fixed `prompt-overlay.ts` in three ways: (1) disable bracketed paste mode (`\x1b[?2004l`) when the overlay opens and re-enable it on close, so raw characters arrive cleanly; (2) add a `pasteInFlight` dedup flag so that both `"keypress"` and `"key C-v"` paths don't double-paste; (3) add Shift+P as a fallback paste trigger in secret mode — since the user can't see what they're typing, the "P" key reads clipboard via pbpaste and inserts the full text at once. The same fix was also applied to the Dye-based `DyeApp.tsx` prompt handler and `PromptOverlay.tsx` hint text. The footer now shows "⌘V or ⇧P paste" in secret mode.
