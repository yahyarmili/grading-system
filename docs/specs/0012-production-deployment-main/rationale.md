# 0012. Production deployment from `main`: rationale

## Context

> ⚠️ Premise note: a public production site with the real AI always on runs into conception C4 ("no real copy goes to a provider before Q12a to Q12c") and DON-02 (Anthropic's data sheet not validated by the client). Production itself is fine. The risk is that someone treats it as a real tool. This spec keeps the AI on, as the engineer wants, and relies on three things: a notice on every page, teacher accounts only created by the admin, and the rule, written again in the procedure, that real copies stay forbidden. Lifting C4 remains a client decision (Q12), not something this step can do.

Since E1, `main` has never been deployed. `vercel.json` disables it (`git.deploymentEnabled.main: false`), spec 0001 records "`main` is never deployed", and `main` stayed at E1 (151 commits behind `preview`, which is still a fast forward away). The only public site is the Preview deployment of `preview`. It runs on the dev Neon database and on the simulator, and the real AI was switched on there only during a demo, by hand, then switched off again (procedure « Activer l'IA sur la preview », replayed on 2026-10-20).

The engineer wants the usual setup instead: the last working version always deployed and always on `main`, and all new work on other branches. Users of that version should get real evaluations from `claude-haiku-5-5`, for text and image copies. E9 is closed; E10 (hardening) and E11 (demo) are next, and E11 listed "final deployment choice" as open (spec 0001 follow up: keep the preview, make `preview` the production branch, or deploy `main` with its own database).

Forces: zero cash cost (Vercel Hobby, Neon free tier, the developer's monthly API credit of 100 dollars with no carry over); one developer who validates each step; secrets never read by the agent; a shared test database other sessions may use; the dev database shared by local dev and the preview; AI guards already in code (5 dollar monthly cap [P] and 200 requests a day, both counted in the database they run on; breaker; "AI unavailable" path) and a 10 dollar monthly limit on the `grading_system` workspace in the Anthropic Console. Not deciding keeps every demo dependent on a manual switch of variables, and keeps `main` meaningless.

## Options considered

### Branches

**Option 1: `main` production, `preview` integration (chosen).** Work stays on `preview`; a step that passes the gate moves to `main` by fast forward.
- Pros: nothing changes in the daily workflow; `main` history is exactly what was validated; the existing Preview variables and procedures keep working.
- Cons: `preview` mixes finished and unfinished work between releases; a hotfix has to go through `preview` too.

**Option 2: one branch per step from `main`, `preview` retired.** The GitHub flow: `e10-hardening` and so on, each with its own Preview URL, merged into `main`.
- Pros: the standard model; each step isolated.
- Cons: each branch gets a new preview URL (`BETTER_AUTH_URL` and email links tied to one address break), Preview variables must cover every branch, and the project's sessions and docs all assume `preview`.

**Option 3: `main`, `preview`, and short step branches into `preview`.**
- Pros: the most isolation.
- Cons: three levels of ceremony for one developer, with no extra safety the gate does not already give.

### How a version reaches `main`

Fast forward on request (chosen) keeps one history and no merge commits; a GitHub pull request leaves a trace per release but adds a step and a merge or squash commit; a local `--no-ff` merge marks each release but makes `main` diverge, so `main` must be merged back into `preview` every time.

### Production database

**Option A: a new Neon project (chosen).** Own storage and compute quota, own AI cap (the guards count the database they read), and no test run, reset or preview can touch it.
- Cons: one more project to watch; the engineer creates it and its variables.

**Option B: a branch of the dev project.** Write isolation, but it shares the project's storage quota, which the E9 images already weigh on (1 GB in spec 0001, possibly 0.5 GB on the current free plan, to check; image deletion is deferred).

**Option C: the dev database.** No setup, but production data mixes with dev and test data, the AI cap is shared, and a dev mistake becomes a production incident.

### When the AI runs on production

**Option X: always, behind the guards (chosen).** `AI_PROVIDER=anthropic` permanently in Production, with a dedicated service account key.
- Cons: spend can happen without the engineer present, bounded by 5 dollars per base, 200 requests a day and the 10 dollar workspace limit.

**Option Y: only during a demo**, as on the preview today. Safer for the credit and C4, but it is exactly the manual switch the engineer wants to stop.

### Smaller calls

- Release gate: step closed through GA plus `npm test`, E2E and a quick look at the preview online. The step only option risks shipping something that works only on the workstation; adding a real AI trial to every release costs little but is only needed when the AI chain changed.
- Notice now rather than in E11, since production with real AI is public from day one.
- Monthly cap kept at 5 dollars per base: 5 for production plus 5 for dev stays within the 10 dollar workspace limit, so the app's own guard trips before the Console does. At about 0.0011 dollars per copy that is several thousand copies.
- Short key expiry renewed each cycle: a forgotten renewal sends copies to "AI unavailable" (manual evaluation still works), and a leaked key dies quickly. A long expiry saves a monthly step at the price of a longer window for a leak.
- Migrations run by the agent, before the merge, through a wrapper fed by `PRODUCTION_DATABASE_URL` in `.env.local`: the agent never sees the address (it never reads `.env*`), and a failed migration shows before anything ships. Migrating during the Vercel build was rejected: a failure breaks the release midway, and the build would need write rights on the schema.
- Same Gmail as preview (the engineer's choice): no new account; the cost is a shared daily limit and a shared revocation. Production refuses to capture silently instead, because a lost confirmation email is invisible.
- `vercel.app` domain: zero cost.
- Start empty plus the admin: the fictitious demo data set stays in E11.
- Rollback by Vercel Instant Rollback rather than `git revert`: immediate, no rebuild, and `main` keeps matching `preview`. It is safe only because migrations stay additive.
- Reading production's AI results (updated 2026-10-26, during the build): the first draft named `ai:read` for it, but `ai:read` is the handwriting trial, which sends photos to the AI, and `ai:report` shows neither the model that answered, nor the request lines, nor the month cost against the cap. A new read only `ai:status` was chosen over extending `ai:report`: the report is a measures document copied into conception/, and a release check would blur it. `ai:read` leaves the `prod` allow list, because its calls would count in production's log and cap; trials stay on dev. The month cost reuses the guard's own computation, so what the agent reads is what the guard compares. A cross check on another model then found that AC-4 had claimed the daily limit protects production: it guards the commands only, so AC-4 now rests on the cap and the breaker, and `ai:status` shows the daily count as information.
- Scope placement: a new step E9.5 rather than the head of E10, which would mix two unrelated subjects.

## Rationale

Option 1 wins because the force that matters most is the existing workflow: one developer, steps validated one at a time, every session, procedure and context file built around `preview`. The release model the engineer asked for ("the working version always on `main`, work elsewhere") is fully met by a gate plus a fast forward, without retiring `preview` or multiplying preview URLs, which would break `BETTER_AUTH_URL` and the email links. The fast forward also makes the invariant checkable: `main` is always an ancestor of `preview`.

A separate Neon project (Option A) follows from the shared test and dev database and from the guards: the monthly cap and the daily limit count rows in the database they read, so only a separate database gives production its own budget and keeps dev resets and other sessions away from user data. The storage argument settles Option B: E9 images already press on the 1 GB, with deletion deferred.

Option X is what the engineer asked for, and the existing guards make it acceptable at zero cash cost: they were designed for exactly this (E6), and the workspace limit backs them in the Console. What it does not settle is C4; that is why the notice moves from E11 to now, and why the procedure repeats that real copies stay forbidden until Q12.
