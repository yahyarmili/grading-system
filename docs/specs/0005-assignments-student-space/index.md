# 0005. Assignments and the student space (E3)

**Date**: 2026-10-14
**Status**: Accepted

## Summary

A teacher creates assignments for their classes. A student sees the assignments of every class where their membership is active, whatever the send date (derived reception, decided 2026-10-14). Editing locks once work exists. Deadlines use one time zone, `Africa/Casablanca`. This spec documents shipped work (step E3).

## Requirements

**Acceptance criteria**: the criteria of ASG-01 to ASG-03 and SUB-01 in `conception/fonctionnalites.md` §6, passed in E3.5 (some replayed later, table 8.3).
- **AC-1**: Reception is derived from active membership; no per student recipient table.
- **AC-2**: Deadlines convert through `src/lib/time-zone.ts` and display through `formatDate` and `formatDateTime` (`src/lib/dates.ts`), never an `Intl.DateTimeFormat` in UTC.

## Decision

**Chosen option**: derived reception, `content_version` on the assignment, lock and edit arbitrated atomically.

## Build plan

Shipped as E3.1 to E3.5.

## Rationale

See [rationale.md](rationale.md).
