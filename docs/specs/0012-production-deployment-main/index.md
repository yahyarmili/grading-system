# 0012. Production deployment from `main`, with the real AI (E9.5)

**Date**: 2026-10-26
**Status**: Proposed

## Summary

`main` becomes the production branch: it always holds the last working version, and Vercel deploys it as the project's public production site, with its own Neon database and the real AI (`claude-haiku-5-5`) switched on for good. Work keeps happening on `preview` (deployed as before, on the dev database and the simulator); when a step is closed and its tests pass, `preview` moves into `main` by a fast forward (no merge commit), on the engineer's request. Every production page says "demo, fictitious data", production refuses to lose an email silently, and one small wrapper script lets the agent migrate the production database, create its first admin and read its AI results without ever seeing the database address.

## Requirements

**User stories**:
- As the engineer, I want `main` to always be the deployed working version, so that anyone can use the real app while new work happens elsewhere.
- As a teacher or a student of the production site, I want the AI to propose an evaluation of a copy, so that the full cycle works as designed, not on a simulator.
- As the engineer, I want production isolated from dev and tests, and its AI spend capped, so that a test reset or a runaway batch cannot hurt it or my credit.
- As anyone landing on production, I want to be told it is a demo with fictitious data, so that nobody sends real student work to the AI.

**Acceptance criteria** (the contract):
- **AC-1**: A push to `main` produces a Vercel Production deployment, served at the project's `vercel.app` production domain. A push to `preview` still produces a Preview deployment only. `vercel.json` no longer disables `main`; its region (`cle1`) and cron stay.
- **AC-2**: Production uses its own Neon project. Data written on production never appears in the dev database and the reverse; the test database is untouched by every production step.
- **AC-3**: On production, a fictitious text submission, then a fictitious one page image submission, by a student of a class whose teacher was created by the admin, each reach `to_review` with a run `provider = 'anthropic'`, `model_answered = 'claude-haiku-5-5'`, `outcome = 'proposed'`, and one `ai_request_sent` line whose subject is the submission. No duplicate run. The engineer creates the teacher from the admin screens and the student by the public sign up (confirmed through the email), and types every password; the image is a fictitious page from `scripts/fixtures/ai/`. The agent reads the result with `npm run prod -- ai:read` (and `ai:report`).
- **AC-4**: The existing AI guards hold on production with no code change and count production only: the monthly cap (`AI_MONTHLY_COST_CAP_USD`, 5 dollars, [P]) and the daily limit (`AI_DAILY_REQUEST_LIMIT`, 200) read the production database; the breaker and the "AI unavailable" path work as on dev.
- **AC-5**: Every production page (signed out, admin, teacher, student) shows the notice "Demo, fictitious data only. Do not submit real student work." Local development, the E2E server and Preview deployments do not show it.
- **AC-6**: When `VERCEL_ENV` is `production`, the transport is SMTP or nothing: with `SMTP_USER` or `SMTP_PASSWORD` missing, sending an email throws a configuration error and nothing is captured, and this check comes before `EMAIL_TRANSPORT` (so `EMAIL_TRANSPORT=capture` cannot drop production mail either). The check stays lazy (at the first send, never at import), so a build never fails on it. In every other environment the transport choice is unchanged (tests and E2E capture, SMTP when both variables exist).
- **AC-7**: `npm run prod -- <script>` runs one allowed script against production: `db:migrate`, `admin:create`, `ai:read`, `ai:report`, nothing else. It runs the script as a child process with `DATABASE_URL` set to `PRODUCTION_DATABASE_URL` and `BETTER_AUTH_URL` set to `PRODUCTION_APP_URL`, forwarding the script's arguments. It exits non zero, naming the problem but never a value, when either variable is unset, when the script is not allowed, or when `PRODUCTION_DATABASE_URL` points at the same host and database as `DATABASE_URL` or `DATABASE_URL_TEST` (URLs compared after parsing, not as raw strings). For `admin:create` it also refuses when `SMTP_USER` or `SMTP_PASSWORD` is missing, so the one time setup link is always emailed, never printed. No variable value is ever printed.
- **AC-8**: On production, Vercel's daily cron calls `/api/cron/evaluation-sweep` with `CRON_SECRET` and gets 200, checked by the engineer with the cron's "Run" button in Vercel (Settings, Cron Jobs) and its log; a call without the secret gets 401, checked by the agent with a plain request.
- **AC-9**: The release procedure is written in `conception/procedures.md` (French): the gate, migrate dev, migrate production, `git merge --ff-only preview` into `main`, push both branches, check production; the rollback (Vercel Instant Rollback, then a fix through the normal path); and the renewal of the production AI key. The first release is done with it: `main` equals `preview` at the tip of E9.5 and AC-1 to AC-8 are checked on production.
- **AC-10**: Preview is unchanged: simulator (no `AI_PROVIDER` nor key in the Preview environment), dev database, no notice.

