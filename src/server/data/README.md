# Data access layer

The only code allowed to import `@/server/db/*` (enforced by `eslint.config.mjs`). Pages, Server Actions and route handlers call these functions, never `db`.

- Each function takes the `Actor` (`@/server/access/actor`) as first argument and implements one line of the access matrix, `conception/fonctionnalites.md` §5.4.
- Ownership is a filter inside the query: another teacher's object is absent, not hidden afterwards.
- A role with no right on the resource gets `AccessDeniedError`. Deny by default.
- Returns minimal DTOs, chosen field by field; never a raw row.
- Each rule comes with negative tests (`*.int.test.ts`, AUTH-04).
- Exception: functions that act on a one-time link or an email request (`confirmEmail`, `resetPassword`, `requestPasswordReset`, `requestEmailVerification`) take no `Actor`. The link proves who acts; the request only sends an email to the owner of the address and answers the same for any email.
