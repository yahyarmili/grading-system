# Scope: Grading system

Grading of written work by students (English, French). The student hands in a pasted text or photos of a handwritten copy; an AI proposes a level from 0 to 4 on the five criteria of a fixed rubric; the teacher rereads, edits, validates and publishes, and the student sees only what is published. Academic demo with fictitious data, at zero cash cost. Requirements live in `conception/` (French): `fonctionnalites.md` is the source of each feature's acceptance criteria.

**Build approach:** Tracer Bullet (thin end to end slices through every layer, then thicken: the first full cycle in text shipped in E8, the image channel grafts onto it in E9).
**Workflow:** GA (after `/develop`: `/check verify`, then `/test`, then a fresh model `/check review`, then `/document`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | existing |
| 2 | Coding standards & tooling | Foundation | existing |
| 3 | Design system & UI foundation | Foundation | existing |
| 4 | Data foundation | Foundation | existing |
| 5 | Accounts, roles & access (E1) | Slice 1: text cycle | existing |
| 6 | Classes & invitation (E2) | Slice 1: text cycle | existing |
| 7 | Assignments & student space (E3) | Slice 1: text cycle | existing |
| 8 | Text submission (E4) | Slice 1: text cycle | existing |
| 9 | AI evaluation proposal (E5) | Slice 1: text cycle | existing |
| 10 | Batch processing & relaunch (E6) | Slice 1: text cycle | existing |
| 11 | Teacher review (E7) | Slice 1: text cycle | existing |
| 12 | Validation, publication & student result (E8) | Slice 1: text cycle | existing |
| 13 | Image channel (E9) | Slice 2: image | in-progress |
| 14 | Hardening & quality measurement (E10) | Slice 3: hardening | planned |
| 15 | Demonstration (E11) | Slice 4: demo | planned |
| 16 | Final review | Slice 4: demo | planned |

## Foundations

### 1. Stack & architecture · existing
Next.js 16 on Vercel Hobby, PostgreSQL on Neon with Drizzle, Anthropic `claude-haiku-5-5`, Vercel Workflows, Docker for local dev; five architecture rules. Spec 0001 · code in `./`

### 2. Coding standards & tooling · existing
ESLint import restrictions derived from tables (`tests/eslint-restrictions.test.ts`), Vitest and Playwright in Docker, no Prettier; context in `AGENTS.md`. code in `eslint.config.mjs`, `compose.yaml`

### 3. Design system & UI foundation · existing
Tailwind principles from refine app-crm-minimal, shared components, teacher on desktop and student on a phone; the `build-ui` project skill carries the conventions. code in `src/components/`, `.claude/skills/build-ui/`

### 4. Data foundation · existing
Drizzle schema per domain, data layer as the only database importer, test database reset per run. Spec 0002 · code in `src/server/db/`, `src/server/data/`, `drizzle/`

## Slice 1: First full cycle in text

### 5. Accounts, roles & access (E1) · existing
Student sign up and confirmation, sign in, recovery, teacher accounts by the admin, access matrix in one point (AUTH-01 to AUTH-05). Spec 0003 · code in `src/server/auth/`, `src/server/access/`

### 6. Classes & invitation (E2) · existing
Classes, derived link and code valid one hour, join, remove and readmit (CLS-01 to CLS-04). Spec 0004 · code in `src/server/classes/`

### 7. Assignments & student space (E3) · existing
Assignments with derived reception, lock after the first submission, one time zone (ASG-01 to ASG-03, SUB-01). Spec 0005 · code in `src/server/assignments/`

### 8. Text submission (E4) · existing
Pasted text up to 4000 graphemes, notice read once, late marking, two replacements at most (SUB-02, SUB-04, SUB-05). Spec 0006 · code in `src/server/submissions/`, `src/server/data/submissions/`

### 9. AI evaluation proposal (E5) · existing
Versioned rubric, allow listed request, hardened Anthropic adapter, immutable proposal, alerts (EVL-01 to EVL-04). Spec 0007 · code in `src/server/ai/`, `src/server/evaluation/`

### 10. Batch processing & relaunch (E6) · existing
One Workflows run per submission, 10 slots, 5 dollars monthly cap, sweep, retry and relaunch (PRC-01, PRC-02). Spec 0008 · code in `src/server/evaluation/`

### 11. Teacher review (E7) · existing
Copy list, copy screen next to the proposal, free editing with an immutable journal, conflicts, teacher notice (REV-01 to REV-04). Spec 0009 · code in `src/server/review/`, `src/server/data/review/`, `src/app/teacher/`

### 12. Validation, publication & student result (E8) · existing
Validate, publish, withdraw, manual evaluation, student result through a closed projection, leak sweep, freshness guard (REV-05, REV-06, PUB-01, PUB-02). Closed 2026-10-25. Still owed to the engineer: the O4 demo by a teacher and a class. Spec 0010 · code in `src/server/review/`, `src/server/results/`, `src/app/student/`

## Slice 2: Image channel

### 13. Image channel (E9) · in-progress
Students hand in photos of a handwritten copy; the AI reads them faithfully (spelling kept, `[illisible]` never guessed); the student checks and corrects the transcription once before sending (Q4); the teacher sees the confirmed transcription with changed words highlighted, image on demand. Opens with the E9.0 handwriting trial (fictitious photos, `claude-haiku-5-5`).
**Done when:** SUB-03 criteria and the TRX-01 contract pass; every image branch replayed (SUB-04, SUB-05, PRC-01, PRC-02, EVL-02 CA3, EVL-04 CA1, REV-01, REV-02, REV-06); a mixed text and image batch runs with no technical help; the matrix holds for images; the fidelity trial is recorded as is.
Spec [0011](../specs/0011-image-channel/index.md)
- [x] Design it (spec): `/architect image channel`
- [x] Build it: `/develop image channel`
  - [x] Reader, `transcription-1` and the E9.0 trial, engineer checkpoint (AC-11, AC-15, AC-19)
  - [x] Migration and one page end to end on the simulator, image route and matrix (AC-1, AC-3, AC-5, AC-12, AC-14)
  - [x] Student draft screen: pages, order, retake, word changes, limits, notice v5 (AC-2, AC-3, AC-4, AC-8, AC-17)
  - [x] Failure branches and pipeline wiring, teacher and student reads, replacement and late, draft purge (AC-6, AC-7, AC-9, AC-10, AC-13, AC-16, AC-18)
  - [x] Replays, mixed batch, security cases, E2E and final fidelity trial (AC-16, AC-19, AC-20)
- [x] Verify it: `/check verify image channel`
- [x] Test it: `/test image channel`
- [x] Review it (fresh model): `/check review image channel`
- [ ] Document it: `/document image channel`

## Slice 3: Hardening

### 14. Hardening & quality measurement (E10) · needs a decision
A: full automated matrix, leak and AI isolation sweeps on text and image, faults, sessions and links, accessibility, backup export, SDK upgrade procedure, independent review. B: quality measures from the journal under a protocol the client validates (stability, CA3, alerts, reading fidelity); vote k = 3 and thinking variant decided there.
**Done when:** part A passes with no open exception the client has not accepted (blocking for E11); part B reports each measure as is, with a client decision per adjustment.
- [ ] Design it (spec): `/architect hardening and quality measurement`

## Slice 4: Demonstration

### 15. Demonstration (E11) · needs a decision
Final deployment choice, fictitious data set in English, scripted scenarios, Neon warm up, "demo, fictitious data" notice, rehearsal; before: plan active, credit left, key expiry; fallback: manual evaluation or the simulator; after: key revoked.
**Done when:** actors playing a teacher and a class run the full cycle with no technical help (O4); nothing visible before publication or after withdrawal; a demo report the client decides on.
- [ ] Design it (spec): `/architect demonstration`

### 16. Final review
Review of the whole app, admin, teacher and student journeys, final sync of the context files.
**Done when:** a fresh model review of the whole app has no open critical or major finding, and `AGENTS.md` matches the code.
- [ ] Review it: `/check review`

## Deferred
Out of scope for the MVP (V2, `conception/fonctionnalites.md` §3.2), kept so the plan stays honest.
- **Email notifications**: new assignment, result published
- **Batch validation and batch publication**
- **Class dashboards and AI versus teacher indicators** · needs a decision
- **CSV class import, teacher created student accounts** (may move up, Q9)
- **Scans uploaded by the teacher for students**
- **Student data rights page** · needs a decision
- **Image quality alert before sending** (blur, dark, cut)
- **Image deletion at the end of review and retention** (DON-01, step 5; a storage risk on Neon's 1 GB), from spec 0011
- **Advanced assignment and class management**: add a class, extend, close, archive, duplicate
- **PDF hand in** (excluded from the MVP, Q4)
- **Return a copy to the student, per assignment hand in modes, text file import, saved draft**
- **Teacher account suspension, email change, classes with several teachers**
- **Automatic masking of a written name (Q10), grade export, blind review of the AI proposal**

## Legend

**The decision box.** Every feature carries exactly one sub task whose label ends with `(spec)`; skills locate it by that suffix.

- **Next step** = the first unticked box.
- **needs a decision** = run `/architect` first; the tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (built before this workflow, E1 to E8) and `dropped`.
- **Workflow** GA: `/check verify`, then `/test`, then `/check review`, then `/document`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
