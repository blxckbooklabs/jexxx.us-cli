# JEXXXUS CLI

> Operator control plane for the **JEXXXUS** ecosystem—dashboard automation, Bible lookups, and the native **BLXCKCHAT** AI agent (BYOK).

The `jexxxus` command is a headless Node.js CLI for vault operators. It is **not** an end-user feature on TV, VEIL, Law, or Docs surfaces. End-user encrypted chat lives at **BLXCKCHAT** (`blxckchat.jexxx.us`)—a separate product.

**Status**: Private repository today; **open-source readiness** work in progress (July 2026: BLXCKCHAT beta with kingdom/garden multi-surface synthesis). See [SECURITY.md](./SECURITY.md) before distributing binaries or making the repo public.

---

## Relevance Across the Kingdom

| Property            | CLI role                                                                       |
| ------------------- | ------------------------------------------------------------------------------ |
| **BLXCKBOOK**       | Primary consumer (default `--target`)—CSV bulk import into `api.contacts`    |
| **NXT.spread**      | Secondary consumer (`--target nxt`)—CSV bulk import into `public.vessels`    |
| **bible.jexxx.us**  | Bible vault read-only—verse/chapter/book/section lookup from local vault     |
| **BLXCKCHAT**       | Native agent layer (BYOK)—separate from blxckchat.jexxx.us's web chat stack  |
| **VEIL**            | Read-only via BLXCKCHAT `veil_query`—public articles on veil.jexxx.us only   |
| **JEXXXUS \| TV**   | Read-only via BLXCKCHAT `tv_query`—public watch catalog on tv.jexxx.us only |
| **Docs**            | Public mirror + RAG source for BLXCKCHAT—[docs.jexxx.us/jexxxus-cli](https://docs.jexxx.us/jexxxus-cli) |
| **Obsidian**        | Canonical operator runbook + Bible/Divinities sources—`jexxx.us-obsidian/CLI/` |
| **Law**             | No runtime dependency                                                          |
| **MAMAbase**        | Writes via operator credentials (`api` or `public` schema based on `--target`) |

---

## Commands

| Command                 | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `jexxxus`               | **Default.** Opens BLXCKCHAT—the native AI agent (BYOK)—directly. No subcommand needed. |
| `jexxxus blxckchat`     | Same as bare `jexxxus`—explicit name for scripts/muscle memory |
| `jexxxus shell`         | Print this command list without entering the agent (non-interactive/scripting) |
| `jexxxus doctor`        | Verify `.env` credentials + probe target schema(s)     |
| `jexxxus import <file>` | Bulk import CSV contacts/vessels into target dashboard |
| `jexxxus notify`        | Push a system notification to a user's dashboard bell  |
| `jexxxus auth`          | End-user device login via secure.jexxx.us              |
| `jexxxus bible`         | Query the Obsidian Bible vault (verse/chapter/book)    |

---

## Installation

```bash
git clone git@github.com:blxckbooklabs/jexxx.us-cli.git
cd jexxx.us-cli
npm install
npm run build
npm link   # optional—global `jexxxus` command
```

### Environment

```bash
cp .env.example .env
# Fill from managed operator secret storage—never commit .env

# Optional: Set Bible vault path (defaults to local checkout path)
# export BIBLE_VAULT_PATH="/path/to/obsidian-bible"
```

**Bible Vault Setup:** The `jexxxus bible` commands require local access to the `obsidian-bible` vault. Clone it from `git@github.com:blxckbooklabs/bible-obsidian.git` or set `BIBLE_VAULT_PATH` to an existing checkout.

---

## Usage

### Dashboard Management

```bash
jexxxus doctor
jexxxus doctor --target nxt
jexxxus import path/to/contacts.csv --user <clerk_user_id>
jexxxus import path/to/contacts.csv --target nxt --user <clerk_user_id>
jexxxus notify -u <clerk_user_id> -m "Your tier unlocked!" -y success
```

### End-User Auth (secure.jexxx.us)

```bash
jexxxus auth login      # device flow—browser consent + local credential store
jexxxus auth status
jexxxus auth refresh
jexxxus auth logout
```

Additive to operator `.env` credentials—does not replace service-role access for batch imports.

### Bible Lookup

```bash
# List all major sections
jexxxus bible section

# List books in a section
jexxxus bible book 01-Torah

# List chapters in a book
jexxxus bible chapter 01-Torah 01-Genesis

# Get a specific verse
jexxxus bible verse Genesis 1 1

# Query by natural format (numbered books supported)
jexxxus bible query "Genesis 1:1"
jexxxus bible query "1 Samuel 2:1"
```

### BLXCKCHAT—Native AI Agent (default entry point)

BLXCKCHAT is a bring-your-own-key AI agent scoped specifically to the JEXXXUS ecosystem—Bible
lookups, public VEIL and **JEXXXUS | TV** catalog reads, dashboard diagnostics, notifications, and
contact imports. It is **not** a general coding agent; it does not read/write arbitrary files or
browse the open web. Supports 20+ BYOK gateways (Anthropic, OpenAI, OpenRouter, Gemini, Groq, Ollama, OpenCode Zen, and more—see `src/lib/blxckchat/providers/catalog.ts`).

Bare `jexxxus` (no subcommand) launches BLXCKCHAT directly—`jexxxus blxckchat` is kept as an
explicit alias. All flags below work identically on either form. Other subcommands (`doctor`,
`import`, `notify`, `auth`, `bible`) still route to their own non-agent behavior as before; only an
unrecognized first token (or none) falls through to the agent.

```bash
# One-time setup—pick a provider, model, and (for hosted providers) an API key
jexxxus blxckchat configure

# See what's configured (API keys are always redacted)
jexxxus blxckchat configure --list

# One-shot prompt (stateless between invocations)—works bare or via blxckchat
jexxxus "What does Genesis 1:1 say?"
jexxxus blxckchat "What does Genesis 1:1 say?"

# Interactive terminal UI (conversation persists within session)—same either way
jexxxus
jexxxus blxckchat

# Resume last autosaved session
jexxxus --resume

# Use a specific named provider config for this invocation
jexxxus --provider my-ollama-config "check doctor status"

# Opt in to shell access for this session (OFF by default)
jexxxus --shell

# Print the command list without opening the agent (scripting/non-interactive)
jexxxus shell
```

**Slash commands (interactive):** `/auth` (secure.jexxx.us login—same as `jexxxus auth login`), `/divinities`, `/chrome`, `/copy`, `/reset`, `/exit`.

**Transmit editor:** Google Docs–style navigation in the transmit box — Option+←/→ by word; Cmd+←/→ to line start/end; Shift extends selection (character, word, or line edge); double-click selects a word; pink inverse highlights selection.

**Copy for debugging:** `/chrome` or `Ctrl+Shift+Y` copies plain-text chrome (model, auth, tool count, hero hints, status bar) to clipboard and `~/.jexxxus/chrome-digest.txt`. `Ctrl+Y` copies chrome + full visual snapshot.

**Providers:** Pi/OpenCode-style catalog (`jexxxus blxckchat configure` or `/provider` in the TUI). Ollama and llama.cpp need no API key when pointed at a local server. Credentials are stored in `~/.jexxxus/credentials.json` (mode `0600`, never committed). Startup profile: pinned default (setup **y**) or last-used model from the previous session—see `resolveStartupProvider` in `config.ts`.

**Signed-in vault reads:** After `jexxxus auth login`, BLXCKCHAT can query your own BLXCKBOOK, NXT, and private TV playlists via `account_query` (RLS-scoped; requires `SUPABASE_ANON_KEY` in `.env`). Cross-user reads require JEXXXUS super-admin credentials plus service-role key—see [SECURITY.md](./SECURITY.md).

**Tools available to BLXCKCHAT:**

| Tool | Mode | Notes |
| --- | --- | --- |
| `bible_query` | read-only | Wraps `jexxxus bible` lookups |
| `veil_query` | read-only | Public VEIL articles on veil.jexxx.us |
| `tv_query` | read-only | Public **JEXXXUS \| TV** catalog on tv.jexxx.us (no stream URLs) |
| `run_doctor` | read-only | Wraps `jexxxus doctor` |
| `send_notification` | write, confirm | Wraps `jexxxus notify`—prompts for confirmation |
| `import_contacts` | write, confirm | Wraps `jexxxus import`—prompts for confirmation |
| `account_query` | read-only (RLS) | Signed-in user's vault, NXT, and TV playlists; super-admin `asUserId` optional |
| `run_shell` | write, confirm, **opt-in via `--shell`** | Off by default; regex blocklist (not a sandbox—see SECURITY.md) |

**Kingdom/Garden synthesis:** For thematic asks (confession, named series, church-girl beats), BLXCKCHAT combines scripture, VEIL articles, and TV watch recommendations in one reply. Short follow-ups inherit recent conversation context.

**Safety model:**
- Every write or shell tool call requires interactive `y/n` confirmation before it runs—the model
  cannot bypass this in the agent loop.
- `run_shell` only exists when `--shell` is passed. A regex blocklist rejects common destructive
  patterns (`rm -rf`, `DROP TABLE`, `git push --force`, `sudo`, curl-pipe-to-shell, etc.) before
  confirmation—but shell runs via `/bin/sh -c`, so this is **defense-in-depth, not a sandbox**.
  Do not enable `--shell` on machines with production operator credentials unless you accept that risk.
- Every BLXCKCHAT tool call (executed, declined, or blocked) is appended to
  `~/.jexxxus/blxckchat-audit.log` (JSONL, mode `0600`). Direct CLI `import`/`notify` are not yet
  mirrored to that log.

**Context (RAG):** BLXCKCHAT primes each conversation with the most relevant sections of
[docs.jexxx.us](https://docs.jexxx.us) content, built into a local lexical (BM25) index on first
run and cached at `~/.jexxxus/docs-index.json`. This index is built **exclusively** from
`docs.jexxx.us` public content—the Obsidian vault is never included by default, and there is
currently no supported path to include it. Divinities persona files are operator-local and are not
merged into the RAG index. See `jexxx.us-obsidian/JEXXXUS CLI/` for the full security rationale.

### Import flags

| Flag                       | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `-t, --target <dashboard>` | Target dashboard: `blxckbook` (default) or `nxt` |
| `-f, --force`              | Skip duplicate rows and import the rest          |
| `-u, --user <id>`          | Vault owner `user_id` (required for production)  |
| `--allow-system-user`      | Permit default `SYSTEM` owner (dev/test only)    |

### CSV headers

| Header                                      | Maps to                          |
| ------------------------------------------- | -------------------------------- |
| `Name` / `name`                             | `name`                           |
| `Notes` / `Bio` / `notes` / `bio`           | `notes`                          |
| `Tags` / `Interests` / `tags` / `interests` | `tags` (comma-separated → array) |

---

## Tests

```bash
npm test
```

42 automated test suites—CSV import, auth, BLXCKCHAT agent loop, kingdom/garden routing, URL/prose sanitization, VEIL/TV public-read security boundaries, and terminal UI session behavior.

---

## Types

Type-only imports from canonical `@blxckbook/shared-types` at `<JEXXXUS root>/packages/shared-types`. Rebuild that package after type changes.

---

## Security

Full policy: **[SECURITY.md](./SECURITY.md)** (reporting, threat model, pre-public checklist).

- Never commit `.env` or paste service-role keys into issues/docs
- Operator credentials bypass RLS—workstation trust boundary only
- Always pass `--user` for production imports; `SYSTEM` blocked unless `--allow-system-user`
- Rotate `SUPABASE_KEY` if it leaves the operator machine—see Obsidian `CLI/Operator Runbook.md`
- BLXCKCHAT RAG: `docs.jexxx.us` only—Obsidian vault excluded by design
- `veil_query` / `tv_query`: public catalog metadata only—no stream URLs or admin surfaces
- Before open-sourcing: remove hardcoded super-admin Clerk IDs, strip dev-machine default paths,
  add Bible path-prefix guards, run `gitleaks` on git history

---

## Obsidian & DOX

- Local contract: `AGENTS.md`
- Vault docs: `jexxx.us-obsidian/CLI/` and `jexxx.us-obsidian/JEXXXUS CLI/`
- Progress report: `jexxx.us-obsidian/JEXXXUS CLI/CLI-Capabilities-Progress-Report.md`
- Public docs: `docs.jexxx.us/src/content/jexxxus-cli.md`

---

## License

ISC