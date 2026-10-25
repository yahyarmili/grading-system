# 0003. Accounts, roles and access (E1)

**Date**: 2026-10-12
**Status**: Accepted

## Summary

Three roles share one app: admin, teacher, student. Better Auth handles passwords and sessions, called from Server Actions only. One time links (confirmation, recovery, teacher invitation) are home made, stored as hashes and consumed by POST. The access matrix is data, checked in one function. This spec documents shipped work (step E1).

## Requirements

**User stories**:
- As a student, I sign up and confirm my email, so that only I use my account.
- As an admin, I create teacher accounts, so that public sign up only ever creates students.

**Acceptance criteria**: the criteria of AUTH-01 to AUTH-05 in `conception/fonctionnalites.md` §6, passed in E1.7.
- **AC-1**: One account, one role; public sign up creates students only (invariant 1).
- **AC-2**: `authorize(actor, resource, action)` is the only access check; a resource of someone else reads as absent (`null`), a role without the right gets `AccessDeniedError`; the page answers 404 in both cases.
- **AC-3**: Every table, Server Action, route and data export is listed in `src/server/access/inventory.ts` (`tests/access-inventory.test.ts`); the matrix is replayed by `tests/access-matrix.int.test.ts` (`REAL`).

## Decision

**Chosen option**: Better Auth for the core, without its HTTP handler; home made single use links.

**Implementation skills**: `better-auth-best-practices`, `better-auth-security-best-practices`, `create-auth`, `email-and-password-best-practices` (`better-auth/skills`, `.claude/skills/`)

## Feature design

- Flow: Server Actions, then `src/server/auth/`, then `src/server/data/auth/`; `getActor()`, `requireRole()`, `src/proxy.ts`.
- Sign out reloads the whole page.
- First admin: `npm run admin:create -- --email … --first-name … --last-name …`.
- Matrix: `src/server/access/matrix.ts`.

## Build plan

Shipped as E1.1 to E1.8 (first deployment on the preview).

## Consequences

**Negative / tradeoffs**:
- To expire a Better Auth session in a test, age it by one day (clock skew between container and Neon).

## Rationale

See [rationale.md](rationale.md).
