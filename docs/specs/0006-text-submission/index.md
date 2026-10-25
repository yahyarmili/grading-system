# 0006. Text submission, lateness and replacement (E4)

**Date**: 2026-10-15
**Status**: Accepted

## Summary

A student pastes a text (at most 4000 graphemes) for an assignment, after reading a notice once. Late work is accepted and marked late. The student can replace the submission at most twice, until the teacher's first act. One file writes the `submissions` table, and every state change goes through one transition table. This spec documents shipped work (step E4).

## Requirements

**Acceptance criteria**: the criteria of SUB-02, SUB-04, SUB-05 and NFR-DON-04, passed in E4.6.
- **AC-1**: `src/server/data/submissions/transitions.ts` is the only writer of `submissions` (`insertReceived`, `applyTransition`; `tests/submission-writes.test.ts`).
- **AC-2**: Any change to the student notice text bumps `STUDENT_NOTICE.version` (hash: `tests/student-notice.test.ts`).
- **AC-3**: Every submission belongs to an assignment the student received (invariant 2).

## Decision

**Chosen option**: one active submission per (assignment, student) with archived versions; states and transitions in `src/lib/submission-status.ts` (§5.5 of the design).

## Build plan

Shipped as E4.1 to E4.6.

## Rationale

See [rationale.md](rationale.md).
