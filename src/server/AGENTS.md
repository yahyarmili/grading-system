# Server

## Overview

Everything that runs on the server: access control, the data layer, submissions, classes, auth, email, AI and evaluation, review and results. The access matrix is enforced here, in one point, never only in the proxy.

## Architecture rules (spec 0001)

1. Access control of the matrix in one point, in the data layer (SEC-01).
2. Images in a separate table, read by one route only; never a public link, never in lists.
3. AI evaluation, handwriting reading and email each behind one interface with a fault injecting simulator (EXP-04).
4. Batch steps are idempotent and carry identifiers only (PRC-01).
5. The AI request is built in one point, from an allow list (EVL-02).

## Product invariants (`conception/fonctionnalites.md` §5.3)

1. One account, one role; public sign up only creates students; the admin creates teachers.
2. Every submission belongs to an assignment the student received.
3. The grader is the teacher who created the assignment and owns the target classes.
4. Neither the student's identity, nor the assignment level, nor any identifier in the AI input.
5. The AI proposal is immutable; every teacher change is journaled.
6. The final grade may differ from the computed one; the gap is shown to the teacher.
7. Published implies validated; the student never reads an unpublished evaluation nor the raw proposal.
8. The rubric is read only for everyone.
9. A student's name, email and class are visible only to the teacher who owns the class.
10. A removed student comes back only when the teacher readmits them.

## Key files

| File | Owns |
|---|---|
| `access/matrix.ts` | The access matrix as data |
| `access/inventory.ts` | Every table, Server Action, route and data export, plus exceptions without `Actor` with their reason |
| `data/**` | The only importer of `@/server/db` (ESLint); one folder per domain |
| `data/submissions/transitions.ts` | The only writer of `submissions` (`insertReceived`, `applyTransition`) |
| `auth/`, `data/auth/` | Better Auth behind Server Actions |
| `email/` | Email interface, capture in tests, Gmail SMTP in dev |
| `submissions/images.ts`, `data/submissions/drafts.ts` | Image channel: draft pages (upload, read, reorder, delete), confirmation into a submission; every draft write locks the draft row first |
| `submissions/page-image.ts` | The only importer of `sharp` (ESLint, `serverExternalPackages`): decodes, rotates, shrinks and encodes a page again without metadata |
| `data/submissions/pages.ts` | `getPageImage` for the one image route `/api/pages/[pageId]` (404 for anyone not allowed) |

## Conventions

- `authorize(actor, resource, action)` is the only access check; `ownedBy` filters ownership inside the query.
- Each data function takes the `Actor` first, calls `authorize()`, filters with `ownedBy`, returns a minimal DTO.
- A resource of someone else: `null`, as if absent; a role without the right: `AccessDeniedError`; the page answers 404 in both cases.
- A new resource first gets its matrix line; its functions join `REAL` (`tests/access-matrix.int.test.ts`), where the "other" columns give "absent", except `creates`. Every new table, action, route or data export joins `inventory.ts` (`tests/access-inventory.test.ts`).
- Submissions: `tests/submission-writes.test.ts` keeps one writer. Any change to the student notice text bumps `STUDENT_NOTICE.version` (hash in `tests/student-notice.test.ts`). Student notice v4, approved [D, 2026-10-19]: texts sent to Anthropic, United States, kept 30 days, 2 years if flagged. Student notice v5, approved [D, 2026-10-25]: adds the photos of pages; read before the next submission of any mode and before the first page upload (409 `noticeNotRead`).
- Classes: link and code never stored, derived from `invite_nonce` and `BETTER_AUTH_SECRET` (changing it changes every code); expiry `CLASS_INVITE_TTL`; every entry goes through `tryInvite`.
- Auth: Better Auth without its HTTP handler (Server Actions → `auth/` → `data/auth/`); `getActor()`, `requireRole()`, `src/proxy.ts`. One time links stored as a hash, consumed by POST. Sign out reloads the whole page. First admin: `npm run admin:create -- --email … --first-name … --last-name …`.
- Email: captured in tests; Gmail SMTP in dev when `SMTP_USER` and `SMTP_PASSWORD` exist (real emails leave); `EMAIL_TRANSPORT=capture` forces capture.

## Gotchas

- The dev database has one account per role (E1.8).

## Related specs

- [0003 accounts, roles and access](../../docs/specs/0003-accounts-roles-access/index.md) · [0004 classes](../../docs/specs/0004-classes-invitation/index.md) · [0005 assignments](../../docs/specs/0005-assignments-student-space/index.md) · [0006 text submission](../../docs/specs/0006-text-submission/index.md) · [0011 image channel](../../docs/specs/0011-image-channel/index.md)

## Agent skills

- Declined: Agent Skills and MCP servers for `sharp` (2026-10-25)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
