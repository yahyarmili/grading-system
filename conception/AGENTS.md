# Design documents (conception)

## Overview

The product's requirements and design, written in French with the engineer: problem, solution, actors, features, non functional needs, stack, procedures and implementation prompts. It is the source of truth for every feature's acceptance criteria; `docs/specs/` records how each step was built and `docs/scope/` where things stand.

## Key files

| File | Owns |
|---|---|
| `fonctionnalites.md` | D1 to D10 (§1, untouchable unless the engineer asks), features and criteria (§6), invariants (§5.3), access matrix (§5.4), states (§5.5), plan E1 to E11 (§8), questions (§9) |
| `besoins-non-fonctionnels.md` | Non functional needs (DON, TRT, EXP, USA, QUA, SEC, FIA) |
| `acteurs.md` | Actors and their rights |
| `stack-technologique.md` | Stack, limits, architecture rules (§4), provisional values per step (§3) |
| `procedures.md` | Procedures the engineer runs: « Activer le français », « Activer l'envoi réel à l'IA », « Activer l'IA sur la preview » (its last step revokes the key) |
| `prompts-implementation.md` | Framing decisions (§1), transverse prompts T1 to T5 (§3), prompts per step |
| `annexe-*` | Material (trials, analysis, dated facts), not decisions |

## Conventions

- Write in French. Markers: **[D]** decision (dated), **[P]** proposal, **[Q#]** open question; an unknown value is "à définir".
- Decided questions: Q1, Q3, Q4, Q5, Q6, Q7, Q8, Q10. Q4 [D, 2026-10-22]: the student checks and corrects their transcription once before sending, no PDF, the student rereads their submission (revises A3 and QNF-4). Q8 [D, 2026-10-22]: editing a validated or published evaluation sends it back to "À valider", republication is explicit. Other recommendations are not decisions.
- A changed decision: update the section of `conception/` (marked [D] with the date), the upcoming prompts, and the right `AGENTS.md` if the rule lasts (prompt T5).
- A new topic: the engineer speaks first; rephrase, analyse, propose a draft; record only when asked.
- Compact: only what is needed, measured in words and KB; detail goes to an annex.
- Cite sources with a link and their limits; say when only a summary was read.
- Law 09-08 / CNDP: always "à confirmer par la CNDP ou un juriste".
- Honesty: AI plus validation does not remove bias (anchoring, halo); copies written by adults do not represent real students.

## Gotchas

- Provisional values not yet recorded in `conception/` (pending T5) are listed in `.claude/a-consigner.md`; record them only when the engineer asks.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
