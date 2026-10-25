# 0008. Batch processing: decision record

## Context

Step E6 of the implementation plan (`conception/fonctionnalites.md` §8.2). Requirements and acceptance criteria live in `conception/fonctionnalites.md` and `conception/besoins-non-fonctionnels.md` (French).

## Options considered

Weighed inside the approved plan below (sections "Contexte", choices marked [P] or [D], and the plan history at its end).

## Rationale

The plan below was approved by the engineer before the build, then amended in its history section as gaps were found. It is copied verbatim, in French, from `~/.claude/plans/`; only its headings moved two levels down.

## References

**Project sources**:
- `conception/fonctionnalites.md`, `conception/stack-technologique.md` §3 (provisional values per step)
- `conception/prompts-implementation.md` (prompts of step E6)

## Approved plan: `plan-e6.md` (verbatim)

### Plan d'E6 — Traitement automatique par lots, échecs et relance

#### Contexte

**Ce qui existe (E5)**
- Le service `evaluateSubmission(submissionId, deps)` (`src/server/evaluation/evaluate.ts:190`) enchaîne trois choses : la prise en charge (transition 2), les tentatives bornées, puis l'enregistrement (transition 5, gardée par la version, résultat `stale` si le texte a été remplacé entre-temps).
- Le balayage `releaseStuckSubmissions` fait passer à l'échec les remises restées trop longtemps en évaluation.
- Seuls la commande `ai:evaluate` et les tests lancent une évaluation. Aucune Server Action ne le fait.

**Ce qu'E6 ajoute**
- Le déclenchement automatique après la remise et le remplacement (PRC-01).
- Un traitement durable par Vercel Workflows, borné en parallélisme.
- Les échecs et la relance (PRC-02).
- Le plafond de coût et la cause « AI unavailable » (EXP-02), le disjoncteur, et la mesure (EXP-01).

**Choix tranchés avec vous le 2026-10-19 [P]** : plafond de **5 $ par mois** ; un Retry-After supérieur à 30 s **arrête** les tentatives (`rate_limited`) ; une sortie tronquée devient une erreur à part, `truncated`, **non relancée** ; parallélisme de **10**.

