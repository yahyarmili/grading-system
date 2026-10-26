# Verify: image channel · spec 0011 · updated 2026-10-26
_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._
_2026-10-26 (review of 2026-10-26): a box locked later by a test is ticked and names it; a box still open is the part no test or run covers, in the browser mostly._

## UI / manual
Build step 5, the student draft screen (commit 04945ea).

- [x] As a student, choose a PDF, then a PNG renamed `.jpg`, then a 21 MB photo → each gets its own message, no page appears, nothing is stored in `submission_pages` → AC-2
- [x] Add 3 pages, move page 3 to the top, send → the version's pages are stored in the chosen order → AC-3
- [x] Cut the network during an upload, then press "Try again" → one page is stored for that `uploadRequestId` → AC-3
- [x] Fix a misread word, then an `[illisible]` marker, then send → the evaluated text has the student's words; `transcription_changes` keeps each engine word and student word → AC-4 _(e9-replays, step 10 case 1; one word in the browser by the E9 journey)_
- [x] With 5 pages, retake one → it works and keeps its position; a 6th page is refused with a message → AC-8
- [ ] Type an empty word, then one over 60 characters → refused in the browser; the same change posted directly is refused by the server (`badChange`) → AC-8 _(server part locked by e9-replays, step 10 case 4, with the engine's own word again; the browser part not run)_
- [x] Post a change on a word index past the end of the page → refused (`badChange`), no submission → AC-8 _(e9-replays, step 10 case 4)_
- [x] Delete page 2 of 3 → the last page becomes page 2; the next page added goes last → AC-3
- [x] As an account that read notice v4 only, open the assignment → notice v5 shows before the first page; a direct upload gets a 409 and the screen reloads onto the notice → AC-17

## Value sourcing
- [x] Read a draft's pages 15 times → the next read gets the draft cap message; source: `reading_runs` counted by `draft_id` → AC-8
- [x] Reach the daily cap, delete the draft, start a new one the same day → still capped; source: `reading_runs` counted by `student_id`, which outlive the draft → AC-8
- [x] Cross midnight in `Africa/Casablanca` (not UTC) → the daily count starts again; source: the day in `DEADLINE_TIME_ZONE` → AC-8 _(reading-caps.int, "the day starts at midnight"; the day starts in SQL on purpose, see `readCapReached`)_
- [x] Upload without `x-page-position` → the page goes to the next free position; source: the header, else the next slot → AC-3
- [x] Confirm with changes → the stored text is rebuilt by the server from readings plus changes, never taken from the browser → AC-4

## Commands
- [x] `docker compose exec -T web npx tsc --noEmit` → no error
- [x] `docker compose exec -T web npm run test:unit` → all pass, including `tests/student-notice.test.ts` for version 5 → AC-17
- [x] `docker compose exec -T web npm run test:int` (ask first: shared test database) → all pass

## Acceptance-criteria coverage
- AC-2 … UI step 1
- AC-3 … UI steps 2, 3, 8; value sourcing step 4
- AC-4 … UI step 4; value sourcing step 5
- AC-8 … UI steps 5, 6, 7; value sourcing steps 1, 2, 3
- AC-17 … UI step 9; commands step 2
- The other ACs are verified with their build steps (6 to 10).

## Build step 6: failure branches and pipeline wiring
_Added 2026-10-25. Run under the simulator reader (its `failed` and `no_writing` faults)._

### UI / manual
- [x] As a student, make a page read fail (simulator fault) → the page shows "Not read" with "Read this page", and the screen offers "Send without checking the reading" → AC-7
- [x] Send without checking, after changing a word on a read page → the dialog says the changed words are not sent; the submission is created with `checked_by_student = false`, no `transcription_changes`, `text` null → AC-7
- [x] The student page after sending shows "Submitted, being marked", never "Transcribing" nor a reading failure → AC-7, AC-14
- [ ] Read every page with the `no_writing` fault → the "No writing found" warning shows, sending still works; the copy ends `not_assessable` / `no_writing`, without a proposal → AC-6 _(the outcome locked by e9-replays, step 10 case 5; the warning on screen not run)_
- [ ] As the teacher, open a `transcription_failed` copy → "Retry" and "Evaluate manually" are offered; Retry reads the pages left, then evaluates; "Evaluate manually" moves it to To review (transition 4), logged `manual_started` → AC-7 _(both paths locked by e9-replays, step 10 case 7; the buttons on screen not run)_
- [ ] In the list, a `transcription_failed` copy shows the "Failed" filter's Retry button, and "Retry requested" once asked → AC-7 _(not run)_

### Pipeline (integration, ask first: shared test database)
_All eight locked by e9-replays (step 10 cases 6, 7, 8, 5, 10, 11, 9, 17), and the workflow body's branches by `orchestrate.test.ts`._
- [x] Unchecked version, reader succeeds → `received` → `transcribing` → `evaluating` → `to_review`; one `reading_runs` row per page left, with `submission_id` and no `draft_id`; the evaluated text is the pages assembled in order → AC-7, AC-5
- [x] Unchecked version, reader fails on every attempt → `transcription_failed`; the run has `AI_MAX_ATTEMPTS` attempts; a teacher Retry claims it once (transition 4) → AC-7
- [x] Guard closed during the pipeline read (cost cap reached in the simulator) → `transcription_failed`, not `ai_unavailable`, nothing sent → AC-7
- [x] Unchecked version with every page `no_writing` → `not_assessable` / `no_writing` by transition 3, text `''` → AC-6
- [x] A transcribing run older than `EVALUATION_STUCK_AFTER_MS` → the sweep releases it to `transcription_failed` → AC-16
- [x] A text and an unchecked image copy, one read failing, triggered together → each reaches a final state, the failure blocks neither → AC-16
- [x] French assignment, unchecked images → transcribed, then `not_assessable` / `rubric_unavailable`, relaunchable → AC-16
- [x] Replace the submission while its pages are being read → the next page step stops, no `text` is written for the old version → AC-10

### Value sourcing
- [x] Interactive reads alone push the month to the cost cap → the next evaluation gets `ai_unavailable`; source: `reading_runs` tokens summed with `evaluation_runs` in `readAiGuardCounts` → AC-16 _(reading-caps.int)_
- [x] Three drafts fail on `configuration` → the breaker opens; source: distinct `draft_id` / `submission_id` of `reading_runs` with the evaluations' → AC-16 _(reading-caps.int)_
- [x] Unchecked text → source: pages read by the pipeline, assembled without changes, written once in `submission_transcriptions.text` → AC-7
- [x] `checked_by_student` → source: the confirmation's `mode` (`unchecked` refused when every page is read: "allRead") → AC-7
- [ ] Places → transcribing and evaluating runs count together in `EVALUATION_CONCURRENCY` → AC-16 _(not locked by a test of its own; a busy start waits as an evaluation in `orchestrate.test.ts`)_

### Acceptance-criteria coverage (step 6)
- AC-6 … UI step 4; pipeline step 4
- AC-7 … UI steps 1, 2, 3, 5, 6; pipeline steps 1, 2, 3; value sourcing steps 3, 4
- AC-16 … pipeline steps 5, 6, 7; value sourcing steps 1, 2, 5
- AC-10 (pipeline part) … pipeline step 8; the rest comes with step 8

### Tests left behind, for `/test image channel` (integration run of 2026-10-25, after 8a5b106)
- [x] `tests/access-matrix.int.test.ts`: add the `draft` and `transcription` resources to `REAL`, and replay `addDraftPage`, `readDraftPage`, `reorderDraftPages`, `deleteDraftPage`, `getOwnDraft`, `getPageImage`, `confirmImages` → AC-12 _(done in step 10)_
- [x] `tests/notice.int.test.ts`: expect notice version 5 and its text on photos (approved in d2a14f7), instead of version 4 without images → AC-17 _(done in 7b189d8)_
- [x] `tests/e4-replays.int.test.ts`, `tests/student-result.int.test.ts`: the student reread now also carries `mode` and `pages` → AC-14 _(done in 7b189d8)_
- [x] `tests/evaluation-relaunch.int.test.ts:254`: give the test an explicit timeout (15.4 s against the 15 s default; Neon latency, no step 6 query on that path)

## Build step 7: teacher and student reads
_Added 2026-10-25. Highlights rebuilt from `submission_pages.reading_text` and `transcription_changes` (`pageSegments`, `assembleSegments` in `src/lib/transcription.ts`)._

### UI / manual
- [x] As the teacher, open a checked image copy with two changed words → each student word is highlighted, the engine's word struck next to it; the footer says "N words, 2 changed by the student" → AC-13, AC-4
- [ ] The same copy, an `[illisible]` left by the student → it shows outlined, read as "(unreadable)" by a screen reader → AC-6 _(the marker kept is locked by e9-replays; the outline on screen not run)_
- [x] Open the copy without pressing "Compare with the pages" → no request to `/api/pages/…` in the network panel → AC-13
- [x] Press "Compare with the pages" → a dialog shows page 1's photo next to its own reading with the changes; switching to page 2 loads only then page 2's photo; "Open page N full size" opens the image route in a new tab → AC-13
- [x] An unchecked copy, read by the pipeline → "not checked by the student", no highlight, the pages' readings in the dialog → AC-13, AC-7
- [x] An unchecked copy not read yet (`transcribing` or `transcription_failed`) → "The transcription of this copy is not available yet."; the dialog says "This page has not been read yet." → AC-7, AC-13
- [ ] A page without writing → the dialog says "No writing was found on this page." → AC-6 _(not run)_
- [x] In the list, an image copy shows the mode "Images" and the image states (Transcribing, Transcription failed) → AC-13
- [ ] As the student, after sending checked pages → the pages and "The reading you checked" (their words, no highlight, no engine word); sent unchecked → the pages only, never a state or a reading failure; back then forward → the page is checked again by `FreshnessGuard` → AC-14 _(the checked reading by the E9 journey and student-leak.int; the unchecked view and back then forward not run)_

### Value sourcing
- [x] Highlight → source: `transcription_changes` (`engine_word`, `student_word`, `word_index`) applied to the page's `reading_text`; the pieces joined must give back `submission_transcriptions.text`, else the text shows as evaluated, without highlight → AC-13
- [x] Mention → source: `submission_transcriptions.checked_by_student` → AC-13

### Commands
- [x] `docker compose exec -T web npx vitest run --project integration tests/student-leak.int.test.ts` (ask first: shared test database) → the image situation passes: a checked copy To review and an unchecked one in `transcription_failed` leak nothing; `getOwnDraft` and `readPageAction` are swept → AC-14

### Acceptance-criteria coverage (step 7)
- AC-13 … UI steps 1, 3, 4, 5, 6, 8; value sourcing steps 1, 2
- AC-14 … UI step 9; commands step 1
- AC-6 (display) … UI steps 2, 7

## Build step 8: replacement and late
_Added 2026-10-25. One replacement core for text and pages (`replaceWith` in `src/server/data/submissions/submissions.ts`); a draft takes pages before the first submission or while transition 11 is open._

### UI / manual
- [x] As a student with a text submission, open "Replace my submission", choose "Photograph new pages", add 2 pages, read them, send → "Your new pages were submitted on …"; the read back shows the pages; the first date and the late mark are unchanged; the version is evaluated again → AC-10, AC-9
- [x] With an image submission, replace it by a text → the read back shows the text; the old pages still open for the student and the owner teacher through `/api/pages/…` → AC-10
- [x] With an image submission, replace it by new pages, then once more → the third replacement is refused: "You have replaced this submission 2 times …", no draft page can be added (the upload answers 404) → AC-10
- [x] Add pages for a replacement, leave, come back → the replace form opens on the photos with the pages kept → AC-10
- [ ] As an account that read notice v4 only, with a submission, open "Photograph new pages" → notice v5 shows before the first page; a direct upload gets a 409 → AC-17 _(not run for a replacement; the first submission's case is step 5's)_
- [ ] Teacher saves a change on the copy while the student's replacement pages are ready, then the student sends → "Your teacher has started marking your submission … Your pages were not sent."; the draft stays → AC-10 _(the race locked by e9-replays, step 10 case 16; the message on screen not run)_

### Integration (ask first: shared test database)
- [x] Text to images: `confirmImages` on a submitted assignment → version 2 in mode `images`, its pages attached, the draft gone, `submitted_at` and `late` of version 1 kept, status `received`, `current_proposal_id` null → AC-10, AC-9 _(e9-replays, step 10 cases 12 and 15)_
- [ ] The same `requestId` sent again → the same `replacedAt` and `replacementsLeft`, one version → AC-3, AC-10 _(locked for a first confirmation, step 10 case 1; not for a replacement by pages)_
- [x] Replacement by pages and the teacher's first act at once → exactly one wins → AC-10 _(e9-replays, step 10 case 16)_
- [ ] A first submission after the deadline replaced by pages before it → `late` stays true; neither the late flag nor the mode reaches the reader or the evaluation request (captured requests) → AC-9, AC-11 _(the request's keys locked by step 10 case 13; this order of dates not replayed)_
- [ ] `addDraftPage` when the replacement is closed (teacher started, limit reached, or no longer a member) → null, nothing stored → AC-10 _(the limit reached locked by step 10 case 15; teacher started and no longer a member not replayed)_

### Value sourcing
- [x] `submittedAt`, late → source: the first submission's `submitted_at` and `late`, never the replacement's `now()` nor its first page → AC-9
- [x] Version number, replacements left → source: `submissions.current_version` + 1 under the row lock, shared by text and pages (`replaceWith`) → AC-10
- [ ] Replaced date → source: the new version's `created_at` → AC-10 _(not checked)_

### Commands
- [x] `docker compose exec -T web npx tsc --noEmit` → no error
- [x] `docker compose run --rm e2e` (ask first) → `e2e/submit-text.spec.ts` and `e2e/e4-journey.spec.ts` pass with the new wording "replace your submission …" _(2026-10-26, with notice v5 and the instruction looked for in the visible tab)_

### Acceptance-criteria coverage (step 8)
- AC-9 … UI step 1; integration step 4; value sourcing step 1
- AC-10 … UI steps 1 to 4, 6; integration steps 1, 2, 3, 5; value sourcing steps 2, 3
- AC-17 (replacement by pages) … UI step 5

## Build step 9: draft purge
_Added 2026-10-25. `deleteStaleDrafts` (`src/server/data/submissions/drafts.ts`), run as the third part of `sweepEvaluations`: at each trigger, at the opening of the copy list or a copy, and by the daily cron in production._

### Integration (ask first: shared test database)
_Locked by `tests/draft-purge.int.test.ts`, passed 2026-10-25._
- [x] A draft whose `updated_at` is `DRAFT_TTL_MS` + 1 s old, with 2 pages and a reading run → `deleteStaleDrafts(DRAFT_TTL_MS)` returns its id; the draft and its pages are gone; the `reading_runs` row stays, `page_id` null → AC-18
- [x] A draft 6 days old, or one whose last write is a read result (`updated_at` bumped) → kept → AC-18
- [x] A stale draft locked by a transaction in progress (a confirmation) → skipped, no wait, no error; the confirmation completes → AC-18
- [x] The student's daily read cap after a purge → unchanged (the runs still count) → AC-8, AC-18

### Commands
- [x] `docker compose exec -T web npx vitest run --project unit tests/evaluation-start.test.ts` → the cron route answers `{ released, restarted, draftsDeleted }` with the secret only → AC-18

### Value sourcing
- [x] Stale drafts → source: `submission_drafts.updated_at` on the database clock, against `now()` minus `DRAFT_TTL_MS`; every draft write bumps it (upload, retake, reorder, delete, read result) → AC-18 _(draft-purge.int; indexed since 0024)_

### Acceptance-criteria coverage (step 9)
- AC-18 … integration steps 1 to 4; command step 1; value sourcing step 1

## Build step 10: replays, mixed batch, security cases, E2E and final fidelity trial
_Added 2026-10-25. Replays locked by `tests/e9-replays.int.test.ts` (22 cases) and the image rows of `tests/access-matrix.int.test.ts`; journey `e2e/e9-journey.spec.ts`; trial recorded in `conception/annexe-essais-lecture.md`._

### Integration (ask first: shared test database)
_Passed 2026-10-25 (touched files: 308 of 309 at first, the one left being the defect fixed in 94b997d, then green)._
- [x] Three pages reordered, two words changed (one an `[illisible]`), confirmed → one submission in mode `images`, pages in the chosen order, text rebuilt by the server in page order; each page's run records `simulator` and `transcription-1`; the same `requestId` again gives the same answer, one version → AC-1, AC-3, AC-4, AC-5
- [x] The same `uploadRequestId` twice → one page → AC-3
- [x] A PNG, a PDF, a cut JPEG → 422 `notJpeg`; over `PAGE_UPLOAD_MAX_BYTES` → 413; no draft created → AC-2
- [x] A 6th page refused, a retake at 5 keeps position 3; an empty, 61 character, two line, out of range, doubled or blank page change → `badChange`; a trimmed NFC word accepted → AC-8
- [x] Every page without writing → sent, then `not_assessable` / `no_writing`, no call to the evaluator; the teacher evaluates by hand → AC-6, REV-06
- [x] Unchecked pages read by the pipeline → To review, text "not checked by the student", one run per page with `submission_id`; the student sees pages, never the text → AC-7, AC-14
- [x] Reading failing every attempt → `transcription_failed`; the teacher's Retry reads the pages again and reaches To review; or the teacher evaluates by hand → AC-7
- [x] Cost cap closed during the pipeline's reading → `transcription_failed`, nothing sent → AC-7
- [x] French, rubric not published → transcribed, then `not_assessable` / `rubric_unavailable`, offered for a relaunch → AC-16
- [x] A transcription stuck past the limit → released to `transcription_failed` → AC-16
- [x] Mixed batch (2 texts, 1 checked, 1 unchecked read, 1 unchecked failing) run together → four To review, one `transcription_failed` → AC-16
- [x] Confirmed after the deadline (pages read before it) → late; replaced by pages after it → first date and late mark kept → AC-9
- [x] The reader's request: keys `system`, `image`, `instruction`, `schema`, `schemaName`, `generation` only; the image the stored JPEG in base64; no identifier, title or account value → AC-11
- [x] An instruction written on a page reaches the evaluation as the student's text → AC-15
- [x] Images → text → images: modes kept per version, old pages readable by the author and the owner teacher only; no third replacement → AC-10
- [x] Pages and the teacher's first act at once → exactly one wins → AC-10
- [x] A pipeline reading of a replaced version stops, `stale`, no text written → AC-10
- [x] A draft page: the owner only; teacher and classmate nothing; an administrator refused; a classmate cannot read, retake nor send it → AC-12
- [x] The matrix replays `draft` and `transcription`, and `getPageImage` on a version page → AC-12

### E2E (ask first)
- [x] `docker compose run --rm e2e` on `e2e/e9-journey.spec.ts` → three photos read, page 3 moved first, "page." corrected to "pages.", sent; To review by itself; the list shows "Images"; the copy shows "checked by the student", the word highlighted next to the engine's; no `/api/pages/…` request before "Compare with the pages", then page 1's only; validated and published; the student reads the result, then "The reading you checked" → AC-20, AC-13, AC-14 (passed 2026-10-25, 2.8 min)

### Commands
- [x] `docker compose exec -T web npm run ai:read -- --provider anthropic --runs 3` → 21 calls, 0 failed, 0 off the schema, recorded as is in `conception/annexe-essais-lecture.md` (section "Essai final de fidélité") → AC-19

### Acceptance-criteria coverage (step 10)
- AC-1 to AC-6, AC-8 … integration steps 1 to 5
- AC-7 … integration steps 6 to 8
- AC-9 … integration step 12; AC-10 … steps 15 to 17; AC-11, AC-15 … steps 13, 14; AC-12 … steps 18, 19
- AC-16 … integration steps 9 to 11
- AC-19 … commands step 1; AC-20 … E2E step 1
