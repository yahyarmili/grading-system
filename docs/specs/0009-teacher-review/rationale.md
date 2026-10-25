# 0009. Teacher review: decision record

## Context

Step E7 of the implementation plan (`conception/fonctionnalites.md` §8.2). Requirements and acceptance criteria live in `conception/fonctionnalites.md` and `conception/besoins-non-fonctionnels.md` (French).

## Options considered

Weighed inside the approved plan below (sections "Contexte", choices marked [P] or [D], and the plan history at its end).

## Rationale

The plan below was approved by the engineer before the build, then amended in its history section as gaps were found. It is copied verbatim, in French, from `~/.claude/plans/`; only its headings moved two levels down.

## References

**Project sources**:
- `conception/fonctionnalites.md`, `conception/stack-technologique.md` §3 (provisional values per step)
- `conception/prompts-implementation.md` (prompts of step E7)

## Approved plan: `plan-e7.md` (verbatim)

### Plan d'E7 — Revue par le professeur : liste, copie, modification libre, journal

#### Contexte

E6 amène chaque remise texte à « To review » avec une proposition immuable (`ai_proposals`), mais le professeur ne voit rien. La page du devoir montre encore un `EmptyState` figé. `listTeacherAssignments` renvoie `submissions: 0, toReview: 0` en dur. Les fonctions d'E6.3 n'ont pas de bouton.

E7 livre REV-01 à REV-04 :
- la liste triée et filtrée ;
- la copie ;
- l'évaluation du professeur, distincte de la proposition ;
- le journal.

Elle couvre aussi NFR-TRT-03, FIA-01, DON-04 et USA-03, et tranche les deux points ouverts d'E6.6.

Ce qui existe déjà :
- **Matrice** : elle a déjà les lignes `submission` (L), `aiProposal` (L), `unpublishedEvaluation` (L É), `reviewLog` (L, sans table) et `studentAccount` (L), toutes pour le professeur propriétaire.
- **Remises** : `teacher_started_at` existe ; seul `startManualEvaluation` le pose.
- **Maquettes 1.4 et 1.5** : elles fixent l'interface, et l'interface réelle les suit.

#### 0. Doc Next.js : ce que le sous-agent a lu, et une réserve

**Réserve** : `node_modules` est vide sur l'hôte et le conteneur `web` est arrêté. Le sous-agent a donc lu la doc de **Next 16.3.8**, dans un autre projet. Le projet utilise 16.4.0.

Au début d'E7.2, je relis les mêmes fichiers dans le conteneur (`docker compose exec -T web grep … node_modules/next/dist/docs`). Tout écart sera noté dans l'historique de ce plan.

Fichiers lus, relatifs à `docs/01-app/` :
- `02-guides/prefetching.md`, `optimizing-prefetching.md`, `adopting-partial-prefetching.md` ;
- `03-api-reference/02-components/link.md`, `…/route-segment-config/{prefetch,instant}.md` ;
- `…/next-config-js/{staleTimes,cacheComponents,partialPrefetching}.md` ;
- `04-functions/{after,refresh,updateTag,revalidatePath,revalidateTag,use-router,not-found,connection}.md` ;
- `02-guides/{server-actions,forms,data-security,streaming,instant-navigation,cdn-caching}.md`, `01-getting-started/{07-mutating-data,08-caching}.md`.

Faits retenus :
1. **Préfetch** :
   - il n'a lieu qu'en production ;
   - avec `cacheComponents`, un `<Link>` par défaut préfetch le rendu en cache de la page ;
   - le code des Server Components s'exécute jusqu'à la première lecture non mise en cache.

   La doc le dit en toutes lettres : un effet de bord dans le rendu (« tracking analytics ») peut s'exécuter « when the route is prefetched, not when the user visits the page ». Elle recommande un `useEffect` ou une Server Action déclenchée depuis un composant client.

   `prefetch={false}` coupe tout préfetch. Aucune API ne permet de reconnaître un préfetch depuis un Server Component.
2. **Cache client** :
   - `staleTimes.dynamic` vaut 0 par défaut, mais les pages sont réutilisées au retour et à l'avance du navigateur ;
   - avec `cacheComponents`, les routes quittées passent en `<Activity hidden>` : leurs effets sont nettoyés, puis recréés au retour ;
   - `router.refresh()` vide le cache client de la route ;
   - `refresh()` de `next/cache` (Server Action seulement) rafraîchit le routeur.
3. **`after()`** :
   - le callback s'exécute après la réponse, même après une erreur ;
   - sur Vercel, il passe par `waitUntil`, borné par `maxDuration` ;
   - le projet l'utilise déjà dans les Server Actions de l'élève.
4. **Server Actions** :
   - envoi en POST, en série par client ;
   - la réponse ne contient un nouveau rendu que si l'action appelle `refresh`, `updateTag` ou `revalidatePath`, ou touche aux cookies ;
   - il faut authentifier dans chaque action.
5. **`cacheComponents`** :
   - tout est dynamique par défaut ;
   - aucune donnée de revue ne sera mise en `'use cache'` ;
   - une fois le streaming commencé, le statut HTTP est figé à 200 ;
   - `export const instant = false` permet de bloquer avant le streaming : c'est le modèle actuel du vrai 404 (`teacher/classes/[classId]/page.tsx`).

#### 1. Décisions

##### 1.1 L'évaluation du professeur : quand elle naît, et pourquoi

**Elle naît à la première écriture du professeur depuis la proposition courante, dans la même transaction que cette écriture.**

Ce qui se passe :
- les valeurs initiales sont copiées de la proposition : niveaux, justifications → remarques, commentaire, pistes, note proposée, note non fixée ;
- puis le changement est appliqué ;
- puis `teacher_started_at` est posé.

Pourquoi pas autrement :
- **Pas à l'ouverture** : une lecture n'écrit rien, hormis le journal. Un préfetch ne doit rien créer.
- **Pas à l'enregistrement de la proposition** : le système créerait une évaluation que le remplacement devrait détruire.

