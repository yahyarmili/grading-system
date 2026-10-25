<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Grading system

Grading of students' written work (English, French). The student hands in a text or images of a copy; the system transcribes without correcting; an AI (`claude-haiku-5-5`) proposes a level from 0 to 4 on the 5 criteria of a fixed rubric, with remarks, without the student's identity. The teacher rereads, edits, validates, publishes; the student sees only what is published. Roles: admin, teacher, student. Academic demo, fictitious data, zero cash cost: the AI is paid by the developer's monthly Max plan API credit. Where things stand: [docs/scope/scope.md](docs/scope/scope.md).

## Working with the engineer

- Reply to the engineer in French. App content, code and identifiers are in English; `docs/` and `AGENTS.md` files are in English; `conception/` is in French.
- The engineer runs the work one step at a time and validates each; never get ahead of the next step. Each step follows the skills cycle in the scope: `/architect` (spec) → `/develop` → `/check verify` → `/test` → `/check review` → `/document`; `/debug` for a confirmed defect, `/sync` once a change is complete, `/scope` to replan. Call a skill at the step where it fits, not in a fixed chain.
- Before a fix, have a fresh subagent confirm a reported problem is reproducible (prompt T4 in `conception/prompts-implementation.md` §3).
- Ask before running integration or E2E tests: other sessions may be using the shared test database.

## Stack

Mirrors [spec 0001](docs/specs/0001-stack-and-architecture/index.md).
- **Language / Runtime**: TypeScript, Node 24 (in Docker only)
- **Framework**: Next.js 16.4 (`proxy.ts`, `cacheComponents`), React 19.3, Tailwind CSS 4
- **Key dependencies**: Drizzle ORM with `pg` on Neon, Better Auth, `workflow` 5.2.2 (Vercel Workflows), `@anthropic-ai/sdk` 0.135.0 exact, Zod 4, Nodemailer
- **Package manager**: npm, run inside the `web` container

## Build approach

**Tracer Bullet**: thin end to end slices through every layer, then thicken (text cycle complete in E8, image channel in E9). Workflow tier: **GA**.

## Commands

Node runs only in Docker. Run npm from the Bash tool (PowerShell 5.1 breaks quotes), with `MSYS_NO_PATHCONV=1` for a container path.

```bash
# Dev server (http://localhost:3000); after editing .env.local: docker compose up -d
docker compose up
# Any npm command
docker compose exec -T web npm <script>
# Tests: unit and integration projects (integration is slow and sequential)
docker compose exec -T web npm test
# E2E (own Next server on port 3100, test database, captured email)
docker compose run --rm e2e
# Build: never in web, only in e2e; then: docker compose restart web
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/` (`index.md` + `rationale.md`) or `docs/specs/NNNN-title.md`. Requirements and acceptance criteria come from `conception/fonctionnalites.md` (feature IDs such as AUTH-01, criteria CA1…).

## Rules

- Secrets: the engineer creates accounts and secrets; code reads `process.env`. **Never read `.env*`.** The Anthropic key is `GRADING_ANTHROPIC_API_KEY`, never `ANTHROPIC_API_KEY` (Claude Code would use it instead of the subscription); any `ANTHROPIC_*` variable and `NODE_DEBUG` are refused at start.
- A value nobody decided goes in `src/config/provisional.ts`, marked [P] and reported; never invent a number. A decided value goes in `src/config/decisions.ts`.
- Time zone `Africa/Casablanca` (`DEADLINE_TIME_ZONE`): convert with `src/lib/time-zone.ts`, display with `formatDate`/`formatDateTime` (`src/lib/dates.ts`), never an `Intl.DateTimeFormat` in UTC. Tests follow Node's tzdata (Morocco on GMT+0 since 2026-09-20).
- No Prettier in the project (long lines); never run `npx prettier`.
- The five architecture rules and the ten product invariants: [src/server/AGENTS.md](src/server/AGENTS.md).
- Deployment: Vercel Hobby, region `cle1`; `preview` builds the public preview on the dev database; `main` is never deployed (its build fails on purpose). Migrate dev before pushing. Variables live in Vercel, Preview environment only, added by the engineer. Neon suspends after 5 minutes (4 to 5 s to wake). Procedures: `conception/procedures.md`.

## Git

- integration: off
- Work happens on `preview`. At the end of each step: one commit on `preview`, **never pushed** unless the engineer asks. `main` does not move.

## Agent skills

- [better-auth-best-practices](.claude/skills/better-auth-best-practices/): `better-auth/skills`, Better Auth server and client setup
- [better-auth-security-best-practices](.claude/skills/better-auth-security-best-practices/): `better-auth/skills`, rate limits, secrets, sessions, cookies
- [create-auth](.claude/skills/create-auth/): `better-auth/skills`, scaffolding auth flows
- [email-and-password-best-practices](.claude/skills/email-and-password-best-practices/): `better-auth/skills`, verification, reset, password policy
- [build-ui](.claude/skills/build-ui/): project skill, the design system and responsive conventions for every screen
- Subagent [feature-reviewer](.claude/agents/feature-reviewer.md): independent read only review of a finished feature

## Context files

- [conception/AGENTS.md](conception/AGENTS.md): the design documents (French), decision markers, how to change a decision
- [src/server/AGENTS.md](src/server/AGENTS.md): architecture rules, invariants, access matrix, data layer, submissions, auth, email
- [src/server/db/AGENTS.md](src/server/db/AGENTS.md): Drizzle, naming, migrations, two clocks
- [src/server/ai/AGENTS.md](src/server/ai/AGENTS.md): the hardened Anthropic adapter and its guarantees
- [src/server/evaluation/AGENTS.md](src/server/evaluation/AGENTS.md): evaluation pipeline, Workflows, budget, sweep, relaunch, AI commands
- [src/server/review/AGENTS.md](src/server/review/AGENTS.md): teacher review, journal, validation, publication, student result
- [src/app/AGENTS.md](src/app/AGENTS.md): routes, real 404, freshness guard, UI conventions
- [tests/AGENTS.md](tests/AGENTS.md): unit and integration tests, helpers, leak sweep
- [e2e/AGENTS.md](e2e/AGENTS.md): Playwright journeys, Local World, online replays

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
