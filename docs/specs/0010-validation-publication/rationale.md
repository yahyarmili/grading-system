# 0010. Validation and publication: decision record

## Context

Step E8 of the implementation plan (`conception/fonctionnalites.md` §8.2). Requirements and acceptance criteria live in `conception/fonctionnalites.md` and `conception/besoins-non-fonctionnels.md` (French).

## Options considered

Weighed inside the approved plan below (sections "Contexte", choices marked [P] or [D], and the plan history at its end).

## Rationale

The plan below was approved by the engineer before the build, then amended in its history section as gaps were found. It is copied verbatim, in French, from `~/.claude/plans/`; only its headings moved two levels down.

## References

**Project sources**:
- `conception/fonctionnalites.md`, `conception/stack-technologique.md` §3 (provisional values per step)
- `conception/prompts-implementation.md` (prompts of step E8)

## Approved plan: `plan-e8.md` (verbatim)

### Plan d'E8 : validation, publication, évaluation manuelle, vue de l'élève

#### Contexte

Après E7, le professeur relit et modifie une copie « To review », mais rien n'avance au-delà :
- aucune transition 8, 9 ou 10 n'est appelée ;
- aucune table ni colonne de publication n'existe : l'état `published` de `submissions.status` est la seule trace ;
- `startManualEvaluation` passe une copie à « To review » **sans évaluation**, si bien que la page affiche « No AI proposal » ;
- l'élève ne voit que trois états, sans résultat et sans son texte. Les textes et tests d'E4 interdisent encore la relecture (`NO_READ_BACK_NOTICE`, `SUBMITTED_NO_READ_BACK_NOTICE`, `tests/e4-replays.int.test.ts:314-371`, `e2e/submit-text.spec.ts:180`), alors que Q4 l'autorise depuis le 2026-10-22 (SUB-01 R2).

