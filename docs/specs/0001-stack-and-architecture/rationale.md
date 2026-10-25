# 0001. Stack and architecture: decision record

## Context

Academic project with one developer and a colleague playing the client. Budget: zero cash cost. Demo with simulated actors and fictitious data. The full decision record, in French, is in the design folder, which stays the source of truth for requirements:

- [conception/stack-technologique.md](../../../conception/stack-technologique.md): stack, limits, architecture rules, provisional values per step, history of the AI provider.
- [conception/annexe-ia-anthropic.md](../../../conception/annexe-ia-anthropic.md): dated facts on Anthropic, SDK audit, rejected options.

## Options considered

Recorded in `conception/stack-technologique.md` §3 and §5: Mistral (dropped 2026-10-16, free tier keys not enabled), OpenRouter free model (dropped 2026-10-19, latency and a 50 requests per day quota made EVL-03 CA3 unmeasurable), Anthropic direct (kept). Agent frameworks (LangChain, LangGraph, Vercel AI SDK, Mastra, Claude Agent SDK, Managed Agents) were rejected: a fixed chain of specialized calls orchestrated by code is enough.

## Rationale

Every choice serves the zero cost demo while keeping the invariants enforceable in the database and the data layer. A simulator behind every external service keeps tests deterministic and offline.

## References

**Project sources**:
- `conception/stack-technologique.md`, `conception/annexe-ia-anthropic.md`, `conception/annexe-essais-ia.md`
- `conception/prompts-implementation.md` §1 (framing decisions of 2026-10-12)