## Decision

**Chosen option**: Option 1 (branches), Option A (database), Option X (AI), see [rationale.md](rationale.md).

`main` is production and only ever moves by fast forward from `preview` once a step passes the release gate; production runs on its own Neon project with the real AI always on, behind the existing guards and a visible demo notice.

**Implementation skills**: `build-ui` (project skill, `.claude/skills/build-ui/`), for the notice banner.

## Feature design

**Data model sketch**: no schema change. The production Neon project receives the same migrations as dev (`drizzle/`), in the same order. Region `us-east-2`, as dev (closest to `cle1`).

**Branch and environment model**:

| Branch | Vercel environment | Database | AI | Notice |
|---|---|---|---|---|
| `preview` (work, integration) | Preview | dev Neon project | simulator | no |
| `main` (production) | Production | production Neon project | `anthropic`, always | yes |
| local, Docker | none | dev (and the test database for tests) | simulator unless `--provider anthropic` | no |

**Release flow** (the gate, then the move):
1. Gate: the step's GA cycle is closed (`/check verify`, `/test`, `/check review`, `/document`), `npm test` is green, the E2E suite is green, the pushed preview was seen working (one quick journey online), and the new migrations' SQL was read for `DROP`, `RENAME` or `SET NOT NULL` (none allowed in the same release as the code that stops using the column).
2. `git merge-base --is-ancestor main preview` must succeed; otherwise stop and ask.
3. Migrate dev (as today), then `npm run prod -- db:migrate`.
4. `git checkout main && git merge --ff-only preview`; a refusal means `main` moved on its own: stop and ask, never force.
5. Push `main` and `preview`, only on the engineer's request.
6. Check production: the deployment is ready, the notice shows, one journey works. AC-3 runs at the first release; later releases replay it only when the step touched the AI chain.

Before the very first push, three extra checks (names only): every Production variable below is set, "Automatically expose System Environment Variables" is on, and Vercel's production branch is `main` (Settings, Git; GitHub's default branch is a separate setting, already `main`).

**Rollback, as Vercel Hobby allows it**: Instant Rollback goes back to the previous production deployment only (not two back). While rolled back, new pushes to `main` build but do not go live until a deployment is promoted again. A urgent fix has no shortcut: `preview` may carry unfinished work, and cherry picking onto `main` breaks the fast forward invariant, so either the fix waits for the gate or production stays rolled back meanwhile.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Notice banner | "is this production?" | `VERCEL_ENV === "production"`, a server side `process.env` read (not `NEXT_PUBLIC_`), fixed per deployment, so resolved at build time; never `headers()` or `cookies()`, which would break the static shell under `cacheComponents` |
| Notice banner | the text, placement | constant in code, decided here (English, like the app); a bar at the top of the root layout, so on every page including the real 404; not dismissible; `role="note"` |
| Email transport | "is this production?" | `VERCEL_ENV`, added to `EmailEnv`, checked first |
| `prod` wrapper (`scripts/prod-run.ts`, run with `tsx`) | production database address | `PRODUCTION_DATABASE_URL`, Neon's **direct** (unpooled) connection string, in `.env.local`, reaching the container through `compose.yaml`'s `env_file`; the script reads the environment only, never a file |
| `prod` wrapper | the address of the dev and test bases, for the guard | `DATABASE_URL`, `DATABASE_URL_TEST` (already in the container) |
| `prod -- admin:create` | admin email, first and last name | given by the engineer in chat at build time, forwarded as arguments |
| `prod -- admin:create` | link base address | `PRODUCTION_APP_URL` in `.env.local`, passed as `BETTER_AUTH_URL` |
| `prod -- admin:create` | the email itself | the SMTP variables already in `.env.local` (the same Gmail as preview); sender is `SMTP_USER` |
| `prod -- ai:read`, `ai:report` | runs, outcomes, `ai_request_sent` lines, monthly spend | the production database, read only (existing scripts) |
| Production runtime | database, auth secret, address, SMTP, AI, cron secret | Vercel, Production environment only (table below), set by the engineer |
| AI guards | cap and daily limit | `src/config/provisional.ts`, unchanged; counted on the production database |