E8 ferme le premier cycle. Il livre :
- REV-05 (validation) et REV-06 (évaluation manuelle) ;
- PUB-01 (publication et retrait) et PUB-02 (vue de l'élève) ;
- les transitions 8, 9 et 10 et l'invariant 7 ;
- NFR-EXP-04 (contrôle bloquant « aucun résultat avant publication ») et NFR-USA-03.

Décisions de l'utilisateur au plan (2026-10-22) :
- **Q6** : un devoir en français évalué à la main affiche les critères d'en-1 et enregistre `en-1`, avec une mention ;
- **Notice du professeur** : elle passe en v2 en E8.1 ;
- **Nature de la validation** : elle s'établit par le contenu.

#### 0. Doc Next.js lue, et ce qu'on en tire

Un sous-agent a lu la doc 16.3.8, car `node_modules` est vide sur l'hôte. J'ai relu les mêmes passages dans le conteneur, en **16.4.0** : aucun écart sur ces points. Chemins relatifs à `node_modules/next/dist/docs/01-app/` :

| Point | Ce que dit la doc | Fichier |
|---|---|---|
| Cache client | « Pages are not cached by default but are reused during browser back/forward navigation ». Il est vidé par `router.refresh`, `revalidatePath`, `updateTag`, ou `refresh()` dans une action, mais **seulement dans le navigateur qui agit** : rien n'invalide le cache de l'élève quand le professeur retire. | `04-glossary.md` l.49, `03-api-reference/04-functions/{use-router,refresh}.md` |
| `staleTimes` | `dynamic` vaut 0 par défaut, et le réglage « doesn't change back/forward caching ». | `…/next-config-js/staleTimes.md` l.36 |
| `cacheComponents` | Les routes quittées sont gardées en `<Activity hidden>` (jusqu'à 3) : le DOM et l'état restent, les effets sont nettoyés puis recréés au retour. `bfcacheId` ne change pas au retour ou à l'avance. | `…/cacheComponents.md`, `02-guides/preserving-ui-state.md`, `use-router.md` l.160-180 |
| Préfetch | Il n'a lieu qu'en production. Avec `partialPrefetching` (actif ici), seul le shell statique est préfetché, données de session (`cookies()`) comprises ; une lecture en base reste dynamique. `prefetch={false}` coupe tout. | `02-guides/prefetching.md`, `…/partialPrefetching.md`, `01-getting-started/08-caching.md` |
| Bfcache du navigateur | **Non documenté** par Next. Seul `useReportWebVitals` cite « back-forward-cache ». | grep `bfcache` |
| Cache-Control | Pages dynamiques : `private, no-cache, no-store, max-age=0, must-revalidate`. Rien n'est dit des réponses RSC ni des actions. Le proxy du projet pose déjà `no-store, max-age=0` sur `/student/*` (`src/proxy.ts:29`). | `02-guides/cdn-caching.md` l.18-24 |
| Charge RSC | Elle contient les props sérialisées des composants client et le rendu des composants serveur. Une action renvoie sa valeur de retour, plus l'arbre de la route si elle appelle `refresh`, `updateTag` ou `revalidatePath`. | `02-guides/server-actions.md`, `data-security.md` |
| Erreurs | En production : message générique plus `digest` ; en dev : message d'origine. | `…/file-conventions/error.md` l.106-113 |
| Taint | Il ne suit que la référence de l'objet : c'est une couche en plus, jamais la parade principale. | `…/taint.md` |
| 404 | Sous `Suspense`, le statut est figé à 200. `instant = false` vérifie avant le streaming (modèle déjà en place). | `04-functions/not-found.md` l.193 |

Ce qu'on en tire :
1. La seule parade valable est que **le serveur n'envoie jamais rien** à l'élève avant la publication. Aucune parade côté client ne protège une donnée déjà envoyée.
2. Le retrait doit être **contrôlé par le client au retour** : ni l'en-tête `no-store` ni `staleTimes` ne couvrent le cache retour/avance du routeur.

#### 1. Transitions et leurs gardes

Toutes les transitions passent par `applyTransition` (`src/server/data/submissions/transitions.ts:62`), sous `FOR UPDATE` de la remise, avec la notice lue.

`seen = { submissionId, versionNumber, proposalId | null, revision, status }` (le `CopySeen` d'E7, `copy.ts:47`).

| # | De → vers | Acte (fonction) | Gardes, dans l'ordre | Journal |
|---|---|---|---|---|
| 6 / 7 | `evaluation_failed` / `not_assessable` → `to_review` | première écriture manuelle (`saveEvaluation`, branche manuelle, §3) | copie absente → `null` ; version ≠ vue → `replaced` ; état hors des deux → `not_open` ; `teacher_started_at` posé par la transition | `manual_started`, puis `evaluation_created` (origine `manual`) dans la même transaction |
| 8 | `to_review` → `validated` | `validateEvaluation(actor, seen, changes)` | `replaced` ; état `validated` avec la même révision → `{ ok, already }` ; état hors `to_review` → `not_open` ; révision ≠ vue → `conflict` ; après application de `changes` : 5 niveaux non nuls et une note non nulle, sinon `incomplete` avec un message par champ | `evaluation_created` ou `evaluation_changed` si quelque chose change, puis `validated` avec `newValue = { nature, revision, finalGrade }` |
| 9 | `validated` → `published` | `publishEvaluation(actor, seen)` | `replaced` ; état `published` avec la même révision → `{ ok, already }` (aucune deuxième publication) ; état hors `validated` → `not_validated` ; révision ≠ vue → `conflict` | `published` avec `newValue = { revision }` |
| 10a | `published` → `validated` | `withdrawPublication(actor, seen)` (droit `publishedEvaluation:write`) | `replaced` ; état `validated` → `{ ok, already }` ; état hors `published` → `not_published` | `unpublished` |
| 10b | `validated` / `published` → `to_review` | une modification réelle par `saveEvaluation` (Q8) | les mêmes gardes que pour un enregistrement ; si le diff est vide, rien ne change | `sent_back_to_review` avec `newValue = { from }`, **avant** `evaluation_changed`, dans la même transaction |

**Nature de la validation (par le contenu)** : sous le verrou, on compare l'évaluation qui sera validée avec `fieldsFromProposal(proposition courante)` (`src/lib/review.ts:110`), par `diffEvaluation` restreint aux champs du résultat :
- niveaux, remarques, commentaire, pistes, note, note fixée ;
- les champs `reread_*` sont exclus.

Trois issues :
- diff vide → `unchanged` (« Validated without changes ») ;
- diff non vide → `changed` (« Validated after changes ») ;
- origine `manual` → `manual` (« Validated (entered manually) »).

Une modification annulée compte donc comme « without changes ». La fonction pure `validationNature` va dans `src/lib/review.ts`, avec ses tests unitaires.

**Valider sans évaluation existante** : on crée l'évaluation depuis la proposition, en révision 1, avec `evaluation_created`. `writeEvaluation` reçoit l'option `{ create: true }`, puisqu'il rend `null` aujourd'hui sur un diff vide. `teacher_started_at` est posé par `markTeacherStarted`. C'est la promesse du plan d'E7 (§1.1).

**Valider = enregistrer le formulaire entier, puis valider, dans une seule transaction.** Le bouton envoie la saisie à l'écran. On ne valide donc jamais une version enregistrée différente de celle que le professeur voit.

**Refus aussi par requête directe** :
- une copie en échec, non évaluable, reçue ou en évaluation est `not_open` ;
- une copie `to_review` a toujours une proposition ou une évaluation (§3) ;
- une évaluation incomplète est `incomplete`.

**Où vit le code** (CLAUDE.md : seul `src/server/data/**` lit la base) :
- `validateEvaluation`, `publishEvaluation` et `withdrawPublication` vivent dans `src/server/data/review/publication.ts`. Ce fichier entre dans `allowed` (ESLint, `eslint.config.mjs:47`) pour `teacherEvaluations` et `reviewJournalEntries`.
- Le service et les actions vont dans `src/server/review/publication.ts`.
- `saveEvaluation` (`copy.ts:309`) est découpé : son corps sous verrou devient `editLocked(tx, grant, row, seen, changes)`, partagé avec `validateEvaluation`, qui l'appelle dans **sa** transaction.

**Droits** :
- une 10b sur une copie `published` modifie une évaluation publiée : `saveEvaluation` et `validateEvaluation` appellent aussi `authorize(actor, "publishedEvaluation", "write")` dans ce cas (cellule `also` de `saveEvaluationAction` dans l'inventaire) ;
- `getCopy` appelle `authorize(actor, "publishedEvaluation", "read")` pour une copie publiée.

**Garanties en base** (migration custom `0019_guard_validated_rows`, sur le modèle de `0011` et `0018`) :
1. **Évaluation figée hors `to_review`** : `guard_teacher_evaluation_birth` (INSERT) et `guard_teacher_evaluation` (UPDATE) passent par `CREATE OR REPLACE` pour exiger aussi `status = 'to_review'` sur la remise lue `FOR SHARE`. On évite ainsi un deuxième trigger qui verrouille la même remise. Une évaluation validée ou publiée est donc figée en base. Le contenu publié est exactement le contenu validé : pas besoin d'instantané.
2. **CONSTRAINT TRIGGER différé `AFTER UPDATE OF status` sur `submissions`** : au commit, il **relit** `status` et `current_version` (pas `NEW`, qui peut être dépassé quand plusieurs transitions se suivent dans une même transaction). `validated` ou `published` exige une `teacher_evaluations` sur `te.version_number = s.current_version` avec 5 niveaux non nuls et une `final_grade` non nulle. C'est la contre-épreuve SQL directe de REV-05 CA2.
3. `submissions_validated_started` (CHECK existant) couvre déjà « validée ou publiée ⇒ `teacher_started_at` ».

**Interblocage**, vérifié par la critique du plan :
- dans le code, le `FOR SHARE` est pris par une transaction qui tient déjà le `FOR UPDATE` de la remise : il n'attend rien ;
- en SQL direct, deux sessions sans `FOR UPDATE` préalable peuvent s'interbloquer. Postgres en annule une, ce qui est acceptable et documenté dans la migration ;
- un test statique vérifie que tout appelant de `writeEvaluation` a pris `.for("update")` sur la remise.

Un bloc de contrôle des lignes existantes accompagne la migration, comme `0018`. On relit le SQL, puis `db:migrate` sur dev. Aucun enum ne change : `validated`, `published`, `unpublished`, `sent_back_to_review` et `manual_started` existent déjà (`review-lists.ts:13`).

**Auteur et date (REV-05 CA1)** : ils viennent de l'entrée `validated` du journal (acteur, `created_at`). La copie affiche « Validated by you on … » et `getCopy` lit déjà le journal. Il n'y a ni colonne ni écriture de plus : un UPDATE de `teacher_evaluations` exigerait une révision (contrainte de `0017`).

**Concurrence** :
- une copie, un verrou ;
- un double clic sur « Publish » se sérialise, et le second appel voit `published` → `already` ;
- « Publish » d'un onglet contre une modification d'un autre onglet : si la modification passe d'abord, la révision change et la publication reçoit `conflict` ou `not_validated` ;
- tests `Promise.all` avec leur contre-épreuve (garde retirée → test rouge, noté dans l'historique).

#### 2. Flux du raccourci « Validate and publish » (D6, PUB-01 R1/R3)

```
validateAndPublishAction(input)           service src/server/review/publication.ts
  1. tx A : validateEvaluation(seen, changes)  → commit (validated + journal "validated")
       échec → message de validation, rien d'autre
  2. tx B : publishEvaluation({...seen, revision: A.revision, status: "validated"})
       → commit (published + journal "published")
  3. B échoue (refus métier ou exception) :
       → { validated: true, published: false, reason }
       la copie reste "Validated" ; message au-dessus de la copie :
       « Validated, but not published: <reason>. Publish it again when ready. »
       + bouton « Publish » ; router.refresh()
```

- Ce sont deux transactions et deux entrées de journal distinctes (`validated`, `published`).
- Le service reçoit la publication par injection : `validateAndPublish(actor, raw, { publish = publishEvaluation })`. C'est le seul point d'injection, sur le modèle du `SubmissionContext` d'E6.

**Comment un test provoque l'échec du second acte** (`tests/review-publication.int.test.ts`) :
1. **Exception** : `publish` lève une `Error("boom")`. On attend la copie `validated`, le journal avec `validated` et sans `published`, et la réponse `{ validated: true, published: false }`.
2. **Refus réel par concurrence** : `publish` enregistre d'abord une vraie modification par `saveEvaluation` (comme un autre onglet), puis appelle `publishEvaluation`. On attend : la transition 10b ramène la copie à `to_review` ; la publication répond `not_validated` ; le journal contient `validated`, `sent_back_to_review`, `evaluation_changed`, sans `published`.
3. **Contre-épreuve** : réunir les deux actes dans une seule transaction fait échouer le cas 1, puisque la copie revient à `to_review`. Le résultat est noté dans l'historique.

#### 3. Évaluation manuelle (REV-06), réconciliée avec `startManualEvaluation`

**Principe** : une copie n'est jamais « To review » sans proposition ni évaluation du professeur. **`startManualEvaluation` est retirée.** La transition 6 ou 7 se fait avec la première écriture, dans `saveEvaluation` (ou dans `validateEvaluation` si le professeur valide directement), dans la même transaction.

**Écran** :
- sur une copie `evaluation_failed` (refus compris, avec l'avertissement existant) ou `not_assessable` (toutes causes, `no_content` compris), le bouton « Evaluate manually » ouvre le formulaire d'E7.4, vide ;
- c'est un état client (`?manual=1` dans l'URL, gardé au retour) et rien n'est écrit en base ;
- le formulaire est le même : 5 niveaux non choisis (« — »), remarques, commentaire, pistes, note calculée vide tant qu'un niveau manque, ou note fixée ;
- il n'y a ni colonne proposition ni « Modified » ni « To re-read ».

**Serveur, dans `editLocked`.** Trois branches, choisies par l'état lu sous verrou et l'origine de l'évaluation :

```
FOR UPDATE remise (propriétaire, notice lue)
  version ≠ vue → replaced
  (a) état ∈ {evaluation_failed, not_assessable}, seen.revision = 0 : première saisie manuelle
        diff(vide, saisie) vide → unchanged (rien n'est écrit, la copie reste en échec)
        applyTransition(6|7 → to_review, set teacher_started_at)   ← efface aussi evaluation_request et la cause
        appendJournal(manual_started, newValue { from, cause })    « Entered manually, without AI proposal »
        writeEvaluation({ origin: "manual", rubricVersion }, révision 1)  → evaluation_created
  (b) état to_review (ou validated/published → 10b), évaluation d'origine manual :
        base relue dans teacher_evaluations (pas d'ai_proposals : copy.ts:330 et 335-344
        exigent aujourd'hui une proposition, c'est cette garde qu'on élargit) ;
        rubricVersion lue sur la ligne ;
        double clic de la première saisie : seen.revision = 0 mais révision 1 → conflict, avec l'évaluation enregistrée
  (c) sinon : branche d'E7 (proposition), inchangée
```

**Types et calculs** (`src/lib/review.ts`) :
- `EvaluationChanges.levels` devient `Record<CriterionId, Level | null>` ;
- `finalGradeOf` rend `null` si un niveau manque et que la note n'est pas fixée, comme le CHECK `teacher_evaluations_grade_calculated` ;
- le schéma Zod du service refuse un niveau nul pour une origine `proposal`, avec un message par champ, au lieu d'une erreur 500 sur le CHECK ;
- « To re-read » ne se pose que si l'ancien niveau n'était pas nul : une saisie manuelle n'en a jamais. Test unitaire.

**Validation** : les niveaux nuls sont permis à l'enregistrement d'une saisie manuelle (le CHECK actuel le permet déjà). Ils sont exigés à la validation (`incomplete`).

**Relances** : la copie en sort, car `teacher_started_at` est posé, et `listRelaunchable` ainsi que `retryEvaluation` l'excluent déjà. Le journal garde la demande abandonnée éventuelle.

**Version de rubrique** :
- `publishedRubric(language)?.id` ;
- pour un devoir en français, sans version publiée (Q6), on enregistre **`en-1`**.

**Critères affichés pour un devoir en français (Q6, décidé)** : les 5 critères et descripteurs d'en-1, en anglais (`lang="en"`), avec la mention [P] « The French rubric is not validated yet: criteria of the English rubric (en-1). ». Le professeur et l'élève voient les mêmes critères, d'après `rubric_version`. La fonction pure `manualRubricFor(language)` va dans `src/lib/rubric.ts` ; à la publication d'une version française, elle la renvoie.

**Tests à reprendre** : ceux qui appelaient `startManualEvaluation` (`evaluation-relaunch`, `review-relaunch`, `review-invariants`, `access-matrix`) passent par `saveEvaluation`, branche manuelle.

#### 4. Projection de l'élève (PUB-02) et sa liste blanche

**Un seul module lit le résultat pour l'élève** : `src/server/data/results/student.ts`. Il est ajouté à `allowed` dans `eslint.config.mjs` pour `teacherEvaluations`.

##### Lecture du résultat

`getPublishedResult(actor, assignmentId)` :
- **droit** : `authorize(actor, "publishedEvaluation", "read")`, filtré par `ownedBy` (`s.student_id = actor.id`) ;
- **requête unique** :
  ```
  FROM submissions s
  JOIN teacher_evaluations te ON te.submission_id = s.id AND te.version_number = s.current_version
  JOIN assignments a ON a.id = s.assignment_id
  WHERE s.assignment_id = $1 AND <owned> AND s.status = 'published'
  ```
  `SELECT` explicite, colonne par colonne : niveaux, remarques, `general_comment`, `next_steps`, `final_grade`, `rubric_version`, `origin`, `a.language`, `a.title`.
- **Jamais lus** : `ai_proposals` et `evaluation_runs` (pas de jointure) ; `review_journal_entries` ; les colonnes `reread_*` ; `grade_fixed` ; `proposal_id` ; la cause ; le jeton ; la demande.
- **Pas de condition d'appartenance à une classe** : l'élève retiré lit son résultat publié (CLS-04 CA3, SUB-01 CA3).
- **État autre que `published`, ou remise d'autrui** : `null`, sans distinction.

##### DTO fermé

```ts
type StudentResult = Readonly<{
  assignmentId: string; title: string; language: AssignmentLanguage;
  finalGrade: number; gradeAdjusted: boolean;   // finalGrade ≠ somme des niveaux (Q5)
  criteria: readonly { id: CriterionId; level: Level; remark: string }[];
  generalComment: string; nextSteps: readonly string[];
  rubricVersion: string;                          // pour afficher les critères de cette version
  aiAssisted: boolean;                            // origin = 'proposal'
}>
```

Il est construit par `toStudentResult(row)`, une fonction qui recopie champ par champ. Il n'y a jamais de spread d'une ligne. Un test fige la liste des clés (`Object.keys` récursif, comme au test d'E4).

##### Page

Route `/student/assignments/[assignmentId]/result` :
- `instant = false` : un résultat `null` donne un 404 réel avant le streaming ;
- 404 aussi pour un devoir non reçu, non publié, retiré, ou pour le résultat de l'élève A demandé par l'élève B ;
- composant serveur, téléphone d'abord (skill `build-ui`).

Contenu affiché :
- **En tête** : la note telle que fixée (`formatGrade`). Si `gradeAdjusted`, l'icône et le texte « Grade adjusted by your teacher » (jamais la couleur seule, USA-03).
- **Par critère** : le nom et le niveau (« 3 – Good »), le descripteur du niveau atteint d'après `rubricVersion`, et la remarque. Un lien mène à la rubrique de **cette** version (`/student/rubric?version=<rubricVersion>`, version inconnue → rubrique en vigueur). Un devoir en français évalué sur en-1 renvoie donc vers en-1.
- **Puis** : le commentaire général et les pistes.
- **`lang={language}`** sur chaque remarque, sur le commentaire et sur les pistes. Les critères d'en-1 sont en `lang="en"`. L'interface est en anglais.
- **Mention de l'IA**, seulement si `aiAssisted` : « Your teacher prepared this feedback with the help of an AI tool, then reviewed and published it. » [P]
- **Évaluation manuelle** : aucune mention de l'IA. Seule la ligne commune à tout résultat reste : « Marked and published by your teacher. » [P]
- **Devoir en français** : la mention de Q6 sur les critères d'en-1.

Ce qui n'est jamais affiché : la proposition, les justifications d'origine, les citations, les alertes, le journal, `Modified`, `To re-read`, l'état technique, la cause d'échec, un refus.

##### Statut et liste

- `toStudentStatus` (`src/lib/submission-status.ts:132`) rend déjà `marked` pour `published` seulement. Un test exhaustif couvre les 9 états stockés.
- La liste et le détail montrent « See your result » (`prefetch={false}`) pour `marked` seulement.

##### Relecture de la remise (SUB-01 R2)

`getOwnSubmission(actor, assignmentId)` dans `src/server/data/submissions/student.ts` :
- droit `submission:read`, propriété `s.student_id = actor.id` ;
- renvoie `{ text, submittedAt, lastVersionAt }` de la **version active** seulement ;
- ni état, ni cause, ni version précédente, ni rien du traitement ;
- disponible dès l'envoi, quel que soit l'état.

Sur la page du devoir, la section « Your submission » montre ce texte (`whitespace-pre-wrap`, `lang={language}`). Elle est distincte de « Your result ».

On retire `NO_READ_BACK_NOTICE` et `SUBMITTED_NO_READ_BACK_NOTICE`, ainsi que le commentaire « A3 » de `page.tsx`.

Les tests d'E4 sont remplacés :
- `e4-replays` : la liste des clés gagne le texte par `getOwnSubmission` seulement. Le détail (`getStudentAssignment`) reste sans texte ni état interne.
- `submit-text.spec.ts:180` : « the student reads their text back, and nothing of the processing ».

#### 5. Canaux de fuite et leur parade (PUB-02 R2, CA2/CA3)

| Canal | Risque | Parade |
|---|---|---|
| Pages (HTML) | une page de l'élève lit une donnée de revue | ESLint interdit `@/server/data/review/**`, `@/server/review/**` et `@/server/data/evaluation/**` sous `src/app/student/**` (table `IMPORT_RESTRICTIONS`, `tests/eslint-restrictions.test.ts`). `results/student.ts` n'importe que `db`, `access` et `lib` (ESLint). Sa requête utilise le constructeur Drizzle, pas du SQL brut, pour que la liste `allowed` sur `teacherEvaluations` contrôle vraiment quelque chose. La projection filtre `status = 'published'` dans la requête. |
| Charge RSC | props sérialisées d'un composant client | Le résultat est rendu par des composants serveur avec le DTO fermé. Un seul composant client, `ResultFreshness`, reçoit seulement `assignmentId` et un jeton opaque. Le balayage lit aussi les réponses `RSC: 1`. |
| Server Actions | une valeur de retour contient un résultat ou un état interne | Les actions de l'élève (envoi, remplacement, notice, `checkFreshnessAction`) renvoient des états fermés. `checkFreshnessAction` rend un booléen ou un **hachage opaque calculé sur la projection élève** (statut à 3 valeurs ; révision de l'évaluation seulement si `published`, sinon `null`). Une révision lue quel que soit l'état trahirait chaque enregistrement du professeur, et l'état stocké trahirait la validation. |
| Messages d'erreur | une cause, un état ou un refus dans un message | En production, une erreur serveur n'a que son `digest` (doc). Les messages des actions élève sont fixes et listés dans le balayage. Un résultat non publié donne le même 404 qu'une ressource absente. La route du résultat a son propre `error.tsx` (« Your result could not be loaded »), au lieu d'hériter de celui de la liste. |
| Fuite admise, déjà vraie avant E8 | `canReplace` (`assignments.ts:287`) et le refus `teacher_started` du remplacement révèlent que le professeur a **commencé** (SUB-05 l'exige) | Ils ne révèlent ni la validation, qui suit forcément ce premier acte, ni aucun contenu. Le cas est consigné comme fuite admise et mis en liste blanche du balayage. Le message dit « can no longer be replaced », sans « validated ». |
| Liste et état | « Marked » trop tôt, ou un libellé interne | `toStudentStatus` à 3 valeurs, avec un test exhaustif. Les libellés internes (« Validated », « Published », « To review », causes, « refused ») sont cherchés par le balayage. |
| Préfetch | résultat préchargé | `partialPrefetching` ne précharge que le shell : la lecture en base est dynamique. Le lien « See your result » a en plus `prefetch={false}`. |
| Cache du routeur (retour/avance, `<Activity>`) | la page du résultat retirée revient au retour | `ResultFreshness` enveloppe le contenu. Le `useLayoutEffect` est détruit au masquage et recréé à la réapparition, avant l'affichage ; le `useRef` survit. Le ref garde l'instant du dernier contrôle réussi. Au montage initial, il est posé par le rendu serveur et rien n'est fait. Une réapparition est un montage d'effet survenant plus de `FRESHNESS_GRACE_MS` [P, 1 s] après ce contrôle : ce critère ne dépend pas du nombre de montages, donc le double montage de StrictMode en dev ne déclenche rien. Le contenu est alors **démonté avant l'affichage**, puis `checkFreshnessAction(assignmentId, jeton)` est appelé. Si le résultat est encore publié et de même révision, il réapparaît. Sinon, `router.refresh()` et la page rend son 404. La liste et le détail ont la même garde sur leur empreinte. |
| Bfcache du navigateur | document restauré tel quel | `Cache-Control: no-store` existe déjà (`src/proxy.ts`), et Next en pose autant sur les pages dynamiques. En plus, `pageshow` avec `event.persisted` → `location.reload()`, dans `ResultFreshness`. |
| Cache HTTP partagé (CDN) | réponse personnelle mise en cache | `private, no-store` ; aucune donnée élève en `'use cache'` (vérifié par grep dans le test statique). |
| Email | — | Aucun email à la publication en E8 ; aucun canal à couvrir. |

**Remarque honnête** :
- un résultat déjà lu reste dans la mémoire du navigateur de l'élève, et même dans le DOM d'une route masquée (`display:none`, jusqu'à 3 routes) ;
- le retrait est garanti « au prochain accès » (PUB-01 CA3), pas sur un écran resté ouvert ni dans une route masquée ;
- le balayage E2E du DOM lit donc le texte **visible** (`innerText`) de la page courante.

#### 6. Balayage automatique de la fuite (E8.4), contrôle bloquant EXP-04

Il y a deux niveaux, tous deux dans les suites par défaut. Ils bloquent donc toute livraison, et la procédure « avant de pousser » les cite.

##### 1. Intégration, `tests/student-leak.int.test.ts`, dans `npm test`

**Semis** :
- une proposition semée avec des marqueurs uniques (`PROP-<uuid>`) dans chaque justification, citation, commentaire et piste, plus des alertes ;
- le simulateur reçoit `setTexts({ justification, comment, nextStep })` (nouvelle méthode de `SimulatorEvaluator`, `src/server/ai/simulator.ts`) pour les cas qui passent par une vraie évaluation ;
- une évaluation du professeur avec `EVAL-<uuid>` dans chaque remarque.

**Ce qui est appelé** : pour chaque situation, toutes les fonctions et tous les services que l'élève peut atteindre :
- `listStudentAssignments`, `getStudentAssignment`, `getPublishedResult`, `getOwnSubmission` ;
- les actions de l'élève, et `checkFreshnessAction`.

Leurs sorties sont sérialisées (`JSON.stringify`, erreurs comprises).

**Situations** :
1. à valider ;
2. validée ;
3. publiée puis retirée ;
4. publiée puis modifiée (10b) ;
5. échec avec refus ;
6. évaluation manuelle validée ;
7. publiée.

**Attendu** :
- aucun `PROP-` nulle part ;
- aucun `EVAL-` hors de la situation 7, où ils figurent seulement dans `getPublishedResult` ;
- aucun libellé interne ni aucune cause, dans aucune situation.

##### 2. E2E, `e2e/student-leak.spec.ts`, dans l'exécution par défaut de `docker compose run --rm e2e`

**Collecte** : `page.on("response")` capture **tous** les corps reçus par le contexte de l'élève : documents, RSC, POST d'actions. On y ajoute le texte du DOM, et un `fetch` de chaque URL élève avec l'en-tête `RSC: 1`. L'en-tête `Cache-Control` est relevé sur le document, sur la réponse RSC et sur l'action.

**Parcours** :
- le professeur, par l'écran, met `EVAL-` dans une remarque, valide, publie, puis retire ;
- à chaque étape, l'élève parcourt la liste, le détail et le résultat ;
- **bouton retour** :
  - (a) via `<Link>` : `page.goBack()` après une navigation interne, donc le cache du routeur ;
  - (b) via `page.goto` d'une autre URL puis `goBack()`, donc le bfcache du navigateur ;
  - après le retrait : pas de `EVAL-` dans le DOM une fois la vérification faite, puis le 404.

**Contre-épreuve**, notée dans l'historique : on ajoute exprès `proposalJustification` au DTO, et on retire la garde `status = 'published'`. Chaque test devient rouge.

#### 7. Matrice et inventaire

##### Matrice (`src/server/access/matrix.ts`)

- **`submission`** : élève concerné « L É (la sienne : relecture de son texte [D, 2026-10-22], remplacement) ». C'est la ligne l.198 de `fonctionnalites.md`, déjà à jour. Commentaire « never reads it back » retiré.
- **`ownSubmissionStatus`** : le libellé perd « never the text ».
- **`publishedEvaluation`** : inchangée (élève L ; propriétaire L É pour le retrait). Elle reçoit enfin ses fonctions.
- **`unpublishedEvaluation`** : inchangée. Validation, publication et saisie manuelle relèvent de son écriture (l.206).

##### Inventaire (`inventory.ts`)

- `TABLES.teacher_evaluations` : `["unpublishedEvaluation", "publishedEvaluation"]`.
- `ENTRY_POINTS` reçoit :
  - `validateEvaluationAction`, `validateAndPublishAction`, `publishEvaluationAction`, `withdrawPublicationAction` ;
  - `checkFreshnessAction` (élève) ;
  - la route `/student/assignments/[assignmentId]/result`.
- `UNGUARDED_DATA_EXPORTS` : `editLocked` (interne, appelé sous verrou par des fonctions gardées) ; `toStudentResult` vit dans `src/lib`.
- `checkFreshnessAction` et `validateAndPublishAction` déclarent leurs cellules `also`.
- Commentaires à mettre à jour :
  - `inventory.ts:24-25` (« never a version (A3) ») ;
  - `TABLES.submission_versions`, qui s'ouvre à la relecture par l'élève.

##### `REAL` (`tests/access-matrix.int.test.ts`)

| Ressource et action | Fonctions |
|---|---|
| `publishedEvaluation.read` | `getPublishedResult` (élève concerné), `getCopy` sur une copie publiée (propriétaire) |
| `publishedEvaluation.write` | `withdrawPublication` |
| `unpublishedEvaluation.write` | `validateEvaluation`, `publishEvaluation`, `saveEvaluation` (branche manuelle, à la place de `startManualEvaluation`) |
| `submission.read` | `getOwnSubmission` (élève concerné) |

Les colonnes « autre » (autre élève, autre professeur) donnent « absent ». L'administrateur et le visiteur sont refusés.

#### 8. Interface du professeur (copie)

**Barre sticky d'`evaluation-form.tsx`** (l.632-656), selon l'état :

| État | Boutons |
|---|---|
| `to_review` | « Save changes », « Validate », « Validate and publish » |
| `validated` | « Publish » (avec confirmation) et le formulaire, encore modifiable |
| `published` | « Withdraw publication » (avec confirmation) et le formulaire |

- En `validated` ou `published`, enregistrer une modification demande une confirmation [P] : « Saving returns this copy to To review. The student will no longer see the result until you publish it again. » Le texte se limite à la première phrase pour `validated`.
- Le bouton d'action réutilise le modèle de `request-button.tsx` : garde contre le double clic et `useNotice`.
- La boîte de confirmation est accessible : focus piégé, `Escape`, focus rendu.
- L'en-tête porte la mention « Validated by you on … » ou « Published on … », lue au journal.
- La liste gagne le compteur « Validated, not published » et les filtres d'état `validated` et `published`.
- « History » reçoit les libellés existants (`EVENT_LABELS`), plus la nature de la validation et « Entered manually, without AI proposal ».

#### 9. Textes et valeurs provisoires

Les textes [P] vont dans `src/lib/texts.ts`. La note de T5 les consigne.

**Notice du professeur `TEACHER_NOTICE` v2** (décidée) :
- elle ajoute la validation, la publication, le retrait et la saisie manuelle au journal ;
- la conservation reste « à définir » ;
- l'empreinte est relevée dans `tests/teacher-notice.test.ts` ;
- chaque professeur la relit une fois ;
- `seedTeacher` et `readTeacherNotice` suivent la version.

**Mentions** :
- mention de l'IA (Q5, AUP « Education and credentials »), formulation à confirmer avec le cadre légal ;
- « Marked and published by your teacher. » ;
- « Grade adjusted by your teacher » ;
- mention de Q6 pour les critères d'en-1.

**Messages** :
- `not_validated`, `not_published`, `incomplete` (« Choose a level for each criterion » ; « Set a grade ») ;
- échec du second acte ;
- confirmations de publication, de retrait et de modification après validation.

**Libellés du journal** : « Validated without changes », « Validated after changes », « Validated (entered manually) », « Entered manually, without AI proposal », « Sent back to review ».

**Valeurs numériques** :
- `FRESHNESS_GRACE_MS` [P] = 1 000, dans `provisional.ts` (§5) ;
- `GRADE_STEP` et `REVIEW_TEXT_MAX_LENGTH` sont réutilisés.

#### 10. Découpage (prompts E8.1 à E8.7, inchangés)

**E8.1 : validation, publication, retrait, transition 10b**
- `0019`, `publication.ts` et `saveEvaluation` 10b ;
- service et actions, boutons et confirmations ;
- notice v2 ;
- tests :
  - machine d'états : chaque transition et chaque garde, publication d'une copie non validée par appel direct ;
  - triggers par SQL brut ;
  - double publication ;
  - échec du second acte (§2) ;
  - concurrence ;
  - nature de la validation.

**E8.2 : évaluation manuelle**
- branche manuelle, `startManualEvaluation` retirée, `manualRubricFor`, double clic ;
- devoir en français.

**E8.3 : vue de l'élève et relecture de la remise**
- projection, page résultat, `ResultFreshness`, ESLint ;
- remplacement des textes et tests d'E4 ;
- 404 réel ;
- cas « 15 contre 13 » qui affiche la mention ;
- EVL-04 CA3.

**E8.4 : balayage de la fuite (intégration et E2E), avec contre-épreuves**

**E8.5 : rejeux de la table 8.3 et matrice « Évaluation publiée »**
- CLS-04 CA3 et SUB-01 CA3 (élève retiré) ;
- SUB-01 CA2 ;
- SUB-05 CA3 (remplacement refusé après validation) ;
- REV-03 R5 avec REV-05 CA2 ;
- REV-04 CA2 et CA3.

**E8.6 : E2E du cycle complet `e2e/e8-journey.spec.ts`, puis rejeu sur la preview**
- le cycle : remise, proposition, modification, validation et publication, lecture de l'élève, retrait et retour, modification après publication, republication ;
- une copie en échec évaluée à la main ;
- rejeu sur la preview, poussée à la demande, avec le simulateur.

**E8.7 : revue en contexte neuf (`feature-reviewer`) sur les canaux de fuite, puis T4, T3, T1, T5**

#### 11. Vérification

- `docker compose exec -T web npm test` : unitaires (`validationNature`, `manualRubricFor`, `toStudentResult`, `toStudentStatus` exhaustif, empreinte de la notice v2), intégration (transitions, triggers `0019`, concurrence, échec du second acte, `student-leak`, rejeux, matrice et `REAL`), statiques (`review-writes`, ESLint, inventaire).
- `docker compose run --rm e2e` : `student-leak`, `e8-journey` et les E2E d'E4 et E7 modifiés. Je demande d'abord, car la base de test est partagée avec les autres sessions.
- Relevé des en-têtes `Cache-Control` du document, de la réponse RSC et de l'action par l'E2E. Captures Playwright envoyées à l'utilisateur :
  - le résultat de l'élève, sur téléphone ;
  - la barre du professeur ;
  - le 404 après retrait.
- Après E8.6 : `db:migrate` sur dev avant de pousser, puis rejeu en ligne (`playwright.online.config.ts`), dont le retour arrière en production, où le préfetch est actif.
- Fin de chaque prompt : commit sur `preview`, sans pousser.

#### Historique
- 2026-10-22 : plan rédigé (E8.0). Doc Next relue en 16.4.0 dans le conteneur. Décisions de l'utilisateur : critères d'en-1 pour le français manuel (Q6), notice du professeur v2 en E8.1, nature de la validation établie par le contenu.
- 2026-10-22 : critique adversariale du brouillon (agent Plan, lecture du code). Intégrés :
  - enregistrements manuels après le premier (branche b) ;
  - niveaux nuls dans `review.ts` ;
  - « To re-read » jamais posé sur une saisie manuelle ;
  - `editLocked` partagé et fonctions placées dans `data/review/publication.ts` ;
  - droits `publishedEvaluation` (10b sur une copie publiée, `getCopy`) ;
  - gardes de `0019` fondues dans les triggers de `0018`, constraint trigger qui relit la remise ;
  - double clic manuel → `conflict` ;
  - ESLint étendu à `server/review/**`, requête en Drizzle ;
  - garde de fraîcheur indépendante de StrictMode ; empreinte nulle hors publication ;
  - fuite admise `canReplace` consignée ;
  - `error.tsx` propre, lien vers la rubrique de la version ;
  - commentaires de l'inventaire.
- 2026-10-22 : E8.1 fait. Écarts d'exécution :
  - `0020` ajouté : le journal est daté par `clock_timestamp()` et non plus par `now()`. Sans cela, les actes d'une même transaction (évaluation créée puis validée ; renvoi puis modification) prenaient la même date et s'affichaient dans le désordre dans « History ».
  - Dans `0019`, la garde « To review seulement » est placée après celle de la révision 1, pour que l'ancien test des invariants garde son message.
  - `validateEvaluation` et `publishEvaluation` vivent dans `data/review/publication.ts` ; `lockCopy`, `lockedRefusal` et `editLocked` sont exportés depuis `copy.ts` et listés dans l'inventaire.
  - Validation ou publication répétées : `already`, rien n'est écrit. Retrait d'une copie seulement validée : `already` aussi.
  - L'en-tête de la copie affiche « Validated/Published by … », lu au journal par `getCopy`. La liste gagne le compteur « Validated ».
  - `ConfirmDialog` reçoit un mode contrôlé, qui sert à confirmer l'enregistrement d'une copie validée ou publiée.
  - Les tests qui posaient directement une copie validée passent par l'assistant `giveCompleteEvaluation` (`tests/helpers/review.ts`) ; le test statique « tout appel de writeEvaluation est sous verrou » est ajouté dans `review-writes`.
  - Vérification (E8.1) : unitaires 557 verts ; intégration verte, après relance des fichiers touchés par `0020` ; E2E 41 verts au passage complet, puis 6 échecs réseau (DNS de Neon) et `e7-journey` relancés et verts, ainsi que `review-publication`, vert après deux sélecteurs corrigés.
- 2026-10-23 : E8.2 fait. Écarts d'exécution :
  - `editLocked` lit le point de départ par une seule requête (`readStored` : proposition, évaluation, langue, cause). L'origine de l'évaluation naît seulement à la première écriture : défaut trouvé par les tests, à la deuxième écriture manuelle.
  - Valider directement une copie en échec avec un formulaire complet est permis : c'est une évaluation manuelle, `manual_started`, puis `evaluation_created`, puis `validated`, dans une seule transaction (§3). Le test d'E8.1 « REV-05 CA2 » vérifie désormais qu'un formulaire vide reste refusé, niveau par niveau.
  - Un niveau vide dans une évaluation issue d'une proposition donne `invalid` avec le message `levelMissing`, et non plus une erreur 500.
  - « Cancel » sur une saisie manuelle non enregistrée, avec une confirmation si quelque chose a été saisi ; « Evaluate manually » est un lien `?manual=1`, qui garde l'état de la liste.
  - Libellés de l'historique : « Entered manually, without AI proposal », « Entered the first values of their evaluation ». Le texte de Q6 est `MANUAL_RUBRIC_SUBSTITUTE_NOTICE` [P].
  - Assistants de test : `enterByHand` et `MANUAL_FORM` remplacent `startManualEvaluation` dans 4 fichiers. Le seeder E2E accepte une langue.
  - Vérification : unitaires 563 ; intégration verte, avec les fichiers touchés relancés ; E2E 49 verts au passage complet, puis `review-manual` (attente corrigée) et `teacher.spec` (échec ponctuel) relancés et verts.
- 2026-10-23 : E8.3 fait. Écarts d'exécution :
  - La matrice donne à l'élève la lecture de sa remise (`submission` : L É). Les fonctions du professeur sur `submission:read` lui restent refusées par leur filtre de propriété (`ownedBy` sans propriétaire élève → `AccessDeniedError`), vérifié en intégration. Dans `REAL`, chaque lecture du professeur est rejouée pour l'élève par `getOwnSubmission` (`orOwnText`).
  - La restriction des pages élève est une entrée de `IMPORT_RESTRICTIONS` : `server/review`, `data/review` et `data/evaluation` (sauf `system`, qui garde son entrée) ne sont importables que sous `src/server/**`, `src/app/teacher/**`, `scripts/**` et `tests/**`.
  - Le jeton de `ResultFreshness` est l'empreinte SHA-256 du DTO publié : `checkFreshnessAction` répond par un booléen, faux pour un résultat retiré, modifié, absent ou d'autrui. Aucune fonction de données en plus.
  - Mentions : celle de l'IA remplace la ligne « Marked and published by your teacher. », pour ne pas dire deux fois « publié » ; une évaluation manuelle n'a que cette ligne.
  - La rubrique accepte `?version=` (onglet présélectionné) ; une version inconnue → la rubrique anglaise en vigueur.
  - Vérification : unitaires 576 ; intégration 1 247 sur 1 259 au passage complet, les échecs réseau (DNS de Neon) relancés et verts, sauf `evaluation-relaunch` : 23 sur 24 à chacun de trois passages, l'échec sur un test différent à chaque fois (deux délais de 15 s, une erreur non relevée) ; le fichier n'est pas touché par E8.3. E2E : 51 verts au passage complet, dont `student-result`, `submit-text`, `e4-journey` et `e6-journey` modifiés ; `e7-journey` (copie non ouverte en 15 s) relancé seul et vert.
- 2026-10-23 : E8.4 fait. Écarts d'exécution :
  - Outil commun `tests/helpers/leak.ts` (marqueurs uniques par exécution, mots internes, `findLeak` qui s'arrête au premier mot trouvé et le nomme), lu par l'intégration et par Playwright (imports relatifs). Le simulateur gagne `setTexts` (justifications, commentaire, piste, drapeaux).
  - Mots internes cherchés : états stockés, causes, erreurs et alertes, en code (entre guillemets, comme en JSON) et en libellé du professeur, plus « AI proposal » et « To re-read ». `"unavailable"` est exclu des codes : c'est aussi le motif de refus propre à l'élève (SUB-02, SUB-05) ; son libellé d'échec reste cherché. Le refus « teacherStarted » reste la fuite admise (§5).
  - Les citations de la proposition ne sont pas des marqueurs : ce sont les mots de l'élève, qu'il relit (SUB-01 R2).
  - Le professeur remplace tous les textes : une justification laissée telle quelle devient sa remarque, publiée à bon droit.
  - Intégration (`tests/student-leak.int.test.ts`) : situations à valider, validée, publiée, retirée, publiée puis modifiée, refus de l'IA, manuelle validée ; l'élève et un camarade, par les fonctions des pages et les services des actions (actions elles-mêmes : `getActor()` et `refresh()` en plus) ; publiée : marqueurs du professeur dans `getPublishedResult` seulement, clés exactes de la liste blanche ; contrôle positif : les marqueurs figurent dans la copie du professeur et `findLeak` les trouve.
  - E2E (`e2e/student-leak.spec.ts`) : réponses du contexte de l'élève (documents, RSC, actions, 404), plus un `GET` `RSC: 1` de chaque URL ; retour du routeur (action de fraîcheur balayée) et retour du navigateur après navigation complète ; `Cache-Control` des réponses `/student/*` : toutes `no-store`. Le statut de l'URL du résultat est vérifié après le balayage.
  - Contre-épreuves (code remis ensuite) : un champ de la proposition (`aiProposals.generalComment`) ajouté au résultat → intégration rouge, « PROP-…-comment in student: getPublishedResult » ; garde `status = 'published'` retirée → intégration rouge (« EVAL-…-task in student: getPublishedResult », 2 tests) et E2E rouge (« EVAL-…-task in to review: page 200 …/result »). Un champ ajouté au DTO sans être rendu n'atteint pas le navigateur : seule l'intégration le voit.
  - Vérification : unitaires 576 ; `student-leak.int.test.ts` vert (3 tests) ; `student-leak.spec.ts` vert seul (1,7 min).
- 2026-10-23 : E8.5 fait. Écarts d'exécution :
  - `tests/e8-replays.int.test.ts`, par les services des écrans et toujours lu du côté de l'élève (liste et détail ensemble) : SUB-01 CA2 sur chaque état atteint par de vrais actes (reçue, en évaluation retenue par le simulateur, à valider, validée, publiée, retirée, échec, refus, non évaluable, saisie manuelle publiée) ; SUB-05 CA3 après une validation **sans modification**, puis publiée et retirée ; EVL-04 CA3 avec les quatre alertes ; REV-03 R5 avec REV-05 CA2 (validée puis modifiée, publiée puis modifiée, republication explicite, copie en échec non validable ni publiable) ; REV-04 CA2 (ouverture puis validation, datées, dans l'ordre) et CA3 (journal, proposition et copie refusés à l'élève et à un camarade après publication) ; CLS-04 CA3 et SUB-01 CA3 (retiré avant publication : devoir en lecture seule, aucun remplacement ni nouvelle remise, résultat lu une fois publié, perdu au retrait ; retiré sans remise : devoir absent).
  - Les états image (`transcribing`, `transcription_failed`) ne sont pas atteignables avant E9 : couverts par le test unitaire exhaustif de `toStudentStatus`.
  - Matrice : « Évaluation publiée » rejoue en plus la modification d'une copie publiée (10b, `saveEvaluation`) : le propriétaire la renvoie à To review, l'autre professeur ne trouve rien et la copie reste publiée, l'élève, l'administrateur et le visiteur sont refusés. Le montage publie deux copies ; le délai des lignes `REAL` passe de 15 à 60 s (le propriétaire dépassait 15 s sur Neon).
  - Vérification : `e8-replays` vert (7 tests) ; `access-matrix` vert (217 tests, la ligne « publishedEvaluation: ownerTeacher » relancée après le délai). Suites complètes non lancées.
- 2026-10-23 : E8.6, partie locale. Écarts d'exécution :
  - `e2e/e8-journey.spec.ts`, chaque acte à l'écran : classe et devoir créés par le professeur ; Lina et Omar rejoignent par le code ; Lina lit la notice et remet ; To review sans action (Workflows, simulateur) ; le professeur lit sa notice, ouvre la copie par le nom, change un niveau (note recalculée), valide (l'élève ne voit toujours rien), publie ; Lina lit son résultat sur téléphone (note, niveau, mention de l'IA, rien de la revue) ; retrait pendant qu'elle est sur le devoir, retour du routeur : contenu démonté, puis 404 et « Submitted, being marked » ; la copie d'Omar, en échec, est évaluée à la main puis validée et publiée par le raccourci ; Omar lit « Marked and published by your teacher. », sans mention de l'IA ; journal vérifié dans l'ordre.
  - La copie en échec est écrite en base (remise, version, run échoué) : les pannes du simulateur restent dans la mémoire du serveur, comme pour `e6-journey`. Le retour du navigateur après navigation complète reste couvert par `student-leak`.
  - Journal : une entrée `evaluation_changed` par champ modifié (niveau, note, « à relire » ; chaque champ saisi à la main) ; le parcours regroupe les entrées identiques qui se suivent.
  - Ajouté à `playwright.online.config.ts`.
  - Vérification : vert seul (3,3 min) au quatrième passage. Les trois premiers échecs venaient du test : libellé du niveau côté élève (« Level 3: »), deux attentes sur le journal, et une ouverture de copie journalisée après plus de 15 s (attente portée à 30 s). Rejeu en ligne : après la poussée demandée.
- 2026-10-23 : E8.6 en ligne. Base dev vérifiée (21 migrations, jusqu'à `0020`), `preview` poussée (`13e215a`, déploiement Vercel réussi). Rejeu de `e8-journey` sur la preview avec le simulateur : vert jusqu'au retrait, retour du routeur compris (contenu démonté), puis **échec sur le statut** : l'adresse du résultat retiré répond 200 au lieu de 404. Sonde (hors dépôt, supprimée) : le HTML et la charge RSC ne contiennent ni la note ni aucune remarque, l'élève voit « 404 This page could not be found » (repli `NEXT_HTTP_ERROR_FALLBACK;404`) ; la page est servie depuis le cache de Vercel (`x-vercel-cache: PRERENDER` puis `HIT`) ; « Your result » n'y figure que dans le titre statique. Constat plus large : en production, une adresse inconnue répond 200 aussi pour `/teacher/classes/[id]` et `/teacher/assignments/[id]`. Doc relue (16.4.0, `route-segment-config/instant.md`, `ensureStatic.md` §« How ensureStatic differs from instant ») : `instant = false` désactive la validation des navigations instantanées, pas le pré-rendu de la coquille ; le « 404 réel » de CLAUDE.md ne tient qu'avec `next dev`. Aucune fuite de contenu ; PUB-01 CA3 tenu pour le contenu, pas pour le statut ; AUTH-04 R3 (même réponse qu'une ressource absente) tenu, les deux répondant 200. L'étape 8 (copie évaluée à la main) n'a pas été rejouée en ligne. Une sonde a créé un compte professeur fictif `@example.test` sur dev. Décision à prendre par l'utilisateur.
- 2026-10-23 : E8.6, parade du 404 réel en production (approuvée par l'utilisateur). Doc 16.4 : `02-guides/streaming.md` (« The HTTP contract », « Cache Components »), `file-conventions/loading.md` (« Status codes » : contrôle dans le proxy, puis réécriture vers une page introuvable), `functions/not-found.md`. Vérifié en ligne avant de coder : la réécriture du proxy vers `/not-found` donne 404 au document et à la charge RSC, et la navigation affiche la page introuvable.
  - `RESOURCE_PAGES` et `FIXED_SPACE_PAGES` dans `src/lib/route-access.ts`, `resourceRoute(pathname)` (identifiant mal formé → introuvable ; une page fixe l'emporte, « new » n'est pas un identifiant) ; `src/server/routes/resources.ts` : une vérification par page, par les lecteurs de la page avec la même condition (copie : `notice_required` compte comme trouvée, la page montre la notice) ; `src/proxy.ts` réécrit vers `/not-found` si la ressource manque ; une erreur de la vérification laisse décider la page.
  - Écart trouvé par les E2E (« Failed to find Server Action ») : l'action de fraîcheur poste sur le chemin du résultat ; une fois le résultat retiré, sa requête était réécrite. Contrôle limité à GET et HEAD ; testé.
  - Tests : unitaires (`route-access.test.ts`), statique (`tests/route-resources.test.ts` : pages du disque = fixes + ressources), intégration (`tests/route-resources.int.test.ts`, vrai proxy et vraies sessions : propriétaire, camarade, élève extérieur, autre professeur, inconnu, mal formé, notice non lue, retrait, POST), E2E `e2e/route-statuses.spec.ts` (document et RSC), ajouté à la configuration en ligne. Contre-épreuve : contrôle neutralisé → le test du retrait rouge (« expected 'page' to be 'not found' »). Pendant la contre-épreuve, un `git checkout` a effacé la parade non commitée ; restaurée depuis une copie, test revert.
  - Vérification locale : unitaires et statiques verts ; `route-resources.int` et `sign-in.int` verts (un passage avec un échec du test des pages du professeur, vert seul puis au fichier entier : lenteur probable, cause non lue) ; E2E 14 verts (`route-statuses`, `e8-journey`, `student-result`, `review-copy`, `classes`, `assignments`), puis `student-result` vert sans erreur d'action après le correctif.
- 2026-10-23 : E8.6 en ligne, après la parade. `preview` poussée (`dde416d`, aucune migration nouvelle, déploiement Vercel réussi). Sur la preview, avec le simulateur : `route-statuses` vert (34 s ; 200 au propriétaire, 404 à l'autre professeur, au camarade, à l'inconnu, au mal formé et au résultat retiré, document et RSC), `e8-journey` vert en entier (1,0 min, retrait et retour compris, 404 réel, copie en échec évaluée à la main et publiée), `e7-journey` vert (50 s). Coût de la requête ajoutée par le proxy : non mesuré. Anthropic : seulement pendant une démonstration, procédure « Activer l'IA sur la preview ».
- 2026-10-24 : vérification avant E8.7. Intégration complète (`npm test`, après redémarrage du conteneur `web` arrêté) : 1 273 verts, 6 échecs dans 5 fichiers (délais de 15 s, 8 connexions coupées, un interblocage du TRUNCATE entre deux tests) ; rejoués seuls : tous verts sauf « refuses any change or removal of a run or a proposal… » (`evaluation.int.test.ts`), 13,7 s seul pour une limite de 15 s : délai explicite de 60 s. Aucun conflit d'usage de la base de test (`pg_stat_activity`), latence 125 ms par requête. E2E complète : 48 verts, 7 échecs (délais, connexions coupées ; 5 sur l'ouverture d'une copie), 2 sautés (mesures) ; les 5 fichiers rejoués seuls : 13 verts. Mesure en ligne (`e7-review-measure`, 120 copies, `45f12b8`, avec la parade du 404) : médianes liste 1,24 s (document 0,62 s), ouverture d'une copie 1,23 s, enregistrement 1,25 s, contre 0,83, 0,57 et 0,92 s en E7.8 ; comparaison le même jour impossible (déploiement sans la parade supprimé par Vercel : `DEPLOYMENT_NOT_FOUND`). Part de la parade non isolée ; la copie, relue en entier par le proxy puis par la page, est le premier suspect. Comptes fictifs ajoutés à dev par les mesures.
- 2026-10-24 : coût de la vérification du proxy, mesuré (protocole approuvé par l'utilisateur). Version A (`958d9ac`) : `Server-Timing` temporaire dans le proxy (durée totale, session, ressource), relevé par `e7-review-measure` sur le GET de chaque page mesurée. Deux mesures A en ligne (120 copies, 5 essais, médianes) : A1 liste 995 ms (proxy 10 ms, ressource 4 ms), copie 645 ms (proxy 35 ms, ressource 28 ms), enregistrement 1 034 ms (proxy 14, ressource 7) ; A2 liste 898 ms (proxy 10, ressource 3), copie 596 ms (proxy 11, ressource 6), enregistrement 990 ms (proxy 34, ressource 23). La vérification de la copie coûte 6 à 28 ms : l'allègement (une requête `copyExists` au lieu de `getCopy` + `getStudentIdentity`) ne peut pas gagner les 50 ms de la règle. Décision : vérification actuelle gardée (lecteurs de la page, une seule écriture de la règle) ; version B écrite (avec son test d'égalité et sa ligne `REAL`), jamais poussée ni mesurée, retirée. Les lenteurs du matin (copie 1,23 s) venaient de la journée : la copie s'ouvre l'après-midi en 0,60 à 0,65 s, proche d'E7.8 (0,57 s). `Server-Timing` retiré (`937a728`, proxy identique à `dde416d`). Incident : le serveur de dev restait sur « Compiling proxy … » (processeur au repos), même après redémarrage ; résolu en vidant son cache Turbopack (`/app/.next/dev`, volume `next_cache`).
- 2026-10-25 : E8.7, revue en contexte neuf (`feature-reviewer`) : aucun critique ; M1 supposé (contrôle du résultat sauté si le routeur reconstruit la page de mémoire après plusieurs retours, `ResultFreshness` ne contrôlant pas un premier montage) ; mineurs m1 (liste et détail sans garde au retour, écart au §5 non consigné jusqu'ici), m2 (titre « Validated, but not published » quand un autre onglet a renvoyé la copie à To review), m3 (nouvel essai du raccourci non testé) ; remarques R1 à R6 (R5 : commentaire périmé de `journal.ts`). Corrections approuvées par l'utilisateur :
  - M1 : `e2e/student-back.spec.ts`, quatre navigations puis quatre retours après retrait, **vert sur le code d'avant** (local, `next dev`) : M1 non reproduit, à rejouer en ligne. Correction gardée : `src/components/freshness-guard.tsx` (`FreshnessGuard`, remplace `ResultFreshness`) ; chaque rendu serveur porte un `renderId` aléatoire ; jamais vu dans l'onglet → rien, déjà vu → masqué avant l'affichage puis contrôlé ; `FRESHNESS_GRACE_MS` ne sert plus qu'au double montage de dev ; action liée (`.bind`) passée en prop.
  - m1 : même garde sur My assignments et sur le devoir (contenu masqué sans démontage, le texte saisi est gardé) ; jeton = empreinte (`viewToken`) du DTO de la page ; `checkListFreshnessAction` et `checkAssignmentFreshnessAction` (booléen, inventaire `assignment:read` + `ownSubmissionStatus:read`), balayées par `student-leak.int`.
  - m2 : `publish_failed` porte `validated` ; renvoyée à To review (`not_validated`, `changed`) → titre « Not published », message `sentBackMeanwhile` [P].
  - m3 : nouvel essai après l'échec du second acte : publiée, journal `evaluation_created`, `validated`, `published`.
  - R5 : commentaire corrigé.
  - Vérification : unitaires et statiques 581 ; intégration `review-publication`, `student-leak`, `student-result` verts (26) ; E2E `student-back`, `student-result` verts, `student-leak` et `e8-journey` verts au second passage (publication du professeur non affichée en 15 s au premier). Contre-épreuves (garde neutralisée) : M1 rouge (« 15 / 20 » encore affiché), m1 rouge (« Submitted, being marked » absent après le retour) ; la contre-épreuve propre à M1 (ancienne règle du premier montage) ne peut pas rougir en local. Remarques R1 à R3 : à trancher par l'utilisateur.
- 2026-10-25 : E8.7, remarques tranchées par l'utilisateur. R1 : consignées comme limites (`.claude/a-consigner.md`, pour T5). R2 : une copie publiée modifiée journalise `unpublished` (`{ revision, cause: "change" }`, « Withdrew the publication by a change ») avant `sent_back_to_review`, dans la même transaction. R3 : comportement de Q8 gardé, « Mark as re-read » désactivé hors To review, avec « Only while To review » (vérifié dans `e8-journey` après la validation). R4 sans objet (M1), R6 déjà consignée.
- 2026-10-25 : E8.7 en ligne. Base dev vérifiée (21 migrations, jusqu'à `0020`, aucune nouvelle), `preview` poussée (`17fba07`, déploiement Vercel réussi). Sur la preview, avec le simulateur : `student-back` (2 tests, M1 et m1) et `e8-journey` verts (2,0 min). Comparaison avec le déploiement d'avant la correction (`937a728`, encore en ligne) non concluante : les deux tests y échouent dès la mise en place (création de classe et connexion jamais affichées en 180 s), avant le retour arrière ; M1 reste donc non reproduit, la correction gardée. Comptes et copies fictifs ajoutés à dev.
- 2026-10-25 : E8.7 clos. T4 (sous-agent neuf, lecture de Next 16.4 installé) : M1 possible en production, `bfcache-state-manager.js` garde 3 routes en Activity par niveau (clé = nom du segment, pas la valeur du paramètre) ; au `popstate`, `restore-reducer.js` → `readFromBFCache` rend la page sans requête, quel que soit `staleTimes` ; vidé seulement par `router.refresh()` ou une action revalidante. `student-back` passait sur l'ancien code, ses navigations n'évinçant sans doute pas la route du résultat (supposé). T3 fait (corrections plus haut). T1 conforme (REV-05, REV-06, PUB-01, PUB-02, rejeux 8.3, balayage, matrice ; démonstration O4 à faire par l'utilisateur). T5 : `stack-technologique.md` §3 (valeurs [P], limites, mesures d'E8.6), `fonctionnalites.md` (Q5, risques d'E8), `besoins-non-fonctionnels.md` DON-04 (notice v2).
- 2026-10-25 : M1 reproduit. Troisième test de `student-back` : résultat ouvert puis quitté aussitôt (trois `router.push` vers My assignments avec un paramètre), retrait, un seul saut arrière (`history.go(-3)`). Rouge avec l'ancienne règle (premier montage non contrôlé, simulée par une mémoire propre à l'instance) : « 15 / 20 » affiché. Rouge aussi avec la première correction (`72b1362`). Cause, lue dans des traces temporaires : aucune éviction (les paramètres d'adresse ne font pas une route distincte ; la page du résultat reste dans l'`<Activity>`), mais le résultat quitté avant tout effet (pas encore hydraté) est rendu plus tard, masqué, sans effet ; au retour, son premier effet voit un identifiant jamais enregistré. Correction : l'instance garde l'heure de son premier rendu, liée à son premier `renderId` ; un premier effet plus de `FRESHNESS_GRACE_MS` après ce rendu est un retour, contrôlé ; un nouveau `renderId` reçu par la même instance (`router.refresh()`, action) reste frais. Vert : `student-back` (3), `student-result`, `student-leak`, `submit-text` (8 au total). L'éviction par plus de 3 routes, possible d'après le code de Next (T4), n'est pas atteignable dans l'espace élève actuel (au plus 3 routes par niveau) ; la garde la couvre par l'identifiant déjà vu.
- 2026-10-25 : rejeu en ligne après la reproduction de M1. Base dev vérifiée (21 migrations, aucune nouvelle), `preview` poussée (`9946265`, déploiement Vercel réussi). Sur la preview, avec le simulateur : `student-back` (3 tests, dont celui qui reproduit M1) et `e8-journey` verts (3,5 min). En production l'hydratation est rapide : le test de M1 y passe par le chemin ordinaire plus souvent qu'en local ; la contre-épreuve reste celle de `next dev`. Comptes et copies fictifs ajoutés à dev.
