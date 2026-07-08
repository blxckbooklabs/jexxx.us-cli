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
| **bible.jexxx.us**  | Bible vault read-only — verse/chapter/book/section lookup from local vault     |
| **Docs**            | Public mirror — [docs.jexxx.us/jexxxus-cli](https://docs.jexxx.us/jexxxus-cli) |
| **Obsidian**        | Canonical operator runbook + Bible source — `jexxx.us-obsidian/CLI/`           |
| **VEIL / TV / Law** | No runtime dependency                                                          |
| **MAMAbase**        | Writes via operator credentials (`api` or `public` schema based on `--target`) |

---

## Commands

| Command                 | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `jexxxus doctor`        | Verify `.env` credentials + probe target schema(s)     |
| `jexxxus import <file>` | Bulk import CSV contacts/vessels into target dashboard |
| `jexxxus notify`        | Push a system notification to a user's dashboard bell  |
| `jexxxus bible`         | Query the Obsidian Bible vault (verse/chapter/book)    |

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

# Query by natural format
jexxxus bible query "Genesis 1:1"
jexxxus bible query "John 3 16"
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