Conséquences :
- **Invariant** : « une évaluation existe ⇒ `teacher_started_at` est posé ». Cet acte ferme le remplacement (SUB-05 R3), le retry et la relance, qui exigent tous `teacher_started_at is null`. L'évaluation porte donc toujours sur la version active, et sa proposition reste la proposition courante. Une seule par remise : `unique(submission_id)`, plus forte qu'« une par version active ».
- **Remplacement avant tout acte** : il n'y a rien à défaire, puisque l'évaluation n'existe pas encore. Le remplacement vide déjà `current_proposal_id` ; la copie suivante partira de la nouvelle proposition.
- **Enregistrement sans aucun changement par rapport à la proposition** : rien n'est créé et rien n'est journalisé. La copie reste remplaçable. En E8, valider « sans modification » créera l'évaluation, journalisée « validated without changes ».

##### 1.2 La note
- **Niveaux** : entiers de 0 à 4. Zod (`z.int().min(0).max(4)`) les vérifie côté serveur, et un CHECK en base aussi. Un 5, un 2,5 ou un texte sont refusés avec un message par champ, y compris par requête directe.
- **Note non fixée** : elle vaut toujours `calculateGrade(levels)`. Le client la recalcule pour l'affichage, le serveur la recalcule à l'enregistrement, et un CHECK l'impose (`grade_fixed or final_grade = somme`).
- **Note fixée** :
  - le client envoie `{ fixed: true, value }` ;
  - Zod vérifie qu'elle est entre 0 et `GRADE_SCALE` (20, [D]) et multiple de `GRADE_STEP` (0,5, [P], déjà dans `provisional.ts`) ;
  - le pas n'est pas dans un CHECK, car une valeur [P] ne se fige pas en base ;
  - plus de recalcul ;
  - l'écart `final − somme` est dérivé et non stocké, signalé par texte et icône (USA-03).
- **Retour à la note calculée** : `{ fixed: false }`.
- **Stockage** : `numeric(4,2)` en mode nombre.

##### 1.3 La remarque « To re-read » (REV-03 R3, D5)
- **Stockage** : `reread_<critère>` booléen dans `teacher_evaluations`.
- **Calcul**, fait par le serveur à chaque enregistrement et par critère :
  `nouveau = (niveau changé et remarque inchangée) ou (ancien et remarque inchangée et critère absent de rereadDone)`.
- **Ce qui l'efface** : une modification de la remarque, ou « Mark as re-read » (`rereadDone`). Cette dernière action est une écriture sans texte, journalisée.
- Elle ne bloque rien et n'exige aucun texte. La validation d'E8 l'ignore.
- **« Modified »** se dérive : niveau ou remarque différents de la proposition.

##### 1.4 Grain d'enregistrement : le formulaire entier

Le professeur enregistre par un bouton « Save changes », avec une barre sticky comme dans la maquette.

Pourquoi pas un enregistrement automatique champ par champ :
- chaque champ coûterait environ 6 allers-retours à Neon ;
- deux onglets entreraient en conflit à chaque frappe ;
- le journal se remplirait d'états intermédiaires.

Effets :
- **Journal** : un enregistrement produit une révision et une ligne par champ réellement changé (ancienne et nouvelle valeur). Toutes les lignes portent la même `evaluation_revision`.
- **Conflits** : toute révision intercalée provoque un conflit, même sur un autre champ. Il n'y a jamais de fusion silencieuse.
- **Perte de saisie** : une saisie non enregistrée est signalée (« Unsaved changes ») et protégée par `beforeunload`.

##### 1.5 Concurrence (REV-03 R5, NFR-FIA-01)

**Ce que porte chaque écriture** : `seen = { submissionId, versionNumber, proposalId | null, revision }`, avec `revision = 0` quand il n'y a pas d'évaluation. Ces valeurs sont lues à l'ouverture et passées par le formulaire.

**Réponses possibles**, dans cet ordre, sous le verrou de la ligne de remise :
1. `null` : copie absente, ou appartenant à un autre professeur. La page répond 404.
2. `"replaced"` : `current_version` ou `current_proposal_id` diffère de ce qui a été vu.
   - Message : « This submission was replaced. The page has been reloaded. »
   - `router.refresh()` charge la nouvelle version.
3. `"not_open"` : état hors `to_review`, pour une même version.
   - En E8, `validated` et `published` passeront ici par la transition 10.
4. `"conflict"` : la révision diffère de celle vue.
   - La réponse contient l'évaluation enregistrée et sa révision.
   - La saisie reste à l'écran, avec l'alerte « Changed in another tab or window ».
   - Deux actions explicites :
     - « Load saved version » abandonne ma saisie ;
     - « Save mine over it » renvoie avec la révision qui vient d'être lue. L'écrasement est voulu et il est journalisé.
   - Rien n'est jamais écrasé en silence.

**Remplacement par l'élève et premier acte du professeur simultanés** : les deux prennent `FOR UPDATE` sur la même ligne de remise, donc le premier gagne.
- Si l'enregistrement passe d'abord, `teacher_started_at` est posé et le remplacement est refusé (`teacher_started`).
- Si le remplacement passe d'abord, la version change et l'enregistrement reçoit `replaced`.

##### 1.6 Ouverture journalisée sans faux positif

**Chemin retenu** : un composant client `<ReviewOpened>` fait un `useEffect` qui appelle une Server Action (`recordCopyOpenedAction` ou `recordListOpenedAction`). C'est la recommandation de la doc. Un préfetch ne monte aucun composant, et un rendu en cache n'exécute aucun effet. Rien n'écrit pendant le rendu serveur.

En plus :
- `prefetch={false}` sur les liens de noms de la liste, soit 120 liens à l'écran ; cela évite aussi 120 rendus pour Neon ;
- un `useRef` garde contre le double effet de StrictMode en dev ;
- un retour par la flèche du navigateur recrée l'effet (Activity), ce qui compte comme une vraie réouverture.

**Contrôle de fraîcheur dans la même action** : elle renvoie l'état courant (`versionNumber`, `proposalId`, `revision`, `status`, et un tampon pour la liste). Si l'état diffère de ce qui a été rendu, le client fait `router.refresh()`. Ainsi, aucune page réutilisée du cache client ne reste périmée.

