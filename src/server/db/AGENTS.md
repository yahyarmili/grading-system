# Database

## Overview

PostgreSQL on Neon (`us-east-2`) through Drizzle and `pg`. One schema file per domain; invariants that must never break are also enforced by triggers.

## Key files

| File | Owns |
|---|---|
| `client.ts` | The database client (import allowed from `src/server/data/**` only) |
| `schema/*.ts` | One schema file per domain |
| `../../../drizzle/NNNN_*.sql` | Migrations, `0000` to `0023` today |

## Commands

```bash
docker compose exec -T web npm run db:generate -- --name=<verb_object>
docker compose exec -T web npm run db:migrate
```

## Conventions

- Naming: camelCase in TypeScript, snake_case in SQL (Drizzle `casing`, never written by hand); plural tables; `id uuid`; `<entity>_id`; `created_at` and `updated_at` as `timestamptz`; states as `pgEnum`.
- Migrations: generate, reread the SQL (drizzle-kit places a unique constraint after the foreign keys that target it), commit, then `db:migrate` on dev. Never `drizzle-kit push`; a committed migration is never edited.

## Gotchas

- Two clocks: the container and Neon diverge; compare a `now()` date in SQL. To expire a Better Auth session in a test, age it by one day.
- Inside a transaction, a join under `FOR UPDATE` is not reread in READ COMMITTED: take the lock, then reread with a separate query (found in E7.5).

## Related specs

- [0002 data foundation](../../../docs/specs/0002-data-foundation/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
