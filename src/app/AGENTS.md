# App routes and UI

## Overview

Next.js 16 App Router pages for the three roles (`admin/`, `teacher/`, `student/`, `(auth)/`) and API routes. Pages call Server Actions and services in `src/server/`; they never fetch data a role may not see.

## Conventions

- Read the guide in `node_modules/next/dist/docs/` before using a Next API (`proxy.ts`, `cacheComponents`).
- Build or change a screen with the `build-ui` skill: English text, decision dependent texts in `src/lib/texts.ts`, teacher on desktop, student on a phone in portrait, never color alone, empty, loading and error states.
- **Real 404** (E8.6): in production the prerendered shell leaves with its 200 before the page (Cache Components), and a page's `notFound()` sets the status only under `next dev`. The real 404 comes from the proxy: a page that shows a resource by its identifiers is listed in `RESOURCE_PAGES` (`src/lib/route-access.ts`, others in `FIXED_SPACE_PAGES`; `tests/route-resources.test.ts` compares with the disk), with its check in `src/server/routes/resources.ts`, by the same readers as the page. GET and HEAD only (a Server Action posts to its page's path). The page keeps `instant = false` and its `notFound()` as a defense. Statuses checked online: `e2e/route-statuses.spec.ts`.
- **Freshness**: any student page that shows a state or a result takes `FreshnessGuard` (`src/components/freshness-guard.tsx`): each server render carries a `renderId`; a page shown again in the tab is hidden before display, then checked by an action tied to `viewToken`. Today: the result, My assignments and the assignment page. The result page also has `ResultFreshness` with `checkFreshnessAction` (boolean, token = hash of the result, `FRESHNESS_GRACE_MS` [P]). The rubric page takes `?version=`.
- Opening a list or a copy is journaled by `useEffect` → Server Action (`ReviewListOpened`, `CopyOpened`), so a prefetch never journals. "See your result" uses `prefetch={false}`.
- The copy form shares state with `CopyOpened` (`copy-state.tsx`); links on the page go through `leave-guard.tsx`; input is never lost without a choice; `router.refresh()` after each save; bounded refresh while evaluating (`refresh-while.tsx`, `EVALUATION_REFRESH_MS` [P]); `request-button.tsx` guards double clicks.

## Gotchas

- Dev server stuck on "Compiling proxy …" with an idle CPU: stop `web`, clear its Turbopack cache (`docker compose run --rm --no-deps --entrypoint sh web -c 'rm -rf /app/.next/dev'`), start again.
- The old editable mockup form (base of E7.4) is only in git history: `git show b0f7e5b:"src/app/dev/mockups/assignments/[assignmentId]/students/[studentId]/evaluation-form.tsx"`.

## Agent skills

- [build-ui](../../.claude/skills/build-ui/): project skill, design system and responsive conventions

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
