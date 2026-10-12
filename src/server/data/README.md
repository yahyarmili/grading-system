# Data access layer

The only code allowed to import `@/server/db/*` (enforced by `eslint.config.mjs`). Pages, Server Actions and route handlers call these functions, never `db`.

- Each function takes the `Actor` (`@/server/access/actor`) as first argument and first calls `authorize(actor, "<resource>", "<action>")` (`@/server/access/policy`): the single access check, which reads the matrix of `conception/fonctionnalites.md` §5.4 declared as data in `@/server/access/matrix`.
- A role with no right on the resource gets `AccessDeniedError`. Deny by default.
- A grant of scope `"own"` must be applied in the query with `ownedBy(grant, …)` (`./access.ts`): another person's resource is absent, the same answer as a missing one (AUTH-04 R3).
- Returns minimal DTOs, chosen field by field; never a raw row.
- A new table, server action, route handler or exported function gets its entry in `@/server/access/inventory.ts`; a new resource gets its row in the matrix first. `tests/access-inventory.test.ts` fails otherwise.
- Every cell of the matrix is replayed by `tests/access-matrix.int.test.ts`: on a test-only resource, and on the real data functions of each authorized resource (add them to `REAL` there).
- Exceptions, listed with their reason in `UNGUARDED_DATA_EXPORTS` (inventory.ts): functions that act on a one-time link or an email request take no `Actor` (the link proves who acts; the request only emails the owner of the address and answers the same for any email); `registerStudent` is the public sign-up; `createFirstAdmin` is called by the local script only; the rest are internal helpers.
