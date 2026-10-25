# 0007. AI evaluation: decision record

## Context

Step E5 of the implementation plan (`conception/fonctionnalites.md` §8.2). Requirements and acceptance criteria live in `conception/fonctionnalites.md` and `conception/besoins-non-fonctionnels.md` (French).

## Options considered

Weighed inside the approved plan below (sections "Contexte", choices marked [P] or [D], and the plan history at its end).

## Rationale

The plan below was approved by the engineer before the build, then amended in its history section as gaps were found. It is copied verbatim, in French, from `~/.claude/plans/`; only its headings moved two levels down.

## References

**Project sources**:
- `conception/fonctionnalites.md`, `conception/stack-technologique.md` §3 (provisional values per step)
- `conception/prompts-implementation.md` (prompts of step E5)

## Approved plan: `plan-e5.md` (verbatim)

### E5 — Rubrique et proposition d'évaluation par l'IA : plan (E5.1, révisé en E5.11 pour Anthropic, 2026-10-19)

#### Contexte

E5 produit, pour une remise de texte évaluable, une proposition conforme, immuable, par critère, avec une note calculée par le système. Seule la liste blanche est transmise à l'IA (EVL-01 à EVL-04 ; NFR-QUA-02, EXP-04, DON-02, DON-05). L'enchaînement automatique reste pour E6 : ici, une commande interne applique les transitions 2 et 5.

**Ce qui existe**
- **États** : les 9 états stockés sont déjà dans l'enum (`0007`). `TRANSITIONS` contient déjà 2 (`received → evaluating`) et 5 (`evaluating → to_review | evaluation_failed | not_assessable`). `applyTransition` (`src/server/data/submissions/transitions.ts`) est le seul écrivain de `submissions`, vérifié par `tests/submission-writes.test.ts` (expression régulière sur `src/`).
- **Remplacement** : `replaceText` verrouille la ligne, applique 11 (`currentVersion + 1`), puis insère la version. 11 part aussi de `evaluating`.
- **Rubrique et note** :
  - `src/lib/rubric.ts` est en anglais, sans version ni langue ;
  - `calculateGrade` vaut déjà la somme des niveaux, et ses seuls usages sont les maquettes `/dev/mockups`.
