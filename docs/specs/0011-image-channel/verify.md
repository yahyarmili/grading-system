# Verify: image channel · spec 0011 · updated 2026-10-25
_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
Build step 5, the student draft screen (commit 04945ea).

- [ ] As a student, choose a PDF, then a PNG renamed `.jpg`, then a 21 MB photo → each gets its own message, no page appears, nothing is stored in `submission_pages` → AC-2
- [ ] Add 3 pages, move page 3 to the top, send → the version's pages are stored in the chosen order → AC-3
- [ ] Cut the network during an upload, then press "Try again" → one page is stored for that `uploadRequestId` → AC-3
- [ ] Fix a misread word, then an `[illisible]` marker, then send → the evaluated text has the student's words; `transcription_changes` keeps each engine word and student word → AC-4
- [ ] With 5 pages, retake one → it works and keeps its position; a 6th page is refused with a message → AC-8
- [ ] Type an empty word, then one over 60 characters → refused in the browser; the same change posted directly is refused by the server (`badChange`) → AC-8
- [ ] Post a change on a word index past the end of the page → refused (`badChange`), no submission → AC-8
- [ ] Delete page 2 of 3 → the last page becomes page 2; the next page added goes last → AC-3
- [ ] As an account that read notice v4 only, open the assignment → notice v5 shows before the first page; a direct upload gets a 409 and the screen reloads onto the notice → AC-17

## Value sourcing
- [ ] Read a draft's pages 15 times → the next read gets the draft cap message; source: `reading_runs` counted by `draft_id` → AC-8
- [ ] Reach the daily cap, delete the draft, start a new one the same day → still capped; source: `reading_runs` counted by `student_id`, which outlive the draft → AC-8
- [ ] Cross midnight in `Africa/Casablanca` (not UTC) → the daily count starts again; source: the day in `DEADLINE_TIME_ZONE` → AC-8
- [ ] Upload without `x-page-position` → the page goes to the next free position; source: the header, else the next slot → AC-3
- [ ] Confirm with changes → the stored text is rebuilt by the server from readings plus changes, never taken from the browser → AC-4

## Commands
- [ ] `docker compose exec -T web npx tsc --noEmit` → no error
- [ ] `docker compose exec -T web npm run test:unit` → all pass, including `tests/student-notice.test.ts` for version 5 → AC-17
- [ ] `docker compose exec -T web npm run test:int` (ask first: shared test database) → all pass

## Acceptance-criteria coverage
- AC-2 … UI step 1
- AC-3 … UI steps 2, 3, 8; value sourcing step 4
- AC-4 … UI step 4; value sourcing step 5
- AC-8 … UI steps 5, 6, 7; value sourcing steps 1, 2, 3
- AC-17 … UI step 9; commands step 2
- The other ACs are verified with their build steps (6 to 10).
