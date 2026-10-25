# Review, preview (image channel, E9 second part), 2026-10-26

**Reviewed by**: Sonnet 5.5 (author on Opus 5.5)
**Scope**: 66 files, range 067345e..2de24c4 (pipeline transcription, read caps, reorder and delete, replacement by pages, draft purge, teacher compare screen, tests and E2E)
**Verdict**: Approve with nits

## Summary
This range finishes the image channel. The pipeline now reads pages the student sent unchecked (one workflow step per page, then the assembly and the hand over to the evaluation under the same claim), the interactive reads are capped and priced through `reading_runs`, pages can be reordered, deleted and sent in place of a submission, stale drafts are purged by the sweep, and the teacher sees the student's changes and the pages side by side. The design holds up: the claim token guards every pipeline write, a replaced version stops cleanly, the new system functions are listed in the inventory, and the AI input is still the page bytes alone. I found no blocker and no major. The remaining points are small: a few findings from the first review that were left, a tab remount that drops the pages state on screen, and some missing narrow tests.

## Minor
### 🟡 Switching the replace or submit tab drops the pages shown, `src/app/student/assignments/[assignmentId]/replace-section.tsx:168` (same pattern at `submission-panel.tsx:180`)
**Problem**: `ImagesSection` sits inside a Radix `TabsContent`, which unmounts when another tab is chosen (no `forceMount` in `components/ui/tabs.tsx`). On return it is built again from the `draft` prop of the page load, which is never refreshed after an upload. Pages uploaded or read since, the unsaved word changes and `draftId` are gone from the screen. I did not run it, this follows from Radix's default behaviour.
**Why it matters**: a student who adds two pages, peeks at "Type a new text" and goes back sees an empty list and a disabled Send, although the pages are stored. A new upload then shows at position 1 while the server puts it at 3, and a reorder answers "mismatch". Nothing is lost on the server and a reload recovers, but it is the main path of AC-10 and AC-3.
**Suggested fix**: keep both panels mounted (`forceMount` with `hidden` on the inactive one), or lift the pages state above the tabs, or call `router.refresh()` and re-seed from the prop on remount. Add one E2E step that switches tabs with a page uploaded.

### 🟡 The 0022 protective triggers still have no direct test, `drizzle/0022_protect_image_rows.sql`
**Problem**: the first review asked for integration cases on the triggers (attach once, no change after attach, runs immutable). The new tests exercise the happy writes (pipeline reading of an attached page, attach at confirmation) but nothing tries a forbidden update and expects the database to refuse it.
**Why it matters**: these triggers are the immutability guarantee for what the teacher grades. A trigger loosened by a later migration would not be noticed.
**Suggested fix**: a small integration file that tries to change the image, position or text of an attached page, to update a reading run, and to attach twice, and expects an error.

### 🟡 No unit test for the transcription branch of `orchestrate`, `src/server/evaluation/orchestrate.test.ts:22`
**Problem**: the fakes were only adapted (`startTranscription` always "skipped"). `runOnce` has branches that are covered only by the integration replays: a page that fails stops the loop, "closed", "stale", `no_writing`, `busy` from the start step, and the `transcribed = true` argument to `evaluate`.
**Why it matters**: this is branching logic in the workflow body, which Workflows replays, and the unit file is the quick, deterministic place where it is checked.
**Suggested fix**: add five or six cases to `orchestrate.test.ts` with fake steps: all pages read then evaluate with `true`, a failed page then `endTranscription` and no evaluate, `busy` waits like before, an error in `transcribePage` releases the claim.

### 🟡 Sharp decodes before authorization, `src/server/submissions/images.ts:56` (left from the first review)
`uploadDraftPage` still calls `preparePage` before `addDraftPage` decides. Any logged in role without the right still makes the server decode up to 3 MB. Run `authorize(actor, "draft", "write")` first.

### 🟡 Image route skips the teacher notice, `src/server/data/submissions/pages.ts:19` (left from the first review)
`getCopy` answers `notice_required`, `getPageImage` does not. The page id is only learned from the copy, so exposure is low, but the two paths disagree (NFR-DON-04). Unchanged in this range.

### 🟡 A transaction stays open during the AI call, `src/server/data/submissions/drafts.ts:224` (left from the first review)
`readDraftPage` still holds a pooled connection, the advisory lock and the page row for up to 45 s. The new cap query sits inside it. Acceptable for the demo load, worth noting for Neon's small pool.

### 🟡 `lockOwnDraft` can still throw on a concurrent confirm, `src/server/data/submissions/drafts.ts:73` (left from the first review)
Insert with `onConflictDoNothing`, then a select: if a confirm deletes the draft in between, `draft` is undefined and `draft.id` throws. Handle the empty result as absent. Unchanged.

### 🟡 `attempts` can still be 0 in a failed reading run, `src/server/evaluation/read-page.ts:76` (left from the first review)
If the loop never runs, `attempts = 0` breaks the `reading_runs_attempts` check and the whole read fails with a 500. Practically unreachable now (deadline is fresh, attempts is at least 2), so this stays minor. A guard that skips the insert, or `Math.max(1, …)`, closes it.

### 🟡 Browser still decodes the photo at full size once, `src/lib/page-shrink.ts:19` (left from the first review)
The probe `createImageBitmap(file, { imageOrientation })` has no resize, so a 48 MP photo is fully decoded before it is shrunk. Unchanged.

