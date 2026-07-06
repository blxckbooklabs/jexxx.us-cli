# JEXXXUS CLI

> Operator tooling for the **JEXXXUS** ecosystem — bulk contact/vessel import into **BLXCKBOOK** and **NXT.spread** dashboards.

The `jexxxus` command is a headless Node.js CLI for vault operators. It is **not** an end-user feature on TV, VEIL, Law, or Docs surfaces.

**Status**: Closed-source, in active development.

---

## Relevance Across the Empire

| Property            | CLI role                                                                       |
| ------------------- | ------------------------------------------------------------------------------ |
| **BLXCKBOOK**       | Primary consumer (default `--target`) — CSV bulk import into `api.contacts`    |
| **NXT.spread**      | Secondary consumer (`--target nxt`) — CSV bulk import into `public.vessels`    |
| **Docs**            | Public mirror — [docs.jexxx.us/jexxxus-cli](https://docs.jexxx.us/jexxxus-cli) |
| **Obsidian**        | Canonical operator runbook — `jexxx.us-obsidian/CLI/`                          |
| **VEIL / TV / Law** | No runtime dependency                                                          |
| **MAMAbase**        | Writes via operator credentials (`api` or `public` schema based on `--target`) |

---

## Commands

| Command                 | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `jexxxus doctor`        | Verify `.env` credentials + probe target schema(s)     |
| `jexxxus import <file>` | Bulk import CSV contacts/vessels into target dashboard |

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
jexxxus doctor --target nxt
jexxxus import path/to/contacts.csv --user <clerk_user_id>
jexxxus import path/to/contacts.csv --target nxt --user <clerk_user_id>
```

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
