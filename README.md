# JEXXXUS CLI

> Operator tooling for the **JEXXXUS** ecosystem — bulk contact import into **BLXCKBOOK** / MAMAbase.

The `jexxxus` command is a headless Node.js CLI for vault operators. It is **not** an end-user feature on TV, VEIL, Law, or Docs surfaces.

---

## Relevance Across the Empire

| Property | CLI role |
|----------|----------|
| **BLXCKBOOK** | Primary consumer — CSV bulk import into `api.contacts` |
| **Docs** | Documented as operator tooling ([docs.jexxx.us](https://docs.jexxx.us) → JEXXXUS CLI page) |
| **VEIL / TV / Law** | No runtime dependency — content and legal surfaces are separate |
| **MAMAbase** | Writes via Supabase service-role key (`api` schema) |

Use cases: migration from spreadsheets, seeding test contacts, one-time vault backfills. All writes require an explicit vault owner via `--user`.

---

## Features

- Styled terminal banner (empire pink gradient)
- CSV parsing with legacy header aliases (`Bio` → `notes`, `Tags` → `tags`)
- Duplicate detection (database constraints)
- `--user` flag for row ownership (RLS bypass requires explicit `user_id`)

---

## Prerequisites

- Node.js 20+
- Supabase **service-role** key (never commit)
- Target table: `api.contacts` on MAMAbase

---

## Installation

```bash
git clone git@github.com:blxckbooklabs/jexxx.us-cli.git
cd jexxx.us-cli
npm install
npm run build
npm link   # optional — global `jexxxus` command
```

### Environment

Copy `.env.example` to `.env` and fill values from managed operator secret storage:

```bash
cp .env.example .env
```

> **Warning**: Operator credentials bypass RLS. Restrict to operator machines only. Never commit `.env`.

---

## Usage

### Import contacts from CSV

```bash
jexxxus import path/to/contacts.csv --user <clerk_user_id>
```

#### CSV headers

| Header | Maps to |
|--------|---------|
| `Name` / `name` | `name` |
| `Notes` / `Bio` / `notes` / `bio` | `notes` |
| `Tags` / `Interests` / `tags` / `interests` | `tags` (comma-separated → array) |

#### Options

| Flag | Description |
|------|-------------|
| `-f, --force` | Skip duplicate rows and import the rest |
| `-u, --user <id>` | Vault owner `user_id` (required for production) |
| `--allow-system-user` | Permit default `SYSTEM` owner (dev/test only) |

```bash
jexxxus import contacts.csv --user user_2abc123 --force
```

---

## Types

Type-only imports from canonical `@blxckbook/shared-types` at `<JEXXXUS root>/packages/shared-types`. Rebuild that package after type changes.

---

## Security

- Never commit `.env`
- Never use service-role keys in browser or public repos
- Always pass `--user` for production imports so RLS-scoped app users can see their rows

---

## Obsidian & DOX

- Local contract: `AGENTS.md`
- Public docs: `jexxx.us-obsidian` → mirrored on docs.jexxx.us

---

## License

ISC