Autres garanties :
- aucune donnée de revue n'est mise en `'use cache'` ;
- les pages sont dynamiques ;
- toute écriture est gardée par la révision.

**Copie « non remise »** : la page de statut n'écrit rien dans le journal, puisqu'il n'y a pas de remise.

##### 1.7 Le balayage à l'ouverture de la liste et d'une copie

Il se fait dans `recordListOpenedAction` et `recordCopyOpenedAction`, pas dans le rendu (révisé en E7.9, 2026-10-22).

Déroulement :
1. On ajoute l'entrée « list opened » (ou « copy opened ») ; la même vérification lit le tampon. Si le devoir ou la copie n'est pas au professeur, rien n'est fait.
2. On lance `sweepEvaluations(startEvaluation)` dans `after()`, sans l'attendre : les Server Actions d'un client passent une à une (doc Next 16.4.0, `server-actions.md`), un « Retry » cliqué après l'ouverture n'attend donc pas le balayage.
3. Une erreur est journalisée par son type seulement (`errorKind`), comme dans `trigger.ts`. Le professeur ne voit aucune erreur.
4. Si le tampon diffère, le client rafraîchit. Ce que le balayage fait avancer (copies `received` ou `evaluating`) s'affiche au rafraîchissement borné déjà monté pour ces états (`RefreshWhileEvaluating`).

Pourquoi pas dans le rendu :
- le rendu peut s'exécuter au préfetch ;
- le balayage coûte 8 à 10 allers-retours, qui ne doivent pas retarder l'affichage (TRT-03).

##### 1.8 La liste (REV-01) : où se fait le tri

**Une seule requête SQL** (CTE) ramène toutes les lignes du devoir :
- les élèves actifs des classes destinataires, plus tout élève ayant une remise ;
- par élève, ses classes destinataires avec le statut d'appartenance ;
- l'état, `late`, le mode de la version active et la date de cette version ;
- la cause, et la dernière erreur du dernier run (pour `refused`) ;
- la note du professeur, la note proposée courante ;
- `evaluation_request is not null`.

**Tri, filtres, compteurs et pagination se font côté serveur, en TypeScript, sur la liste entière.** Au cas haut (100 à 300 lignes, moins de 100 Ko), c'est négligeable, et l'ordre alphabétique reste `compareText` : le même collateur partout, testé sur « Émile », « Eric », « d'Aubigné ». Un `ORDER BY` SQL aurait une autre collation que les tests unitaires.

Règles d'affichage et de tri :
- **Note** : celle du professeur ; sinon la proposée, marquée « provisional » ; sinon « — ». Les copies sans note vont en fin de liste dans les deux sens (fonction pure testée).
- **Date** : celle de la version active (`submission_versions.created_at`).
- **Élève retiré** : il n'apparaît que s'il a une remise, avec le Tag « Removed from class ».
- **Élève dans plusieurs classes** : une seule ligne, avec ses classes.

État de la liste dans l'URL :
- `?sort=name|grade|date&dir=asc|desc&class=<id>&status=<état|failed>&page=n`, validé par Zod, avec repli sur les défauts ;
- la page vaut `REVIEW_LIST_PAGE_SIZE` [P, 50] ;
- le tri et les filtres sont conservés au retour : le lien vers la copie porte `?list=<requête>`, que « Back to submissions » restitue, et la flèche du navigateur garde l'URL.

**Compteurs** : « To review », « Failed » (évaluation ou transcription) et « Not assessable », calculés sur la liste entière, non filtrée.

**Relance** : le bouton est sur la ligne. `listRelaunchable` n'est appelé que si au moins une ligne est `not_assessable`, ce qui évite 2 allers-retours sinon.

**Liste des devoirs** : `listTeacherAssignments` reçoit les vrais compteurs (remises, à valider).

##### 1.9 La copie (REV-02)
- **Identité (D9)** : nom, prénom, email (`getStudentIdentity`, ressource `studentAccount`). Classes : seulement celles de l'élève qui sont destinataires du devoir et appartiennent au professeur (`assignment_classes.teacher_id`).
- **Texte** : la version active telle quelle (`whitespace-pre-wrap`), dans une région avec `lang={assignment.language}` (USA-03).
- **Proposition en lecture seule** :
  - niveaux, justifications, citations, commentaire, pistes, note proposée ;
  - alertes avec leur libellé (`proposalAlertLabels`, nouveau dans `src/lib/evaluation.ts`) ;
  - modèle (`model_answered`) et date du run en petit (`formatDateTime`).
- **Également affichés** : mode et « Late ». Aucune note ni moyenne antérieure de l'élève.
- **Page de statut, sans formulaire**, selon l'état :

  | État | Page |
  |---|---|
  | `to_submit` | « Not submitted » |
  | `received` ou `evaluating` | « Being evaluated » |
  | `evaluation_failed` | Cause, puis « Retry ». Si la dernière erreur est `refused` : « The AI declined to assess this text », plus l'avertissement « A refusal usually repeats » sur « Retry ». |
  | `not_assessable` | Cause libellée, et « Relaunch » si `listRelaunchable` la propose. |

  « Evaluate manually » est absent jusqu'à E8 : aucun bouton mort.
- **Formulaire** : à partir de `to_review`.

##### 1.10 Relance (PRC-02 depuis l'écran)
- **Actions** : `retryEvaluationAction(seen)` et `relaunchEvaluationAction(seen)`. Elles appellent les fonctions d'E6.3 avec `{ onStart: (ref) => after(() => startEvaluation(ref)) }`, et calculent `relaunchConditions()` pour la relance.
- **Journal** : `retryEvaluation` et `relaunchEvaluation` écrivent « retry requested » ou « relaunch requested » dans leur transaction. La ligne verrouillée fournit `assignment_id`.
- **Refus** :
  - `changed` → « This submission was replaced » puis rafraîchissement ;
  - `not_failed` ou `not_relaunchable` → message, puis rafraîchissement.
- **Double clic** : le bouton est désactivé pendant l'envoi. Côté serveur, la demande est à usage unique (E6.6).

##### 1.11 Les deux points ouverts d'E6.6 : recommandations

**1. Alerte « prestataire injoignable » (EXP-02)** — **Recommandé : la faire en E7.6.**

