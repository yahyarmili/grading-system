# 0010. Validation, publication and the student result (E8)

**Date**: 2026-10-22
**Status**: Accepted

## Summary

The teacher validates, publishes or withdraws each copy, or evaluates a failed copy by hand. The student only ever sees a published result, through one projection with a closed DTO. Editing a validated or published copy sends it back to review (Q8). This closes the first full cycle in text. This spec documents shipped work (step E8).

## Requirements

**Acceptance criteria**: the criteria of REV-05, REV-06, PUB-01, PUB-02 and NFR-EXP-04, passed in E8.5 and E8.6, reviewed in E8.7.
- **AC-1**: Published implies validated; the student never reads an unpublished evaluation nor the raw proposal (invariant 7).
- **AC-2**: The leak sweep (`tests/helpers/leak.ts`, `tests/student-leak.int.test.ts`, `e2e/student-leak.spec.ts`) is a blocking check; any new student entry point joins `studentReceives` or `studentVisits`.
- **AC-3**: Any new student page that shows a state or a result takes `FreshnessGuard` (`src/components/freshness-guard.tsx`).

## Decision

**Chosen option**: published state in `submissions.status`; validate = save then validate in one transaction, nature by content; the validate and publish shortcut is two transactions; `startManualEvaluation` removed, transition 6 or 7 at the first write.

## Feature design

- `src/server/data/review/publication.ts`, `src/server/review/publication.ts`; migrations `0019`, `0020`.
- Student projection: `getPublishedResult` (`src/server/data/results/student.ts`), DTO `toStudentResult` (`src/lib/student-result.ts`).
- Pages showing a resource by its identifiers are listed in `RESOURCE_PAGES` (`src/lib/route-access.ts`) for a real 404 from the proxy.

## Build plan

Shipped as E8.1 to E8.7.

## Consequences

**Negative / tradeoffs**:
- Limits accepted [D, 2026-10-25] are recorded in `conception/stack-technologique.md` §3 and in the plan history in [rationale.md](rationale.md).

## Rationale

See [rationale.md](rationale.md).
