# End to end tests

## Overview

Playwright journeys run in the `e2e` container against their own Next server on port 3100, the test database and captured email. One journey per step (`eN-journey.spec.ts`) plus focused specs.

## Commands

```bash
docker compose run --rm e2e
```

Measure specs run only on demand, with `E2E_MEASURE=1`: `e6-batch-measure.spec.ts` (20 copies through the sweep route, test `CRON_SECRET`) and `e7-review-measure.spec.ts` (120 copies).

## Conventions

- Workflows run in the Local World: `WORKFLOW_TARGET_WORLD=local` is set, otherwise `withWorkflow` replaces `WORKFLOW_LOCAL_DATA_DIR` by `.next/workflow-data`.
- Support: `support/review.ts` (review helpers), `support/helpers.ts`; `seedTeacher` reads the teacher notice unless `noticeRead: false`.
- A spec that types into the copy waits for `copy_opened` first (hydration).
- `student-leak.spec.ts` checks every response of the student's browser (RSC refetches, router and browser back, `Cache-Control: no-store`); a new student page joins `studentVisits`.
- Online replays: `playwright.online.config.ts` with `E2E_ONLINE_URL`, on the dev database, never reset; run only after the engineer pushes the preview. The cycle runs with the simulator; with Anthropic only during a demo (`conception/procedures.md`).

## Gotchas

- The first test after a change can exceed 15 s: run again before hunting a bug.
- `review-list.spec.ts` was written against `next dev` (no prefetch there).
- Simulator faults live in the server's memory, so a failed copy in a journey is written in the database.
- `sharp` is importable only by `src/server/submissions/page-image.ts` and `tests/**` (ESLint), not `e2e/`: a journey draws its photos in the browser with a canvas (`e9-journey.spec.ts`).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