Le mécanisme :
- quand une exécution se termine `failed` avec une dernière erreur `unavailable` ou `timeout`, on compte les remises distinctes dans ce cas sur `AI_UNREACHABLE_WINDOW_MS` [P, 1 h] ;
- à `AI_UNREACHABLE_FAILURES` [P, 3], un email `ai_alert` part par `claimAiAlert("ai_provider_unreachable", …)`, une fois par fenêtre ;
- le disjoncteur ne s'ouvre pas : un 529 est passager.

Le coût :
- une valeur d'enum `security_event_type` (`ADD VALUE`) ;
- une requête de comptage sur le seul chemin d'échec, donc rien quand tout va bien ;
- un test avec le simulateur en panne 529 persistante ;
- environ une demi-journée.

L'alternative, ne rien faire, ne coûte rien, mais EXP-02 reste incomplet et l'administrateur n'apprend une panne prolongée que par le professeur.

**2. Relance abandonnée après 5 min sans place** — **Recommandé : la rendre visible.**

Le mécanisme :
- tant que `evaluation_request` est posée, la copie affiche « Retry requested: waiting for an evaluation slot » ;
- à la fin des attentes, `orchestrate` appelle une nouvelle étape, `dropRequestStep(ref)` ;
- cette étape efface la demande, gardée par le jeton de demande, via `clearEvaluationRequest` dans `transitions.ts` ;
- elle journalise « retry abandoned » (acteur système) ;
- la copie revient à « Evaluation failed » avec « No slot freed within 5 minutes. Retry later. ».

Le coût :
- une étape, une fonction de transitions et une valeur d'enum du journal ;
- un test unitaire d'`orchestrate` et un test d'intégration ;
- 1 à 2 événements Workflows, seulement en cas d'abandon ;
- environ une demi-journée.

Les alternatives :
- relancer depuis le balayage demanderait une colonne de date et une migration ;
- ne rien faire laisse la copie en échec sans explication.

##### 1.12 Notice du professeur (DON-04)

**Le texte** :
- constante `TEACHER_NOTICE = { version: 1, title, sections, acknowledge }` dans `src/lib/texts.ts` [P] ;
- elle dit ce que mesure le journal : heures d'ouverture et de validation, donc le temps de revue ; concordance entre proposition et version finale ;
- elle dit qui le lit : le correcteur seul, et l'équipe pour les mesures d'E10 ;
- elle donne la limite de REV-04 R4 ;
- elle est gelée par empreinte dans `tests/teacher-notice.test.ts`.

**La lecture** :
- elle s'enregistre dans `notice_acknowledgements` avec la nouvelle valeur `teacher_review` de `notice_kind` ;
- `acknowledgeNotice` et `getNoticeAcknowledgement` choisissent la notice selon le rôle de l'acteur, sans paramètre ;
- l'accès est refusé côté serveur tant que la notice n'est pas lue : chaque fonction de revue inclut le prédicat SQL `acknowledgedNotice(userId, "teacher_review")` et rend `"notice_required"` s'il manque ;
- les pages affichent alors la notice à la place de la liste ou de la copie.

#### 2. Schéma : tables, contraintes, migrations

##### `teacher_evaluations` (fichier `src/server/db/schema/reviews.ts`)

| Colonne | Type | Remarque |
|---|---|---|
| id | uuid PK | |
| submission_id | uuid not null, **unique** | une par remise |
| version_number | smallint not null | FK `(submission_id, version_number)` → `submission_versions` |
| origin | enum `teacher_evaluation_origin` (`proposal`, `manual`) | `manual` en E8 |
| proposal_id | uuid | FK `(proposal_id, submission_id, version_number)` → `ai_proposals` ; CHECK `(origin='proposal') = (proposal_id is not null)` |
| rubric_version | text not null | celle du run de la proposition ; en E8, celle publiée |
| level_task … level_mechanics | smallint | CHECK entre 0 et 4 ; non nuls si `origin='proposal'` ; nuls permis pour une saisie manuelle en cours (E8) |
| remark_task … remark_mechanics | text not null default '' | |
| reread_task … reread_mechanics | boolean not null default false | |
| general_comment | text not null default '' | |
| next_steps | text[] not null default '{}' | |
| final_grade | numeric(4,2) | CHECK entre 0 et 20 ; CHECK `grade_fixed or final_grade is not distinct from (somme des niveaux)` ; CHECK `not grade_fixed or final_grade is not null` |
| grade_fixed | boolean not null default false | |
| revision | integer not null default 1 | CHECK ≥ 1 |
| created_by | uuid FK users | |
| created_at, updated_at | timestamptz, `now()` | |

Les champs `validated_at`, `validated_by` et `published_at` viennent avec E8 (sa migration).

##### `review_journal_entries`

| Colonne | Type | Remarque |
|---|---|---|
| id | uuid PK | |
| assignment_id | uuid not null, sans FK (E7.1) | un devoir sans remise peut être supprimé après l'ouverture de sa liste ; le journal lui survit |
| submission_id | uuid FK, nullable | CHECK `(event = 'list_opened') = (submission_id is null)` |
| actor_id | uuid FK users, nullable | null = système (« retry abandoned ») |
| event | enum `review_event` | voir ci-dessous |
| field | text | ex. `level.task`, `remark.task`, `reread.task`, `general_comment`, `next_steps`, `final_grade`, `grade_fixed` ; CHECK `(event = 'evaluation_changed') = (field is not null)` |
| old_value, new_value | jsonb | |
| evaluation_revision | integer | |
| version_number | smallint | |
| created_at | timestamptz not null default `now()` | horloge de la base |

- **Valeurs de `review_event`**, toutes déclarées dès maintenant pour éviter un `ADD VALUE` en E8 :
  - utilisées en E7 : `list_opened`, `copy_opened`, `evaluation_created`, `evaluation_changed`, `retry_requested`, `relaunch_requested`, `retry_abandoned` ;
  - réservées à E8 : `manual_started`, `validated`, `published`, `unpublished`, `sent_back_to_review`.
- **Index** : `(submission_id, created_at desc)` et `(assignment_id, created_at)`.

