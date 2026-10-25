# 0007. Rubric and AI evaluation proposal (E5)

**Date**: 2026-10-19
**Status**: Accepted

## Summary

The AI (`claude-haiku-5-5`, Anthropic API direct) proposes a level from 0 to 4 on the five criteria of a fixed rubric, with remarks, and never learns who the student is. The proposal is immutable. The grade is the sum of levels, out of 20. One hardened adapter sends the request and journals it before sending. This spec documents shipped work (step E5, replanned for Anthropic in E5.11).

## Requirements

**Acceptance criteria**: the criteria of EVL-01 to EVL-04 in `conception/fonctionnalites.md` §6; EVL-03 CA3 exceeded once (a03), accepted [D, 2026-10-19].
- **AC-1**: No student identity, no assignment level and no identifier in the AI input (invariant 4); `tests/evaluation-leak.int.test.ts`.
- **AC-2**: The request is built in one point (`buildEvaluationRequest`, allow list, `PROMPT_VERSION` frozen by hash).
- **AC-3**: Each adapter guarantee is tested with its counter test (`src/server/ai/anthropic.test.ts`): journal before send, bounded duration including the read, `ANTHROPIC_*` and `NODE_DEBUG` refused at start and at each call, key never read implicitly, errors classified without content, no hidden retry, 4 headers only, never `metadata`.
- **AC-4**: `evaluation_runs` and `ai_proposals` are immutable by trigger; only `src/server/data/evaluation/system.ts` inserts them (`tests/evaluation-writes.test.ts`).
- **AC-5**: Blocking alerts before any request (`no_content`, then `rubric_unavailable`); French gets no AI proposal until its rubric is validated (Q6).

## Decision

**Chosen option**: a fixed chain of specialized calls orchestrated by code, no agent and no framework; `@anthropic-ai/sdk` 0.135.0 exact, imported by `src/server/ai/anthropic.ts` only, `messages.create` rather than `messages.parse`.

**Implementation skills**: `claude-api` (built in skill, for the request shape)

## Feature design

- Rubric registry `RUBRIC_VERSIONS` (`src/lib/rubric.ts`), `en-1` frozen by hash; `fr-test` for tests only.
- `Evaluator` interface, fault injecting simulator (default everywhere), real adapter.
- Haiku 5.5: no `temperature` (any value other than 1 gives 400); adaptive thinking counted in `max_tokens`; refusal is HTTP 200 with `stop_reason: "refusal"`, never retried, no fallback.
- `openrouter` stays in the stored enum (immutable rows), outside `selectableAiProviders`.
- Commands: `npm run ai:evaluate`, `npm run ai:trial` (simulator unless `--provider anthropic`), daily stop counted on the journal.

## Build plan

Shipped as E5.0 to E5.16, then E5.9 (review). E5.8 (handwriting trial) moved to E9.0.

## Consequences

**Negative / tradeoffs**:
- AI plus teacher validation does not remove bias (anchoring, halo); texts written by adults do not represent real students.

## Rationale

See [rationale.md](rationale.md).
