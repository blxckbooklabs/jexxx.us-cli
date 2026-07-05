# JEXXXUS CLI

> Operator tooling for the **JEXXXUS** ecosystem — bulk contact import into **BLXCKBOOK** / MAMAbase.

The `jexxxus` command is a headless Node.js CLI for vault operators. It is **not** an end-user feature on TV, VEIL, Law, or Docs surfaces.

**Status**: Closed-source, in active development.

---

## Relevance Across the Empire

| Property | CLI role |
|----------|----------|
| **BLXCKBOOK** | Primary consumer — CSV bulk import into `api.contacts` |
| **Docs** | Public mirror — [docs.jexxx.us/jexxxus-cli](https://docs.jexxx.us/jexxxus-cli) |
| **Obsidian** | Canonical operator runbook — `jexxx.us-obsidian/CLI/` |
| **VEIL / TV / Law** | No runtime dependency |
| **MAMAbase** | Writes via operator credentials (`api` schema) |

---

## Commands

| Command | Description |
|---------|-------------|
| `jexxxus doctor` | Verify `.env` credentials + read-only `api.contacts` probe |
| `jexxxus import <file>` | Bulk import CSV contacts |

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

```bash
cp .env.example .env
# Fill from managed operator secret storage — never commit .env
```

---

## Usage

```bash
jexxxus doctor
jexxxus import path/to/contacts.csv --user <clerk_user_id>
```

### Import flags

| Flag | Description |
|------|-------------|
| `-f, --force` | Skip duplicate rows and import the rest |
| `-u, --user <id>` | Vault owner `user_id` (required for production) |
| `--allow-system-user` | Permit default `SYSTEM` owner (dev/test only) |

### CSV headers

| Header | Maps to |
|--------|---------|
| `Name` / `name` | `name` |
| `Notes` / `Bio` / `notes` / `bio` | `notes` |
| `Tags` / `Interests` / `tags` / `interests` | `tags` (comma-separated → array) |

---

## Tests

```bash
npm test
```

Covers CSV parsing, duplicate handling (`--force`), and the SYSTEM owner guard.

---

## Types

Type-only imports from canonical `@blxckbook/shared-types` at `<JEXXXUS root>/packages/shared-types`. Rebuild that package after type changes.

---

## Security

- Never commit `.env`
- Never use operator credentials in browser or public repos
- Always pass `--user` for production imports
- Rotate keys if they leave the operator machine — see Obsidian `CLI/Operator Runbook.md`

---

## Obsidian & DOX

- Local contract: `AGENTS.md`
- Vault docs: `jexxx.us-obsidian/CLI/`
- Public docs: `docs.jexxx.us/src/content/jexxxus-cli.md`

---

## License

ISC