**Key invariants**:
- `main` only ever moves by fast forward from `preview`; nothing is committed on `main` directly.
- Production and dev never share a database, an auth secret, or an AI key.
- Migrations stay additive (expand, then contract in a later release): the previous deployment must keep running on the new schema, which is what makes Instant Rollback safe.
- The production database address is never printed, logged or read by the agent; the wrappers pass it through the environment only.
- Preview never gets AI variables.
- No real student work on production while Q12 is open (conception C4); the notice says so on every page.

**Security model**: unchanged access matrix. Teacher accounts are created only by the admin (the engineer), so a stranger who signs up as a student cannot submit anything, nor trigger an AI call, without a class code from such a teacher. The production key belongs to a service account, is limited to the `grading_system` workspace (whose 10 dollar monthly limit caps dev, preview and production together), and has a short expiry renewed each credit cycle. `BETTER_AUTH_SECRET` and `CRON_SECRET` are new values, distinct from dev.

**Configuration required** (Vercel, **Production** environment only, set by the engineer; values never read by the agent):
- `DATABASE_URL`: the production Neon project, pooled connection string.
- `BETTER_AUTH_SECRET`: new, distinct from dev.
- `BETTER_AUTH_URL`: the production `vercel.app` address.
- `SMTP_USER`, `SMTP_PASSWORD`: the same Gmail as preview.
- `AI_PROVIDER`: `anthropic`.
- `GRADING_ANTHROPIC_API_KEY`: the production service account key ("Sensitive").
- `CRON_SECRET`: new random value.
- Never `ANTHROPIC_*`, `NODE_DEBUG`, `WORKFLOW_TARGET_WORLD`, `WORKFLOW_LOCAL_*`, `EMAIL_TRANSPORT`, `MAIL_CAPTURE_DIR`.

