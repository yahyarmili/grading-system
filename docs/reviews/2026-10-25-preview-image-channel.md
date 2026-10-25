# Review, preview (image channel, E9 first part), 2026-10-25

**Reviewed by**: Sonnet 5.5 (author on Opus 5.5)
**Scope**: 60 files, range 17663fa^..067345e (spec, Reader port, trial, data model, one page thread)
**Verdict**: Changes requested

## Summary
This slice adds the Reader port and its Anthropic and simulator implementations, the handwriting trial, the image data model with protective triggers, the upload and image routes, and a first student screen that uploads, reads and confirms pages without word changes. The design is careful: access goes through `authorize` and `ownedBy`, the AI request is built in one place from the page bytes alone, and the triggers match the spec. The main gaps are missing tests that the project conventions require for new resources, and a few small races and cost leaks in the read path.

## Major
### 🟠 Required matrix and word module tests are missing, `tests/access-matrix.int.test.ts`
**Problem**: AGENTS.md says a new resource joins `REAL` in `tests/access-matrix.int.test.ts` and the leak sweeps. The diff adds the `draft` row, a changed `transcription` row, `getPageImage`, `addDraftPage`, `readDraftPage`, `confirmImages`, but touches neither the matrix test nor the leak tests. `src/lib/transcription.ts` (word split, `assembleText`, `applyWordChanges`) has no unit test at all. The triggers of 0022 have no test either.
**Why it matters**: these are the access control, the text sent to grading and the immutability guarantees; all branching and security relevant. A wrong `word_index` or a trigger that is too loose would not be noticed.
**Suggested fix**: add the `REAL` entries (other student, other teacher, admin give absent or denied), a unit test for `lib/transcription.ts` (punctuation, `[illisible]`, pages without writing, order), and integration cases for the 0022 triggers (attach once, no change after attach, runs immutable). Fine to do in the planned `/test` step, but it should land before merge.

### 🟠 Read result can bill twice on a stale status check, `src/server/data/submissions/drafts.ts:177`
**Problem**: `page.status` is read before `pg_try_advisory_xact_lock`. If another read of the same page commits between the select and the lock, the second request gets the lock with a stale `pending` status and calls the AI again. Its write is then dropped (status no longer pending or failed) but the paid call and run already happened.
**Why it matters**: the spec promises one billed call for a double tap. The window is small but real with two tabs.
**Suggested fix**: read the page status after the lock is taken (or re-select under the lock).

## Minor
### 🟡 Sharp decoding happens before authorization, `src/server/submissions/images.ts:67`
The route only rejects visitors. A logged in teacher, admin, or student with no right to the assignment still makes the server decode a body of up to 3 MB with sharp before `addDraftPage` answers 404. Run the cheap role and assignment checks first, or at least `authorize(actor, "draft", "write")` before `preparePage`.

### 🟡 Reads are not capped or counted yet, `src/config/provisional.ts:332`, `src/server/data/evaluation/system.ts:459`
`DRAFT_READS_MAX` and `STUDENT_DAILY_READS_MAX` are defined but unused. With the Anthropic provider, a student can upload, retake and read in a loop without limit. Also each read writes an `ai_request_sent` event with no matching evaluation run, so `readAiGuardCounts` prices every read as an unrecorded call at the full ceiling, which inflates the month cost and can close the cap early for evaluations. The spec schedules both for step 6, so this is only acceptable if no real provider is enabled before then; say so in the scope.

### 🟡 Image route does not require the teacher notice, `src/server/data/submissions/pages.ts:19`
`getCopy` returns `notice_required` before showing a copy (NFR-DON-04), but `getPageImage` serves a version page to the owner teacher without that check. A page id is only learned from the copy, so exposure is low, but the two paths disagree.

### 🟡 Reading run insert can fail the whole read, `src/server/submissions/images.ts:125`
`attempts` is `errors.length + (reading ? 1 : 0)`. If the loop never runs (deadline already aborted) a failed run has `attempts = 0`, which violates the `reading_runs_attempts` check and turns the read into a 500 with a rolled back transaction. Unlikely with a 45 s deadline but cheap to guard (always run at least one attempt or skip the insert).

### 🟡 A database transaction stays open during the AI call, `src/server/data/submissions/drafts.ts:168`
`readDraftPage` holds a pooled connection, an advisory lock and a page read for up to 45 s. On Neon with a small pool a few concurrent reads can starve other requests. The spec accepts reading inside the request; consider releasing the connection around the call (read, close, call, then write under the draft lock).

### 🟡 `lockOwnDraft` can crash on a concurrent confirm, `src/server/data/submissions/drafts.ts:58`
Insert with `onConflictDoNothing` then a separate select: if the draft is deleted by a confirm in between, `draft` is undefined and `draft.id` throws. Self race only, so rare; handle the empty result as "absent".

### 🟡 Blank pages go to evaluation as an empty text, `src/server/data/submissions/submissions.ts:574`
Confirming only pages without writing stores `text = ''` and the submission ends `not_assessable` with `no_content` (via `alerts.ts`), with no warning to the student. The spec's `no_writing` cause and warning are scheduled later; note it as a known interim behaviour.

### 🟡 Browser decodes the photo at full size once, `src/lib/page-shrink.ts:19`
The probe `createImageBitmap` has no resize, so a 48 MP photo is fully decoded, which the spec says to avoid. Read the size from the file header, or probe through an `<img>` / `createImageBitmap` with a small resize and compute the ratio differently.

## Nits
- ⚪ `src/app/student/assignments/[assignmentId]/images-section.tsx:94`, the object URL from `URL.createObjectURL` is never revoked.
- ⚪ `src/server/submissions/images.ts:113`, the retry set and attempt count are local constants; put `READ_ATTEMPTS` in config with the other read values.
- ⚪ `src/server/submissions/images.ts:218`, a student change equal to the engine word is accepted and shows as a highlight; consider refusing a no-op.
- ⚪ `drizzle/0022_protect_image_rows.sql`, `TRUNCATE` is not guarded (noted in the header); fine for tests.

## Strengths
- The image route and data function are tight: one query, ownership through `ownedBy` for student and teacher, a teacher never reaches a draft page, 404 for everyone else, and `no-store`, `nosniff` headers.
- The AI request is built from the JPEG bytes alone (`reading.ts`), the body check in `guardedFetch` is untouched, the sender is shared by evaluator and reader, and the simulator reuses the same faults; identity and mode cannot reach the AI.
- The 0022 triggers match the spec case by case (draft pages free, attach once with everything else unchanged, reading only from pending or failed to read, runs only `page_id` to null), and the upload path normalises through sharp with strict decode, pixel limit and metadata stripping.
- Confirmation is well built: request id lookup first for idempotency, draft locked, text rebuilt on the server from readings plus checked changes, shared core with text submissions so late and lock behaviour are identical.

## Test coverage
Covered: page preparation (`page-image.test.ts`), request body and send point (`ai-request`, `ai-send-point`, `anthropic.test.ts`), `reading.ts` parsing, inventory and ESLint restriction tests. Not covered: `lib/transcription.ts`, `drafts.ts`, `confirmImages`, the two routes, the 0022 triggers, and the matrix `REAL` list. Integration and E2E were not run in this review (shared test database).
