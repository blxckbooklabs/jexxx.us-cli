# Security Policy

JEXXXUS CLI (`jexxxus`) is an **operator control plane**. It is designed for trusted
workstations with privileged credentials. Treat every install as high-trust infrastructure,
not a consumer desktop app.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | ✅ Active |

Security fixes land on `main` in [jexxx.us-cli](https://github.com/blxckbooklabs/jexxx.us-cli).

## Reporting a Vulnerability

**Do not** open public GitHub issues for undisclosed security bugs.

Email **security@jexxx.us** (or your kingdom security contact) with:

- Description and impact
- Reproduction steps (CLI command, tool name, env flags)
- Affected version / commit SHA

We aim to acknowledge within **72 hours** and provide a remediation timeline for confirmed issues.

## Security Model

### Two credential tiers

| Tier | Source | Power |
| ---- | ------ | ----- |
| **Operator** | `.env` — `SUPABASE_URL` + `SUPABASE_KEY` (service role) | Bypasses RLS; `import`, `notify`, `doctor` writes/reads |
| **End-user** | `jexxxus auth login` → Clerk JWT in `~/.jexxxus/credentials.json` | RLS-scoped reads via `SUPABASE_ANON_KEY` + user JWT |

Never commit `.env`. Never paste service-role keys into docs, chat logs, or issue trackers.

### Local secret storage

| Path | Mode | Contents |
| ---- | ---- | -------- |
| `~/.jexxxus/credentials.json` | `0600` | BYOK API keys, auth tokens, provider profiles, `lastUsed` |
| `~/.jexxxus/blxckchat-audit.log` | `0600` | BLXCKCHAT tool audit trail (JSONL) |
| `~/.jexxxus/docs-index.json` | should be `0600` | RAG index over public docs only |

Directory `~/.jexxxus/` is created at mode `0700` where enforced by code.

## BLXCKCHAT Boundaries

### Read-only by design

- **RAG** indexes `docs.jexxx.us` public markdown only — not Obsidian or private vaults.
- **`veil_query` / `tv_query`** — host-locked HTTPS fetches + curated local paths; no stream/embed URLs.
- **`bible_query`** — local Bible vault only (operator-configured path).

### Write tools (confirmation required)

`send_notification`, `import_contacts`, and `run_shell` prompt `y/N` before execution. The model
cannot skip confirmation in the agent loop.

### Shell tool (`--shell`)

- **Off by default.** Registered only when `--shell` is passed.
- Uses `/bin/sh -c` — this is **not a sandbox**. Regex blocklists are defense-in-depth only;
  bypasses via alternate syntax, chaining, or non-listed destructive commands are possible.
- **Do not enable `--shell`** on machines with production operator `.env` unless you accept full
  shell risk on that workstation.

### Super-admin elevation

Cross-user vault reads (`account_query` with `asUserId`) require **both**:

1. Signed-in Clerk user on the JEXXXUS super-admin allowlist
2. `SUPABASE_KEY` (service role) in operator `.env`

Before any public release, remove hardcoded super-admin Clerk IDs from source; configure
`JEXXXUS_SUPER_ADMIN_CLERK_IDS` via environment only.

### BYOK provider URLs

Custom provider `baseUrl` values trigger outbound `fetch()` with the configured API key.
Treat untrusted base URLs as potential SSRF/key-exfiltration targets.

## Operator Responsibilities

- Pass `--user <clerk_user_id>` on production imports; `SYSTEM` is blocked unless `--allow-system-user`.
- Rotate `SUPABASE_KEY` if it ever leaves the operator machine.
- Review `~/.jexxxus/blxckchat-audit.log` — it may contain PII from tool arguments.
- Keep `DIVINITIES_VAULT_PATH` and Bible vault paths operator-local; Divinities personas are not public content.

## Pre–Public Release Checklist

- [ ] Run secret scan (`gitleaks`, `trufflehog`) on full git history
- [ ] Remove hardcoded super-admin Clerk IDs from `src/lib/super-admin.ts`
- [ ] Strip developer-specific default paths from `bible.ts`, `veil.ts`, `tv.ts`, `docs-source.ts`
- [ ] Add Bible vault path-prefix guards (mirror `veil-security.ts`)
- [ ] Correct shell-tool documentation (not a sandbox)
- [ ] Add CI secret scanning on push
- [ ] Confirm `.env` was never committed; rotate service-role key if uncertain

## Related Documentation

- Operator runbook: `jexxx.us-obsidian/CLI/Operator Runbook.md` (private)
- BLXCKCHAT threat model: `jexxx.us-obsidian/JEXXXUS CLI/BLXCKCHAT-Agent.md` (private)
- Public behavior mirror: [docs.jexxx.us/jexxxus-cli](https://docs.jexxx.us/jexxxus-cli)