`BETTER_AUTH_URL` is the stable production alias with `https`; only that address is supported (a per deployment `vercel.app` URL would fail Better Auth's origin check at sign in). No `trustedOrigins` is added.

In `.env.local` (local only, never read by the agent): `PRODUCTION_DATABASE_URL` (direct connection), `PRODUCTION_APP_URL`.

**Critical test scenarios**:
- Happy path: first release, a fictitious text then image submission evaluated by Haiku on production, verifies **AC-1**, **AC-3**.
- Isolation: a row written on production is absent from dev, a row on dev absent from production, verifies **AC-2**.
- Email: `selectTransport` with `VERCEL_ENV = "production"` and no SMTP throws, also with `EMAIL_TRANSPORT = "capture"`; without `VERCEL_ENV` it still captures, verifies **AC-6**.
- Wrapper: missing variable, a script not allowed, `PRODUCTION_DATABASE_URL` naming the dev or test base (same host and database, different spelling), and `admin:create` without SMTP, all refused with no value printed, verifies **AC-7**.
- Notice: shown when `VERCEL_ENV = "production"`, absent otherwise; absent in the E2E journeys, verifies **AC-5**, **AC-10**.
- Cron: 401 without the secret, 200 with it, on production, verifies **AC-8**.

## Build plan

Tracer Bullet: the code that must exist before the AI goes public comes first, then the thin thread through production (one release end to end), then the written procedure that makes it repeatable.

1. `vercel.json`: remove `git.deploymentEnabled.main`; keep the region and the cron, satisfies **AC-1**
2. Notice banner in the root layout, shown only when `VERCEL_ENV === "production"` (a pure function tested apart, the banner per `build-ui`), satisfies **AC-5**, **AC-10**
3. Email: add `VERCEL_ENV` to `EmailEnv`; in production, checked first and lazily, missing SMTP throws a configuration error instead of capturing; unit tests, satisfies **AC-6**
4. Wrapper `scripts/prod-run.ts` and the `prod` npm script: allow list, mapping of `PRODUCTION_*`, parsed URL guard against `DATABASE_URL` and `DATABASE_URL_TEST`, SMTP required for `admin:create`, argument forwarding, no value ever printed; unit tests on the guard, satisfies **AC-7**
5. Engineer checkpoint: create the Neon project (`us-east-2`, same Postgres version as dev), the service account and its workspace limited key, the Vercel Production variables, and the two `.env.local` entries; then the three first push checks (variables by name, system variables exposed, production branch `main`); the agent checks names only, satisfies **AC-2**, **AC-4**
6. `npm run prod -- db:migrate`, then `npm run prod -- admin:create` with the identity the engineer gives; the engineer opens the emailed link and sets the password. A lost email is recovered with "forgot password" (a second `admin:create` is refused), satisfies **AC-2**, **AC-7**
7. Write in `conception/procedures.md`: « Livrer une version en production » (gate, ancestry check, migrations, fast forward, push, checks, rollback within Hobby's limits, no urgent shortcut) and « Renouveler la clé d'IA de production »; update its line saying `AI_PROVIDER` is never set in Vercel (now: never in Preview, always in Production); mark « Activer l'IA sur la preview » as superseded for demos (demos now run on production); record the decision [D, 2026-10-26] in `fonctionnalites.md` §8 and `stack-technologique.md` (prompt T5), satisfies **AC-9**
8. First release by that procedure: gate, migrations, `git merge --ff-only preview` into `main`, push on request, then check online: AC-1, AC-3 (text and image, read with `prod -- ai:read`), AC-4 (`prod -- ai:report` shows production's spend only), AC-2 (the AC-3 rows are absent from dev), AC-5, AC-8 (401 by the agent, 200 by the engineer) and AC-10, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-8**, **AC-9**, **AC-10**

## Migration plan

**Strategy**: no data migration; a new, empty production database receives the existing migrations.
**Phases**:
1. Code (tasks 1 to 4) lands on `preview`, deployed as Preview: nothing changes for production yet, since `main` is still disabled in the deployed `vercel.json` of `main`.
2. Production database ready and admin created (tasks 5, 6).
3. The fast forward brings the new `vercel.json` to `main`: its push is the first Production deployment.
**Rollback**: before the first release, nothing to undo. After it: Vercel Instant Rollback to the previous production deployment; in the worst case, remove `AI_PROVIDER` from Production and redeploy (simulator), or revoke the key (copies go "AI unavailable", manual evaluation stays).
**Risks**: a Production variable missing or wrong (caught by the step 8 checks, and loudly for SMTP by AC-6); the key expiring unnoticed (copies go "AI unavailable", renewal procedure); Neon free quotas per project (maybe 0.5 GB rather than the 1 GB cited so far: check in the Neon console); the first request after 5 idle minutes takes 4 to 5 s on the public site (accepted).

## Consequences

**Positive**:
- The working version is always reachable and usable with the real AI; the demo (E11) no longer needs the "AI on the preview" dance.
- Dev, tests and production cannot damage each other; each has its own AI cap.
- A release is a fast forward: `main` history is exactly what was validated on `preview`.

**Negative / tradeoffs**:
- AI spend can now happen without the engineer present: bounded by the 5 dollar cap per base, 200 requests a day, and the 10 dollar workspace limit, but real.
- A public site with real AI sits next to conception C4: the notice and admin only teacher accounts reduce the risk, they do not remove it. Real copies stay forbidden until Q12.
- More to operate: a second Neon project, a second set of Vercel variables, a key to renew each cycle, a release procedure to follow.
- The production database URL lives in `.env.local` on the workstation, next to dev's.
- Shared Gmail: production and preview share Gmail's daily sending limit.

**Neutral**:
- Updates owed elsewhere: spec 0001 (Hosting row, E11 follow up), root `AGENTS.md` and `CLAUDE.md` (Deployment and Git rules, by `/sync`), the scope (E9.5 row, E11 loses its "final deployment choice").
- The Vercel cron now runs (production only), once a day at 03:00 UTC.

## Follow-up

- [ ] `/sync` after E9.5: root `AGENTS.md` Deployment and Git lines (`main` is production, moved by fast forward on request), `src/server/email` notes on the production refusal.
- [ ] E11: the demo runs on production; its scope row drops "final deployment choice" and keeps the data set, scenarios, rehearsal, and key revoked after.
- [ ] Check in the Neon console the free tier quotas per project (storage, compute hours) and record them in `conception/stack-technologique.md`.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
