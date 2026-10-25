# Evaluation pipeline

## Overview

Turns a received submission into an immutable AI proposal: alerts, claim, bounded attempts, result recorded only for the expected version. Runs as one Vercel Workflows run per trigger, with slots, a monthly cost cap, a breaker and a sweep. Also hosts the AI commands and the teacher's retry and relaunch.

## Key files

| File | Owns |
|---|---|
| `evaluate.ts` | Service: claim, bounded attempts, `recordEvaluation`; a `stale` result is kept, not current |
| `alerts.ts` | Alerts (EVL-04); blocking ones before any request, `no_content` then `rubric_unavailable`; `very_short` under `SHORT_TEXT_MIN_WORDS` [P] |
| `workflow.ts`, `steps.ts`, `trigger.ts`, `orchestrate.ts` | Workflows run, single step `maxRetries = 0`, `sleep` 20 × 15 s for a slot |
| `budget.ts` | Guard before each attempt: monthly cap on `anthropic` runs (even with the simulator), breaker per provider, one `ai_alert` email to admins per period |
| `sweep.ts` | Sweep at each trigger; cron route `/api/cron/evaluation-sweep` (`CRON_SECRET`, `vercel.json`) |
| `relaunch.ts` | `relaunchConditions()`: languages with a published rubric, `costCapReached()` |
| `prices.ts`, `report.ts`, `trial.ts` | Cost estimate (prices read 2026-10-19), report computation, trial launcher |
| `../data/evaluation/measures.ts`, `scripts/evaluation-report.ts` | `readEvaluationMeasures` and the `ai:report` command, without identity or content |
| `../data/evaluation/system.ts` | The only inserter of `evaluation_runs` and `ai_proposals` (`tests/evaluation-writes.test.ts`); `CLAIM_FROM` |
| `../data/evaluation/teacher.ts` | Teacher retry and relaunch |

## Commands

```bash
docker compose exec -T web npm run ai:evaluate -- --submission|--assignment <id> [--simulate <fault>]
docker compose exec -T web npm run ai:trial -- [--provider anthropic] [--limit <n>]
docker compose exec -T web npm run ai:report -- [--assignment <id>] [--since <date>]
```

The commands use the simulator unless `--provider anthropic` (they ignore `AI_PROVIDER`); a daily stop is counted on the journal (`countAiRequestsToday`, `AI_DAILY_REQUEST_LIMIT`); `SCRIPTS` in `inventory.ts`; data sets in `scripts/fixtures/ai/` (10 + 7, plus 3 `sensitive`). Real sends follow `conception/procedures.md` ("Activer l'envoi réel à l'IA", "Activer l'IA sur la preview").

## Conventions

- `evaluation_runs` and `ai_proposals` are immutable by trigger (`0011`, `forbid_change`); `getCurrentProposal` reads the current one.
- Rubric registry `RUBRIC_VERSIONS` (`src/lib/rubric.ts`, `en-1` = the client's text, frozen by hash); grade = sum of levels, out of 20. `fr-test` is for tests only (`tests/fixtures/rubric-fr-test.ts`, injected by `registry`).
- `submitStudentText`/`replaceStudentText` require a `SubmissionContext` (`onReceived(ref)` after the commit); the action passes `after(() => triggerEvaluation(ref))`; tests use `noTrigger` or `recordTriggers` (`tests/helpers/triggers.ts`). `EvaluationRef` carries identifiers only.
- Claim token: `submissions.claim_token` = `workflowRunId` (`0014`), present exactly in `evaluating`, cleared by `applyTransition`; result, `stillEvaluating`, `releaseEvaluation` and `releaseStep(ref, token)` are guarded by version and token; `ai:evaluate` takes a random token.
- Slots: `claimForEvaluation(id, { expectedVersion, slots })` takes an awaited advisory lock, then counts; returns `"busy"` when the 10 slots are taken.
- Migration `0013` adds `ai_unavailable`, `budget`, `truncated` and the events `ai_cost_cap_reached`, `ai_breaker_tripped`.
- `budget` error → `not_assessable`/`ai_unavailable` (run `failed`, `unavailable: true`); `truncated` and Retry-After above 30 s are not retried; `refused` is never retried, its usage summed. `AI_CALL_TIMEOUT_MS` = 60 000; `EVALUATION_STEP_MAX_MS` = 280 s (counts 2 alerts, below 300 s).
- Never left in `evaluating`: fallback `releaseEvaluation`, sweep `releaseStuckSubmissions` beyond `EVALUATION_STUCK_AFTER_MS` [P]; `takeStaleReceived` dated by `markRestarted`.
- Retry and relaunch: rights `unpublishedEvaluation:write`, `listRelaunchable` on `submission:read`; each takes the seen version (`SeenVersion`, else `changed`); a single use request (`0015`, `submissions.evaluation_request`, set by `recordEvaluationRequest`, required by claim 6 or 7, cleared by any transition); the version goes to `ctx.onStart`, transition 6 or 7 happens in the step (`EvaluationRef.origin` = `auto`, `retry`, `relaunch`); never a copy where `teacher_started_at` is set. Relaunchable causes: `rubric_unavailable` and `ai_unavailable`, never `no_content`. After a provider `budget` error, relaunch is offered only once a run of the same provider has succeeded since [P]. A request without a slot is abandoned (`abandonStep` → `abandonEvaluationRequest`, `retry_abandoned` without actor).
- Step dependencies are created after the claim (`AiConfigurationError` → `evaluation_failed` + `ai_configuration_failed`). Calls without usage count at one call's cap. The alert is recorded after sending, bounded by `AI_ALERT_SEND_MAX_MS`. Alert `ai_provider_unreachable`: `AI_UNREACHABLE_FAILURES` [P] = 3 over `AI_UNREACHABLE_WINDOW_MS` [P] = 1 h, no call stopped.
- `workflow*` is importable only in `src/server/evaluation/**` and `next.config.ts` (ESLint); the error is identified by its class only. No prompt caching [D, 2026-10-20], to revisit if AI cost becomes the limit.

## Gotchas

- `withWorkflow` in `next.config.ts` generates the route under `src/app/.well-known/workflow/` (ignored by git and ESLint); its routes are in `ENTRY_POINTS` (`entrySources`), and that test needs the dev server to have run.
- The Vercel cron runs only in production, not on the preview: there, opening the copy list or a copy runs the sweep.
- Never set `WORKFLOW_TARGET_WORLD` on Vercel, and no Workflows variable at all.

## Related specs

- [0007 AI evaluation](../../../docs/specs/0007-ai-evaluation/index.md) · [0008 batch processing](../../../docs/specs/0008-batch-processing/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
