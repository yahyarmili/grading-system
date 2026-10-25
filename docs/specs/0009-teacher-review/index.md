# 0009. Teacher review: list, copy, free editing, journal (E7)

**Date**: 2026-10-21
**Status**: Accepted

## Summary

The teacher sees the copies of an assignment, opens one next to the AI proposal and edits it freely. Every write leaves an immutable journal entry, written in the same transaction by one file. Conflicts between two tabs are detected by version. This spec documents shipped work (step E7).

## Requirements

**Acceptance criteria**: the criteria of REV-01 to REV-04 (except those replayed in E8 and E9, table 8.3), passed in E7.8 and reviewed in E7.9.
- **AC-1**: The AI proposal stays immutable and every teacher change is journaled (invariant 5); `review_journal_entries` is immutable, with a deferred trigger "no write without a journal entry".
- **AC-2**: `src/server/data/review/record.ts` is the only writer (`tests/review-writes.test.ts`).
- **AC-3**: A typed grade may differ from the computed one, and the gap is shown to the teacher (invariant 6).
- **AC-4**: The teacher reads the teacher notice once before reviewing (`acknowledgedNotice(userId, "teacher_review")` guard).

## Decision

**Chosen option**: the teacher evaluation is born at the first write, one per submission; the whole form is saved with a version guard; sort and filters run in TypeScript on the whole list; opening is journaled by `useEffect` plus a Server Action.

## Build plan

Shipped as E7.1 to E7.9.

## Rationale

See [rationale.md](rationale.md).