**Sources sur Workflows** (sous-agent du 2026-10-19 ; les pages workflow-sdk.dev ont été lues par WebFetch, qui en donne un résumé)
- `workflow` est en version **5.2.2** depuis le 2026-10-13 ([npm](https://registry.npmjs.org/workflow)). Le site `useworkflow.dev` redirige vers `workflow-sdk.dev`.
- `start()` n'a **ni clé d'idempotence ni identifiant de run choisi** : chaque appel crée un run ([start](https://workflow-sdk.dev/docs/api-reference/workflow-api/start), [idempotency](https://workflow-sdk.dev/docs/foundations/idempotency)).
- Une étape peut être livrée **au moins une fois** ; un bug de ré-exécution d'une étape longue a été corrigé en 5.1 ([issue 3909](https://github.com/vercel/workflow/issues/3909)).
- Une étape n'a pas de délai propre : elle est bornée par la durée d'une fonction, **300 s** sur Hobby ([fonctions](https://vercel.com/docs/functions/limitations)).
- Hobby : **50 000 événements par mois** ; une étape en coûte 3, plus 1 par nouvelle tentative ; les données d'étape sont gardées 1 jour ([tarifs](https://vercel.com/docs/workflows/pricing), [rétention](https://vercel.com/docs/workflows/retention)).
- Aucun limiteur de parallélisme natif ([discussion 301](https://github.com/vercel/workflow/discussions/301)).
- En local, la « Local World » stocke dans `.workflow-data/` et livre par HTTP au serveur lui-même ([local](https://workflow-sdk.dev/worlds/local)). Sur Vercel, elle a besoin de `VERCEL_DEPLOYMENT_ID` ([déploiement](https://workflow-sdk.dev/docs/deploying)).

#### 1. Flux

```
Élève : submitText / replaceText (transaction validée)
  └─ l'action : after(() => triggerEvaluation(ref))      ref = { submissionId, versionNumber, origin: "auto" }
        └─ start(evaluateSubmissionWorkflow, [ref])  (erreur attrapée, journalisée : la confirmation n'en dépend pas)
Workflow (un run par déclenchement, aucun accès à la base) :
  boucle ≤ EVALUATION_BUSY_MAX_WAITS :
    r = evaluateStep(ref)      ← la seule étape qui appelle l'IA, maxRetries = 0
    r = "busy"  → sleep(EVALUATION_BUSY_WAIT_MS), puis on recommence
    sinon      → fin (to_review | evaluation_failed | not_assessable | stale | skipped)
  exception    → releaseStep(ref, jeton)   (evaluating → evaluation_failed, gardée par la version et le jeton ; amendé le 2026-10-20)
  jeton = getWorkflowMetadata().workflowRunId, posé sur la remise par la prise en charge
Balayage (à chaque déclenchement ; en E7, à l'ouverture des copies par le professeur ; cron en production seulement) :
  releaseStuckSubmissions ; on relance start() pour les remises texte « received » plus vieilles que TRIGGER_GRACE_MS
Professeur (E7/E8 posent les boutons) : retryEvaluation, relaunchEvaluation, startManualEvaluation, listRelaunchable
```

#### 2. Workflow, étapes et leurs garanties

Fichiers : `src/server/evaluation/workflow.ts` (`"use workflow"`) et `src/server/evaluation/steps.ts` (`"use step"`).
- Le dossier `src/server/evaluation/` est imposé par `tests/ai-send-point.test.ts` et par la règle ESLint qui protège `system.ts`.
- `steps.ts` n'a pas d'`import "server-only"` ni d'effet de bord en tête de module.
- Le corps du workflow appelle une fonction pure, `orchestrate(ref, { evaluate, release, sleep })`, que les tests unitaires exercent avec des faux.

| Garantie | Comment |
|---|---|
| Les étapes ne portent que des identifiants (règle 4) | Entrée : la `ref`. Sortie : `{ status, attempts, durationMs }`. Une étape ne renvoie jamais une `EvaluationClaim`, qui contient le texte, car Workflows garde les entrées et sorties 1 jour chez Vercel. |
| Aucun contenu dans une erreur d'étape | Toute exception est attrapée dans l'étape, puis relevée en `FatalError(errorKind(e))` (`evaluate.ts:251`) : un message de `pg` peut contenir des valeurs. |
| Un seul traitement actif par version (CA2) | La barrière est la prise en charge en base (§3), pas un hook. Un second run, ou une étape livrée deux fois, trouve la remise déjà en évaluation et rend `skipped`, sans appel. |
| Pas de double facturation cachée | L'étape a `maxRetries = 0`. Les tentatives restent la boucle d'E5, une seule exécution (run) par prise en charge. |
| Une version devenue non active ne produit rien de courant | La prise en charge exige la version attendue ; l'enregistrement est gardé par la version (`stale`). Comportement inchangé. |
| Une exécution ne libère que sa propre prise en charge (amendé le 2026-10-20) | La prise en charge stocke le jeton du run (`submissions.claim_token`, présent exactement en `evaluating`, `0014`) ; `applyTransition` l'efface en quittant `evaluating`. Le résultat, `stillEvaluating`, `releaseEvaluation` et `releaseStep` sont gardés par la version **et** le jeton. Sans jeton, un run B dont l'étape échoue libérerait la remise que le run A évalue ; et, après une relance du professeur (E6.3), un ancien résultat pourrait devenir courant. La commande `ai:evaluate` prend un jeton aléatoire. |
| Reprise sans perte ni doublon (CA4) | Chaque remise a son propre run. Un arrêt entre deux étapes reprend par rejeu. Un arrêt pendant l'étape mène au `catch`, puis à `releaseStep` ; si le processus meurt, le balayage prend le relais. Les remises encore `received` sont traitées par leur run, ou relancées par le balayage. |
| Aucune remise en cours au-delà d'une durée maximale | 1) Les tentatives tiennent en 3 × 60 + 2 × 30 = 240 s, sous les 300 s. 2) Une exception mène à `releaseStep`. 3) Le balayage fait passer à `evaluation_failed` toute remise en évaluation depuis plus de `EVALUATION_STUCK_AFTER_MS` (9 min), au plus tard au cron quotidien ou au déclenchement suivant. Un test vérifie que cette durée dépasse 300 s. |
| La confirmation de l'élève ne dépend pas du traitement | `start()` part dans `after()`, après la réponse. Un échec est journalisé sans contenu ; la remise reste `received` et le balayage la reprend. |

#### 3. Prise en charge, parallélisme, idempotence

`claimForEvaluation(ref)` (`src/server/data/evaluation/system.ts:60`) :
- `SELECT … FOR UPDATE` filtré par l'état d'origine **et** `current_version = ref.versionNumber`.
- L'origine choisit la transition :
  - `auto` : transition 2, depuis `received` ;
  - `retry` : transition 6, depuis `evaluation_failed` ;
  - `relaunch` : transition 7, depuis `not_assessable`, avec une cause relançable et `teacher_started_at is null`.
- **Sémaphore** dans la même transaction : d'abord `pg_advisory_xact_lock(<clé constante>)` (amendé le 2026-10-20 : le verrou est attendu, plus tenté une seule fois ; il n'est tenu que le temps de 3 requêtes, et une simple collision entre deux prises en charge ne coûte plus 15 s ni d'événements Workflows), puis on compte les remises en évaluation dont `updated_at > now() - EVALUATION_STUCK_AFTER_MS` (une remise bloquée n'occupe pas de place). Si le compte atteint `EVALUATION_CONCURRENCY` (10), la fonction rend `busy` : « busy » veut dire « 10 places prises », jamais « verrou pris ».
  - Un verrou lié à la transaction reste valable derrière le pooler de Neon.
  - Un `UPDATE … WHERE (count) < N` sans verrou ne suffirait pas : il laisserait passer deux prises en charge à 9.
- `evaluateSubmission(submissionId, deps, opts?: { expectedVersion, origin })` : sans `opts`, le comportement d'E5 est gardé (`ai:evaluate`, `evaluateAssignment`, `REAL.aiProposal`). `EvaluationOutcome` et `formatOutcomeLine` reçoivent `busy`.
- Le balayage ne prend que des versions texte : une remise en images rendrait toujours `skipped`.

#### 4. Tentatives et erreurs (constats reportés d'E5.9)

- `AI_CALL_TIMEOUT_MS` passe de 120 000 à **60 000** (E5.16 : maximum de 11,3 s ; un appel jusqu'à `max_tokens` prendrait environ 30 s).
- On relance : `timeout`, `unavailable` (dont 529, 5xx, 409 et un `stop_reason` inconnu), `rate_limited` si Retry-After ≤ 30 s, `not_json`, `schema`, `quote_not_found`.
- On ne relance jamais : `refused`, `configuration`, `rejected`, `budget`, `truncated`.
- **Retry-After supérieur à `AI_RETRY_MAX_WAIT_MS`** : arrêt en `rate_limited`, donc `evaluation_failed` et relance par le professeur [P]. On ne ramène plus l'attente au plafond.
- **`max_tokens`** : l'adaptateur lève `EvaluatorError("truncated")`, avec l'usage, au lieu de passer au validateur [P]. Cela touche `anthropic.ts` et le simulateur.
- **Budget** : nouveau `CallError` `budget`, classé par `errorForStatus` (`errors.ts:191`) sur ces cas :
  - 400 « usage limits » (`spend_limit`) ;
  - le message « credit balance is too low » **quel que soit le statut, 429 compris** (`credit_exhausted`) ;
  - 429 `enforced_spend_limit_reached` (`tier_spend_limit`) ;
  - 402 `billing_error` [P].

  Une clé, un modèle ou une requête faux restent `configuration` ou `rejected`, donc « evaluation failed ».
- Une erreur `budget` pendant les tentatives donne une exécution `failed` qui se termine par `budget` ; la remise passe à `not_assessable`, cause `ai_unavailable`. Pour cela, `EvaluationResult` reçoit la variante `{ outcome: "failed", run, unavailable: true }`, et `STATUS_OF` en déduit l'état (`system.ts:139`). Les CHECK de `evaluation_runs` sont respectés sans être modifiés.

#### 5. Plafond de coût et disjoncteur (`src/server/evaluation/budget.ts`)

**Plafond (EXP-02)**
- Calcul : on somme les exécutions `provider = 'anthropic'` du mois UTC en cours, `prompt_tokens × 0,10 $/MTok + completion_tokens × 0,50 $/MTok`, × 1,1 (`prices.ts`).
  - L'estimation est par excès, car le cache lu est compté au prix de l'entrée.
  - On change le commentaire de `prices.ts` (aujourd'hui « essai seulement »).
- La vérification se fait **avant chaque tentative**.
  - Plafond atteint avant le premier appel : exécution `not_assessable`, cause `ai_unavailable`, 0 tentative, versions nulles, comme le chemin des alertes bloquantes (`evaluate.ts:111-119`).
  - Plafond atteint après au moins un appel : exécution `failed` avec `unavailable: true`.
  - Dans les deux cas, aucun appel de plus.
- Dépassement possible : au plus 10 appels en cours, soit environ 0,01 $. Les appels d'`ai:trial` ne sont pas comptés.
- Email à l'administrateur une fois par mois (événement `ai_cost_cap_reached`).

**Disjoncteur [P]**
- Il s'ouvre quand `AI_BREAKER_FAILURES` (3) remises distinctes ont, dans `AI_BREAKER_WINDOW_MS` (1 h), une exécution `failed` dont la dernière erreur est `configuration` ou `rejected`.
- Ouvert, aucun appel : la remise prise en charge passe à `evaluation_failed` par `releaseEvaluation`, sans exécution.
- L'administrateur reçoit un email s'il n'y a pas déjà un événement `ai_breaker_tripped` dans la fenêtre.
- Il se referme seul quand la fenêtre est passée. Aucune commande de remise à zéro.

**Email** : nouvel `EmailKind` `ai_alert`, adressé aux administrateurs, sans aucun contenu d'élève ; capturé en test.

#### 6. Migration `0013_add_ai_unavailable`

Elle ne contient que des `ADD VALUE`, aucune contrainte modifiée :
- `not_assessable_cause` : `ai_unavailable` ;
- `evaluation_error` : `budget` et `truncated` (drizzle-kit les place `BEFORE 'not_json'`, comme en `0012`) ;
- `security_event_type` : `ai_cost_cap_reached` et `ai_breaker_tripped`.

**Fait vérifié** : le migrateur de Drizzle 0.45.4 passe toutes les migrations en attente **dans une seule transaction** (`drizzle-orm/pg-core/dialect.js:44-72`). Aucune migration de ce lot, ni d'un lot suivant passé en même temps, ne doit donc *utiliser* ces valeurs. `0013` les ajoute seulement. La migration de dev passe seule, à relire avant `db:migrate`.

Libellés (`src/lib/evaluation.ts:38`) : `ai_unavailable` → « AI unavailable » ; `rubric_unavailable` reçoit un libellé distinct, puisqu'il commence aujourd'hui lui aussi par « AI unavailable ».

#### 7. Fonctions du professeur, matrice, inventaire

Fichier `src/server/data/evaluation/teacher.ts`. Chaque fonction reçoit l'Actor en premier et vérifie l'accès avec `authorize` et `ownedBy` (professeur propriétaire).

| Fonction | Droit [P] | Effet |
|---|---|---|
| `retryEvaluation(actor, id)` | `unpublishedEvaluation:write` | Vérifie `evaluation_failed`, puis lance un `start` avec `origin: "retry"`. La transition 6 se fait dans l'étape, sous le sémaphore. |
| `relaunchEvaluation(actor, id)` | idem | Cause `ai_unavailable` (plafond plus atteint) ou `rubric_unavailable` (rubrique de la langue présente), jamais si `teacher_started_at` est posé. Lance un `start` avec `origin: "relaunch"` (transition 7). Jamais automatique. |
| `listRelaunchable(actor, assignmentId)` | `submission:read` | Identifiants et causes des copies relançables, celles-là seules (PRC-02 CA3). |
| `startManualEvaluation(actor, id)` | `unpublishedEvaluation:write` | Transition 6 ou 7 vers `to_review`, sans proposition, `teacher_started_at = now()`. Le formulaire viendra en E8. |

- Les Server Actions qui déclenchent passent `after` par injection : le service reçoit un `ctx: { onReceived(ref) }` obligatoire. C'est le modèle de `src/server/auth/sign-up.ts:38`. Les services restent appelables depuis les tests, où un enregistreur prouve qu'il y a un seul déclenchement par validation.
- `submitText` et `replaceText` renvoient une `ref` interne, jamais exposée au client.
- Fichiers touchés : `inventory.ts` (exports système de `steps.ts`, nouvelles fonctions, route cron avec un nouveau type d'`EntryPoint` `{ system }`), `REAL` dans `tests/access-matrix.int.test.ts`, et `IMPORT_RESTRICTIONS` (`workflow` et `workflow/*` réservés à `src/server/evaluation/**`).

#### 8. Mesure (EXP-01) et point d'attache du lecteur d'images

- `evaluation_runs` porte déjà la durée, les tentatives, les tokens et les erreurs, sans identité ni contenu. Aucune colonne n'est ajoutée.
  - Délai entre la remise et le résultat : `run.created_at − submitted_at`.
  - Le coût est calculé par le script d'E6.4 avec les prix datés de `prices.ts`. Il n'est pas stocké, car un prix stocké se figerait.
  - Les événements Workflows par copie seront mesurés en E6.4 avec `npx workflow inspect`.
- Interface `Reader` : reportée à E9, avec son implémentation (amendé le 2026-10-20 : sans utilisateur avant E9, elle serait du code mort à réécrire). L'étape ne prend pas en charge une version en images (`skipped`), ce qui ne change rien à E5.

#### 9. Réglages provisoires (`provisional.ts`, [P])

| Constante | Valeur | Remarque |
|---|---|---|
| `AI_CALL_TIMEOUT_MS` | 60 000 | Était 120 000 (proposé en E5.16). |
| `AI_MAX_ATTEMPTS` / `AI_RETRY_DELAY_MS` / `AI_RETRY_MAX_WAIT_MS` | 3 / 2 000 / 30 000 | Inchangés. 3 × 60 + 2 × 30 = 240 s < 300 s. |
| `EVALUATION_STUCK_AFTER_MS` | 9 min (dérivé) | Toujours la même formule ; un test vérifie qu'il dépasse 300 s. |
| `EVALUATION_CONCURRENCY` | 10 | Choisi avec vous. |
| `EVALUATION_BUSY_WAIT_MS` / `EVALUATION_BUSY_MAX_WAITS` | 15 000 / 20 | Au plus 5 min d'attente d'une place, puis la remise reste `received`. Environ 5 événements par attente. |
| `TRIGGER_GRACE_MS` | 10 min | Doit dépasser 20 × 15 s. Le balayage relance les remises `received` plus vieilles que ce délai. |
| `AI_MONTHLY_COST_CAP_USD` | 5 | Choisi avec vous. Reste sous la limite de 10 $ de l'espace. |
| `AI_BREAKER_FAILURES` / `AI_BREAKER_WINDOW_MS` | 3 / 1 h | Arbitraires. |
| `AI_DAILY_REQUEST_LIMIT` | 200 | Commandes seulement, inchangé ; l'application est bornée par le plafond. |

#### 10. Développement, tests, preview

- **Installation** :
  - `workflow` en version exacte `5.2.2` (au moins 5.1 pour la correction du bug d'étape longue) ;
  - `withWorkflow(nextConfig)` dans `next.config.ts`, à vérifier avec `cacheComponents` et `partialPrefetching` au build dans e2e ;
  - `.workflow-data*` dans `.gitignore`.

  `src/proxy.ts` ne change pas : son matcher ne couvre que `/student`, `/teacher` et `/admin`.
- **Développement** (`web`, `next dev`) : Local World sur `http://localhost:3000` ; le simulateur est en mémoire dans le même processus. `AI_PROVIDER` vide → simulateur.
- **Tests d'intégration** :
  - ils appellent les étapes et les services directement (sans le compilateur, `"use step"` n'a pas d'effet), avec le simulateur injecté ;
  - `start()` n'est jamais appelé, car la garde réseau le refuserait ;
  - `orchestrate` est testé en unitaire avec un `sleep` faux.
- **E2E** (Playwright, `next dev` sur le port 3100) : `WORKFLOW_LOCAL_BASE_URL=http://localhost:3100` et un dossier de données distinct de celui de `web`, qui partage le même `/app`. On ne teste que le chemin nominal : les pannes du simulateur restent en mémoire.
- **Preview** (Vercel World) :
  - **à cocher par vous** : « Enable access to System Environment Variables » (`VERCEL_DEPLOYMENT_ID`) ;
  - `CRON_SECRET` pour la route cron ;
  - `AI_PROVIDER` absent → simulateur, jusqu'à la démonstration d'E6.5.
- **Cron** : `src/app/api/cron/evaluation-sweep/route.ts`, déclaré dans `vercel.json`. **Vérifié le 2026-10-20** : Vercel appelle le cron sur le déploiement de production seulement ([Cron Jobs](https://vercel.com/docs/cron-jobs)) ; `main` n'étant pas déployée [D], il ne tourne pas. Le balayage tourne à chaque déclenchement, borné à 20 relances, et, **à partir d'E7**, à l'ouverture des copies d'un devoir par le professeur (amendé le 2026-10-20). **Limite connue** : d'ici E7, une remise bloquée n'est libérée qu'à la remise suivante, de n'importe quel élève ; ensuite, au plus tard quand le professeur la regarde. Déployer `main` pour le cron a été écarté (second déploiement sur la même base, variables à doubler, une fois par jour sur Hobby). `ai:evaluate --received` retiré (amendé le 2026-10-20) : le balayage à chaque remise et la route cron le remplacent.

#### 11. Découpage (`prompts-implementation.md` l.807-838)

- **E6.1** :
  - installation et configuration ;
  - `ref` et `onReceived` ; `trigger.ts` ;
  - prise en charge sur la version attendue ;
  - workflow, `evaluateStep` et `releaseStep` (sans sémaphore) ;
  - build dans e2e, avec l'empaquetage du SDK d'Anthropic.

  Tests : PRC-01 CA1 et CA2, SUB-05 CA2.
- **E6.2** :
  - migration `0013` ; `budget`, `truncated`, `ai_unavailable` ;
  - Retry-After ; délai à 60 s ;
  - sémaphore et attente `busy` ;
  - plafond, disjoncteur et email ;
  - balayage et cron.

  Tests : PRC-01 CA3 et CA4, plafond, disjoncteur.
- **E6.3** : fonctions du professeur, matrice, inventaire, `REAL`. Tests : PRC-02 CA1 à CA4, SUB-01 CA2.
- **E6.4** : `scripts/evaluation-report.ts` et mesure des événements. Le cache des consignes se décide là.
- **E6.5 et E6.6** : inchangés.

#### 12. Vérification

Un test par garantie, chacun avec sa contre-épreuve : retirer la protection doit faire échouer le test.

| Garantie | Test | Contre-épreuve |
|---|---|---|
| Un déclenchement par validation, aucun sur un refus | intégration : enregistreur `onReceived` | appeler `onReceived` avant la transaction → le test échoue |
| Double déclenchement → une seule exécution | `evaluateStep(ref)` ×2 en parallèle → 1 exécution, 1 proposition courante | retirer le filtre d'état ou de version |
| Version non active | remplacement pendant un `holdNext()` → ancien résultat `stale`, nouveau traité | retirer `expectedVersion` |
| Au plus 10 en évaluation | 30 remises, `holdNext`, compte observé ≤ 10, autres `busy` | retirer le verrou consultatif |
| Lot sans mélange (CA3) | 30 textes à marqueur unique, plusieurs comptes ; chaque proposition ne cite que le sien ; tous atteignent un état final | — |
| Panne isolée et reprise (CA4) | une remise en 529 persistant → `evaluation_failed`, les autres `to_review` ; une étape qui lève → `releaseStep` | retirer le `catch` d'`orchestrate` |
| Une exécution ne libère que sa prise en charge | run A en `holdNext` ; `releaseStep(ref, B)` → `false`, A finit `to_review` courant ; `releaseStep(ref, A)` → `evaluation_failed`, la réponse tardive de A `stale` ; la base refuse `evaluating` sans jeton et un jeton hors `evaluating` | retirer le jeton de la garde → B libère la prise en charge de A |
| Pas de remise bloquée | balayage après le délai ; test `EVALUATION_STUCK_AFTER_MS` > 300 s | réduire le délai sous 300 s |
| Budget → AI unavailable, sans relance | simulateur 402, `spend_limit`, 429 « credit balance » → `not_assessable/ai_unavailable`, 1 tentative | reclasser en `rate_limited` |
| Plafond : plus aucun appel | exécutions anthropic fictives au-dessus de 5 $ → 0 tentative, `simulator.captured()` vide, un seul email | retirer la vérification |
| Disjoncteur | 3 échecs `configuration` → 4e sans appel, email unique | — |
| `truncated` et Retry-After long non relancés | 1 tentative | — |
| Aucun texte dans une étape | sortie et erreur de `evaluateStep` sans le marqueur du texte | renvoyer la claim |
| Matrice des nouvelles fonctions | `REAL` : propriétaire seul, autre → `null`, élève → `AccessDeniedError` | — |
| Élève : « Submitted, being marked » | intégration et E2E, pour chaque état d'échec | — |

Commandes :
- `docker compose exec -T web npm test` ;
- `docker compose run --rm e2e` (build et parcours E6), jamais en même temps que l'intégration ;
- en dev, une remise réelle par l'interface passe à « To review » (simulateur), contrôlée en base et avec `npx workflow inspect runs`.

#### Valeurs à consigner (T5, à la demande)

- **[P]** : les valeurs du §9 ; le classement `budget` (402 compris) ; `truncated` ; l'arrêt sur Retry-After long ; les droits du §7 (aucune ligne n'existe dans la matrice §5.4) ; la cause « AI unavailable » ; le disjoncteur.
- **Faits** : Workflow 5.2.2 ; pas d'idempotence native de `start()` ; étapes livrées au moins une fois ; Hobby à 50 000 événements, 300 s par fonction, données gardées 1 jour ; Drizzle passe toutes les migrations en une transaction.
- **À vérifier** : les événements par copie (E6.4) ; le code HTTP du crédit épuisé ; la durée réelle d'une étape sur Vercel.
- **Mise à jour** : `stack-technologique.md` §3 ; `fonctionnalites.md` §5.4 et §5.5 (cause) ; `procedures.md` (variables de la preview) ; CLAUDE.md (état).

#### Historique

- **2026-10-20, écart 1 résolu (décision de l'utilisateur : `releaseStep` sûr)** : en E6.1, `releaseStep` avait été omis, car gardé par la version seule il pouvait libérer la prise en charge d'un autre run de la même version. Il est rétabli avec un jeton de prise en charge (`0014`, `submissions.claim_token` = `workflowRunId`), qui garde aussi le résultat, `stillEvaluating` et `releaseEvaluation` (§1, §2, §12).
- **2026-10-20, écarts 2 à 5 résolus (recommandations appliquées à la demande de l'utilisateur)** : 2) verrou consultatif attendu au lieu d'une tentative unique (§3) ; 3) cron absent de la preview (production seulement) : balayage aussi côté professeur en E7, limite notée (§1, §10) ; 4) `Reader` reporté à E9 (§8) ; 5) `ai:evaluate --received` retiré (§10).
- **2026-10-20, E6.3 (précisions du §7, sans changer les droits)** : chaque fonction du professeur prend la version vue (`{ submissionId, versionNumber }`, sinon `changed`) ; l'origine voyage dans `EvaluationRef.origin` ; `listRelaunchable` et `relaunchEvaluation` reçoivent les conditions (`relaunchConditions()` dans `src/server/evaluation/relaunch.ts`), parce que la couche de données n'importe pas le service d'évaluation ; « AI unavailable » venu d'une erreur `budget` du fournisseur n'est proposé qu'après une exécution aboutie du même fournisseur [P], l'application ne pouvant pas lire le compte Anthropic.
- **2026-10-20, E6.6 (revue en contexte neuf, constats corrigés à la demande de l'utilisateur)** : M1) une relance ou un relancement demandé deux fois pouvait évaluer deux fois, car l'état de départ (`evaluation_failed`) est aussi celui d'un échec : chaque demande du professeur stocke un identifiant aléatoire (`0015`, `submissions.evaluation_request`, effacé par toute transition), que la prise en charge 6 ou 7 exige et consomme ; M2) les routes générées par Workflows sont inscrites à l'inventaire (`{ system }`, test étendu aux `.js`) ; `@vercel/queue` ne vérifie aucune signature de livraison (source lue), la protection par Vercel n'est pas vérifiée : sans la demande stockée, un message forgé ne prend rien que le système n'aurait pris ; m1) le balayage date les remises qu'il relance (`updated_at`, `skip locked`) ; m2) une IA impossible à créer fait échouer la copie prise (`evaluation_failed`, sans exécution) et alerte les administrateurs (`ai_configuration_failed`) ; m3) contre-épreuve du jeton (réponse tardive de A pendant que B évalue la même version) ; m4) le plafond compte au plafond d'un appel [P] les appels sans usage (délais dépassés, requêtes journalisées au-delà des appels des exécutions) ; m5) l'alerte n'est enregistrée qu'une fois envoyée, envoi borné par `AI_ALERT_SEND_MAX_MS` [P], compté dans `EVALUATION_STEP_MAX_MS` (260 s) ; m6) la ref d'une demande est construite champ par champ.