Ce journal est distinct de `security_events` (DON-05), qui reste sans contenu. Les remarques du professeur n'entrent que dans ce journal.

##### Migrations

**`0016_create_teacher_reviews`** (générée) :
- les deux tables ;
- les enums `teacher_evaluation_origin` et `review_event` ;
- `ALTER TYPE notice_kind ADD VALUE 'teacher_review'` ;
- `ALTER TYPE security_event_type ADD VALUE 'ai_provider_unreachable'`.

Les `ADD VALUE` ne sont utilisés par aucune migration : le migrateur passe tout le lot dans une seule transaction, comme pour `0013`.

**`0017_protect_review_rows`** (custom, comme `0011`) :
- **Journal immuable** : `review_journal_entries_forbid_change` BEFORE UPDATE OR DELETE → `forbid_change()`.
- **Évaluation jamais supprimée** : `teacher_evaluations_forbid_delete` BEFORE DELETE → `forbid_change()`.
- **Champs d'origine figés, révision qui avance d'un pas** : `teacher_evaluations_guard` BEFORE UPDATE refuse tout changement de `submission_id`, `version_number`, `origin`, `proposal_id`, `rubric_version` ou `created_by`, ainsi que `NEW.revision <> OLD.revision + 1`.
- **Aucune écriture sans journal, garantie en base** : `teacher_evaluations_require_journal` est un CONSTRAINT TRIGGER AFTER INSERT OR UPDATE, `DEFERRABLE INITIALLY DEFERRED`. Au commit, il exige une entrée de journal ayant le même `submission_id` et `evaluation_revision = NEW.revision`.

La migration se relit, puis `db:migrate` sur dev.

#### 3. Module unique d'écriture et flux d'une modification

**Écrivain unique** : `src/server/data/review/record.ts`.
- C'est le seul fichier qui fait `insert`/`update` sur `teacher_evaluations` et `review_journal_entries`.
- Fonctions internes, listées dans `UNGUARDED_DATA_EXPORTS` :
  - `appendJournal(tx, entries)` ;
  - `writeEvaluation(tx, evaluation, entries)`, qui lève une erreur si `entries` est vide et écrit l'évaluation et le journal ensemble.
- Test statique `tests/review-writes.test.ts`, par regex, sur le modèle de `submission-writes.test.ts` : aucun autre fichier de `src/` n'écrit ces tables, et aucun fichier ne fait `delete`.

**`transitions.ts`** (reste le seul écrivain de `submissions`) :
- `markTeacherStarted(tx, id, where)` : `teacher_started_at = coalesce(teacher_started_at, now())`, sans transition ;
- `clearEvaluationRequest(tx, id, request)` (§1.11, point 2).

**Flux de `saveEvaluation(actor, seen, changes)`** (`src/server/data/review/evaluation.ts`) :
```
authorize(actor, "unpublishedEvaluation", "write")
changes déjà validés par Zod dans le service (niveaux 0-4 entiers, note au pas, longueurs)
transaction :
  1. SELECT submission (+ LEFT JOIN teacher_evaluations, + run de la proposition)
       WHERE id = seen.submissionId AND owned(grant) AND notice lue
       FOR UPDATE OF submissions                       ← verrou unique, aussi pris par replaceText
  2. absente → null ; notice → "notice_required"
  3. version ≠ seen.versionNumber ou current_proposal_id ≠ seen.proposalId → "replaced"
  4. status ≠ to_review → "not_open"                   (E8 : validated/published → transition 10)
  5. revision (0 si aucune) ≠ seen.revision → { "conflict", saved }
  6. base = évaluation, ou copie de la proposition ; next = applique changes,
     note recalculée si non fixée, reread calculé (§1.3)
  7. diff(base, next) vide → { ok, unchanged }         (aucune écriture)
  8. writeEvaluation(tx, next(revision+1), [evaluation_created si nouvelle, evaluation_changed par champ])
  9. markTeacherStarted(tx, id, eq(currentVersion, seen.versionNumber))
commit → le trigger différé vérifie qu'une entrée existe pour la révision
retour { ok, evaluation, revision }  (le client met son état à jour ; aucune revalidation nécessaire)
```

#### 4. Routes, données, Server Actions

**Routes** (toutes `export const instant = false`, avec la garde uuid et `notFound()` avant tout `Suspense`, sur le modèle de `classes/[classId]`) :
- **`/teacher/assignments/[assignmentId]`** : la page existante. La section « Submissions » devient la liste réelle, sous `Suspense` après la vérification 404 (maquette 1.4).
- **`/teacher/assignments/[assignmentId]/students/[studentId]`** : la copie (maquette 1.5), avec l'historique (« History ») sous `Suspense` en E7.7. Elle répond 404 si le devoir ou la copie appartient à un autre professeur, ou si l'élève n'a pas reçu le devoir et n'a pas de remise.

**Données** (`src/server/data/review/`) ; chaque fonction prend l'`Actor` en premier, appelle `authorize`, puis `ownedBy`.

