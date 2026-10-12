---
name: build-ui
description: Build or update application UI (teacher, student or admin) using the existing design system, components and responsive conventions. Use when creating or significantly changing pages, screens or components.
---

Build or update the following UI:

$ARGUMENTS

Follow this process:

1. Inspect the current implementation, related components and the referenced feature IDs in conception/fonctionnalites.md.
2. Search for reusable components before creating new ones.
3. Reuse the existing design system and patterns.
4. Keep the change focused on the requested feature.
5. All user-facing text is in English. Decision-dependent texts (notices, AI mention, "no name" instruction) live in the single texts module.
6. Teacher screens target desktop; student screens target a phone in portrait.
7. Never convey information by color alone; keyboard actions with visible focus.
8. Include empty, loading and error states.
9. Respect the access matrix: never fetch or render data the current role may not see.
10. Run and visually verify the screen at phone and desktop widths, then run the project checks.
11. Fix reproducible issues without expanding scope. Summarize what changed.
