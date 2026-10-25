# Unit and integration tests

## Overview

Vitest with two projects: `unit` (`*.test.ts`, also next to the code in `src/`) and `integration` (`*.int.test.ts`). Every guarantee of the system has a test, and each important one a counter test that proves the test can fail.

## Commands

```bash
docker compose exec -T web npm test
docker compose exec -T web npm run test:unit
docker compose exec -T web npm run test:int
# Vitest UI, from the Terminal panel; then open http://localhost:51204/__vitest__/?token=… (new token each time, port open to this machine only)
docker compose exec web npm run test:ui -- <files>
```

## Conventions

- Integration tests run in sequence on `DATABASE_URL_TEST`, reset and migrated. They are slow (Neon `us-east-2`, about 175 ms per query). **Integration and E2E share the test database: never at the same time**, and ask the engineer first.
- Stop the Vitest UI watch mode before an E2E run. `vitest` and `@vitest/ui` keep the same exact version.
- ESLint import rules are derived from the `IMPORT_RESTRICTIONS` table (`eslint-restrictions.test.ts`).
- Static guard tests keep single writers and imports: `submission-writes`, `evaluation-writes`, `review-writes`, `ai-send-point`, `eslint-restrictions`, `access-inventory`, `route-resources`.
- The matrix is replayed by `access-matrix.int.test.ts` (`REAL`, checked function by function; `REAL` lines wait up to 60 s); the design's table 8.3 by `e4-replays`, `e7-replays`, `e8-replays`.
- Helpers: `helpers/triggers.ts` (`noTrigger`, `recordTriggers`), `helpers/review.ts` (review teachers read the notice; `giveCompleteEvaluation`, `enterByHand`), `helpers/leak.ts`.
- **Leak sweep** (EXP-04, blocking): `helpers/leak.ts` puts per run markers (`PROP-`, `EVAL-`) and internal words in the simulated proposal and the evaluation (`SimulatorEvaluator.setTexts`), and `findLeak` names the first one found in anything a student receives (`student-leak.int.test.ts`, 7 situations). A new student entry point joins `studentReceives` (here) or `studentVisits` (E2E).
- Fixtures: `fixtures/rubric-fr-test.ts` is named by no file outside `tests/`; neither `src/` nor `scripts/` import `tests/`.

## Gotchas

- Never run a build in `web`; the E2E container builds.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