| Fonction | Droit | Rôle |
|---|---|---|
| `listAssignmentCopies(actor, assignmentId)` | `submission:read` | lignes de la liste, ou `null` / `"notice_required"` |
| `getCopy(actor, assignmentId, studentId)` | `submission:read` + `aiProposal:read` + `unpublishedEvaluation:read` | copie, proposition, évaluation, `seen` |
| `getStudentIdentity(actor, studentId)` | `studentAccount:read` (élève : la sienne ; professeur : élève d'une de ses classes, retiré compris) | appelée en parallèle de `getCopy` |
| `saveEvaluation(actor, seen, changes)` | `unpublishedEvaluation:write` | §3 |
| `recordCopyOpened(actor, seen)` | `submission:read` | journal plus état courant |
| `recordListOpened(actor, assignmentId)` | `submission:read` | journal plus tampon |
| `listCopyJournal(actor, submissionId)` | `reviewLog:read` | historique, du plus récent au plus ancien |

Les fonctions modifiées sont `retryEvaluation` et `relaunchEvaluation` (journal), ainsi que `acknowledgeNotice` et `getNoticeAcknowledgement` (selon le rôle).

**Server Actions** :
- `src/app/teacher/assignments/[assignmentId]/actions.ts` : `recordListOpenedAction`, `retryEvaluationAction`, `relaunchEvaluationAction` ;
- `…/students/[studentId]/actions.ts` : `saveEvaluationAction` (`useActionState`), `recordCopyOpenedAction` ;
- `src/app/teacher/actions.ts` : `acknowledgeTeacherNoticeAction`.

Chacune passe par un service `src/server/review/*.ts` (Zod, `AccessDeniedError` → `recordSecurityEvent("access_denied")`), et toutes entrent dans `ENTRY_POINTS`.

#### 5. Matrice et inventaire

**Matrice** : une seule ligne change. `noticeAcknowledgement` devient « Notice reading (own) », avec `ownerTeacher: LW`. Les autres lignes existent déjà et aucune colonne « autre » ne reçoit un droit.

**Inventaire** :
- `TABLES` : `teacher_evaluations: ["unpublishedEvaluation"]`, `review_journal_entries: ["reviewLog"]` ;
- les nouvelles actions ;
- `record.ts` et les nouvelles fonctions de `transitions.ts` dans les exceptions sans acteur, avec leur raison.

**Tests d'accès** :
- `access-inventory.test.ts` : la liste figée reçoit `reviewLog` et `studentAccount`.
- `REAL` reçoit :
  - `submission.read` : `listAssignmentCopies`, `getCopy`, `recordCopyOpened`, `recordListOpened` ;
  - `unpublishedEvaluation.read` : `getCopy` ;
  - `unpublishedEvaluation.write` : `saveEvaluation` ;
  - `reviewLog.read` : `listCopyJournal` ;
  - `studentAccount.read` : `getStudentIdentity` ;
  - `noticeAcknowledgement.write` : la notice du professeur (`creates`).
- L'autre professeur, l'élève, l'administrateur et le visiteur n'obtiennent rien.

#### 6. Réactivité (NFR-TRT-03)

Allers-retours vers Neon, estimés à environ 175 ms chacun en local, et 10 à 20 ms depuis Vercel `cle1` :

| Moment | Requêtes | Allers-retours |
|---|---|---|
| Liste, rendu | session, devoir et notice, lignes (CTE unique, tampon calculé par la base), et `relaunchConditions` + `listRelaunchable` seulement si une ligne peut être relancée (E7.9) | 3 à 5 |
| Liste, action d'ouverture (après l'affichage) | session, vérification avec le tampon, journal (E7.9 : balayage après la réponse) | ≈ 5 ; non bloquant |
| Copie, action d'ouverture | session, journal ; balayage après la réponse (E7.9) | ≈ 4 ; non bloquant |
| Copie, rendu | session, `getCopy` et `getStudentIdentity` en parallèle, notice incluse | 3 |
| Enregistrement | session, BEGIN, SELECT FOR UPDATE, écriture de l'évaluation, journal (un INSERT groupé), `markTeacherStarted` (première fois), COMMIT | 6 à 7 |

**Index** : les existants couvrent la liste (unique `(assignment_id, student_id)`, `(class_id, student_id)`, `(assignment_id, class_id)`, `evaluation_runs(submission_id)`). On ajoute ceux du journal et l'unique de `teacher_evaluations`.

**Mesure (E7.8)** : `e2e/e7-review-measure.spec.ts`, lancée sur demande (`E2E_MEASURE=1`).
- Elle sème 120 copies fictives avec proposition en SQL.
- Elle mesure 5 fois chacun : affichage de la liste, ouverture d'une copie, enregistrement jusqu'à « Saved ».
- Elle rapporte médiane et maximum, en local puis sur la preview.
- Le seuil reste « à définir ».

#### 7. Valeurs provisoires

Dans `provisional.ts`, marquées [P] :

| Valeur | Montant | Statut |
|---|---|---|
| `GRADE_STEP` | 0,5 | existe |
| `REVIEW_LIST_PAGE_SIZE` | 50 | nouvelle |
| `SWEEP_ON_OPEN_MAX_MS` | 2 000 | retirée en E7.9 (balayage sans attente) |
| `AI_UNREACHABLE_FAILURES` | 3 | nouvelle |
| `AI_UNREACHABLE_WINDOW_MS` | 1 h | nouvelle |

Restent aussi [P] :
- le texte de `TEACHER_NOTICE` ;
- les libellés des alertes ;
- le seuil de TRT-03 (« à définir »).

Toutes sont à consigner en T5.

#### 8. Découpage (prompts E7.1 à E7.9, inchangés)

**E7.1 — Schéma et module d'écriture**
- `0016` et `0017`, `record.ts`, `transitions.ts`, matrice et inventaire.
- Tests :
  - unitaires : note (recalcul, fixation, pas, bornes, retour), niveau hors 0-4, calcul de « reread » ;
  - intégration : chaque écriture a son journal, journal immuable (UPDATE et DELETE refusés), écriture sans journal refusée au commit (contre-épreuve directe en SQL), proposition identique après modification ;
  - statique : `review-writes`.

**E7.2 — Liste réelle**
- Relecture de la doc 16.4.0, liste, compteurs de `listTeacherAssignments`, `ReviewOpened` côté liste, balayage.

**E7.3 — Copie en lecture**
- Pages de statut, `copy_opened`.

**E7.4 — Formulaire modifiable**
- `saveEvaluation`, journal, `teacher_started_at`.

**E7.5 — Conflits**
- Tests d'intégration avec `Promise.all` sur de vraies transactions, chacun avec sa contre-épreuve (garde de révision retirée → le test échoue, noté dans l'historique) :
  - deux enregistrements avec la même révision : un `ok`, un `conflict` ;
  - remplacement et premier enregistrement simultanés, répétés 20 fois : exactement un aboutit ;
  - enregistrement après remplacement : `replaced`.

**E7.6 — Relance**
- Boutons, journal des relances, points ouverts §1.11.

**E7.7 — Historique et notice**
- Historique (« History »), notice et garde `notice_required` sur toutes les fonctions de revue.