- **Matrice** : les lignes `aiProposal` (professeur propriétaire L) et `rubric` (L pour tous les connectés) existent, sans fonction réelle.
- **Modèle à suivre** : l'email (`src/server/email/`), qui a une interface, une capture, `failNext` et un singleton.
- **Journal de sécurité** : `recordSecurityEvent`, sans valeur IA.
- **Manques** (à l'origine) : aucune garde réseau dans Vitest ; aucun SDK.
- **Depuis (2026-10-19)** : E5.2 à E5.7 livrés ; `openrouter.ts` en place jusqu'à E5.13 ; `ai_provider` = `simulator` | `openrouter` jusqu'à `0012` ; dans `provisional.ts`, `AI_CALL_TIMEOUT_MS` = 120 000 (relevé le 2026-10-17), `AI_TRIAL_PAUSE_MS` = 4 000, `AI_DAILY_REQUEST_LIMIT` = 50 (quota d'OpenRouter).

**Prestataire [D, 2026-10-19]** : API d'Anthropic en direct, `claude-haiku-5-5`, `inference_geo: "us"`, SDK officiel durci (`stack-technologique.md` §3). Faits et sources : `conception/annexe-ia-anthropic.md` (§1 modèle, §3 erreurs et limites, §5 audit du SDK 0.135.0, §8 relevés de la Console du 2026-10-19). Lus de plus pour cette révision, le 2026-10-19 : skill local `claude-api` (`model-migration.md` § Migrating to Claude Haiku 5.5, `error-codes.md`) ; [migration Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide) ; [sortie structurée](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (fin de page non lue) ; [erreurs](https://platform.claude.com/docs/en/api/errors) ; [limites](https://platform.claude.com/docs/en/api/rate-limits) ; [data residency](https://platform.claude.com/docs/en/manage-claude/data-residency).

Faits d'OpenRouter et de Mistral : historique git de ce plan et de `stack-technologique.md` §3 (commits `85b60c4` et `a7aaf44`).

#### 1. Rubrique versionnée et note (EVL-01)

**Registre** : `src/lib/rubric.ts`, sans import, car drizzle-kit le charge.
- `criterionIds` : `task`, `organization`, `vocabulary`, `grammar`, `mechanics`. Les mêmes pour toutes les versions et les deux langues (R1 [D]).
- `RubricVersion = { id: "en-1", language: "en", publishedOn, levelNames, criteria }`.
- `RUBRIC_VERSIONS` : ajout seul, gelé en profondeur (`Object.freeze` récursif). Il contient seulement `en-1`, dont le texte est fixé au §12.
- `publishedRubric(language, registry = RUBRIC_VERSIONS)` renvoie la dernière version publiée de la langue, ou `null` pour le français aujourd'hui.
- `rubric` reste exporté (`en-1`) pour les maquettes.

**Gel** : `tests/rubric-versions.test.ts`.
- Il compare l'empreinte SHA-256 de chaque version publiée à une valeur figée. Modifier une version publiée échoue (NFR-QUA-02) : on en publie une nouvelle.
- Il vérifie aussi CA2 : 5 critères, poids 20, niveaux entiers de 0 à 4, mêmes identifiants partout.

**Rubrique française « test only »** : `tests/fixtures/rubric-fr-test.ts`, injectée par le paramètre `registry`. Un test statique vérifie qu'aucun fichier hors de `tests/` n'importe `tests/` ni ne cite `rubric-fr-test`.

**Procédures (NFR-EXP-03)** : `conception/procedures.md` (nouveau), deux sections.
- **« Activer le français »** :
  1. validation écrite du client ;
  2. `fr-1` ajouté au registre ;
  3. empreinte ajoutée au test ;
  4. `npm test` ;
  5. commit et poussée de `preview` ;
  6. [D] consigné ;
  7. relance proposée au professeur (E6.3).
- **« Activer l'envoi réel à l'IA »** (réécrite en E5.15) :
  - `AI_PROVIDER=anthropic` et `GRADING_ANTHROPIC_API_KEY` [P] dans l'environnement visé ; ni `NODE_DEBUG` ni aucune variable `ANTHROPIC_*` ;
  - conditions de DON-02 (données fictives) ;
  - contrôles dans la Console (crédit et son expiration, limite de l'espace, conservation) ;
  - contrôle au journal de sécurité et du coût ; retour arrière.

Ce sont deux des trois procédures rejouées en démonstration (§2.8).

**Note (Q1 [D])**
- `decisions.ts` reçoit :
  - `GRADE_SCALE = 20` ;
  - la règle en commentaire : somme des 5 niveaux, entière, de 0 à 20 ;
  - `AI_MODEL` et `AI_INFERENCE_GEO` : §9.
- `calculateGrade(levels)` devient la somme explicite. `grade.ts` importe `GRADE_SCALE` de `decisions.ts`.
- `GRADE_STEP` et `GRADE_DECIMALS` restent provisoires, relibellés : « note sur 20 décidée ; seul le pas de la note libre reste ouvert ».
- Les mentions « Q1 open » disparaissent des maquettes.

**Écran Rubric (E5.2, `/build-ui`)**
- `/teacher/rubric` et `/student/rubric`, avec un composant serveur partagé et une entrée « Rubric » dans `navigation.ts`. Le proxy garde déjà ces chemins.
- Données : `getPublishedRubrics(actor)` (`src/server/data/rubric/rubric.ts`), qui appelle `authorize(actor, "rubric", "read")` et renvoie un DTO.
- Contenu :
  - critères × niveaux, poids ;
  - la règle « Grade out of 20: the sum of the five levels » ;
  - `FRENCH_RUBRIC_PENDING_NOTICE` (`texts.ts`).
- Aucun formulaire ni bouton d'écriture.

#### 2. Tables et contraintes

**Enums** depuis `src/lib/evaluation.ts` (sans import), avec les libellés destinés au professeur :
- `evaluation_outcome` : `proposed`, `failed`, `not_assessable` ;
- `not_assessable_cause` : `no_content`, `rubric_unavailable`, libellé « AI unavailable: French rubric not validated » (E6 et E9 ajouteront leurs causes) ;
- `evaluation_error` : `timeout`, `rate_limited`, `unavailable`, `rejected`, `configuration`, `not_json`, `schema`, `quote_not_found`, `superseded`, `internal` ; `refused` en `0012` ;
- `proposal_alert` : `very_short`, `other_language`, `off_topic`, `addressed_to_marker` ;
- `ai_provider` : `simulator`, `openrouter` (jamais `mistral`, retiré en E5.4b) ; `anthropic` en `0012`.

**Listes séparées** (`src/lib/evaluation.ts`, E5.12) :
- stockée : `aiProviders = ["simulator", "openrouter", "anthropic"]`, base de l'enum (les lignes `openrouter` sont immuables) ;
- sélectionnable : `selectableAiProviders`, `["simulator", "openrouter"]` en E5.12, `["simulator", "anthropic"]` dès E5.13.
- `callErrors` gagne `refused`, donc `evaluationErrors` aussi.

**Migrations**
- **`0009_add_ai_request_event`** (E5.3) : `ALTER TYPE security_event_type ADD VALUE 'ai_request_sent'`, comme `0003`.
- **`0010_create_evaluation_runs`** (E5.5) : générée puis relue. Les tables sont ajoutées à la suite dans `schema/submissions.ts` : c'est le même agrégat, et on évite une importation circulaire entre fichiers.
  - Le cycle de types `submissions ↔ ai_proposals` (TS7022) se coupe en annotant les références `(): AnyPgColumn =>` et en typant le retour du callback de contraintes.
  - Les FK composites sont nommées explicitement : `evaluation_runs_version_fk`, `ai_proposals_run_fk`, `submissions_current_proposal_fk`.
  - Ordre à relire : enums, `evaluation_runs`, `ai_proposals`, colonnes de `submissions`, FK et checks en dernier.
- **`0012_add_anthropic_and_refused`** (E5.12, `db:generate -- --name=add_anthropic_and_refused`), en **ajouts seulement** : `ALTER TYPE ai_provider ADD VALUE 'anthropic'` et `ALTER TYPE evaluation_error ADD VALUE 'refused'` (drizzle-kit peut écrire `BEFORE 'not_json'` : sans effet sur les lignes). SQL montré à l'utilisateur avant `db:migrate`. Rien d'autre : ni colonne, ni check, ni retrait (une valeur d'enum ne se retire pas).

**`evaluation_runs`** : une ligne par exécution, réussie ou non. Elle porte la traçabilité (QUA-02) et la mesure (EXP-01, E6).

| Colonne | Rôle |
|---|---|
| `id`, `submission_id`, `version_number` | FK `(submission_id, version_number) → submission_versions(submission_id, number)`, sur l'unique existant. |
| `outcome` | Non nul. |
| `not_assessable_cause` | Non nulle si et seulement si `outcome = 'not_assessable'`. |
| `provider` | Non nul. |
| `model_requested`, `model_answered` | Nuls sans appel. |
| `provider_answered` | Fournisseur qui a répondu (champ `provider` d'OpenRouter, s'il est donné et a la forme d'un identifiant) ; nul sinon ou sans appel ; **toujours nul avec Anthropic** (aucun champ équivalent). `providerCode` n'est pas stocké, ni la catégorie d'un refus. |
| `prompt_version`, `rubric_version` | Nulles si et seulement si `outcome = 'not_assessable'` : l'alerte bloquante passe avant toute requête. Cela couvre un texte français sans contenu. |
| `attempts` | smallint, non nul. |
| `attempt_errors` | `evaluation_error[]`, non nul, `'{}'` par défaut. Une entrée par tentative échouée, sans contenu. |
| `duration_ms` | Non nul. |
| `prompt_tokens`, `completion_tokens`, `total_tokens` | Cumul des tentatives, refus compris (facturés), nul si inconnu. Avec Anthropic [P] : `prompt` = `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` ; `completion` = `output_tokens` (réflexion comprise) ; `total` = leur somme. Détail du cache et `inference_geo` : en mémoire seulement, pour l'essai (E5.14). |
| `created_at` | |

Checks, écrits pour tenir face aux valeurs nulles :
- `outcome <> 'proposed'` ou (`model_requested`, `prompt_version`, `rubric_version` non nuls et `attempts >= 1` et `cardinality(attempt_errors) = attempts - 1`) ;
- `failed` ⇒ `attempts >= 1` et `cardinality = attempts` ;
- `not_assessable` ⇒ `attempts = 0`.

Contraintes : `unique(id, submission_id, version_number)` ; index sur `(submission_id)`.

**`ai_proposals`** : la sortie conforme, 1 pour 1 avec une exécution (`run_id` unique). Toutes les colonnes sont non nulles.

| Colonne | Rôle |
|---|---|
| `id`, `run_id`, `submission_id`, `version_number` | FK `(run_id, submission_id, version_number) → evaluation_runs(id, submission_id, version_number)`. |
| `level_<critère>` ×5 | smallint, check de 0 à 4. |
| `justification_<critère>` ×5 | Check `btrim <> ''`. |
| `quotes_<critère>` ×5 | text[], check `cardinality >= 1`. |
| `general_comment` | Non vide. |
| `next_steps` | text[], au moins 1. |
| `alerts` | `proposal_alert[]`, `'{}'` par défaut. |
| `proposed_grade` | smallint, check `= level_task + … + level_mechanics`. La règle de Q1 est tenue par la base, jamais par l'IA. Si la règle change, ce sera avec une nouvelle version de rubrique, et le check sera remplacé en `NOT VALID`. |
| `created_at` | |

Contrainte : `unique(id, submission_id, version_number)`.

**`submissions`** (modification d'E4)
- **`current_proposal_id`** : FK `(current_proposal_id, id, current_version) → ai_proposals(id, submission_id, version_number)`.
  - La base garantit que la proposition courante appartient à cette remise **et porte sur sa version active** (SUB-05 R2).
  - Un pointeur nul n'est pas contrôlé (MATCH SIMPLE). La transition 11 peut donc incrémenter la version et vider le pointeur dans la même instruction.
- Check : `current_proposal_id is null or status in ('to_review', 'validated', 'published')`.
- **`not_assessable_cause`**, avec le check `(status = 'not_assessable') = (not_assessable_cause is not null)`.

**`0011_protect_evaluation_rows`** (personnalisée, `db:generate -- --custom`)
- Une fonction `forbid_change()` lève une exception. Elle est appelée par des triggers :
  - `BEFORE UPDATE OR DELETE` sur `ai_proposals` et `evaluation_runs` ;
  - `BEFORE UPDATE` sur `submission_versions` : le texte évalué ne change plus. Une suppression reste possible, et un test d'E4 en fait une.
- Le `TRUNCATE` des tests n'est pas concerné.
- Limite à consigner : la future suppression d'une copie (DON-01, avant tout usage réel) devra désactiver ces triggers dans sa procédure.

#### 3. Interface d'évaluation, simulateur, adaptateur Anthropic (`src/server/ai/`, règle 3)

`types.ts` (E5.13 ; E5.12 n'ajoute que l'`usage` optionnel de l'erreur et `refused`) :
```ts
type Generation = { effort: "low" | "medium" | "high" | "xhigh" | "max"; thinking: "adaptive" | "disabled"; maxOutputTokens: number };
type Usage = { inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null; cacheCreationTokens: number | null; inferenceGeo: string | null };
type EvaluationRequest = { system: string; user: string; schemaName: string; schema: JsonSchema; generation: Generation };
type EvaluationResponse = { content: string; modelAnswered: string | null; providerAnswered: null; stopReason: string | null; usage: Usage | null };
interface Evaluator {
  readonly provider: "simulator" | "anthropic";
  readonly model: string;
  evaluate(req: EvaluationRequest, ctx: { signal: AbortSignal; subjectId: string | null }): Promise<EvaluationResponse>;
}
class EvaluatorError extends Error { kind: CallError; retryAfterMs?: number; providerCode?: string; stopReason?: string; usage?: Usage }
```
- L'interface ne voit ni remise ni identifiant, seulement la requête construite (§4).
- L'adaptateur réel journalise lui-même `ai_request_sent` avant chaque requête HTTP (journal injectable) ; si le journal échoue, rien ne part (§3, point 4). Le simulateur ne journalise pas.
- Chaque évaluateur borne lui-même chaque appel (`AI_CALL_TIMEOUT_MS`, injectable), lecture du corps comprise.
- `EvaluatorError` a un message fixe par `kind` (`refused` : « The AI declined to evaluate this text. ») et aucune `cause` ; `providerCode` filtré en identifiants (`IDENTIFIER`). L'`usage` d'une erreur (refus, facturé) entre dans le cumul d'`evaluate.ts` (E5.12).

**Sélection** : `selectEvaluator(env)`, fonction pure et testée, et `getEvaluator()`, qui la met en cache sur `globalThis`.
- Simulateur quand `NODE_ENV=test`, ou quand `AI_PROVIDER` est absent, vide ou `simulator`.
- `anthropic` (dès E5.13) exige une `GRADING_ANTHROPIC_API_KEY` [P] non vide, lue par `index.ts` sous ce seul nom et passée explicitement, sinon `AiConfigurationError`.
- Toute autre valeur (dont `openrouter` dès E5.13, et `mistral`) est une erreur, jamais un repli.
- Commandes : `--provider anthropic` sur la ligne de commande, `AI_PROVIDER` ignoré (E5.7).

**Simulateur** (`simulator.ts`, défaut partout)
- Sortie déterministe tirée de la requête : niveaux fixes (2 par défaut, réglables), citations prises dans `student_text`, remarques courtes dans la langue demandée, drapeaux faux ; `providerAnswered: null` ; `stopReason: "end_turn"`.
- Pannes injectables, `failNext(fault, times = 1)` :
  - `{ kind: "error", status: 500 | 429 | 401 }` ;
  - `"timeout"` : attend l'abandon du signal ;
  - `{ kind: "invalid_output", variant: "not_json" | "missing_criterion" | "level_out_of_range" | "non_integer_level" | "empty_justification" }` ;
  - `"missing_quote"` ;
  - E5.12, chacune avec son `kind` et son code, sans classeur de statut : `{ kind: "refusal", category: string | null }` → `refused`, `providerCode` `refusal/<catégorie|null>`, `stopReason: "refusal"`, un `usage` fictif ; `"max_tokens"` → 200 au JSON coupé, `stopReason: "max_tokens"`, laissé au validateur ; `{ kind: "error", status: 529 }` → `unavailable` ; `402` → `configuration` (`billing_error`) ; `"spend_limit"` → `configuration`, `invalid_request_error/spend_limit`.
- `ai:evaluate --simulate` gagne `refusal`, `max_tokens`, `overloaded`, `billing`, `spend_limit` (E5.12).
- `holdNext()` renvoie `release()` : l'appel reste suspendu, pour le test de version périmée.
- `captured()` et `clear()` : les dernières requêtes, en mémoire seulement et en nombre borné, jamais sur disque ni dans la console.

**Adaptateur Anthropic** (`anthropic.ts`, E5.13), seul fichier qui importe `@anthropic-ai/sdk`, épinglé à `0.135.0` exactement (audit : annexe §5) ; `messages.create`, jamais `messages.parse`. `createAnthropicEvaluator({ apiKey, fetcher?, journal?, callTimeoutMs?, env? })` ; `fetcher` et `journal` injectés par les tests seulement.

1. **Démarrage refusé** (`AiConfigurationError`, noms de variables seulement, jamais leur valeur) : `NODE_DEBUG` défini ; toute variable dont le nom commence par `ANTHROPIC_` (`ANTHROPIC_CUSTOM_HEADERS` est lue par le SDK quelles que soient les options) ; clé vide ou blanche ; durée invalide ; effort `xhigh`/`max` avec `thinking` `disabled` (400 documenté). Le contrôle des variables est refait à chaque appel [P].
2. **Un client par appel** [P], construit dans `evaluate()` :
   ```ts
   new Anthropic({
     apiKey: key, authToken: null, webhookKey: null, baseURL: "https://api.anthropic.com",
     maxRetries: 0, timeout: callTimeoutMs, logLevel: "off", logger: SILENT, openTelemetry: false,
     fetch: guardedFetch(subjectId, state), fetchOptions: { cache: "no-store" },
     defaultHeaders: { "User-Agent": null, /* et les 8 X-Stainless-* */ },
   });
   ```
   **Le sujet du journal** est capturé par la fermeture de `guardedFetch` : aucun état partagé entre appels simultanés (E6), aucun en-tête porteur d'identifiant, pas d'`AsyncLocalStorage`. Jamais `profile`, `config`, `credentials`, `middleware`.
3. **`guardedFetch(url, init)`**, appelé par le SDK avec l'`init` définitif :
   - refuse (erreur interne, rien de journalisé ni d'envoyé) tout ce qui n'est pas `POST https://api.anthropic.com/v1/messages`, et un corps dont les clés sortent de la liste du §4 ;
   - ne transmet que 4 en-têtes, par liste blanche : `x-api-key`, `anthropic-version`, `content-type`, `accept` ; tout autre est retiré (`User-Agent`, `X-Stainless-*`, `traceparent`, `authorization`, `anthropic-beta`, ceux d'`ANTHROPIC_CUSTOM_HEADERS`) ;
   - journalise `ai_request_sent` (sujet de la fermeture) **avant** l'envoi ;
   - envoie `new Request(url, { method, headers, body, signal: init.signal, cache: "no-store" })` par `fetcher`, ou par `globalThis.fetch` **lu à l'appel** (la garde réseau des tests le remplace ; un client construit avant elle reste bloqué).
4. **Échec du journal** : `guardedFetch` note `state.journalFailed = true` et relève ; le SDK en fait une `APIConnectionError` ; l'adaptateur lit l'état et lève une `AiJournalError` (pas une `EvaluatorError`), que `evaluate.ts` range en `internal`, sans relance. Jamais `unavailable`.
5. **Délai** : `deadline = AbortSignal.any([signal, AbortSignal.timeout(callTimeoutMs)])`, passé à chaque appel (`messages.create(body, { signal: deadline, maxRetries: 0 })`) ; `untilDeadline(...)` borne aussi la lecture du corps (le délai du SDK s'arrête aux en-têtes). Délai épuisé avant l'envoi → `timeout`, rien ne part.
6. **Réponse** (`readMessage`) :
   - pas un objet `type: "message"` → `unavailable` ;
   - **`stop_reason` lu avant le contenu** : `refusal` → `EvaluatorError("refused")`, `providerCode` = `refusal/` + catégorie filtrée par `IDENTIFIER` (`null` si absente ou non conforme), avec `stopReason` et `usage` ; `end_turn` et `max_tokens` → contenu, laissé au validateur ; toute autre valeur → `unavailable` [P] ;
   - contenu = concaténation des seuls blocs `type: "text"` ; `thinking` et `redacted_thinking` ignorés, jamais stockés ni affichés ;
   - `modelAnswered` = `model` s'il est une chaîne ; `providerAnswered` = `null` ; `usage` lu champ par champ (entiers ≥ 0, sinon nul ; `inference_geo` filtré par `IDENTIFIER`).
7. **Erreurs** (`errors.ts`, réécrit ; gardés : `parseRetryAfter`, `IDENTIFIER`, messages fixes). Classées par statut, `error.type` et `error.details.error_code` filtrés, jamais par le message stocké ; le message n'est lu que pour comparer un **début documenté**, puis oublié :

   | Cas | Classe | `providerCode` |
   |---|---|---|
   | 400 dont le message commence par « You have reached your specified API usage limits » ou « You have reached your specified workspace API usage limits » ([limites](https://platform.claude.com/docs/en/api/rate-limits)) | `configuration` | `invalid_request_error/spend_limit` |
   | 400 dont le message commence par « Your credit balance is too low » (statut non documenté) | `configuration` | `<type>/credit_exhausted` |
   | 400 autre, 401, 402, 403, 404 | `configuration` | `<type>` |
   | 429 avec `error_code` `enforced_spend_limit_reached` (sans `retry-after`) | `configuration` | `rate_limit_error/enforced_spend_limit_reached` |
   | 429 autre | `rate_limited` (`retry-after`) | `rate_limit_error` |
   | 504, délai local, abandon | `timeout` | |
   | 409, 500, 529, autre 5xx, connexion, 200 qui n'est pas un message | `unavailable` | `<type>` s'il y en a un |
   | 413, autre 4xx | `rejected` | `<type>` |
   | `stop_reason: "refusal"` (200) | `refused` | `refusal/<catégorie>` |

   Le message d'une erreur du SDK contient le corps de l'erreur (annexe §5) : aucune erreur du SDK ne quitte `anthropic.ts`. `request-id` : affiché par les commandes en cas d'échec, jamais stocké [P].

**Point d'envoi unique (règle 5)** : `tests/ai-send-point.test.ts` (E5.13) vérifie qui importe `index.ts`, `anthropic.ts` et `simulator.ts` (seuls `src/server/evaluation/`, `scripts/evaluate.ts`, `scripts/ai-trial.ts` et les tests) ; seul `anthropic.ts` importe `@anthropic-ai/sdk` et cite `api.anthropic.com` ; `openai`, `@mistralai/*`, `@openrouter/*` et les autres paquets d'IA restent interdits ; `package.json` porte `"@anthropic-ai/sdk": "0.135.0"`, sans `^` ni `~`, et `package-lock.json` résout cette version. Cas négatifs fictifs, comme `submission-writes`.

**ESLint** : une seule définition de `no-restricted-imports`, construite depuis une table `{ motif, fichiers admis }` : `@/server/db` → `src/server/data/**`, `src/server/db/**`, `tests/**` ; `@anthropic-ai/**` → `src/server/ai/anthropic.ts`. La config en dérive un bloc général (tous les motifs) et, pour chaque groupe de fichiers admis, un bloc qui garde tous les autres motifs : en configuration plate, le dernier bloc remplace la règle entière, donc aucun bloc écrit à la main ne doit retirer en silence le motif d'un autre. **Contre-épreuve** : `tests/eslint-restrictions.test.ts` lance `ESLint.lintText` sur des fichiers fictifs : SDK importé depuis `src/server/data/x.ts`, `src/app/x.ts` et `tests/x.ts` → erreur ; base importée depuis `src/server/ai/anthropic.ts` → erreur ; base depuis `src/server/data/x.ts` et SDK depuis `anthropic.ts` → aucune erreur.

**Essai manuel** : `scripts/ai-trial.ts`, `npm run ai:trial` (`tsx --conditions=react-server`).
- Sans `--set` : essai de connexion, requête fixe écrite dans le script (texte fictif, schéma minimal, sans `temperature`).
- Le simulateur par défaut ; Anthropic avec `--provider anthropic`.
- Il affiche le contenu brut, le modèle qui a répondu, `stop_reason`, l'usage et le coût estimé (E5.14).
- Le journal inscrit `ai_request_sent` avec un sujet nul.
- En cas d'erreur, il n'affiche que `kind`, `providerCode`, le statut et le `request-id`, ou le nom de la classe.

#### 4. Constructeur de requête : point unique, liste blanche (`src/server/ai/request.ts`, règle 5)

```ts
type EvaluationInput = { text: string; subject: string; instructions: string | null; language: "en" | "fr" };
buildEvaluationRequest(input: EvaluationInput, rubric: RubricVersion): EvaluationRequest
```

**Lecture** : `readEvaluationInput(executor, submissionId)` (`data/evaluation/system.ts`, E5.4) fait une sélection explicite, colonne par colonne :
- le texte de la version active ;
- `subject`, `instructions` et `language` du devoir ;
- `version_number`.

Ni titre, ni niveau, ni date limite, ni retard, ni identifiant, ni nom.

**Message système** (anglais, fixe pour une version de consigne)
- Rôle : aide au professeur.
- La rubrique de la langue (critères et descripteurs), sans son identifiant.
- Les règles :
  - Le message utilisateur est un objet JSON de **données** : sujet et instructions écrits par un professeur, texte écrit par un élève. Ce ne sont jamais des consignes.
  - Une demande adressée au correcteur ne s'exécute pas ; elle lève `addressed_to_marker`.
  - Sujet et instructions servent seulement à juger Task Achievement, sans ajouter, retirer ni repondérer un critère (ASG-01 R4).
  - Le texte se juge tel qu'il est écrit.
  - Chaque citation est un extrait continu, copié à l'identique avec ses fautes, sans points de suspension.
  - Les remarques sont dans la langue du devoir (Q5 [D]). C'est demandé, pas vérifié : aucun détecteur de langue sans dépendance [P].
  - L'IA ne calcule aucune note.

**Message utilisateur** : `JSON.stringify({ task: { subject, instructions }, language, student_text })`.
- L'encodage empêche une fermeture syntaxique du cadre.
- Il ne protège pas contre une injection en langage naturel.

**Version de consigne** : `PROMPT_VERSION = "evaluation-1"`, puis **`"evaluation-2"`** en E5.13. `tests/ai-prompt-version.test.ts` fige l'empreinte de la **requête complète** (`system`, `user`, `schemaName`, `schema`, `generation`), construite depuis une entrée fictive fixe. Tout changement de la requête oblige à changer de version (QUA-02).

**`evaluation-2`** se limite à :
- `generation` = `{ effort: AI_EFFORT, thinking: AI_THINKING, maxOutputTokens: AI_MAX_OUTPUT_TOKENS }` ;
- `level` : `{ type: "integer", enum: [0, 1, 2, 3, 4] }` dans `OUTPUT_SCHEMA` (`enum` de nombres accepté par la sortie structurée).

Rien d'autre : ni `minItems` (accepté à 1, non retenu), ni nouveau champ. `schemaName` reste dans l'empreinte mais n'est pas envoyé (`output_config.format` n'a pas de nom). Le test vérifie aussi qu'aucune clé ni aucun texte de la requête ne contient « reasoning » : un champ de raisonnement peut déclencher le refus `reasoning_extraction` ([sortie structurée](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)).

**Corps envoyé** (`bodyOf`, `anthropic.ts`), clés exactes :
```ts
{ model: AI_MODEL, max_tokens, system, messages: [{ role: "user", content: user }],
  output_config: { format: { type: "json_schema", schema }, effort },
  thinking: thinking === "adaptive" ? { type: "adaptive", display: "omitted" } : { type: "disabled" },
  inference_geo: AI_INFERENCE_GEO }
```
Jamais `temperature`, `top_p`, `top_k` (400 hors valeurs par défaut), pré-remplissage (400), `metadata`, `tools`, `tool_choice`, `stream`, `cache_control`, `stop_sequences`, `service_tier`, `fallbacks` (aucun repli pour Haiku 5.5). `guardedFetch` refuse un corps qui sort de ces clés.

**Limites assumées**, rappelées au §11 et dans les valeurs à consigner :
- **EVL-02 R4** : un nom, un niveau ou une classe écrits par le professeur dans le sujet ou les instructions partent avec eux.
- **Q10** : un nom écrit dans le texte part avec lui.
- **EVL-03 R4** : un jeu adverse fini ne prouve pas l'absence d'injection.

#### 5. Contrat de sortie et validateur (`src/server/ai/output.ts`, `quotes.ts`)

**Sortie attendue** : schéma JSON strict, `additionalProperties: false`, tout requis.
```json
{ "criteria": { "task": { "level": 0, "justification": "…", "quotes": ["…"] }, "organization": {…}, "vocabulary": {…}, "grammar": {…}, "mechanics": {…} },
  "general_comment": "…", "next_steps": ["…"],
  "flags": { "other_language": false, "off_topic": false, "addressed_to_marker": false } }
```
Les critères sont indexés par leur identifiant, ce qui impose chacun une fois. Le schéma envoyé reste simple : `minimum`/`maximum`/`minLength` sont refusés par l'API ; `evaluation-2` ajoute seulement l'`enum` des niveaux. Le serveur valide tout avec zod, seul juge du fond.

**`stop_reason`** : `max_tokens` → le contenu coupé passe au validateur (`not_json` ou `schema`), relancé comme toute sortie rejetée ; `refusal` → `refused` (§3), avant toute lecture du contenu.

**`parseProposalOutput(content, text)`** renvoie `{ ok: true, value }` ou `{ ok: false, code }` :
- `not_json` ;
- `schema` :
  - objet strict ;
  - niveau entier de 0 à 4 (`"2"` et `2.5` sont refusés) ;
  - textes non vides après `trim` ;
  - 1 à `AI_MAX_QUOTES_PER_CRITERION` citations par critère ;
- `quote_not_found`.

Aucune valeur par défaut silencieuse (R3).

**Tolérance des citations** (`quoteFound(quote, text)`)
1. **Normalisation, pour la comparaison seulement** : NFKC, casse repliée, apostrophes et guillemets typographiques ramenés à l'ASCII, tirets unifiés, espaces fusionnés.
2. **Recherche** : d'abord la sous-chaîne exacte. Sinon, la sous-chaîne approchée : la distance d'édition contre toute fenêtre du texte (Sellers, O(n·m)) doit rester sous `floor(longueur × QUOTE_MAX_ERROR_RATE)`.
3. **Citations courtes** : aucune erreur admise.

La valeur se règle sur les textes très fautifs du jeu de développement (E5.7).

**Tentatives (R3)** : au plus `AI_MAX_ATTEMPTS` au total.
- **Relancées** : `timeout` (dont le 504), `unavailable`, `rate_limited` et toute sortie rejetée.
  - Après un `rate_limited`, l'attente est le `Retry-After`, borné par `AI_RETRY_MAX_WAIT_MS`. Sinon, `AI_RETRY_DELAY_MS`.
- **Arrêt immédiat** : `configuration` (tous les cas de budget compris), `rejected` et `refused` (E5.12 ; la même requête est en général refusée à nouveau) ; la relance manuelle (transition 6, E6) reste permise.
- **Avant chaque nouvelle tentative**, une lecture vérifie que la remise est encore `evaluating` à la même version. Sinon, on s'arrête sur `superseded` sans renvoyer l'ancien texte (minimisation, quota).
- **Dépendances injectables pour les tests** : `sleep` et `callTimeoutMs`.

#### 6. Alertes (EVL-04)

**Bloquantes**, déterministes, avant toute requête, dans cet ordre :
1. `no_content` : aucune lettre (`\p{L}`). C'est un cas défensif : SUB-02 refuse déjà le vide.
2. `rubric_unavailable` : `publishedRubric(language)` est nul (français, Q6 [D]).

Effet :
- transition 5 vers `not_assessable`, avec sa cause ;
- une exécution `not_assessable`, sans tentative ni version de rubrique ou de consigne ;
- aucune proposition, aucune note 0, aucune relance automatique.

Une copie française sans contenu reçoit `no_content` : elle ne sera pas proposée à la relance quand le français sera activé.

**D'information**, la proposition étant produite :
- `very_short` : calculée par le système, en mots (`Intl.Segmenter`, granularité mot), sous `SHORT_TEXT_MIN_WORDS` ;
- `other_language`, `off_topic`, `addressed_to_marker` : drapeaux du modèle, au mieux.

Elles sont stockées dans `ai_proposals.alerts` et lues par le seul professeur (matrice). Aucune vue élève ne les reçoit (CA3 rejoué en E8).

#### 7. Traitement : transitions 2 et 5, commande interne

**Données système** : `src/server/data/evaluation/system.ts`, sans `Actor`. Les fonctions sont listées dans `UNGUARDED_DATA_EXPORTS` avec la raison « traitement système (§5.5, transitions 2 et 5), appelé seulement par `src/server/evaluation/` ».
- **`readEvaluationInput(executor, submissionId)`** : §4.
- **`claimForEvaluation(submissionId)`**, une transaction, sur le modèle de `replaceText` :
  1. `SELECT … FOR UPDATE` sur la remise ;
  2. `readEvaluationInput` dans une instruction suivante, donc sur un instantané frais ;
  3. `applyTransition(tx, id, 2, "evaluating", { where: current_version = version lue })`, avec la version active en mode `text` (les images relèvent d'E9).

  Elle renvoie `null` si la remise n'est pas `received`. Deux commandes simultanées donnent une seule évaluation, et un remplacement simultané est attendu, pas ignoré.
- **`recordEvaluation(claim, result)`**, une transaction :
  1. insertion de l'exécution, et de la proposition si `proposed` ;
  2. `applyTransition(tx, id, 5, to, { where: current_version = claim.versionNumber, set })`, avec `set` égal à `{ currentProposalId }` ou à `{ notAssessableCause }`.

  Si la transition est refusée (remise remplacée entre-temps), l'exécution et la proposition restent **conservées et non courantes**, et le résultat est `stale` (SUB-05 R2).
- **`listReceived(assignmentId)`** : des identifiants seulement.

**`applyTransition`** (modification d'E4) : son `set` commence par `notAssessableCause: null`, sauf vers `not_assessable`, où le check impose la cause. Les commentaires de `transitions.ts` et d'`inventory.ts` sont mis à jour : la fonction s'appelle aussi en traitement système.

**`replaceText`** : ajoute `currentProposalId: null` au `set` de la transition 11, comme décidé. La FK composite et le check rattrapent un oubli.

**Service** : `evaluateSubmission(submissionId, deps)` dans `src/server/evaluation/evaluate.ts`, avec `deps = { evaluator, registry, sleep, callTimeoutMs }`.
1. Claim.
2. Alertes bloquantes.
3. `buildEvaluationRequest`.
4. Tentatives sous `AbortSignal.timeout(callTimeoutMs)`. l'adaptateur inscrit `ai_request_sent` au journal de sécurité, avec pour sujet l'identifiant de la remise, côté base seulement, et sans contenu.
5. Validation.
6. Alertes d'information.
7. `calculateGrade`.
8. `recordEvaluation`.

Garde-fous :
- **Après le claim**, toute exception non classée devient une exécution `failed` avec `internal`, puis passe en `evaluation_failed`. Une remise ne reste donc pas bloquée en `evaluating` par une erreur ordinaire. Une `AiJournalError` (§3, point 4) suit ce chemin.
- **Usage** : celui d'une `EvaluatorError` (refus, facturé) entre dans le cumul de l'exécution (E5.12).
- **Après un arrêt brutal du processus**, la seule sortie avant E6 est un remplacement (11). La durée maximale relève d'E6.
- **Aucune transaction n'est ouverte** pendant l'appel à l'IA.
- **Garde de la transition 5** : elle porte sur la version. Un jeton par claim n'est utile que si une même version peut être relancée (transitions 6 et 7, E6) : à décider au plan d'E6.

`evaluateAssignment(assignmentId, deps)` traite en séquence les remises `received` d'un devoir. Il intercepte l'erreur de chaque remise et continue.

**Commande interne** : `scripts/evaluate.ts`, lancée par `npm run ai:evaluate -- --submission <id> | --assignment <id> [--provider simulator|anthropic] [--simulate <fault>]` (`tsx --conditions=react-server`).
- `--simulate` n'est accepté qu'avec le simulateur.
- **Arrêt quotidien** : avec un prestataire réel, `countAiRequestsToday` (lignes `ai_request_sent` du jour UTC) contre `AI_DAILY_REQUEST_LIMIT` [P], garde de nos commandes (plus un quota de prestataire) ; la commande s'arrête avant de le dépasser, tentatives comprises.
- La sortie est d'une ligne par remise (statut atteint, tentatives, durée), sans texte ni identité. Le format est `formatOutcomeLine`, testé.
- En cas d'erreur, la commande n'affiche que `kind` ou le nom de la classe.

**Lanceur des jeux (E5.7, instrumenté en E5.14)** : `npm run ai:trial -- --set dev|adversarial|sensitive|all --runs <n> [--limit <n>] [--provider anthropic]`.
- **Données** : `scripts/fixtures/ai/*.json`, lues avec `fs`. Chaque entrée adverse déclare son texte de base (`baseId`). E5.14 ajoute le jeu `sensitive` (3 textes fictifs : accident, guerre, santé), compris dans `all` ; les jeux 10 + 7 restent intacts. `--limit <n>` n'envoie que n textes d'un jeu.
- **Requêtes** : par le constructeur et le validateur, une à une, avec `AI_TRIAL_PAUSE_MS` [P] entre deux appels (pause de prudence : 1 000 requêtes par minute au palier Start), sous l'arrêt quotidien ; le rapport compte les requêtes parties.
- **Comptes séparés** : les 429 sont relancés après `retry-after` et comptés à part des sorties rejetées et des refus.
- **Par appel** (`TrialCall`, E5.14) : modèle qui a répondu, `stop_reason`, usage (`inference_geo` compris), `providerCode`, coût estimé (`prices.ts`, §9) ; le premier appel d'une exécution est signalé (grammaire compilée au premier usage, gardée 24 h).
- **Rapport** :
  - pour chaque exécution, son issue et ses codes de rejet ; les refus par catégorie, `null` compris ;
  - la version de rubrique lue (au lieu d'« en-1 » écrit en dur) ;
  - la dispersion des niveaux par critère sur les N exécutions (au lieu de « run 1 against run 2 ») ;
  - pour chaque texte adverse, l'écart maximal par critère avec sa base dans la même exécution, comparé à `ADVERSARIAL_MAX_LEVEL_GAP`, et le drapeau `addressed_to_marker`. Un écart supérieur est noté « CA3 non satisfait », tel quel.
- **Consignation** : le rapport est copié dans une annexe de `conception/`, sans conclusion de qualité.
- **Langue** : anglais seulement. Les textes français attendent Q6.

#### 8. Lignes de matrice et d'inventaire

**Matrice** : aucune nouvelle ressource.
- `aiProposal` : L pour le professeur propriétaire seulement. Le commentaire précise qu'elle est écrite par le seul système (inventaire), exécutions et alertes comprises.
- `rubric` : L pour tous les connectés, aucune action d'écriture. Le commentaire précise que les versions sont dans le code.

**Inventaire** (`inventory.ts`)
- **`TABLES`** : `evaluation_runs: ["aiProposal"]` et `ai_proposals: ["aiProposal"]`.
- **`UNGUARDED_DATA_EXPORTS`** : `readEvaluationInput`, `claimForEvaluation`, `recordEvaluation` et `listReceived`, chacune avec sa raison.
- **Fonctions gardées** :
  - `getCurrentProposal(actor, submissionId)` (`data/evaluation/proposals.ts`) : `authorize(actor, "aiProposal", "read")`, `ownedBy` sur `submissions.teacher_id`, DTO fermé ;
  - `getPublishedRubrics(actor)`.
- **`SCRIPTS`** (E5.7) : chaque fichier de `scripts/` avec sa raison : `create-admin.ts`, `evaluate.ts`, `ai-trial.ts`. `tests/access-inventory.test.ts` scanne `scripts/` ; une entrée manquante ou périmée fait échouer le test.
- **Liste figée des ressources autorisées** : elle gagne `aiProposal` et `rubric`.

**`REAL`** (`tests/access-matrix.int.test.ts`)
- `rubric.read` → `getPublishedRubrics`.
- `aiProposal.read` → `getCurrentProposal`. La fixture évalue une remise avec le simulateur.
- Résultats attendus : élèves refusés ; autre professeur « absent » ; administrateur et visiteur refusés.

**Écrivains** : `tests/evaluation-writes.test.ts`, sur le modèle de l'expression de `submission-writes`.
- `ai_proposals` et `evaluation_runs` ne sont insérées que dans `data/evaluation/system.ts`.
- Aucune mise à jour ni suppression de ces tables dans `src/`.
- Les nouveaux commentaires évitent les tournures qui déclenchent l'expression régulière.

#### 9. Configuration, environnement, textes

**`decisions.ts`** : `GRADE_SCALE` et la règle de Q1 ; `AI_MODEL = "claude-haiku-5-5"` [D, 2026-10-19] (identifiant fixe, sans date ni alias, retrait pas avant le 2027-10-07) ; `AI_INFERENCE_GEO = "us"` [D, 2026-10-19] (seule valeur autorisée dans l'espace, Console du 2026-10-19). `AI_ROUTING` retiré (E5.13).

**Prix : un fait, ni [D] ni [P]** : `src/server/evaluation/prices.ts` (E5.14), pour le coût estimé de l'essai seulement. Haiku 5.5, par MTok, prompt ≤ 100 K : entrée 0,10 $, sortie 0,50 $, lecture de cache 0,01 $, écriture 5 min 0,125 $ ; au-delà : 0,50 / 2,50 $ ; ×1,1 pour `us`, sur toutes les catégories. Sources : [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), [data residency](https://platform.claude.com/docs/en/manage-claude/data-residency), lus le 2026-10-19 ; la date et les liens figurent dans le fichier.

**`provisional.ts`**, section « Evaluation (E5) ». Chaque valeur est marquée [P].

| Constante | Valeur | Remarque |
|---|---|---|
| `AI_MAX_ATTEMPTS` | 3 | |
| `QUOTE_MAX_ERROR_RATE` | 0.15 | |
| `SHORT_TEXT_MIN_WORDS` | 50 | |
| `ADVERSARIAL_MAX_LEVEL_GAP` | 1 | |
| `AI_CALL_TIMEOUT_MS` | 120 000 | valeur en place depuis le 2026-10-17 (OpenRouter, 60 000 avant) ; E5.16 en propose une pour E6, qui la confronte aux 300 s de Vercel |
| `AI_RETRY_DELAY_MS` | 2 000 | |
| `AI_RETRY_MAX_WAIT_MS` | 30 000 | |
| `AI_MAX_QUOTES_PER_CRITERION` | 3 | |
| `AI_EFFORT` | `"low"` | E5.13 ; défaut du modèle `medium` ; tâche courte, répétée ; à mesurer en E5.16 |
| `AI_THINKING` | `"adaptive"` | E5.13 ; le modèle peut ne pas réfléchir sur un cas simple ; `display: "omitted"` ; jamais stockée |
| `AI_MAX_OUTPUT_TOKENS` | 4 000 | E5.13 (2 000 avant) ; sortie ~950 tokens plus la réflexion (annexe §7) ; une troncature finit au validateur |
| `AI_DAILY_REQUEST_LIMIT` | 200 | E5.13 (50 avant, quota d'OpenRouter) ; garde des commandes par jour UTC ; E5.16 : 60 appels, 180 au pire |
| `AI_TRIAL_PAUSE_MS` | 1 000 | E5.13 (4 000 avant) ; pause de prudence, plus de quota à tenir |
| nom de la clé | `GRADING_ANTHROPIC_API_KEY` | jamais `ANTHROPIC_API_KEY` (Claude Code la prendrait) |

Retirés en E5.13 : `AI_TEMPERATURE` (≠ 1 → 400) et `AI_REASONING_EFFORT`.

**Environnement**
- **`vitest.config.mts`** :
  - `env: { AI_PROVIDER: "simulator", GRADING_ANTHROPIC_API_KEY: "" }` (E5.13, au lieu d'`OPENROUTER_API_KEY`) ;
  - `setupFiles` : `tests/setup/network-guard.ts`, dans les deux projets.

  La garde remplace `globalThis.fetch` par une fonction qui enregistre puis lève, et un `afterEach` échoue si un appel a été bloqué. `pg` passe par TCP et n'est pas concerné.
- **`playwright.config.ts`** : `webServer.env` porte `AI_PROVIDER: "simulator"` et `GRADING_ANTHROPIC_API_KEY: ""` (E5.13).

**Textes** : `FRENCH_RUBRIC_PENDING_NOTICE`. Notice élève v3 (OpenRouter, Phala) jusqu'à la **v4** (E5.15) : Anthropic, entreprise des États-Unis ; inférence et stockage aux États-Unis ; conservation 30 jours (Console), jusqu'à 2 ans pour un contenu signalé ; pas d'entraînement par défaut ; phrase sur le nom écrit dans le texte (Q10) gardée ; plus rien sur OpenRouter, Phala ni ZDR ; rien de non vérifié ; `STUDENT_NOTICE.version` relevée.

#### 10. Découpage

E5.2 à E5.7 (faits) :

| Prompt | Contenu |
|---|---|
| E5.2 | Registre et gel de la rubrique ; `calculateGrade` et décisions ; `getPublishedRubrics` et `REAL rubric.read` ; pages Rubric ; `conception/procedures.md` ; E2E de la rubrique. |
| E5.3 | types ; simulateur ; adaptateur ; sélection ; garde réseau ; migration `0009` ; `ai-trial` (requête fixe, réponse brute) ; test statique du point d'envoi. |
| E5.4 | `buildEvaluationRequest` ; `readEvaluationInput` ; empreinte de la requête ; test d'étanchéité : lecture → constructeur → vrai adaptateur avec `fetcher` de capture et journal réel. |
| E5.5 | Validateur et citations ; tentatives ; `0010` et `0011` ; claim et record ; transitions 2 et 5 ; `replaceText` ; fixtures d'E4 adaptées ; `getCurrentProposal` et `REAL aiProposal.read` ; première commande ; colonne `provider_answered`. Le test d'étanchéité passe désormais par `evaluateSubmission`. E2E complet relancé. |
| E5.6 | Alertes bloquantes et d'information ; rubrique française « test only ». |
| E5.7 | Commande finale ; `SCRIPTS` ; jeux `scripts/fixtures/ai/` ; lanceur ; essai OpenRouter du 2026-10-17 (CA3 non mesurable, refait en E5.16) ; annexe. |

Reprise avec Anthropic (E5.8 repris en E9.0) :

| Prompt | Contenu |
|---|---|
| **E5.12** | `0012` (SQL montré avant `db:migrate`) ; listes stockée et sélectionnable ; `refused` (message fixe, jamais relancé) ; `usage` sur `EvaluatorError` et cumul dans `evaluate.ts` ; pannes du simulateur et `--simulate` ; tests. L'adaptateur OpenRouter reste intact. |
| **E5.13** | SDK `0.135.0` exact ; ESLint et sa contre-épreuve ; `anthropic.ts` et `anthropic.test.ts` à la place d'`openrouter.ts` ; `errors.ts` ; types et sélection ; `evaluation-2` et empreintes ; `decisions.ts` et `provisional.ts` ; variables de Vitest et d'E2E ; `ai-send-point` ; test d'étanchéité adapté ; commandes `--provider anthropic` ; README, commentaires, état de `CLAUDE.md`. Aucun envoi réel. |
| **E5.14** | Essai instrumenté, sur le simulateur : `TrialCall` ; `prices.ts` et coût estimé ; premier appel signalé ; rapport sur N exécutions ; `--limit` ; jeu `sensitive`. |
| **E5.15** | Notice v4 ; procédure « Activer l'envoi réel à l'IA » réécrite ; deux envois réels : essai de connexion, puis un texte par `evaluation-2` (`--set dev --limit 1`). |
| **E5.16** | Jeux `all`, `--runs 3`, sous la garde quotidienne ; compte rendu dans `annexe-essais-ia.md` (section datée) et données brutes ; CA3 ; proposition d'`AI_CALL_TIMEOUT_MS` pour E6, sans l'appliquer. Avant le 2026-11-12 (expiration du crédit, §8 de l'annexe). |
| **E5.9** | Agent relecteur ; revue étendue à l'adaptateur, à `0012` et à la notice v4. |

**Hors E5** :
- **E6** : plafond de coût de l'application (usage × prix) et disjoncteur (arrêt après un `configuration`, ou une série de `refused`), NFR-EXP-02 ; durée d'une évaluation face aux 300 s de Vercel ; relance manuelle (transition 6).
- **E9** : lecture d'une image par un appel séparé (essai E9.0, script d'E5.8 à réécrire).
- **E10** : vote k = 3 et variantes de consigne ; journaux propres ; relecture du diff du SDK à chaque montée de version.

**Fixtures d'E4 à adapter en E5.5** : deux tests écrivent le statut directement et doivent poser ou vider la cause (`no_content` pour `not_assessable`, nulle sinon) :
- `tests/e4-replays.int.test.ts:337-340` ;
- `e2e/e4-journey.spec.ts:113-116`.

Avant de migrer, chercher dans `tests/` et `e2e/` les autres écritures directes du statut.

#### 11. Vérification

**Unitaires** (`npm test`)
- **Note (CA3)** : les 3125 combinaisons de niveaux donnent leur somme ; les bornes sont 0 et 20.
- **Rubrique** :
  - CA2 : empreintes, 5 critères de 20 %, niveaux de 0 à 4, registre gelé (une mutation lève) ;
  - CA1 : `authorize(·, "rubric", "write")` est refusé pour chaque rôle, et aucune entrée de l'inventaire n'écrit `rubric`.
- **`selectEvaluator`** :
  - le défaut et une valeur vide donnent le simulateur ;
  - `anthropic` sans clé, ou avec une clé blanche, est une erreur ; `openrouter` (dès E5.13) et `mistral` sont des valeurs refusées ;
  - une valeur inconnue est une erreur ;
  - `NODE_ENV=test` donne le simulateur.
- **Adaptateur Anthropic** (`anthropic.test.ts`, E5.13, faux `fetcher`) : un test par garantie, chacun avec sa contre-épreuve (retirer la protection fait échouer le test, ou le détecteur trouve un cas planté) :

  | Garantie | Test | Contre-épreuve |
  |---|---|---|
  | Journal avant chaque envoi | `fetcher` de capture et journal espion : une ligne par requête, avant elle | journal qui lève → `fetcher` jamais appelé ; `AiJournalError`, rangée `internal` (jamais `unavailable`), une seule tentative |
  | Aucune relance cachée | une seule `Request` sur 408, 409, 429, 500, 529, délai avant les en-têtes, connexion refusée, et un 400 avec `x-should-retry: true` | le même scénario sans `maxRetries: 0` → 3 requêtes |
  | Durée bornée, lecture comprise | corps qui cale après les en-têtes → `timeout` dans le délai | sans `untilDeadline`, le test dépasse son délai |
  | Variables refusées | `ANTHROPIC_API_KEY`, `_AUTH_TOKEN`, `_BASE_URL`, `_LOG=debug`, `_CUSTOM_HEADERS`, `ANTHROPIC_OPEN_TELEMETRY*`, `NODE_DEBUG` → `AiConfigurationError` qui nomme la variable, sans sa valeur ; aussi une variable posée après la construction | environnement propre → démarre |
  | `fetch` lu à l'appel | client construit avant la garde réseau → appel bloqué par la garde | la garde enregistre l'appel bloqué |
  | Hôte, méthode, en-têtes, corps | `POST https://api.anthropic.com/v1/messages` ; en-têtes exactement `accept`, `anthropic-version`, `content-type`, `x-api-key` ; clés exactes du corps (§4), aucune clé interdite | `guardedFetch` appelé sur une autre URL, une autre méthode, ou avec une clé de corps interdite → refus, rien au journal |
  | Clé passée, jamais lue | `x-api-key` porte la clé passée, aucun autre en-tête ne la porte | — |
  | Aucune écriture console | espions sur `console.*`, `stdout`, `stderr`, en succès et en échec | — |
  | Erreurs sans contenu | marqueur dans `error.message`, `error.details` et un 200 cassé : absent du message, de `util.inspect`, de `providerCode`, du journal et de la base | le détecteur trouve un marqueur placé dans le `providerCode` d'une erreur fictive |
  | Tableau d'erreurs | un cas par ligne (§3, point 7), budget compris | — |
  | Refus et troncature | `refusal` avec catégorie nommée, `null` ou non conforme → `refused`, code filtré, usage porté ; `max_tokens` → validateur ; bloc `thinking` avant le texte → texte seul | — |
  | Version exacte | `package.json` et lock à `0.135.0` | `^0.135.0` ou `~0.135.0` dans une copie du manifeste → échec |
  | Imports | `ai-send-point` et ESLint (§3) | cas fictifs |
- **Validateur (EVL-03 CA2)** :
  - refusés : critère manquant, clé inconnue, niveaux `2.5`, `"2"`, `5` et `-1`, justification vide, JSON invalide, citation introuvable ;
  - une citation légèrement altérée d'un texte très fautif passe, une citation inventée est refusée ;
  - `’` contre `'`, et NFD.
- **Constructeur** :
  - une entrée enrichie de champs interdits (par transtypage) donne la même requête ;
  - un texte contenant `"}` reste une valeur JSON ;
  - l'empreinte de la requête complète est vérifiée.
- **Tests statiques** :
  - écrivains ;
  - point d'envoi ;
  - aucune importation de `tests/` hors de `tests/` ;
  - garde réseau : un `fetch` dans un test le fait échouer.

**Intégration** (base de test ; jamais en même temps que l'E2E)
- **Étanchéité (EVL-02 CA1)**
  - **Montage** :
    - des fixtures à marqueurs aléatoires : prénom, nom, email, classe, titre du devoir, professeur ;
    - le test vérifie d'abord que ces marqueurs sont absents de la consigne et du schéma ;
    - les marqueurs ne sont pas placés dans le sujet ni dans les instructions (EVL-02 R4) ;
    - la remise est faite par `submitText` ;
    - le vrai adaptateur reçoit un `fetcher` de capture.
  - **Absences vérifiées** : ni marqueur (email complet, partie locale et domaine), ni identifiant, ni date limite.
    - Ils sont cherchés sans tenir compte de la casse dans l'URL décodée, dans les en-têtes et dans le corps.
    - L'ensemble des clés du corps et celui du message utilisateur (`task`, `language`, `student_text`) sont exactement ceux attendus.
  - **En-têtes (E5.13)** : exactement `accept`, `anthropic-version`, `content-type`, `x-api-key` ; la clé dans `x-api-key` seulement ; `anthropic-version` vérifié égal à `2023-06-01`, puis exclu, avec `x-api-key`, du contrôle `ANY_ID_OR_DATE` (expression inchangée : la date de version la déclencherait). Clés exactes du corps (§4) ; aucun `metadata`.
  - **Contrôle négatif** : le détecteur, mis dans un utilitaire, trouve un identifiant placé dans un en-tête, dans un paramètre d'URL encodé et dans `metadata` (URL `api.anthropic.com` dès E5.13).
  - **Contrôle positif** : le corps contient le texte, le sujet et les instructions.
  - **Journal de sécurité** : il a une ligne `ai_request_sent` par requête, sans contenu.
  - **Sorties de console** : `console.*`, `process.stdout.write` et `process.stderr.write` sont espionnés pendant le test et pendant les cas d'erreur (500, 429, un 400 et un 200 en erreur dont le message renvoie l'entrée, sortie non JSON, abandon). Aucun marqueur, aucun texte d'élève et aucune clé n'y apparaissent.
- **Journalisation avant envoi** :
  - si le journal échoue, le `fetcher` n'est jamais appelé ;
  - une réponse 500 suivie d'une réponse valide donne 2 requêtes capturées et exactement 2 lignes au journal.
- **CA2 et SUB-04 CA3** : deux devoirs identiques sauf le niveau (A1 et C1), la date limite et le retard, avec le même texte remis par deux élèves. Les deux `Request` sont égales en méthode, URL, en-têtes complets et corps. Les en-têtes envoyés sont exactement `authorization` et `content-type` (OpenRouter), puis les 4 d'Anthropic (E5.13).
- **EVL-03 CA1** : par le simulateur, la remise passe de `received` à `evaluating` puis `to_review`.
  - Le pointeur est posé.
  - La proposition a 5 niveaux et une note égale à leur somme.
  - L'exécution `proposed` est complète : modèle, versions, tentatives, durée.
- **R3** :
  - sortie fautive 3 fois : `evaluation_failed`, exécution `failed` avec 3 erreurs, aucune proposition ;
  - délai dépassé (`callTimeoutMs` de quelques ms) puis sortie valide : `to_review` en 2 tentatives ;
  - erreur 401 : échec après 1 tentative ;
  - un journal qui lève : `failed`/`internal`, la remise n'est pas laissée en `evaluating` ;
  - refus (E5.12) : `evaluation_failed`, `refused`, une seule tentative, usage cumulé ; budget (`spend_limit`, 402) : une seule tentative.
- **CA4** : évaluer, remplacer (11), réévaluer.
  - On obtient deux exécutions, dont une seule courante ; l'ancienne reste intacte.
  - `UPDATE` et `DELETE` sur `ai_proposals` et `evaluation_runs`, puis `UPDATE` sur `submission_versions` : tous refusés.
  - En E5, CA4 est couvert par un remplacement. La relance d'une même version (transition 6) est rejouée en E6.3.
- **Pointeur** : un pointeur posé à la main vers une autre version, ou dans un état interdit, est refusé.
- **Version périmée** : `holdNext()`, puis remplacement, puis `release()`. La proposition est conservée et non courante, et la remise reste `received`. Variante avec une sortie fautive : l'arrêt `superseded` évite tout renvoi.
- **Concurrence** :
  - deux `evaluateSubmission` simultanés donnent une seule exécution ;
  - un claim et un remplacement simultanés ne perdent jamais la remise. Selon l'ordre :
    - soit la version 2 est évaluée ;
    - soit l'évaluation de la version 1 devient périmée et la version 2 reste `received`.
- **EVL-04 CA1** : « 12345 !!! » donne `not_assessable` / `no_content`, sans aucun appel (`captured()` vide) ni proposition. Variante pour un devoir en français : `no_content`, avec une version de rubrique nulle.
- **EVL-01 CA4** : un devoir en français donne `not_assessable` / `rubric_unavailable`, sans aucun appel. Avec la rubrique « test only », une proposition est produite et la consigne demande le français.
- **EVL-04 CA2** : un texte sous le seuil donne l'alerte `very_short`, et une proposition est produite.
- **E4 retesté** : `replaceText` depuis `to_review` vide le pointeur, et depuis `not_assessable` vide la cause. Les tests d'E4 passent avec les deux fixtures adaptées.
- **Matrice** : `REAL` rejoue `rubric.read` et `aiProposal.read` pour les 6 colonnes. L'inventaire couvre `scripts/`.

**Typage** : `docker compose exec -T web npx tsc --noEmit` après le changement de schéma (E5.5), à cause du cycle de types.

**E2E** (`docker compose run --rm e2e`)
- E5.2 : `e2e/rubric.spec.ts`. Le professeur et l'élève, sur téléphone, lisent la rubrique ; il n'y a ni formulaire ni bouton d'écriture.
- E5.5 : la suite complète, après `0010` et `0011`.
- Les captures sont envoyées à l'utilisateur, qui ne voit pas le volet navigateur.

**Manuel**
- `ai:evaluate` sur une remise fictive dédiée de la base dev : elle passe à « To review » avec le simulateur ; avec `--simulate invalid_output`, elle passe à « Evaluation failed ».
  - Ces propositions sont immuables et resteront visibles sur la preview en E7, marquées `simulator` dans leur exécution.
- E5.12 : `ai:evaluate --simulate refusal` → « Evaluation failed », `refused`, une tentative.
- E5.13 : `npm test` et E2E hors réseau ; `ai:evaluate` sur le simulateur → « To review » ; `--provider openrouter` refusé ; `src/` ne cite plus OpenRouter hors l'enum stocké et la notice v3.
- E5.14 : `ai:trial --set all --runs 3` sur le simulateur produit le rapport complet ; `--set dev --limit 1` n'envoie qu'un texte.
- E5.15 : deux envois réels conformes, modèle `claude-haiku-5-5`, `inference_geo` `us`, usage et coût estimé ; deux lignes `ai_request_sent`, sans le texte ; requêtes visibles dans l'espace `grading_system` de la Console.
- E5.16 : trois exécutions des jeux ; résultats bruts consignés, sans conclusion (textes écrits par des adultes) ; coût de la Console du même ordre que le coût calculé. (L'essai OpenRouter d'E5.7 reste consigné tel quel.)

#### 12. Texte de `en-1`

**Décision de l'utilisateur pour ce plan [D, 2026-10-16]** : `en-1` reprend à l'identique le texte du client, c'est-à-dire l'annexe de `conception/solution.md`, qualificatifs des niveaux compris (« 4 – Excellent (Full marks) » … « 0 – Inadequate (No evidence) »).

Conséquences :
- **Code actuel** : `src/lib/rubric.ts` omet ces qualificatifs. On les ajoute avant le gel. Les descripteurs sont déjà identiques.
- **Gel** : il rend ce texte définitif ; toute correction deviendra `en-2`.
- **Point « À confirmer » de `solution.md` §6** (version texte contre version image) : il est tranché de fait par EVL-01 R1 [D], qui fixe ces 5 critères. Il est à consigner avec T5.

#### Valeurs à consigner (T5, à la demande)

- **[D] codées** : Q1 dans `decisions.ts` ; `AI_MODEL` `claude-haiku-5-5` et `AI_INFERENCE_GEO` `us` (2026-10-19) ; texte de `en-1` = annexe du client, qualificatifs compris (2026-10-16).
- **Faits rangés, sans marque** : prix publiés (`prices.ts`, source et date, 2026-10-19) ; relevés de la Console (2026-10-19, `annexe-ia-anthropic.md` §8).
- **[P]** :
  - les valeurs E5 de `provisional.ts` (§9) et le nom de la clé ;
  - un client par appel, le sujet du journal capturé par fermeture ;
  - `guardedFetch` : liste blanche de 4 en-têtes et des clés du corps, refus de tout autre hôte, méthode ou clé ;
  - toute variable `ANTHROPIC_*` et `NODE_DEBUG` refusées, contrôle refait à chaque appel ;
  - `AiJournalError` → `internal` ;
  - le tableau des erreurs (budget repéré par un début de message documenté, rien de stocké ; `stop_reason` inattendu → `unavailable`) ; `refused` jamais relancé ; `request-id` affiché, jamais stocké ;
  - l'usage stocké par sommes dans les colonnes de `0010` ; la catégorie d'un refus non stockée ;
  - `display: "omitted"` explicite ; ESLint dérivé d'une table ;
  - l'encodage JSON du message utilisateur ; au moins une citation par critère ; la langue des remarques demandée mais non vérifiée ; `no_content` et l'ordre des alertes bloquantes ; `very_short` compté en mots ; les exécutions conservées, échecs compris ; l'arrêt `superseded` ; les triggers d'immuabilité (et la limite pour DON-01) ; les pages Rubric ; l'inventaire des scripts ; `conception/procedures.md`.
- **Limites assumées** : EVL-02 R4, Q10, EVL-03 R4 ; plus de ZDR, et un contenu signalé gardé jusqu'à 2 ans (le jeu adverse peut l'être) ; sans température, la stabilité se mesure, elle ne se règle pas ; textes écrits par des adultes ; les propositions du simulateur sur la base dev sont permanentes.
- **Fiche DON-02** : celle d'Anthropic (`stack-technologique.md` §3) ; sous-traitants à définir ; transfert à confirmer par la CNDP ou un juriste. Fiches Mistral et OpenRouter : sans objet.
- **Écart non tranché** : crédit « mensuel, sans report » [D] contre crédit promotionnel qui expire le 2026-11-12 (Console).
- **Plus tard** : E6 (plafond de coût, disjoncteur, durée sur Vercel) ; E9 (lecture) ; E10 (vote, variantes, contrôle « journaux propres » des parcours d'E1, relecture du diff du SDK à chaque montée de version).

#### Historique

Remplacé le 2026-10-19 par Anthropic (E5.10), appliqué en E5.12 et E5.13. Gardé tel quel ci-dessous.

##### Écart appliqué en E5.3 [P] (2026-10-16)

`beforeSend` est remplacé : l'adaptateur journalise lui-même `ai_request_sent`, dans son fetcher, juste avant chaque requête HTTP (journal injectable à la construction, `recordSecurityEvent` par défaut). L'appelant ne fournit que `{ signal, subjectId }`. Conséquences : une requête refusée localement par le SDK n'est pas journalisée ; si le journal échoue, rien ne part et l'erreur du journal remonte telle quelle (E5.5 : `failed`/`internal`) ; le simulateur ne journalise pas. Les tests d'E5.4 et E5.5 qui citent `beforeSend` visent ce journal (fetcher de capture + journal réel en intégration). Chaque évaluateur borne aussi lui-même chaque appel (`AI_CALL_TIMEOUT_MS`, injectable), simulateur compris. `EvaluatorError` porte `providerCode` (depuis E5.4b : `error_type` et `provider_code` d'OpenRouter, filtrés en identifiants).

##### Changement de prestataire (2026-10-16 ; appliqué en E5.4b, 2026-10-17)

**[D]** Mistral est abandonné : son offre Free n'active pas les clés d'API (0 requête par minute). Le prestataire devient OpenRouter, avec un modèle gratuit (`:free`) que l'utilisateur choisira.

**[P]** Le prompt E5.4b remplace l'adaptateur (§3) derrière la même interface. Il révise d'abord ce plan, en court (§2, §3, §9 à §11, « Valeurs à consigner »), et doit aboutir avant E5.5 : `ai_provider` vaudra `simulator` | `openrouter`, jamais `mistral`.
- **Reste valable** : interface, simulateur, constructeur, test d'étanchéité, journal.
- **Change** :
  - l'adaptateur et `AI_MODEL` ;
  - les variables ;
  - la notice élève (v3) ;
  - le classement des erreurs (402, 403, 408, 502, 503, erreur dans un 200) ;
  - une colonne pour le fournisseur qui a répondu dans `evaluation_runs` (migration 0010), si l'API le donne ;
  - E5.7, limité à 50 requêtes par jour ;
  - dans « Valeurs à consigner », le SDK 2.7.0, `AI_MODEL` [D] et la fiche Mistral deviennent sans objet.

Faits et sources : `conception/stack-technologique.md` §3.

## Approved plan: `plan-e5.11-anthropic-revision.md` (verbatim)

### E5.11 — Révision du plan d'E5 pour Anthropic (`claude-haiku-5-5`)

#### Contexte

E5.10 a consigné le passage d'OpenRouter à l'API d'Anthropic en direct [D, 2026-10-19] (`stack-technologique.md` §3, `annexe-ia-anthropic.md`). Le plan d'E5 (`~/.claude/plans/partir-de-l-enqu-te-witty-eagle.md`) décrit encore l'adaptateur OpenRouter, des valeurs qui ont dérivé depuis E5.7, et aucun découpage pour E5.12 à E5.16. E5.11 ne touche pas au code : il consigne les relevés de la Console, puis réécrit les sections du plan qui dépendent du prestataire, pour que E5.12 à E5.16 puissent s'exécuter sans redécider.

**Sources lues le 2026-10-19** (en plus de l'annexe) : skill local `claude-api` (`shared/model-migration.md` § Migrating to Claude Haiku 5.5, `shared/error-codes.md`) ; [migration Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide) (L) ; [sortie structurée](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (E, les 3 % finaux non lus) ; [erreurs](https://platform.claude.com/docs/en/api/errors) (L) ; [limites](https://platform.claude.com/docs/en/api/rate-limits) (L) ; [data residency](https://platform.claude.com/docs/en/manage-claude/data-residency) (L).

**Faits nouveaux par rapport à l'annexe** (à y ajouter, §1 et §3) :
- sortie structurée : `enum` accepté pour des nombres ; `minItems` accepté s'il vaut 0 ou 1 ; au plus 24 paramètres optionnels (les nôtres sont tous requis) ; « Schema is too complex for compilation » → 400 ; refus sous sortie structurée : 200, **facturé**, sortie hors schéma possible ; demander un raisonnement pas à pas dans un champ peut déclencher `reasoning_extraction` ;
- plafond du palier : 429 `rate_limit_error`, `error.details.error_code` = `enforced_spend_limit_reached`, sans `retry-after` ; limite fixée par l'utilisateur : 400 `invalid_request_error`, message qui commence par « You have reached your specified API usage limits » ou « You have reached your specified workspace API usage limits » ;
- 409 `conflict_error` ; 413 renvoyé par Cloudflare avant l'API ; un SDK non-streaming refuse localement un `max_tokens` dont la durée prévue dépasse 10 min ;
- `inference_geo` hors de `allowed_inference_geos` de l'espace : « returns an error » (statut non dit) ; limites de débit partagées entre `us` et `global` ; prix ×1,1 en `us`, sur toutes les catégories de tokens ;
- Haiku 5.5 : `thinking: {type: "disabled"}` accepté jusqu'à l'effort `high` (400 à `xhigh` et `max`) ; blocs `thinking` vides par défaut (`display: "omitted"`) ; `temperature` seulement 1, `top_p` seulement 0,99, jamais les deux, `top_k` jamais ;
- catégories de refus documentées pour Haiku 5.5 : `cyber`, `bio`, `frontier_llm`, `general_harms` (skill et page de prompting) ; `reasoning_extraction` n'est citée que par les pages générales : 4 ou 5, toujours non tranché.

**Écart à signaler, sans le trancher** : le [D] dit « crédit API mensuel de l'abonnement Max, sans report » ; la Console montre un **crédit promotionnel** de 100 $ accordé le 2026-10-17, qui expire le 2026-11-12 (UTC). Conséquences consignées comme faits : E5.15 et E5.16 se font avant le 2026-11-12 ; le renouvellement après cette date n'est pas observé (à relever alors). La date coïncide avec l'entrée en vigueur de la liste des pays et de l'AUP (2026-11-12).

#### Étapes d'exécution (après approbation)

1. **Consigner les relevés** (datés 2026-10-19, par l'utilisateur), sans nouveau [D] :
   - `conception/annexe-ia-anthropic.md` §8 : la ligne « Console, à relever » devient les relevés ; « Non vérifié » perd la conservation (« On · 30 days », pas de ZDR) ; ajout de l'écart du crédit promotionnel ; les faits nouveaux ci-dessus vont en §1 et §3, avec leurs liens et leur confiance ;
   - `conception/stack-technologique.md` §3 : « Fin du cycle : à relever » → crédit promotionnel, expiration 2026-11-12 ; « Palier réel : à relever » → Start, 1 000 RPM, 2 M ITPM, 400 K OTPM, plafond 500 $ ; espace `grading_system` à 10 $ par mois (remise à zéro le 1er), alertes à 5 et 8 $ ; conservation affichée « On · 30 days », pas de ZDR ; `inference_geo` autorisé `us` seulement, défaut `us`, région de l'espace United States ; programme partenaire non rejoint, retours désactivés. §5 : la ligne « relevés de la Console » devient « faite le 2026-10-19 », reste : conditions acceptées, expiration de la clé (E5.15).
2. **Réécrire le plan d'E5** (`partir-de-l-enqu-te-witty-eagle.md`) selon les sections ci-dessous ; sections inchangées : §6, §8, §12. « Changement de prestataire » et « Écart appliqué en E5.3 » passent sous « Historique ».
3. `conception/prompts-implementation.md` : sous E5.11, « Fait le 2026-10-19 » ; `CLAUDE.md` « État » : E5.11 fait, prochain E5.12.
4. Commit sur `preview`, sans pousser.

Pas de code, pas de `.env*`, aucun appel d'API.

---

### Contenu révisé du plan d'E5

#### Contexte (révisé)

Inchangé dans son objet. « Ce qui existe » gagne : E5.2 à E5.7 livrés ; `openrouter.ts` en place jusqu'à E5.13 ; `ai_provider` = `simulator` | `openrouter` jusqu'à `0012` ; `AI_CALL_TIMEOUT_MS` = 120 000, `AI_TRIAL_PAUSE_MS` = 4 000, `AI_DAILY_REQUEST_LIMIT` = 50 (quota d'OpenRouter) dans `provisional.ts`.

**Faits d'Anthropic** : renvoi à `annexe-ia-anthropic.md` (§1 modèle, §3 erreurs et limites, §5 SDK, §8 Console). Les faits d'OpenRouter passent en historique (commit `85b60c4`).

#### §1. Rubrique et note

Inchangé, sauf la procédure « Activer l'envoi réel à l'IA » : `AI_PROVIDER=anthropic`, `GRADING_ANTHROPIC_API_KEY` [P] ; aucune variable `ANTHROPIC_*` ni `NODE_DEBUG` ; contrôles de la Console ; réécrite en E5.15. `decisions.ts` : voir §9.

#### §2. Tables et contraintes (révisé)

- **Migration `0012_add_anthropic_and_refused`** (E5.12, `db:generate -- --name=add_anthropic_and_refused`), en **ajouts seulement** : `ALTER TYPE ai_provider ADD VALUE 'anthropic'` et `ALTER TYPE evaluation_error ADD VALUE 'refused'` (drizzle-kit peut écrire `BEFORE 'not_json'` : sans effet sur les lignes). Le SQL est montré avant `db:migrate`. Rien d'autre : ni colonne, ni check, ni retrait (une valeur d'enum ne se retire pas, et les lignes `openrouter` sont immuables).
- **Listes séparées** (`src/lib/evaluation.ts`) :
  - stockée : `aiProviders = ["simulator", "openrouter", "anthropic"]`, base de l'enum ;
  - sélectionnable : `selectableAiProviders`, `["simulator", "openrouter"]` en E5.12, `["simulator", "anthropic"]` dès E5.13.
- `callErrors` gagne `refused` (donc `evaluationErrors` aussi).
- **Usage stocké** (colonnes de `0010`, inchangées) [P] : `prompt_tokens` = `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` ; `completion_tokens` = `output_tokens` (réflexion comprise) ; `total_tokens` = leur somme. Le détail du cache et `inference_geo` restent en mémoire, pour l'essai (E5.14), sans colonne.
- `provider_answered` : toujours nul avec Anthropic (aucun champ équivalent).
- La catégorie d'un refus n'est pas stockée : seulement `refused` dans `attempt_errors`.

#### §3. Interface, simulateur, adaptateur Anthropic (révisé)

**Types** (`types.ts`, E5.13 ; E5.12 n'ajoute que l'optionnel `usage` sur l'erreur) :
```ts
type Generation = { effort: "low" | "medium" | "high" | "xhigh" | "max"; thinking: "adaptive" | "disabled"; maxOutputTokens: number };
type Usage = { inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null; cacheCreationTokens: number | null; inferenceGeo: string | null };
type EvaluationResponse = { content: string; modelAnswered: string | null; providerAnswered: null; stopReason: string | null; usage: Usage | null };
class EvaluatorError extends Error { kind: CallError; retryAfterMs?: number; providerCode?: string; stopReason?: string; usage?: Usage }
```
`EvaluatorError` garde un message fixe par `kind` (ajout de `refused` : « The AI declined to evaluate this text. ») et aucune `cause`. `evaluate.ts` ajoute l'`usage` d'une erreur au cumul (un refus est facturé), E5.12.

**Sélection** : `selectEvaluator` admet `simulator` (ou vide) et `anthropic` (dès E5.13) ; `openrouter` et `mistral` deviennent des valeurs refusées, jamais un repli. `anthropic` exige `GRADING_ANTHROPIC_API_KEY` non vide, lue par `index.ts` sous ce nom seul et passée explicitement. Commandes : `--provider anthropic`, `AI_PROVIDER` ignoré (inchangé).

**Simulateur** (E5.12) : nouvelles pannes, chacune avec son `kind` et son code, sans passer par un classeur de statut :
- `{ kind: "refusal", category: string | null }` → `refused`, `providerCode` `refusal/<catégorie|null>`, `stopReason: "refusal"`, un `usage` fictif ;
- `"max_tokens"` → réponse 200 au JSON coupé, `stopReason: "max_tokens"`, laissée au validateur (`not_json`) ;
- `{ kind: "error", status: 529 }` → `unavailable` ; `402` → `configuration` (`billing_error`) ; `"spend_limit"` → `configuration`, `providerCode` `invalid_request_error/spend_limit`.
- `ai:evaluate --simulate` gagne `refusal`, `max_tokens`, `overloaded`, `billing`, `spend_limit`.

**Adaptateur** `src/server/ai/anthropic.ts` (E5.13), seul fichier qui importe `@anthropic-ai/sdk`, épinglé à `0.135.0` exactement. `createAnthropicEvaluator({ apiKey, fetcher?, journal?, callTimeoutMs?, env? })`, `fetcher` et `journal` injectés par les tests seulement.

1. **Démarrage refusé** (`AiConfigurationError`, noms de variables seulement) : `NODE_DEBUG` défini, ou toute variable dont le nom commence par `ANTHROPIC_` (`ANTHROPIC_CUSTOM_HEADERS` est lue par le SDK sans option pour l'éviter, annexe §5) ; clé vide ou blanche ; durée invalide ; effort `xhigh`/`max` avec `thinking` `disabled`. Le contrôle des variables est refait à chaque appel (peu coûteux ; une variable ajoutée après le démarrage ne passe pas).
2. **Un client par appel** [P], construit dans `evaluate()` :
   ```ts
   new Anthropic({
     apiKey: key, authToken: null, webhookKey: null, baseURL: "https://api.anthropic.com",
     maxRetries: 0, timeout: callTimeoutMs, logLevel: "off", logger: SILENT, openTelemetry: false,
     fetch: guardedFetch(subjectId, state), fetchOptions: { cache: "no-store" },
     defaultHeaders: { "User-Agent": null, /* les 8 X-Stainless-* */ },
   });
   ```
   **Le sujet du journal** est capturé par la fermeture de `guardedFetch` : pas d'état partagé entre appels simultanés (E6), pas d'en-tête porteur d'identifiant, pas d'`AsyncLocalStorage`. Jamais `profile`, `config`, `credentials`, `middleware`, `messages.parse`.
3. **`guardedFetch(url, init)`** (appelé par le SDK avec l'`init` définitif) :
   - refuse (erreur interne marquée, rien de journalisé ni envoyé) tout ce qui n'est pas `POST https://api.anthropic.com/v1/messages`, et un corps dont les clés sortent de la liste du §4 ;
   - ne transmet que 4 en-têtes, par liste blanche : `x-api-key`, `anthropic-version`, `content-type`, `accept` ; tout autre (User-Agent, X-Stainless-*, `traceparent`, `authorization`, `anthropic-beta`, ceux d'`ANTHROPIC_CUSTOM_HEADERS`) est retiré ;
   - journalise `ai_request_sent` (sujet de la fermeture) **avant** l'envoi ; si le journal lève, `state.journalFailed = true`, puis relève ;
   - envoie `new Request(url, { method, headers, body, signal: init.signal, cache: "no-store" })` par `fetcher` ou par `globalThis.fetch` **lu à l'appel** (la garde réseau des tests le remplace ; un client construit avant elle reste bloqué).
4. **Échec du journal** : le SDK en fait une `APIConnectionError` ; l'adaptateur lit `state.journalFailed` et lève une `AiJournalError` (pas une `EvaluatorError`), que `evaluate.ts` range en `internal`, sans relance. Jamais `unavailable`.
5. **Délai** : `deadline = AbortSignal.any([signal, AbortSignal.timeout(callTimeoutMs)])`, passé par appel (`messages.create(body, { signal: deadline, maxRetries: 0 })`) ; `untilDeadline(...)` borne aussi la lecture du corps (le délai du SDK s'arrête aux en-têtes, annexe §5). Délai épuisé avant l'envoi → `timeout`, rien ne part.
6. **Réponse** (`readMessage`) :
   - pas un objet `type: "message"` → `unavailable` ;
   - **`stop_reason` lu avant le contenu** : `refusal` → `EvaluatorError("refused")`, `providerCode` = `refusal/` + catégorie filtrée par `IDENTIFIER` (`null` si absente ou non conforme), avec `stopReason` et `usage` (facturé) ; `end_turn` et `max_tokens` → contenu, laissé au validateur ; toute autre valeur → `unavailable` [P] ;
   - contenu = concaténation des seuls blocs `type: "text"` ; `thinking` et `redacted_thinking` ignorés, jamais stockés ni affichés ;
   - `modelAnswered` = `model` s'il est une chaîne ; `providerAnswered` = `null` ; `usage` depuis `usage` (entiers ≥ 0, sinon nul ; `inference_geo` filtré par `IDENTIFIER`).
7. **Erreurs** (`errors.ts`, réécrit ; gardés : `parseRetryAfter`, `IDENTIFIER`, messages fixes). Classées par statut, `error.type` et `error.details.error_code` filtrés, jamais par le message stocké. Le message n'est lu que pour comparer un **début documenté**, puis oublié :

   | Cas | Classe | `providerCode` |
   |---|---|---|
   | 400 dont le message commence par « You have reached your specified (workspace )API usage limits » | `configuration` | `invalid_request_error/spend_limit` |
   | 400 dont le message commence par « Your credit balance is too low » (statut non documenté) | `configuration` | `<type>/credit_exhausted` |
   | 400 autre, 401, 402, 403, 404 | `configuration` | `<type>` |
   | 429 avec `error_code` `enforced_spend_limit_reached` | `configuration` | `rate_limit_error/enforced_spend_limit_reached` |
   | 429 autre | `rate_limited` (`retry-after`) | `rate_limit_error` |
   | 504, délai local, abandon | `timeout` | |
   | 409, 500, 529, autre 5xx, connexion, 200 qui n'est pas un message | `unavailable` | `<type>` s'il y en a un |
   | 413, autre 4xx | `rejected` | `<type>` |
   | `stop_reason: "refusal"` (200) | `refused` | `refusal/<catégorie>` |

   Le message d'erreur du SDK contient le corps (annexe §5) : l'erreur du SDK ne quitte jamais `anthropic.ts`. `request-id` : affiché par les commandes en cas d'échec, jamais stocké [P].

**Point d'envoi unique** (`tests/ai-send-point.test.ts`, E5.13) : seul `anthropic.ts` importe `@anthropic-ai/sdk` et cite `api.anthropic.com` ; `openai`, `@mistralai/*`, `@openrouter/*` et les autres paquets d'IA restent interdits ; `package.json` porte `"@anthropic-ai/sdk": "0.135.0"` sans `^` ni `~`, et `package-lock.json` résout cette version.

**ESLint** : une seule définition de `no-restricted-imports`, construite depuis une table `{ motif, fichiers admis }` (motif `@/server/db` → `src/server/data/**`, `src/server/db/**` ; motif `@anthropic-ai/**` → `src/server/ai/anthropic.ts`). Le fichier de config en dérive un bloc général (tous les motifs) et, pour chaque groupe de fichiers admis, un bloc qui garde tous les autres motifs : aucun bloc ne retire en silence le motif d'un autre (en configuration plate, le dernier bloc remplace la règle entière). `tests/` reste exempté du seul motif de la base. **Contre-épreuve** : `tests/eslint-restrictions.test.ts` lance `ESLint.lintText` sur des fichiers fictifs : SDK importé depuis `src/server/data/x.ts`, `src/app/x.ts` et `tests/x.ts` → erreur ; base importée depuis `src/server/ai/anthropic.ts` → erreur ; base depuis `src/server/data/x.ts` et SDK depuis `anthropic.ts` → aucune erreur.

**Essai de connexion** (`ai:trial` sans `--set`) : requête fixe du script, sans `temperature`, par `--provider anthropic` ; affiche modèle, `stop_reason`, usage, coût estimé ; en cas d'échec, seulement `kind`, `providerCode`, statut et `request-id`.

#### §4. Constructeur de requête (révisé)

Liste blanche, cadre JSON, message système : inchangés. **`PROMPT_VERSION = "evaluation-2"`** (E5.13) ; les changements se limitent à :
- `generation` = `{ effort: AI_EFFORT, thinking: AI_THINKING, maxOutputTokens: AI_MAX_OUTPUT_TOKENS }` ;
- `level` : `{ type: "integer", enum: [0, 1, 2, 3, 4] }` dans `OUTPUT_SCHEMA`.

Rien d'autre : ni `minItems`, ni nouveau champ. `schemaName` reste dans l'empreinte mais n'est pas envoyé (`output_config.format` n'a pas de nom). Le test d'empreinte vérifie aussi qu'aucune clé ni aucun texte de la requête (système, schéma) ne contient « reasoning » (catégorie de refus `reasoning_extraction`).

**Corps envoyé** (`bodyOf`, `anthropic.ts`), clés exactes :
```ts
{ model: AI_MODEL, max_tokens, system, messages: [{ role: "user", content: user }],
  output_config: { format: { type: "json_schema", schema }, effort },
  thinking: thinking === "adaptive" ? { type: "adaptive", display: "omitted" } : { type: "disabled" },
  inference_geo: AI_INFERENCE_GEO }
```
Jamais `temperature`, `top_p`, `top_k`, pré-remplissage (dernier message `assistant`), `metadata`, `tools`, `tool_choice`, `stream`, `cache_control`, `stop_sequences`, `service_tier`, `fallbacks` (aucun repli pour Haiku 5.5). `guardedFetch` refuse un corps qui sort de ces clés.

#### §5. Contrat de sortie (révisé)

Validateur et citations inchangés (`output.ts`, `quotes.ts`, seul juge du fond). Le schéma envoyé gagne l'`enum` des niveaux ; `minimum`/`maximum`/`minLength` restent interdits par l'API. Une sortie de `stop_reason: "max_tokens"` passe au validateur : `not_json` ou `schema`, relancée comme toute sortie rejetée (au plus `AI_MAX_ATTEMPTS`).

**Tentatives** : `refused` rejoint l'arrêt immédiat (`configuration`, `rejected`) : jamais relancé automatiquement ; la relance manuelle (transition 6, E6) reste permise. `configuration` couvre tous les cas de budget : jamais relancés.

#### §7. Traitement (révisé)

Inchangé, sauf : l'`usage` d'une `EvaluatorError` (refus) entre dans le cumul ; une `AiJournalError` finit en `internal` ; l'arrêt quotidien compte toujours `ai_request_sent` du jour UTC (`countAiRequestsToday`), contre `AI_DAILY_REQUEST_LIMIT` [P] (garde des commandes, plus un quota de prestataire).

**Lanceur des jeux** : la pause et la limite viennent de §9 ; le rapport (E5.14) donne par exécution `stop_reason`, usage, coût estimé, refus par catégorie (`null` compris), la dispersion des niveaux par critère sur N exécutions, la version de rubrique lue (plus « en-1 » en dur) ; le premier appel d'une exécution est signalé (grammaire compilée au premier usage, gardée 24 h). `--limit <n>` ; jeu `sensitive` (3 textes fictifs : accident, guerre, santé), compris dans `all` ; jeux 10 + 7 intacts.

#### §9. Configuration, environnement, textes (révisé)

**`decisions.ts`** : `GRADE_SCALE` et la règle de Q1 (inchangés) ; `AI_MODEL = "claude-haiku-5-5"` [D, 2026-10-19] ; `AI_INFERENCE_GEO = "us"` [D, 2026-10-19]. `AI_ROUTING` retiré.

**Prix (fait, ni [D] ni [P])** : `src/server/evaluation/prices.ts` (E5.14) : Haiku 5.5, par MTok, prompt ≤ 100 K : entrée 0,10 $, sortie 0,50 $, lecture de cache 0,01 $, écriture 5 min 0,125 $ ; au-delà : 0,50 / 2,50 $ ; ×1,1 pour `us` ; source [Pricing](https://platform.claude.com/docs/en/about-claude/pricing) et [data residency](https://platform.claude.com/docs/en/manage-claude/data-residency), lus le 2026-10-19. Sert au coût estimé de l'essai seulement.

**`provisional.ts`**, section « Evaluation (E5) » ; chaque valeur [P] :

| Constante | Valeur | Remarque |
|---|---|---|
| `AI_EFFORT` | `"low"` | défaut du modèle `medium` ; tâche courte et répétée ; à mesurer en E5.16 |
| `AI_THINKING` | `"adaptive"` | le modèle peut ne pas réfléchir sur un cas simple ; `display: "omitted"` ; jamais stockée |
| `AI_MAX_OUTPUT_TOKENS` | 4 000 | sortie ~950 tokens + réflexion (annexe §7) ; une troncature finit au validateur |
| `AI_CALL_TIMEOUT_MS` | 120 000 | valeur actuelle (relevée le 2026-10-17 pour OpenRouter) ; E5.16 propose la valeur d'E6 |
| `AI_DAILY_REQUEST_LIMIT` | 200 | garde des commandes par jour UTC ; E5.16 : 60 appels, 180 au pire |
| `AI_TRIAL_PAUSE_MS` | 1 000 | 1 000 RPM au palier Start : pause de prudence, plus de quota |
| nom de la clé | `GRADING_ANTHROPIC_API_KEY` | jamais `ANTHROPIC_API_KEY` (Claude Code la prendrait) |

Retirés : `AI_TEMPERATURE` (≠ 1 → 400), `AI_REASONING_EFFORT`. Inchangés : `AI_MAX_ATTEMPTS`, `QUOTE_MAX_ERROR_RATE`, `SHORT_TEXT_MIN_WORDS`, `ADVERSARIAL_MAX_LEVEL_GAP`, `AI_RETRY_DELAY_MS`, `AI_RETRY_MAX_WAIT_MS`, `AI_MAX_QUOTES_PER_CRITERION`.

**Environnement** : `vitest.config.mts` → `AI_PROVIDER: "simulator"`, `GRADING_ANTHROPIC_API_KEY: ""` (au lieu d'`OPENROUTER_API_KEY`) ; `playwright.config.ts` (`webServer.env`) idem. Garde réseau inchangée.

**Textes** : notice élève v4 en E5.15 (Anthropic, États-Unis, 30 jours, jusqu'à 2 ans pour un contenu signalé, pas d'entraînement par défaut, phrase Q10 gardée, plus rien sur OpenRouter, Phala ni ZDR) ; `STUDENT_NOTICE.version` relevée.

#### §10. Découpage (révisé)

E5.2 à E5.7 : faits (tableau gardé, en historique). Ensuite :

| Prompt | Contenu |
|---|---|
| **E5.12** | `0012` (SQL montré) ; listes stockée et sélectionnable ; `refused` (message fixe, non relancé) ; `usage` sur `EvaluatorError` et cumul dans `evaluate.ts` ; pannes du simulateur et `--simulate` ; tests. OpenRouter intact. |
| **E5.13** | SDK `0.135.0` exact ; ESLint et sa contre-épreuve ; `anthropic.ts` et `anthropic.test.ts` à la place d'`openrouter.ts` ; `errors.ts` ; types et sélection ; `evaluation-2` et empreintes ; `decisions.ts` et `provisional.ts` ; variables de Vitest et d'E2E ; `ai-send-point` ; test d'étanchéité adapté ; commandes `--provider anthropic` ; README, commentaires, état de `CLAUDE.md`. Aucun envoi réel. |
| **E5.14** | Essai instrumenté sur le simulateur : `TrialCall` (`stop_reason`, usage, `inference_geo`, code) ; coût estimé (`prices.ts`) ; premier appel signalé ; rapport par N exécutions ; `--limit` ; jeu `sensitive`. |
| **E5.15** | Notice v4 ; procédure « Activer l'envoi réel à l'IA » réécrite ; deux envois réels : essai de connexion, puis un texte par `evaluation-2` (`--set dev --limit 1`). |
| **E5.16** | Jeux `all`, `--runs 3`, sous la garde ; compte rendu dans `annexe-essais-ia.md` (section datée) et données brutes ; CA3 ; proposition d'`AI_CALL_TIMEOUT_MS` pour E6, sans l'appliquer. Avant le 2026-11-12. |
| **E5.9** | Agent relecteur ; revue étendue à l'adaptateur, à `0012` et à la notice v4. |

**Hors E5** : plafond de coût de l'application et disjoncteur (arrêt après `configuration` ou une série de `refused`) en E6 (NFR-EXP-02, avec Workflows et la durée de 300 s) ; vote k = 3 et variantes de consigne en E10 ; lecture d'image par un appel séparé en E9 (essai E9.0).

#### §11. Vérification (révisé)

**Tableau garantie → test hors réseau** (E5.13 sauf mention ; chaque contre-épreuve : retirer la protection fait échouer le test, ou le détecteur trouve un cas planté) :

| Garantie | Test | Contre-épreuve |
|---|---|---|
| Journal avant chaque envoi | `fetcher` de capture + journal espion : 1 ligne par requête, avant elle | journal qui lève → `fetcher` jamais appelé, erreur `AiJournalError` → `internal` (pas `unavailable`, une seule tentative) |
| Aucune relance cachée | une seule `Request` capturée sur 408, 409, 429, 500, 529, délai avant les en-têtes, connexion refusée, 400 avec `x-should-retry: true` | même scénario avec `maxRetries` retiré → 3 requêtes |
| Durée bornée, lecture comprise | corps qui cale après les en-têtes → `timeout` dans le délai | sans `untilDeadline`, le test dépasse son délai |
| Variables refusées | environnement piégé : `ANTHROPIC_API_KEY`, `_AUTH_TOKEN`, `_BASE_URL`, `_LOG=debug`, `_CUSTOM_HEADERS`, `ANTHROPIC_OPEN_TELEMETRY*`, `NODE_DEBUG` → `AiConfigurationError` nommant la variable, sans sa valeur | environnement propre → démarre |
| `fetch` lu à l'appel | client construit avant la garde réseau → appel bloqué par la garde | — (la garde enregistre l'appel bloqué) |
| Hôte, méthode, en-têtes, corps exacts | `POST https://api.anthropic.com/v1/messages` ; en-têtes exactement `accept`, `anthropic-version`, `content-type`, `x-api-key` ; clés du corps exactes (§4) | `guardedFetch` appelé sur une autre URL ou avec une clé de corps interdite → refus, rien journalisé |
| Clé passée, jamais lue | `x-api-key` porte la clé passée ; aucune autre en-tête ne la porte | — |
| Aucune écriture console | espions sur `console.*`, `stdout`, `stderr` pendant succès et échecs | — |
| Erreurs sans contenu | marqueur dans `error.message`, `error.details` et un 200 cassé : absent du message, de `util.inspect`, de `providerCode`, du journal et de la base | le détecteur trouve le marqueur placé dans `providerCode` d'une erreur fictive |
| Chaque ligne du tableau d'erreurs | un cas par ligne (§3.7), budget compris | — |
| Refus et troncature | `refusal` (catégorie nommée, `null`, non conforme) → `refused`, code filtré, usage porté ; `max_tokens` → validateur ; bloc `thinking` avant le texte → texte seul | — |
| Version exacte | `package.json` et lock à `0.135.0` | `^0.135.0` ou `~` dans une copie du manifeste → échec |
| Imports | `ai-send-point` et ESLint | cas fictifs (§3) |

**Étanchéité** (`tests/evaluation-leak.int.test.ts`, E5.13) : montage inchangé (marqueurs, `submitText`, vrai adaptateur, `fetcher` de capture) ; en-têtes exactement les 4 ; la clé dans `x-api-key` seulement ; `anthropic-version` vérifié égal à `2023-06-01`, puis exclu, avec `x-api-key`, du contrôle `ANY_ID_OR_DATE` (expression inchangée : la date de version la déclencherait) ; clés exactes du corps et du message utilisateur ; aucun `metadata` ; A1 = C1 (deux `Request` égales). Le contrôle négatif garde l'URL `api.anthropic.com`.

**Unitaires et intégration hérités** : inchangés, sauf `index.test.ts` (`anthropic`, `openrouter` refusé), `errors.test.ts`, `evaluation.int` (refus : `failed`, une tentative, `refused` ; usage cumulé), empreinte d'`evaluation-2`.

**E5.12** : `npm test` ; `ai:evaluate --simulate refusal` → « Evaluation failed », `refused`, une tentative.
**E5.13** : `npm test` et E2E hors réseau ; `ai:evaluate` sur le simulateur → « To review » ; `--provider openrouter` refusé ; `src/` ne cite plus OpenRouter hors l'enum stocké et la notice v3.
**E5.15** (manuel) : deux réponses conformes, `claude-haiku-5-5`, `inference_geo` `us`, usage et coût ; deux lignes `ai_request_sent` ; requêtes visibles dans l'espace `grading_system`.
**E5.16** : compte rendu ; coût de la Console du même ordre que le coût calculé.

#### Valeurs à consigner (révisé)

- **[D] codées** : Q1 ; `AI_MODEL` `claude-haiku-5-5` et `AI_INFERENCE_GEO` `us` (2026-10-19) ; texte de `en-1` (2026-10-16).
- **Faits rangés** : prix publiés (source, 2026-10-19) ; relevés de la Console (2026-10-19).
- **[P]** : valeurs E5 de `provisional.ts` (§9) ; nom de la clé ; un client par appel et le sujet capturé par fermeture ; liste blanche de 4 en-têtes et des clés du corps, refus d'autre chose dans `guardedFetch` ; toute variable `ANTHROPIC_*` refusée, contrôle à chaque appel ; `AiJournalError` → `internal` ; tableau des erreurs (budget par début de message documenté, rien de stocké ; `stop_reason` inattendu → `unavailable`) ; `refused` non relancé ; usage stocké par sommes dans les colonnes existantes ; catégorie de refus non stockée ; `request-id` affiché, non stocké ; `display: "omitted"` explicite ; ESLint dérivé d'une table ; plus les [P] antérieurs (encodage JSON, citations, alertes, triggers, `superseded`, pages Rubric, inventaire des scripts, `procedures.md`).
- **Limites assumées** : EVL-02 R4, Q10, EVL-03 R4 ; plus de ZDR, contenu signalé gardé jusqu'à 2 ans (le jeu adverse peut l'être) ; sans température, la stabilité se mesure ; textes d'adultes ; propositions du simulateur permanentes sur la base dev.
- **Fiche DON-02** : celle d'Anthropic (`stack-technologique.md` §3) ; sous-traitants à définir ; transfert à confirmer par la CNDP ou un juriste. Fiches Mistral et OpenRouter : sans objet.
- **Plus tard** : E6 (plafond de coût, disjoncteur, durée sur Vercel) ; E9 (lecture) ; E10 (vote, variantes, journaux propres, relecture du diff du SDK à chaque montée de version).

#### Historique (déplacé)

« Écart appliqué en E5.3 » et « Changement de prestataire (2026-10-16 ; E5.4b, 2026-10-17) » gardés tels quels sous ce titre, suivis d'une ligne : « Remplacé le 2026-10-19 par Anthropic (E5.10), appliqué en E5.12 à E5.13. »

#### Vérification d'E5.11

- `git diff --stat` : seuls `conception/annexe-ia-anthropic.md`, `conception/stack-technologique.md`, `conception/prompts-implementation.md`, `CLAUDE.md` changent dans le dépôt (le plan est hors dépôt) ; aucun fichier de `src/`.
- Grep de « OpenRouter|openrouter » dans le plan révisé : seulement en historique, dans la liste stockée et dans l'état « jusqu'à E5.13 ».
- Chaque relevé de la Console est daté et attribué à l'utilisateur ; aucun nouveau [D].

## Approved plan: `plan-e5.4b-openrouter-history.md` (verbatim)

### E5.4b — Adaptateur OpenRouter : révision du plan d'E5 et plan d'exécution

#### Contexte

Mistral est abandonné [D, 2026-10-16] : son offre Free n'active pas les clés d'API. L'utilisateur a choisi le modèle gratuit `xingchen-agi/xing4.0-29b-a4b:free` [D, 2026-10-17]. Ce prompt remplace l'adaptateur derrière l'interface `Evaluator`, retire toute trace de `mistral` avant la migration `0010` (E5.5) et réécrit la notice élève (v3). L'interface, le simulateur, le constructeur, le journal et le test d'étanchéité restent ; seuls l'adaptateur, la sélection, les erreurs et les textes changent.

**Faits vérifiés le 2026-10-17** (API publique et documentation, lues en extraction) :
- **Modèle** ([`/models/…/endpoints`](https://openrouter.ai/api/v1/models/xingchen-agi/xing4.0-29b-a4b:free/endpoints)) :
  - un seul endpoint, **Phala**, présent dans [`/endpoints/zdr`](https://openrouter.ai/api/v1/endpoints/zdr) ;
  - paramètres pris en charge : `response_format`, `structured_outputs`, `reasoning`, `temperature`, `max_tokens` ;
  - `expiration_date: null` ; `canonical_slug` : `…-20261015`. L'identifiant `:free` ne porte donc pas de date : OpenRouter peut le faire pointer ailleurs ;
  - raisonnement **activé par défaut**, non obligatoire.
- **Raisonnement** ([doc](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)) : `reasoning: { effort: "none" }` le désactive. Il partage sinon le budget `max_tokens`.
- **Routage** ([doc](https://openrouter.ai/docs/guides/routing/provider-selection)) : `require_parameters` vaut `false` par défaut ; `zdr: true` restreint aux endpoints ZDR. Le ZDR ne couvre pas les plugins ([ZDR](https://openrouter.ai/docs/guides/features/zdr)) : on n'en envoie aucun.
- **Réponse** ([doc](https://openrouter.ai/docs/api_reference/overview)) : `model` documenté ; **aucun champ `provider` documenté** en non-streaming, alors que l'exemple d'erreur en streaming en porte un. On le lit s'il est présent, et l'essai tranche la question.
- **Erreurs** ([doc](https://openrouter.ai/docs/api_reference/errors-and-debugging)) :
  - le corps est `{error:{code,message,metadata?}}` ;
  - `metadata.error_type` est un code stable, et `provider_code` le code amont ;
  - `metadata.raw` et `moderation.flagged_input` peuvent contenir notre entrée ;
  - une réponse 200 peut porter une `error` en tête (sans `choices`), ou un choix en `finish_reason: "error"` avec un contenu partiel ;
  - `Retry-After` peut accompagner un 429 ou un 503.
- **OpenRouter** ([collecte](https://openrouter.ai/docs/guides/privacy/data-collection)) :
  - ne garde pas le contenu par défaut, mais garde des métadonnées (tokens, latence…) ;
  - échantillonne quelques prompts pour les classer, de façon anonyme, par un modèle ZDR ; ni volume ni durée ne sont donnés.

#### 1. Révision du plan d'E5 (`~/.claude/plans/partir-de-l-enqu-te-witty-eagle.md`), faite en premier

- **En-tête « Faits du SDK »** : il devient « Faits d'OpenRouter » et reprend les faits ci-dessus. Les faits Mistral sont renvoyés à l'historique.
- **§1 Procédures** : la procédure « Activer l'envoi réel à Mistral » devient « Activer l'envoi réel à l'IA » ; `AI_MODEL` vaut l'identifiant ci-dessus [D, 2026-10-17].
- **§2** :
  - `ai_provider` : `simulator`, `openrouter` ;
  - `evaluation_runs` gagne `provider_answered` (text, nul si inconnu ou sans appel) à côté de `model_answered` ;
  - `providerCode` n'est pas stocké : il ne sert qu'à l'affichage de l'essai.
- **§3** : il est réécrit selon le §2 de ce plan. L'écart d'E5.3 (journal dans l'adaptateur, `subjectId`) y est intégré.
- **§5 Tentatives** : `timeout` comprend désormais le 408.
- **§7 E5.7** : quota de 20 requêtes par minute et 50 par jour UTC, tentatives comprises. Les jeux et `--runs` sont dimensionnés pour tenir sous 50, sur un ou plusieurs jours, et le rapport compte les requêtes.
- **§9** :
  - `decisions.ts` : `AI_MODEL` et `AI_ROUTING` ;
  - `AI_REASONING_EFFORT` : la remarque devient « le modèle raisonne par défaut ; le raisonnement partage `max_tokens` ». La valeur ne change pas, donc l'empreinte de `evaluation-1` non plus ;
  - environnement : `OPENROUTER_API_KEY: ""` dans Vitest et Playwright ;
  - textes : notice v3.
- **§10** : ligne E5.4b ; E5.5 crée `provider_answered` ; E5.7 tourne avec OpenRouter.
- **§11** : il reprend la vérification du §5 de ce plan.
- **Valeurs à consigner** :
  - `AI_MODEL` [D, 2026-10-17] ;
  - `zdr` et `require_parameters` [D, demande de l'utilisateur] ;
  - [P] : `fetch` sans SDK, aucun en-tête d'attribution ni champ `user` (le fournisseur voit le compte), `NODE_DEBUG` refusé, `allow_fallbacks` laissé par défaut (entre endpoints ZDR seulement), classement des erreurs (403 et 402) ;
  - fiche DON-02 : OpenRouter et Phala.
  - Le SDK 2.7.0 et la fiche Mistral sortent de la liste.
- **« Changement de prestataire »** : il est marqué « appliqué en E5.4b, 2026-10-17 ».

#### 2. Adaptateur (`src/server/ai/openrouter.ts`, remplace `mistral.ts`)

**Client : `fetch` natif, sans bibliothèque** [P].
- Le SDK `openai` lit seul `OPENAI_API_KEY`, `OPENAI_BASE_URL` et `OPENAI_LOG`, relance 2 fois par défaut, et ajoute des en-têtes `X-Stainless-*` (OS, architecture, version).
- `fetch` n'ajoute que des en-têtes génériques (`user-agent: node`, `accept*`), ne lit aucune clé et a zéro dépendance.
- Le projet n'a ni `instrumentation.ts` ni `logging.fetches` : le `fetch` de Next ne trace rien. On passe tout de même `cache: "no-store"`.

**`createOpenRouterEvaluator({ apiKey, fetcher?, journal?, callTimeoutMs?, env? })`** : même forme que l'actuel.
- **Démarrage refusé** si `NODE_DEBUG` est défini, quelle que soit sa valeur : il fait écrire `http` et `undici`. Refus aussi si la clé est vide ou blanche, ou si la durée est invalide.
- **Envoi** : `POST https://openrouter.ai/api/v1/chat/completions` (constante).
  - En-têtes **exactement** `Authorization: Bearer <clé>` et `Content-Type: application/json`.
  - Corps :
    ```json
    { "model": AI_MODEL, "messages": [system, user], "temperature", "max_tokens", "reasoning": { "effort" },
      "response_format": { "type": "json_schema", "json_schema": { "name", "strict": true, "schema" } },
      "provider": AI_ROUTING, "stream": false }
    ```
  - `AI_ROUTING = { require_parameters: true, zdr: true }` (`decisions.ts`, gelé). Le modèle a un endpoint ZDR, donc pas de `data_collection`. Un commentaire dit la règle : sans endpoint ZDR, `data_collection: "deny"`.
  - Jamais `user`, `models`, `plugins`, `metadata`, `transforms`, `debug`, `HTTP-Referer`, `X-Title`, `X-OpenRouter-Title` ni `X-OpenRouter-Categories`.
- **Ordre** :
  1. `deadline = AbortSignal.any([signal, AbortSignal.timeout(callTimeoutMs)])` ;
  2. `await journal(subjectId)`. S'il échoue, son erreur remonte telle quelle et le `fetcher` n'est jamais appelé ;
  3. si le délai a expiré pendant le journal : `timeout`, rien ne part ;
  4. `fetcher(new Request(url, { method, headers, body, signal: deadline }))`, puis `await response.text()`, sous le même signal. La lecture du corps est donc bornée.
- **Lecture d'une réponse 200** : JSON, puis contrôles dans cet ordre :
  1. une `error` en tête : classée par `error.code` (table ci-dessous) ;
  2. `choices[0].error` présent, ou `finish_reason === "error"` : classé par le code, et le contenu partiel est jeté ;
  3. `finish_reason === "content_filter"` ou `message.refusal` : `rejected` ;
  4. pas de `choices[0].message` : `unavailable`.

  Sinon, on renvoie :
  - `content` : une chaîne, ou les morceaux `text` ; `message.reasoning` est ignoré ;
  - `modelAnswered` : `model` ;
  - `providerAnswered` : `provider` s'il est une chaîne au format d'identifiant (règle `IDENTIFIER`), sinon `null` ;
  - `usage` : `prompt_tokens`, `completion_tokens`, `total_tokens`.

  `finish_reason: "length"` est laissé au validateur d'E5.5 (sortie tronquée, donc rejetée).
- **Classement** (`errors.ts`, `errorForStatus` revu), sans jamais garder `message`, `raw` ni `moderation` :

  | Statut ou code | Classe |
  |---|---|
  | abandon, délai, 408 | `timeout` |
  | 429 | `rate_limited` (`Retry-After`) |
  | 401, 404 | `configuration` |
  | 402 (solde négatif) | `configuration` |
  | 403 avec `metadata.limit_source` (budget) | `configuration` |
  | 403 sans (modération, garde-fou) | `rejected` |
  | 400, autre 4xx | `rejected` |
  | 500, 502, 503, autre 5xx, réseau | `unavailable` |
  | 200 illisible (non JSON) | `unavailable` |

  `providerCodeOf(body)` lit `error.metadata.error_type` et `error.metadata.provider_code` (nombre converti en chaîne), joints par `/`, chacun filtré par `IDENTIFIER`. Ce n'est jamais `code` seul : le statut le donne déjà.
- **`types.ts`** :
  - `EvaluationResponse` gagne `providerAnswered: string | null` (le simulateur renvoie `null`) ;
  - les commentaires de `providerCode` et de l'en-tête sont mis à jour ;
  - `AiProvider` vient de `aiProviders = ["simulator", "openrouter"]` (`src/lib/evaluation.ts`).

#### 3. Sélection, essai, retrait de Mistral

- **`index.ts`** : `AI_PROVIDER` vaut `""`, `simulator` ou `openrouter` ; `openrouter` exige `OPENROUTER_API_KEY` non vide. `mistral` devient une valeur inconnue, donc une erreur.
- **`scripts/ai-trial.ts`** : en-tête, message d'envoi, ligne « Provider answered: … (not said) » et `[OpenRouter: code]`.
- **Retrait** :
  - `npm uninstall @mistralai/mistralai` dans le conteneur, avec le lock à jour ;
  - suppression de `mistral.ts` et de `mistral.test.ts` ;
  - `git grep -i mistral` ne doit plus rien trouver dans `src/`, `tests/`, `scripts/`, `e2e/`, les configurations et `package*.json`.
- **Commentaires** à mettre à jour : `types.ts`, `errors.ts`, `tests/helpers/imports.ts`, `tests/setup/network-guard.ts` et `tests/network-guard.test.ts` (URL d'exemple).

#### 4. Notice élève v3 (`src/lib/texts.ts`), à approuver par l'utilisateur

`version: 3`. Le commentaire dit sur quoi repose chaque phrase (ZDR exigé par requête, liste d'OpenRouter, pages lues le 2026-10-17) et que tout changement de modèle ou de routage relève la version. Section « What is sent to an AI » :

1. « Your text, the assignment's subject, instructions and language, and the marking rubric are sent to OpenRouter, an outside service based outside Morocco. OpenRouter passes them to the company that runs the AI model (currently Phala). Where that company processes them is not known. »
2. « The app does not add your name, email or class. But everything written in your text is sent as it is: if you write your name in it, your name is sent too. » (inchangée)
3. « The app asks OpenRouter to use only companies that, according to OpenRouter, keep nothing they receive, and so do not use it to train their models. The app cannot check this itself. »
4. « OpenRouter says it does not keep your text by default. It keeps details about each request, such as its size and time, and may look at a few texts, without linking them to the app's account, to sort them by topic. »

Les autres sections ne changent pas. Les tests qui citent la version, à commencer par `tests/notice.int.test.ts`, suivent : une lecture de la v2 redemande la v3.

#### 5. Tests et vérification

- **`src/server/ai/openrouter.test.ts`** (faux `fetcher`), qui remplace `mistral.test.ts` :
  - **Envoi** : URL, méthode, ensemble exact des en-têtes envoyés, absence des 4 en-têtes d'attribution, corps exact ; ni `user`, ni `models`, ni `plugins`.
  - **Journal** : il est écrit avant le `fetcher`. Si le journal échoue, rien ne part, et l'erreur remonte telle quelle.
  - **Délais** : un délai dépassé pendant le journal, la réponse ou la lecture du corps donne `timeout`.
  - **Erreurs** : chaque ligne du tableau a son cas, plus l'erreur en tête d'un 200, l'erreur d'un choix avec un contenu partiel, le refus et l'absence de choix.
  - **Marqueur** : un marqueur placé dans `message`, `raw` et `flagged_input` n'apparaît ni dans le message, ni dans `util.inspect`, ni dans `providerCode`.
  - **Réponse** : `modelAnswered` et `providerAnswered` sont lus ; un `provider` qui n'est pas un identifiant donne `null`.
  - **Démarrage** : refus sous `NODE_DEBUG`, avec une clé vide ou blanche.
- **`errors.test.ts`** : le format d'OpenRouter et le filtre.
- **`index.test.ts`** : les cas `openrouter`, et `mistral` refusé.
- **`tests/ai-send-point.test.ts`** :
  - implémentations : `openrouter` et `simulator` ;
  - la règle du SDK devient « aucun paquet d'IA importé » (`openai`, `@mistralai/*`, `@openrouter/*`) et « l'URL `openrouter.ai` n'apparaît que dans `openrouter.ts` », avec les cas négatifs adaptés.
- **`tests/evaluation-leak.int.test.ts`** :
  - le vrai adaptateur OpenRouter et son URL ;
  - les en-têtes exacts ;
  - CA2 inchangé ;
  - cas d'erreur : 500, 429, un 400 et un 200 en erreur dont le message renvoie l'entrée, une sortie non JSON, un abandon.
- **Configurations** : `vitest.config.mts` et `playwright.config.ts` passent à `OPENROUTER_API_KEY: ""`.
- **Commandes** :
  - `npm test` (unitaires et intégration), puis `npx tsc --noEmit` et `npm run lint` dans `web` ;
  - E2E (`docker compose run --rm e2e`), après l'intégration et jamais en même temps : la notice v3 change le parcours de première remise.
- **Manuel, par l'utilisateur** : `docker compose exec -e AI_PROVIDER=openrouter web npm run ai:trial`.
  - Attendu : un JSON conforme, le modèle qui a répondu, et le fournisseur ou « (not said) ». Le résultat est consigné au §3 de `stack-technologique.md` (le champ `provider` est-il présent ?) et au rejeu de la procédure.
  - Le journal doit montrer une ligne `ai_request_sent`, sans texte.

#### 6. Documents et fin

- **`conception/procedures.md`** : « Activer l'envoi réel à l'IA » est réécrite.
  - Conditions : `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, `NODE_DEBUG` absent.
  - Étapes : vérifier dans `/endpoints` que le modèle a encore un endpoint ZDR et pas de date de retrait ; vérifier que les réglages de confidentialité du compte n'activent pas la journalisation des prompts ; essai ; journal ; activation dans Vercel Preview.
  - Retour arrière : selon la liste, rien n'est conservé chez Phala ; OpenRouter garde les métadonnées.
  - Rejeu à dater.
- **`conception/stack-technologique.md`** :
  - §2 et §3 : modèle [D, 2026-10-17], `fetch` [P] ;
  - §5 : la ligne Mistral est retirée de « Tranché », et le choix du client est marqué fait.
- **`conception/prompts-implementation.md`** :
  - E5.4b marqué fait, avec l'identifiant ;
  - E5.7 : quota.
- **README** : « une IA (modèle gratuit via OpenRouter) ».
- **`CLAUDE.md`, « État »** : adaptateur OpenRouter en place, `AI_MODEL`, notice v3. Les lignes « encore Mistral » disparaissent.
- **`.claude/a-consigner.md`** : le point E5 renvoie à la fiche OpenRouter et Phala.
- **Commit** sur `preview`, sans pousser.
