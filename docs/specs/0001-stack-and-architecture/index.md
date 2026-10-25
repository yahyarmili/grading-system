# 0001. Stack and architecture for the grading system

**Date**: 2026-10-12
**Status**: Accepted

## Summary

The app is one TypeScript Next.js project hosted on Vercel, with PostgreSQL on Neon and the Anthropic API (`claude-haiku-5-5`) as its AI. Everything runs at zero cash cost for an academic demo: the AI is paid by the developer's monthly Max plan API credit. Node runs only inside Docker on the developer machine. This spec documents a decision already made and shipped.

## Requirements

**User stories**:
- As the developer, I want one stack that serves teachers, students and admins at zero cash cost, so that the demo can run without a budget.
- As a teacher, I want the AI to propose grades and the app to keep my decisions, so that I keep control of every published result.

**Acceptance criteria**:
- **AC-1**: The app builds and runs on Vercel Hobby, region `cle1`, from the `preview` branch, with the Neon dev database.
- **AC-2**: Node and npm run only in the Docker containers (`web`, `e2e`); nothing depends on a Node install on the host.
- **AC-3**: The five architecture rules below hold and each is guarded by a test or an ESLint rule.
- **AC-4**: AI, handwriting reading and email each sit behind one interface with a fault injecting simulator, used by default in every test.

## Decision

**Chosen option**: the stack below, decided step by step between 2026-10-12 and 2026-10-19 (AI provider changed twice: Mistral, then OpenRouter, then Anthropic).

**Implementation skills**: `better-auth-best-practices`, `better-auth-security-best-practices`, `create-auth`, `email-and-password-best-practices` (`better-auth/skills`, `.claude/skills/`) · `build-ui` (project skill, `.claude/skills/build-ui/`)

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Developer preference, one language end to end |
| Framework | Next.js 16.4 (App Router, `proxy.ts`, `cacheComponents`), React 19.3, Tailwind CSS 4, radix-ui, GSAP | Developer preference; read `node_modules/next/dist/docs/` before using an API |
| Primary DB | PostgreSQL on Neon free tier (`us-east-2`), Drizzle ORM with `pg` | Relational data and DB triggers for invariants; 1 GB limit |
| Auth | Better Auth, without its HTTP handler (Server Actions only) | Email and password, sessions, single role per account |
| Batch processing | Vercel Workflows, `workflow` 5.2.2 exact | Durable runs, resumes after a crash |
| AI | Anthropic API direct, `claude-haiku-5-5`, `inference_geo: "us"`, `@anthropic-ai/sdk` 0.135.0 exact, hardened, imported by one file | Measurable latency, structured output, paid by the monthly credit |
| Validation | Zod 4 | Server side validation of every input |
| Email | Nodemailer with Gmail SMTP (demo only), capture in tests | Zero cost |
| Images | In PostgreSQL, separate table, one controlled route | No public storage link |
| Tests | Vitest 5.0.4 (unit and integration projects), Playwright 1.64 | One runner per level |
| Hosting | Vercel Hobby, region `cle1` | Zero cost; `main` is never deployed |
| Local dev | Docker Desktop and Docker Compose, Node 24 in a container | No Node on the workstation |
| Observability | Security events and evaluation journal in the database; `npm run ai:report` | No paid monitoring |

**Architecture rules** (each enforced):
1. Access control of the matrix in one point, in the data layer (SEC-01).
2. Images in a separate table, read by one route only; never a public link, never in lists.
3. AI evaluation, handwriting reading and email each behind one interface with a fault injecting simulator (EXP-04).
4. Batch steps are idempotent and carry identifiers only (PRC-01).
5. The AI request is built in one point, from an allow list (EVL-02).

## Build plan

Shipped as phases 0 to 2 and steps E1 to E8 (see `docs/scope/scope.md`). No build left under this spec.

## Consequences

**Positive**:
- Zero cash cost; every external service has a simulator, so tests never reach the network.

**Negative / tradeoffs**:
- 4.5 MB per Vercel request and 1 GB of database bound the image channel (E9).
- Neon suspends after 5 minutes (4 to 5 s to wake) and is far from the container (about 175 ms per query), so integration tests are slow.
- Gmail SMTP and the Max plan credit fit a demo, not real use.
- Data leaves Morocco (Vercel, Neon, Anthropic in the United States): fine for fictitious data; real use needs CNDP authorization, to be confirmed by the CNDP or a lawyer.

## Follow-up

- [ ] E9: confirm Haiku vision behind a separate `Reader` interface (trial E9.0).
- [ ] E11: decide the final deployment (keep the preview, make `preview` the production branch, or deploy `main` with its own Neon database).

## Rationale

See [rationale.md](rationale.md).
