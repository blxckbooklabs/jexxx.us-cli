# JEXXXUS CLI — Setup & Dependency Guide

## Quick start (public repos only)

```bash
git clone git@github.com:blxckbooklabs/jexxx.us-cli.git
cd jexxx.us-cli
npm install
cp .env.example .env
# Set SUPABASE_URL, SUPABASE_KEY, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
npm run build
jexxxus blxckchat configure
```

## Optional dependencies

### Bible vault (for `jexxxus bible` tool)
If you want local Bible lookups, clone the public vault:
```bash
git clone git@github.com:blxckbooklabs/bible-obsidian.git
export JEXXXUS_BIBLE_VAULT_PATH="$(pwd)/bible-obsidian"
```

Without this env var, the CLI will fall back to web-based queries (if available).

### VEIL articles (for `jexxxus veil-query` tool)
If you want local VEIL article parsing:
```bash
git clone git@github.com:blxckbooklabs/veil.jexxx.us.git
export JEXXXUS_VEIL_REPO_PATH="$(pwd)/veil.jexxx.us"
```

Without this, only public web queries work.

### TradingView charts (for `jexxxus tv-query` tool)
If you want to scrape local TV charts:
```bash
git clone git@github.com:blxckbooklabs/tv.jexxx.us.git
export JEXXXUS_TV_REPO_PATH="$(pwd)/tv.jexxx.us"
```

### Docs RAG (for `jexxxus blxckchat` context)
The CLI auto-fetches `docs.jexxx.us` on first run and caches it locally.
To use a local copy instead:
```bash
git clone git@github.com:blxckbooklabs/docs.jexxx.us.git
export JEXXXUS_DOCS_SOURCE_PATH="$(pwd)/docs.jexxx.us"
```

### Divinities (for LLM persona system — optional)
**Private repo** — only available to authorized users. If you have access:
```bash
git clone git@github.com:blxckbooklabs/jexxx.us-obsidian.git
export JEXXXUS_OBSIDIAN_PERSONAS_PATH="$(pwd)/jexxx.us-obsidian/Divinities"
```

Without this, LLM personas fallback to built-in defaults.

## Environment variables

```bash
# Required
SUPABASE_URL=https://...
SUPABASE_KEY=your-service-role-key

# Optional (paths default to public web APIs if not set)
JEXXXUS_BIBLE_VAULT_PATH=
JEXXXUS_VEIL_REPO_PATH=
JEXXXUS_TV_REPO_PATH=
JEXXXUS_DOCS_SOURCE_PATH=
JEXXXUS_OBSIDIAN_PERSONAS_PATH=

# Operator-only (if you have super-admin elevation)
JEXXXUS_SUPER_ADMIN_CLERK_IDS=user_123,user_456
```

## Architecture

**Public repos (required or recommended):**
- `jexxx.us-cli` — the CLI tool itself
- `bible-obsidian` — (optional) Bible vault for local lookups

**Public repos (optional):**
- `veil.jexxx.us` — (optional) VEIL articles for local parsing
- `tv.jexxx.us` — (optional) TradingView chart sources for local scraping
- `docs.jexxx.us` — (optional) docs RAG source (auto-fetched on first run)

**Private repos (not for end users):**
- `jexxx.us-obsidian` — Operator-only Obsidian vault (Personas, internal content)
- `jexxx.us-api` — Backend service definitions (for deployment, not CLI)
- `jexxx.us-infrastructure` — Infrastructure as code (deployment only)

**Tool calling (source types):**
| Tool | Source | Fallback |
|------|--------|----------|
| `jexxxus bible` | Local vault (env var) | Web API (if available) |
| `jexxxus veil-query` | Local VEIL repo (env var) | Web scrape only |
| `jexxxus tv-query` | Local TradingView repo (env var) | Web scrape only |
| `jexxxus blxckchat` + docs RAG | Local docs repo (env var) | Fetch from web on first run |
| `jexxxus blxckchat` + LLM providers | BYOK (credentials.json) | Web outbound only |
| `account_query` | Supabase (Clerk JWT) | Web API only |

