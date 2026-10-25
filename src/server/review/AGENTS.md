# Teacher review, publication and student result

## Overview

The teacher's side of a copy (list, copy screen, free editing, conflicts, retry and relaunch, journal, notice) and its end (validate, publish, withdraw, manual evaluation), plus the only projection a student reads. Services live here; data functions in `src/server/data/review/` and `src/server/data/results/`.

## Key files

| File | Owns |
|---|---|
| `../data/review/record.ts` | The only writer of `teacher_evaluations` and `review_journal_entries` (`writeEvaluation`, which sets `teacher_started_at` via `markTeacherStarted` at the first write; `appendJournal`); `tests/review-writes.test.ts` |
| `../data/review/list.ts`, `list.ts` | `listAssignmentCopies`, `recordListOpened`; opening the list journals "list opened", then sweeps in `after()` without waiting |
| `../data/review/copy.ts`, `copy.ts` | `getCopy`, `getStudentIdentity` (`studentAccount:read`), `recordCopyOpened`, `saveEvaluation` |
| `evaluation.ts` | `saveTeacherEvaluation` (Zod, one message per field) |
| `relaunch.ts` | Retry and relaunch services (`changed` → "replaced" notice above the page) |
| `../data/review/publication.ts`, `publication.ts` | Validate, publish, withdraw, shortcut |
| `../data/review/journal.ts` | `listCopyJournal` (`reviewLog:read`), shown by `history.tsx` on the copy; "replaced" notices by `NoticeArea` (`notice.tsx`) |
| `../data/results/student.ts` | `getPublishedResult`: the only student projection |
| `../results/freshness.ts` | `viewToken` for `FreshnessGuard` |
| `src/lib/review*.ts`, `src/lib/student-result.ts` | Pure logic: grade, "to re-read", differences, list sort and filters, journal labels, closed DTO `toStudentResult` |

## Conventions

- Migrations `0016` to `0020` hold the invariants: journal immutable, evaluation never deleted, origin frozen, revision +1, deferred trigger "no revision without a journal entry"; revision carried exactly by `evaluation_created`/`evaluation_changed` (`0018`); evaluation written only in To review, a validated or published copy has a complete evaluation (`0019`); journal dated by `clock_timestamp()` (`0020`). A submission with an evaluation no longer changes version (`freeze_reviewed_submission`).
- One teacher evaluation per submission, born at the first write.
- List: sort, filters, counters and pages in TypeScript on the whole list (`src/lib/review-list.ts`), state in the URL, `DataTable` in `controlled` mode; `listTeacherAssignments` gives the real counters; `relaunchConditions` is read only for a relaunchable row.
- Retry and relaunch on the copy and in the list (copies of `listRelaunchable`); a refusal shows "A refusal usually repeats" and "Retry anyway", and the list offers no "Retry" for it (`ReviewRow.refused`); an abandoned request shows "Retry not started".
- The form is not remounted for a new revision (`reconcileSaved`). The AI output validator rejects a hint with a line break and texts or joined hints longer than `REVIEW_TEXT_MAX_LENGTH`. System calls are listed in the inventory's `systemCalls`.
- `saveEvaluation`: lock the submission (`lockCopy`), reread proposal and evaluation by a separate query, then guards `replaced` → `not_open` → `conflict`, then `writeEvaluation`. Whole form; `REVIEW_TEXT_MAX_LENGTH` [P] = 4000. "Save mine over it" overwrites after a conflict.
- Validate = save the form then validate in one transaction (`editLocked`, shared with `saveEvaluation`); nature `unchanged`/`changed`/`manual` by content (`validationNature`). Transitions 8, 9 and 10 through `applyTransition`, under `lockCopy`. Editing a validated or published copy sends it back to To review (`sent_back_to_review`, Q8). The validate and publish shortcut is two transactions; the second's failure is injected by `deps.publish` in tests.
- Manual evaluation (`?manual=1`) from a failed (refusal included) or not assessable copy: the first write in `editLocked` is transition 6 or 7, `manual_started` then the `manual` evaluation with its rubric version (`manualRubricFor`, `en-1` for French, Q6), in one transaction. Null levels allowed while editing, required at validation (`levelMissing`).
- Teacher notice `TEACHER_NOTICE` v2 [P] (`src/lib/texts.ts`, hash `tests/teacher-notice.test.ts`), read once (`TeacherNotice`, `acknowledgeTeacherNoticeAction`, `notice_kind` `teacher_review`, notice picked by role in `notices.ts`, matrix row `noticeAcknowledgement`: teacher read and write, own notice only); server guard `acknowledgedNotice(userId, "teacher_review")` in `listAssignmentCopies`, `getCopy` (`"notice_required"`), `saveEvaluation`, the openings, relaunches and `listCopyJournal`.
- Student projection: `getPublishedResult` reads listed columns in one query (`publishedEvaluation:read`), never the proposal, journal or alerts, no class condition; `toStudentResult` returns a closed DTO. `getOwnSubmission` (`src/server/data/submissions/student.ts`) lets the student reread their submission.
- ESLint: no page outside `src/app/teacher/**` and `src/server/**` imports `server/review`, `data/review` or `data/evaluation`; any new reader of `teacherEvaluations` or `reviewJournalEntries` joins `allowed` in `eslint.config.mjs`.
- Texts [P]: `proposalAlertLabels`, `evaluationFailureLabel` (`src/lib/evaluation.ts`), `RESULT_AI_MENTION`, `RESULT_MARKED_BY_TEACHER`, `GRADE_ADJUSTED_NOTICE`, `RESULT_RUBRIC_SUBSTITUTE_NOTICE` (`src/lib/texts.ts`).

- Behaviour fixed on 2026-10-25: withdrawing through an edit journals `unpublished` with cause `change` before `sent_back_to_review` (R2); "Mark as re-read" is disabled outside To review (R3).

## Gotchas

- R1 of the E8.7 review is accepted as a limit [D, 2026-10-25] (plan history in spec 0010).

## Related specs

- [0009 teacher review](../../../docs/specs/0009-teacher-review/index.md) · [0010 validation and publication](../../../docs/specs/0010-validation-publication/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