**E7.8 — Rejeux, mesure et E2E**
- Rejeux de la table 8.3 : ASG-02 CA2, SUB-04 CA3, SUB-05 CA3, CLS-04 CA3 / REV-01 CA4, PRC-02.
- Matrice.
- Mesure TRT-03.
- E2E `e7-journey`.

**E7.9 — Revue en contexte neuf**

#### 9. Vérification
- `docker compose exec -T web npm test` : unitaires, intégration, statiques, inventaire, matrice.
- `docker compose run --rm e2e` pour `e2e/e7-journey.spec.ts`. Le parcours :
  - une remise arrive « To review » par le simulateur ;
  - le professeur lit la notice, ouvre la liste, puis la copie ;
  - il change un niveau : la note suit et « To re-read » apparaît ;
  - il fixe la note, change un niveau : l'écart est signalé ;
  - le journal est visible ;
  - conflit entre deux onglets (deux `page` du même contexte) : saisie conservée ;
  - l'élève remplace pendant l'ouverture : « replaced », puis rechargement ;
  - l'élève voit « Submitted, being marked » ;
  - un préfetch ne journalise rien : le build de production de l'E2E (où le préfetch est actif) rend la liste, et le journal ne compte aucune « copy_opened » tant qu'aucun nom n'a été cliqué ;
  - le 404 est réel (`expectNotFound`) pour un devoir, une copie et un élève d'autrui.
- Par requête directe, l'élève n'obtient ni l'évaluation, ni le journal, ni la proposition (Server Actions et fonctions de données).
- Après E7.8, et une fois la preview poussée à la demande : rejeu en ligne avec le simulateur et mêmes mesures.

