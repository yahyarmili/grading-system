# AI adapter

## Overview

The `Evaluator` interface, its fault injecting simulator (the default everywhere) and the real Anthropic adapter. `claude-haiku-5-5` is called direct with `inference_geo: "us"`; a fixed chain of specialized calls orchestrated by code, no agent and no framework.

## Key files

| File | Owns |
|---|---|
| `anthropic.ts` | The only importer of `@anthropic-ai/sdk` (0.135.0 exact, `tests/ai-send-point.test.ts`); one client per call, `guardedFetch` |
| `errors.ts` | Anthropic error classification |
| `output.ts`, `quotes.ts` | Output validator and quote matching |
| `anthropic.test.ts` | One test per guarantee, each with its counter test |

## Conventions

- The adapter journals `ai_request_sent` itself before each send; if the journal fails nothing leaves (`AiJournalError` → `internal`).
- Guarantees: duration bounded, read included; `ANTHROPIC_*` and `NODE_DEBUG` refused at start and at each call; key never read implicitly; errors classified without content; no hidden retry; 4 headers only; never `metadata` [P].
- Hardened by explicit options and by refusing variables at start; detail [P] in `conception/annexe-ia-anthropic.md` §5; `messages.create`, not `messages.parse`.
- The request is built by `buildEvaluationRequest` (allow list, `PROMPT_VERSION` = `evaluation-2`, frozen by hash) from `readEvaluationInput`; leak test `tests/evaluation-leak.int.test.ts`.
- `AI_PROVIDER` = `simulator` | `anthropic`; `aiProviders` (stored) and `selectableAiProviders` in `src/lib/evaluation.ts`; `openrouter` stays in the stored enum (immutable rows), outside the selectable list.
- `Usage` keeps the three stored sums and an in memory `detail` (cache, `inference_geo`) for the trial only (report and `trial-results/` files, never the database).
- `EvaluatorError.status` is shown with the `request-id`.

## Gotchas

- Haiku 5.5: no `temperature` (any value other than 1 gives 400); adaptive thinking by default, counted in `max_tokens`, blocks read by type; a refusal is HTTP 200 with `stop_reason: "refusal"`, no fallback.
- Simulator faults include refusal, `max_tokens`, 529, 402 and the spend limit, without a status classifier.

## Agent skills

- `claude-api` (built in): request shape, vision, structured output, model facts.

## Related specs

- [0007 AI evaluation](../../../docs/specs/0007-ai-evaluation/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
