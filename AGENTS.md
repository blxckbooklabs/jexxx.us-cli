# DOX framework - jexxx.us-cli

## 1. Purpose

Native headless CLI agent (`jexxxus`) for the JEXXXUS ecosystem — bulk
import/automation against MAMAbase (Supabase).

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
- Writes target **`api.contacts`** (`db.schema: 'api'`) with columns `name`,
  `notes`, `tags`, `user_id`. Legacy CSV headers (Bio/Tags) map to `notes`/`tags`.
  Do not write to deprecated `public.vessels`.

## 4. Work Guidance

- Refer to the root `AGENTS.md` for brand spelling (`JEXXXUS`, `wing6`,
  `BLXCKBOOK`) and conventions.

## 5. Verification

- `npx tsc --noEmit` must pass, and `dist/index.js` must contain no
  `@blxckbook/shared-types` import after build.
- `npm test` must pass (CSV parsing, duplicate handling, SYSTEM guard).
- `jexxxus doctor` must perform read-only connectivity checks only.
- Vault operator docs live in `jexxx.us-obsidian/CLI/`; public mirror in
  `docs.jexxx.us/src/content/jexxxus-cli.md`. Keep both aligned.

## 6. Child DOX Index

- (None)
