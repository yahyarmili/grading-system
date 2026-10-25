# 0002. Data foundation: PostgreSQL, Drizzle and the data access layer

**Date**: 2026-10-12
**Status**: Accepted

## Summary

All data lives in PostgreSQL on Neon, reached through Drizzle and `pg`. Only the data layer (`src/server/data/**`) imports the database client, and it applies the access matrix there. Migrations are generated, reviewed and committed, never pushed. This spec documents shipped work (phase 2.2).

## Requirements

**Acceptance criteria**:
- **AC-1**: Only `src/server/data/**` imports `@/server/db` (ESLint).
- **AC-2**: Every data function takes the `Actor` first, calls `authorize()`, filters ownership with `ownedBy` in the query and returns a minimal DTO; an exception without `Actor` is listed with its reason in `src/server/access/inventory.ts`.
- **AC-3**: Naming: camelCase in TypeScript, snake_case in SQL through Drizzle `casing`; plural tables; `id uuid`; `<entity>_id`; `created_at`, `updated_at` as `timestamptz`; states as `pgEnum`.
- **AC-4**: Integration tests run on `DATABASE_URL_TEST`, reset and migrated before the run.

## Decision

**Chosen option**: Drizzle with `pg` on Neon, one schema file per domain, migrations by `drizzle-kit generate` then `migrate`.

## Feature design

- Client: `src/server/db/client.ts`; schema: `src/server/db/schema/*.ts`; migrations: `drizzle/NNNN_<verb_object>.sql`.
- A committed migration is never edited; `drizzle-kit push` is never used.
- Two clocks: the container and Neon diverge, so a `now()` date is compared in SQL.

## Build plan

Shipped in phases 2.2 and 2.3. Migrations `0000` to `0020` exist today.

## Consequences

**Negative / tradeoffs**:
- Neon in `us-east-2` adds about 175 ms per query from the container: integration tests are slow and run in sequence.

## Rationale

See [rationale.md](rationale.md).
