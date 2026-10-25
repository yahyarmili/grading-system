# 0008. Automatic batch processing, failures and relaunch (E6)

**Date**: 2026-10-20
**Status**: Accepted

## Summary

Each received submission starts one Vercel Workflows run, which claims the submission in the database and calls the AI once, with no hidden retry. At most 10 evaluations run at once, and spending is capped at 5 dollars per month. A teacher can retry or relaunch a failed copy. This spec documents shipped work (step E6).

## Requirements

**Acceptance criteria**: the criteria of PRC-01, PRC-02 and NFR-EXP-01, EXP-02, passed in E6.5 and reviewed in E6.6.
- **AC-1**: A submission never stays stuck in `evaluating` (`releaseEvaluation`, `releaseStuckSubmissions` beyond `EVALUATION_STUCK_AFTER_MS`).
- **AC-2**: A result is kept only for the expected version and claim token (`submissions.claim_token` = `workflowRunId`, present exactly in `evaluating`).
- **AC-3**: Retry and relaunch need a single use request (`submissions.evaluation_request`).

## Decision

**Chosen option**: one run per trigger; barrier = claim in the database on the expected version; semaphore of 10 (advisory lock, then count); one AI step with `maxRetries = 0`; `budget` and `truncated` never retried; a Retry-After above 30 s stops.

## Feature design

- `src/server/evaluation/{workflow,steps,trigger,orchestrate,budget,sweep}.ts`; `workflow*` importable only in `src/server/evaluation/**` and `next.config.ts` (ESLint).
- Server Actions pass `after(() => triggerEvaluation(ref))`; tests use `noTrigger` or `recordTriggers` (`tests/helpers/triggers.ts`).
- Cron route `/api/cron/evaluation-sweep` (`CRON_SECRET`, `vercel.json`) runs in production only; on the preview, opening the copy list or a copy runs the sweep.
- Report: `npm run ai:report -- [--assignment <id>] [--since <date>]`.

## Build plan

Shipped as E6.1 to E6.6.

## Consequences

**Neutral**:
- Measured: 0.0011 dollars per copy; the cap allows about 4,600 copies per month, Workflows Hobby about 6,700.

## Rationale

See [rationale.md](rationale.md).