### 🟡 The daily cap day boundary uses the database's time zone data, `src/server/data/submissions/drafts.ts:170`
**Problem**: the start of the day is computed in SQL with `DEADLINE_TIME_ZONE`. The project rule is to convert with `src/lib/time-zone.ts` (Node's tzdata), and the docs say Morocco's offset changed in 2026, a case where Postgres and Node tzdata can differ.
**Why it matters**: if Neon's tzdata is older, the day boundary moves by an hour near Ramadan changes. Low impact (a read cap), but it breaks the single source of truth for time zones.
**Suggested fix**: compute `dayStart` in the server with `time-zone.ts` and pass it as a parameter, or note in `src/server/db/AGENTS.md` that this one comparison is done in SQL on purpose.

## Nits
- ⚪ `src/server/data/submissions/submissions.ts:~262`, the server still accepts a student change equal to the engine word (the browser drops it in `WordEditor`); refuse a no-op so the highlight never shows a change to the same word. Left from the first review.
- ⚪ `src/app/student/assignments/[assignmentId]/images-section.tsx:139`, the object URL from `URL.createObjectURL` is never revoked. Left from the first review.
- ⚪ `src/server/evaluation/read-page.ts:435`, `INTERACTIVE_READING.attempts = 2` is a local literal beside the other read values in `provisional.ts`; move it next to `READ_REQUEST_MAX_MS`.
- ⚪ `src/server/evaluation/sweep.ts:33`, `deleteStaleDrafts` now runs at every trigger and list opening. One cheap query, but a `FOR UPDATE SKIP LOCKED` scan on each submission; fine now, an index on `updated_at` if the table grows.
- ⚪ `docs/specs/0011-image-channel/verify.md`, about 35 boxes are still unticked (for example lines 10 to 20, 44 to 63, 72 to 74, 111, 128), many of them covered later by the ticked step 10 cases; tick or strike them so the file shows what really remains.

## Strengths
- The pipeline is built on the evaluation's own claim: one token, one place count for transcribing and evaluating together, `markTranscribing` dating each page so the stuck release counts from the last page, and every write (`readTranscriptionPage`, `recordTranscriptionPage`, `finishTranscription`) guarded by the version and token. A replaced version gets "stopped" and writes nothing, and the run row is still recorded for the call that was paid.
- Billing and cost are consistent now: step `maxRetries = 0` so Workflows never repeats a paid call, the guard is asked per page, `readAiGuardCounts` sums `reading_runs` tokens and calls and counts reading subjects (submission or draft) once in the breaker.
- The shared core `replaceWith` serves text and pages with one lock order (draft, then submission), keeps `submitted_at` and `late`, and keeps the idempotency by request id for both modes. The unchecked path refuses changes and the case where nothing is left to read.
- The teacher side is careful: pages load only when the dialog tab opens, the highlight is rebuilt from the pages and dropped if it would not give back the evaluated text, markers are named for screen readers, and a `transcription_failed` copy gets Retry (transition 4) and manual evaluation through shared `retriedStatuses` and `manualStartStatuses` lists.
- `normalizeStudentWord` now refuses U+0000, which Postgres text cannot store, and is shared by the browser and the server.

## Test coverage
Covered well: `tests/transcription.test.ts` (word split, assembly, segments), `tests/page-file.test.ts` (header sniffing), `tests/reading-caps.int.test.ts` (draft cap, daily cap with deleted drafts, midnight in the project's zone, guard sums, breaker subjects), `tests/draft-purge.int.test.ts` (TTL, read result bump, skip locked), `tests/e9-replays.int.test.ts` (22 cases: reorder, idempotent upload, no writing, pipeline success and failure, closed guard, stuck release, mixed batch, late, replacement races, AI input, matrix security cases), the new `draft`, `transcription` and `getPageImage` rows in `tests/access-matrix.int.test.ts`, the student leak sweep, and the E9 journey. Not covered: direct refusal by the 0022 triggers, unit cases for the transcription branch of `orchestrate`, the tab switch in the replace form, and `deleteStudentPage` outside the matrix. Integration and E2E were not run in this review (shared test database); I relied on `verify.md`, which records them as passed on 2026-10-25.

## Status of the first review's findings (2026-10-25)
- Missing matrix and word module tests (major): **fixed**. `draft`, `transcription` and `getPageImage` are in `REAL`, `tests/transcription.test.ts` exists, the leak sweep covers the image situation. The direct 0022 trigger tests are still missing (kept above as a minor).
- Double billing on a stale status read (major): **fixed** (commit 193a4d9). `readDraftPage` takes the ownership check first, then the advisory lock, then reads the page again under it (`drafts.ts:210`).
- Sharp decoding before authorization: **left**.
- Read caps unused and reads priced as unrecorded calls: **fixed**. `readCapReached` enforces both caps (counted on `reading_runs`, which keep the draft id after deletion), and `readAiGuardCounts` now prices reads from their runs. The overshoot with pages in flight is documented in the code.
- Image route skips the teacher notice: **left**.
- Reading run insert with `attempts = 0`: **left**, practically unreachable.
- Transaction open during the AI call: **left**.
- `lockOwnDraft` crash on a concurrent confirm: **left**.
- Blank pages sent as an empty text: **fixed**. Both modes end `not_assessable` with the new `no_writing` cause, the student sees a warning before sending, and the evaluation makes no request.
- Browser decodes the photo at full size once: **left**.
- Nits: object URL never revoked **left**; retry set and attempts constant in `images.ts` **moot** (moved to `read-page.ts`, still a local literal, see nit above); no-op change accepted **left** on the server; `TRUNCATE` not guarded **left**, fine for tests.
