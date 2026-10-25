# 0011. Image channel: rationale

## Context

The text cycle (E4 to E8) is shipped: a submission is created atomically with its text, a Vercel Workflows run evaluates it, the teacher reviews, validates and publishes. The data model already reserves the image channel (enum `submission_mode` has `images`, statuses `transcribing` and `transcription_failed` exist, the matrix has a `transcription` row), but there is no page table, no reader, and the Anthropic adapter only sends text.

Q4 [D, 2026-10-22] moved the transcription before sending: the student sees the reading, retakes a bad photo, fixes misread words once, and only the confirmed version is evaluated. This collides with three existing rules: the submission has no draft state, "a refused file creates nothing and stores nothing", and a Vercel function accepts at most 4.5 MB per request (one page per request after shrinking in the browser, already decided in `conception/stack-technologique.md`). So pages must exist on the server before any submission does.

Other forces: zero cash cost (Neon free 1 GB, a 5 dollar monthly AI cap, all AI calls counted), a reading error becomes a grade error (Mechanics), the reader must be replaceable without touching business rules, students use a phone, and a failure must never stop a student from handing in before the deadline (lateness is marked, D8). What happens when reading fails before sending was left "à définir".

## Options considered

### Option 1: Draft in the database, page by page reading in the request

A draft per (student, assignment) holds pages uploaded one per request; each page is read right after upload by a Server Action that waits for the reader; one transaction confirms, creates the submission or version, and attaches the pages.

**Pros**: the submission stays atomic and its state machine unchanged; survives a reload; retaking a page rereads only that page; little new machinery.
**Cons**: pages stored before sending (a draft purge is needed); the student waits for each read; a closed page leaves a page "to read".

### Option 2: Stateless, signed transcription

The browser keeps the images; the server reads them and returns a transcription signed with an HMAC; at sending, the browser sends everything back with the signature.

**Pros**: nothing stored before sending; no purge.
**Cons**: five pages exceed 4.5 MB in one request, so the final send needs several requests anyway; a reload loses the work; signature and replay handling for little gain.

### Option 3: Draft with a Workflows run for reading

As option 1, but reading runs in a durable workflow and the screen polls.

**Pros**: reading survives a closed page; retries and timing handled by Workflows.
**Cons**: a second workflow, its states and a polling screen on the student side, for a wait of a few seconds per page.

## Rationale

Option 1 fits the forces with the least new machinery. The 4.5 MB limit already forces one page per request, so pages must land somewhere before sending, which rules out option 2's main benefit. A reading takes seconds, so a durable workflow (option 3) buys little over a retry button, while costing a second orchestration and a polling screen on a phone. Keeping the draft outside the submission preserves the atomic submission and lets a checked image version join the existing pipeline exactly like a text one.

Choices made with the engineer on 2026-10-25, each against its runner up:
- Failure before sending: send without transcription (runner up: block sending). Blocking would let an AI outage or the cost cap make students late. Sending unchecked reuses states 2 to 4 and lets the pipeline retry.
- No writing found: warn, sending allowed, cause `no_writing` (runner up: refuse). Keeps EVL-04 CA1 reachable and the teacher's manual path.
- Correction: word by word (runner up: free text area). Matches "misread word", records changes structurally, prevents rewriting paragraphs.
- One page per call (runner up: all pages in one call). Starts reading at upload, rereads only a retaken page, keeps requests small; a word split across pages is a rare, fixable cost.
- Late at confirmation time (runner up: first page time). Same rule as text, no loophole of a draft opened before the deadline.
- One page table with a moved attachment (runner up: two tables and a copy); reading on the page row (runner up: a reading table per page), completed by `reading_runs` once it appeared that the cost cap, breaker and daily limit sum `evaluation_runs` tokens and must count reads of deleted pages too (runner up: a `kind` column on `evaluation_runs`, which is tied to a submission version a draft does not have).
- Structured change rows (runner up: a JSON column); a new cause `no_writing` (runner up: reuse `no_content`).
- Transport: a dedicated POST route (runner up: raising the Server Action body limit for the whole app). Server check: `sharp` (runner up: a hand written JPEG marker parser, which cannot detect corrupt image data). Browser shrink: native `createImageBitmap` and canvas (runner up: a compression library).
- Limits: 5 pages, 20 MB originals, JPEG, PNG, WebP and HEIC, mode switch allowed at replacement, notice v5 for every next submission, drafts purged after 7 days.

Decided by the architect (runner up in brackets): the reading starts in a separate action after the upload, so an upload stays fast and safe to retry (read inside the upload request); unsaved word changes stay in the page state (saved to the draft on each change, more writes for little value); `[illisible]` as the single marker for both languages, as written in TRX-01 (a marker per language); a reads cap per draft so one student cannot burn the shared budget (no per student cap); a guard closed during a pipeline read gives `transcription_failed`, relaunchable, since the text does not exist yet (`ai_unavailable`, whose relaunch assumes an existing text).
