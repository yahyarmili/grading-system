# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Students can hand in photos of a handwritten copy (up to 5 pages, JPEG, PNG, WebP or HEIC, 20 MB per photo). Each page is shrunk in the browser, checked again on the server, and kept in a draft until the student sends it (see spec 0011).
- The AI reads each page as it is uploaded, copying the handwriting exactly, uncorrected, with `[illisible]` where it cannot read. Text written inside a photo is copied as content and never followed as an instruction.
- Before sending, the student checks the reading and can fix a misread word, one word at a time, then confirms. The evaluation runs on that confirmed text, exactly as for a pasted text.
- Students can reorder, delete and retake pages before sending, and reread their pages and their confirmed transcription afterwards.
- If reading fails, the student can still send the photos. The pipeline then reads them itself; the copy goes through `transcribing`, and on repeated failure to `transcription_failed`, from which the teacher can retry or evaluate by hand.
- A copy whose pages hold no writing becomes not assessable with the new cause `no_writing`, with no AI proposal; the student is warned before sending.
- The teacher copy shows the transcription with a "checked by the student" or "not checked by the student" mention, highlights each word the student changed next to the AI's word, and shows the pages side by side on demand.
- The submissions list shows the hand in mode and the transcription states.
- A submission can be replaced by photos or by text, in either direction, within the existing limit of 2 replacements.
- Page images are served through one private route, only to their author and the owner teacher; anyone else gets a 404.
- Interactive reads are capped per draft (15) and per student per day (30), and every read counts toward the monthly AI cost cap, the breaker and the daily request limit.
- The sweep deletes drafts left untouched for 7 days, with their pages.
- An `npm run ai:read` command runs the handwriting trial through the product's reader. The E9.0 trial and the final fidelity trial are recorded in `conception/annexe-essais-lecture.md`.

### Changed
- Students must acknowledge notice v5, which covers the reading of images, before their next submission in any mode, text included.
- Submissions stuck in `transcribing` are released to `transcription_failed` by the same stuck release as evaluations.