#### Historique
- 2026-10-21 : plan rédigé (E7.0).
- 2026-10-21 : E7.2, doc Next relue en 16.4.0 dans le conteneur (préfetch et effets de bord, `prefetch={false}`, `instant = false`, `after()` par `waitUntil`) : aucun écart avec 16.3.8. Écarts d'exécution : l'E2E tourne sur `next dev`, qui ne préfetch pas : le cas « préfetch sans journal » se rejoue sur la preview en E7.8 ; le tampon de la liste est une empreinte des lignes (recalculée dans l'action d'ouverture), pas une date de mise à jour.
- 2026-10-21 : E7.5, tests concurrents (`tests/review-concurrency.int.test.ts`, `Promise.all` sur deux connexions du pool). Défaut trouvé et corrigé : `saveEvaluation` lisait l'évaluation dans la requête `FOR UPDATE` ; un second enregistrement qui avait attendu le verrou relisait la ligne de remise mais pas l'évaluation jointe (READ COMMITTED), croyait la révision 0 et tentait une seconde insertion, arrêtée par l'unicité (erreur 500 au lieu d'un conflit). Correctif : verrou d'abord, puis lecture de la proposition et de l'évaluation par une requête à part. Course remplacement / premier enregistrement, 20 fois : les deux issues observées (9 enregistrements, 11 remplacements). Contre-épreuves, chacune restaurée ensuite : (1) garde de révision retirée → deux onglets « saved », test en échec ; (2) `isNull(teacher_started_at)` retiré de `replacementOpen` → remplacement accepté après un enregistrement, test en échec ; (3) garde version + proposition retirée → rien d'écrit (la garde d'état prend le relais) mais `not_open` au lieu de `replaced`, tests en échec. Écran : « Save mine over it » ajouté au conflit ; message « replaced » gardé au-dessus de la copie rechargée (`CopyNoticeArea`).
- 2026-10-21 : E7.6, relance depuis l'écran. Décision du §1.11 appliquée sur les deux points ouverts d'E6.6 : (1) alerte « prestataire injoignable » faite (`alertIfUnreachable` après un échec `unavailable` ou `timeout`, comptage par fournisseur sur la fenêtre, `claimAiAlert`, aucun appel arrêté) ; `EVALUATION_STEP_MAX_MS` compte désormais deux alertes (disjoncteur puis injoignable) : 280 s < 300 s ; (2) relance abandonnée rendue visible (`abandonStep` → `abandonEvaluationRequest`, gardée par le jeton de demande, `retry_abandoned` sans acteur, `newValue.origin`), valable aussi pour le relancement. Écarts d'exécution : « Retry » reste proposé pendant qu'une demande attend (une nouvelle demande remplace l'ancienne : jamais deux évaluations, et une copie dont le démarrage du run a échoué n'est pas bloquée) ; la liste porte « Relaunch » seulement (« Retry », avec l'avertissement de refus, sur la copie) ; `getCopy` lit le journal (dernière demande abandonnée) et autorise donc `reviewLog:read` ; rafraîchissement automatique borné (4 s, 10 min) pendant l'évaluation ou une demande en attente, sur la copie et la liste.
- 2026-10-21 : E7.7, notice du professeur et historique. Écarts d'exécution : la garde de la notice rend `"notice_required"` pour la liste, la copie et l'enregistrement (la page montre la notice) ; les ouvertures, relances et `listCopyJournal` traitent une copie comme absente avant la lecture (rien d'écrit) ; la copie d'un autre professeur reste absente, notice lue ou non. `getStudentIdentity` (classes aussi) n'est pas gardée : ce n'est pas une copie. Les entrées d'un même enregistrement (même révision) sont regroupées à l'écran, champs dans l'ordre du formulaire ; aucune entrée n'est modifiable ni supprimable (aucun bouton). Fixture de la matrice : l'autre professeur a lu sa notice, pour que ce qui lui manque soit la copie, non la notice.
- 2026-10-21 : E7.8, rejeux, matrice, mesure et parcours. Rejeux de la table 8.3 dans `tests/e7-replays.int.test.ts` (6 tests, sur de vraies remises par les services des écrans) : ASG-02 CA2, SUB-04 CA3, SUB-05 CA3 (remplaçable après une simple ouverture, refusé après une modification), CLS-04 CA3 / REV-01 CA4, PRC-02 depuis la liste ; matrice sur une copie réellement modifiée et journalisée : autre professeur « absent » partout, élève et administrateur refusés par les fonctions de données et « not_found » par les services, rien d'écrit. Écart trouvé et corrigé : la liste n'avait que « Relaunch », un échec ne se relançait que depuis la copie, contre le critère de sortie d'E7 (« relance d'un échec possible depuis la liste ») ; la ligne porte maintenant « Retry » sur une copie en échec, sauf un refus de l'IA (`ReviewRow.refused`, marqué « The AI declined the text », relancé depuis la copie avec son avertissement). Parcours `e2e/e7-journey.spec.ts`, tout par les écrans (remise réelle, simulateur, notice, liste, nom, remplacement pendant l'ouverture, niveau puis note seule, historique, refus du remplacement, deux onglets, vue de l'élève) ; écart d'ordre : le remplacement pendant l'ouverture vient avant la première modification, puisqu'il est refusé après (SUB-05 R3). Mesure TRT-03 `e2e/e7-review-measure.spec.ts` (sur demande, `E2E_MEASURE=1`), 120 copies, 5 mesures après un passage d'échauffement, en local (`next dev` dans Docker, Neon `us-east-2`) : liste affichée médiane 2,6 s (2,3 à 3,3 s ; document 2,2 s), ouverture d'une copie depuis la liste médiane 4,1 s (2,6 à 7,5 s), enregistrement jusqu'à « Saved » médiane 2,8 s (2,5 à 3,0 s). Seuil : à définir. Restent pour la preview, une fois poussée à la demande : le parcours en ligne, les trois mêmes délais, le cas « préfetch sans journal » (E7.2).
- 2026-10-21 : E7.8 en ligne. Base dev migrée (rien de nouveau), `preview` poussée à la demande (`cbfc09f`, déploiement Vercel réussi). Rejeu par `playwright.online.config.ts` (`E2E_ONLINE_URL`, sans serveur local ni remise à zéro ; la base est celle de la preview, dev, où le rejeu ajoute des comptes et des copies fictifs `@example.test`, journal et évaluations immuables ; `global-setup` refuse de tourner en ligne). Parcours `e7-journey` passé sur la preview avec le simulateur (52 s). Préfetch sans journal vérifié pour de vrai : en production le lien du devoir est préfetché (requête relevée par son en-tête de préfetch), et aucune « list opened » ni « copy opened » n'est écrite avant le clic. Mesure TRT-03 en ligne, 120 copies, 5 mesures après échauffement, navigateur sur ce poste, Vercel `cle1` : liste affichée médiane 0,83 s (0,71 à 0,98 s ; document 0,44 s), ouverture d'une copie depuis la liste médiane 0,57 s (0,41 à 0,64 s), enregistrement jusqu'à « Saved » médiane 0,92 s (0,89 à 0,96 s). En local (`next dev`, poste au Maroc vers Neon `us-east-2`) : 2,6 s, 4,1 s et 2,8 s. Seuil : à définir.
- 2026-10-22 : E7.9, revue en contexte neuf (feature-reviewer) : 11 points examinés, 1 majeur et 9 mineurs ; tous corrigés à la demande de l'utilisateur (« corrige tout »), par cinq agents sur des fichiers disjoints, puis vérifiés ensemble. C1 (majeur) et C6 : une saisie non enregistrée pouvait se perdre sans avertissement (navigation interne, retour sur une page gardée par le routeur, enregistrement d'un autre onglet) et l'historique ne suivait pas un enregistrement ; correctif : état partagé formulaire / `CopyOpened` (`copy-state.tsx`), révision la plus récente envoyée à l'ouverture, alerte au lieu d'un rafraîchissement quand le formulaire est modifié, `key` du formulaire sans la révision et `reconcileSaved` (plus ancienne ignorée, plus récente adoptée si propre, conflit sinon), `leave-guard.tsx` (liens de la page en phase de capture, `beforeunload`), `router.refresh()` après chaque enregistrement ; le bouton retour ne peut pas être bloqué par Next 16 (doc `link.md`, `onNavigate`), la page gardée par `<Activity>` ne perd plus rien. C2 : `manual_started` journalisé par `startManualEvaluation`. C3 et C4 : `0018` (contrainte : révision présente exactement sur `evaluation_created`/`evaluation_changed` ; trigger différé exigeant `evaluation_created` à l'INSERT et `evaluation_changed` à l'UPDATE, même révision et même version ; évaluation née en révision 1 sur une remise commencée et sa version active ; remise évaluée figée : ni version changée ni `teacher_started_at` effacé ; bloc de contrôle des lignes existantes) ; jointures de l'évaluation aussi sur la version (`copy.ts`, `list.ts`). C5 : validateur de sortie, piste sans `\n` ni `\r`, justification, commentaire, piste et pistes jointes ≤ `REVIEW_TEXT_MAX_LENGTH` (le schéma du professeur borne la chaîne jointe) ; corps envoyé et `PROMPT_VERSION` inchangés ; 0 des 65 propositions réelles de `trial-results/` refusée. C7 : restriction ESLint sur `teacherEvaluations`/`reviewJournalEntries` (globs imbriqués : le bloc le plus précis en dernier) ; `review-writes` renforcé. C8 : les Server Actions d'un client passent une à une (doc `server-actions.md`) : balayage dans `after()` sans attente, à l'ouverture de la liste et d'une copie (§1.7 révisé ; `SWEEP_ON_OPEN_MAX_MS` retiré) ; tampon calculé par la base (un aller-retour et ~51 Ko de moins sur 120 copies) ; `relaunchConditions` lu seulement si une ligne ou la copie peut être relancée. C9 : `REAL` contrôlé fonction par fonction (7 fonctions d'étapes antérieures ajoutées), `saveEvaluation` du propriétaire écrit vraiment. C10 : inventaire (`systemCalls` du balayage), doc (`notice.tsx`, absence de FK du journal au §2). Vérification : `tsc` et ESLint propres ; `npm test` 1 187 tests verts (3 échecs `class-join` dus à une panne DNS vers Neon, verts relancés seuls) ; E2E 46 tests : 40 au passage complet, puis les fichiers en échec relancés et verts (deux nouveaux tests tapaient avant l'hydratation : ils attendent désormais `copy_opened` ; `e7-journey`, premier à ouvrir une copie, dépassait 15 s de compilation ; CA3, trace Playwright manquante) ; 2 mesures sautées (sur demande).
