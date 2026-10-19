# CLAUDE.md

Consignes durables pour Claude Code dans ce dépôt. Réponds en français.

## Produit

Notation de productions écrites d'élèves (anglais, français). L'élève remet un texte ou des images de sa copie ; le système transcrit sans corriger ; une IA (`claude-haiku-5-5` d'Anthropic) propose un niveau de 0 à 4 sur les 5 critères d'une rubrique fixe, avec des remarques, sans l'identité de l'élève. Le professeur relit, modifie, valide, publie ; l'élève ne voit que le publié. Acteurs : administrateur, professeur, élève. Projet académique de démonstration, données fictives, 0 MAD décaissé : l'IA est payée par le crédit API mensuel de l'abonnement Max du développeur [D, 2026-10-19].

## Suivi et branche

- Spécification dans `conception/` ; les `annexe-*` sont de la matière, pas des décisions. `fonctionnalites.md` : D1 à D10 (§1, intouchables sans demande), fonctionnalités, matrice §5.4, états §5.5, plan §8, questions §9. Aussi `besoins-non-fonctionnels.md`, `acteurs.md`, `stack-technologique.md`, `procedures.md`.
- **Prompts** : `conception/prompts-implementation.md`. L'utilisateur les lance un par un et valide chacun ; une étape E commence par un `/plan`. Ne prends pas d'avance sur le prompt suivant.
- **Branche** [D] : tout se fait sur `preview`. Fin de chaque prompt : commit sur `preview`, **sans pousser** ; pousser seulement à la demande. `main` n'avance pas.
- **T5 en attente** : `.claude/a-consigner.md`, à consigner dans `conception/` à la demande.

## État (2026-10-19)

- E1 à E4 livrées. Plans approuvés dans `~/.claude/plans/` : E3 `…typed-meerkat.md`, E4 `…happy-petal.md`, E5 `partir-de-l-enqu-te-witty-eagle.md` (révisé pour Anthropic en E5.11 : adaptateur §3, corps §4, valeurs §9, découpage E5.12 à E5.16 puis E5.9 au §10, tableau garantie → test au §11, « Valeurs à consigner », historique en fin de plan).
- **E5 en cours** : E5.0 à E5.7 faits (Mistral jusqu'à E5.3, OpenRouter depuis E5.4b) ; E5.8 : script écrit (`85b60c4`), essai non lancé, repris en E9.0 ; essai CA3 à refaire en E5.16 (`conception/annexe-essais-ia.md`). Faits durables :
  - rubrique : registre `RUBRIC_VERSIONS` (`src/lib/rubric.ts`, `en-1` = texte du client, gelée par empreinte) ; note = somme des niveaux sur 20 ;
  - `src/server/ai/` : interface `Evaluator`, simulateur à pannes (défaut partout), adaptateur réel qui journalise lui-même `ai_request_sent` avant chaque envoi ; requête : `buildEvaluationRequest` (liste blanche, `PROMPT_VERSION` figée par empreinte), `readEvaluationInput`, test d'étanchéité `tests/evaluation-leak.int.test.ts` ;
  - garanties de l'adaptateur, chacune testée avec sa contre-épreuve (`src/server/ai/anthropic.test.ts`) : journal avant envoi (rien ne part s'il échoue : `AiJournalError` → `internal`), durée bornée lecture comprise, `ANTHROPIC_*` et `NODE_DEBUG` refusés au démarrage et à chaque appel, clé jamais lue implicitement, erreurs classées sans contenu, aucune relance cachée, 4 en-têtes seulement, jamais `metadata` [P] ;
  - adaptateur OpenRouter supprimé en E5.13 ; notice élève v4 (Anthropic, États-Unis, 30 jours, 2 ans si signalé) depuis E5.15 ;
  - **E5.5 fait** : `evaluation_runs` et `ai_proposals` (`0010`), immuables par trigger (`0011`, `forbid_change`) ; validateur `src/server/ai/output.ts` et `quotes.ts` ; service `src/server/evaluation/evaluate.ts` (claim, tentatives bornées, `recordEvaluation`, résultat `stale` conservé non courant) ; seul `src/server/data/evaluation/system.ts` insère ces tables (`tests/evaluation-writes.test.ts`) ; `getCurrentProposal` ; commande `npm run ai:evaluate -- --submission|--assignment <id> [--simulate <faute>]`.
  - **E5.6 fait** : alertes (EVL-04) dans `src/server/evaluation/alerts.ts` ; bloquantes avant toute requête, `no_content` puis `rubric_unavailable` ; `very_short` sous `SHORT_TEXT_MIN_WORDS` [P] ; rubrique française `fr-test` réservée aux tests (`tests/fixtures/rubric-fr-test.ts`, injectée par `registry`).
  - **E5.7 fait (2026-10-17)** : commandes `ai:evaluate` et `ai:trial` sur le simulateur sauf `--provider <réel>` (elles ignorent `AI_PROVIDER`), arrêt quotidien compté au journal (`countAiRequestsToday`, `AI_DAILY_REQUEST_LIMIT`) ; `SCRIPTS` dans `inventory.ts` ; jeux `scripts/fixtures/ai/` (10 + 7) ; lanceur `src/server/evaluation/trial.ts`.
- **Reprise d'E5 avec Anthropic [D, 2026-10-19]** : prompts E5.10 à E5.16 puis E5.9 ; décisions dans `conception/stack-technologique.md` §3, faits et sources dans `conception/annexe-ia-anthropic.md`. E5.10 et E5.11 faits (plan d'E5 révisé pour Anthropic, relevés de la Console du 2026-10-19 : crédit promotionnel qui expire le 2026-11-12, donc E5.15 et E5.16 avant). **E5.12 fait** : `0012` (`anthropic`, `refused`) ; listes `aiProviders` (stockée) et `selectableAiProviders` (`simulator`, `openrouter` jusqu'à E5.13) dans `src/lib/evaluation.ts` ; `refused` jamais relancé, son `usage` cumulé ; pannes du simulateur sans classeur de statut (refus, `max_tokens`, 529, 402, limite de dépense). **E5.13 fait** : `src/server/ai/anthropic.ts` (un client par appel, `guardedFetch`), `errors.ts` d'Anthropic, `evaluation-2`, `AI_PROVIDER` = `simulator` | `anthropic`, commandes `--provider anthropic` ; ESLint dérivé de la table `IMPORT_RESTRICTIONS` (`tests/eslint-restrictions.test.ts`) ; aucun envoi réel. **E5.14 fait** : `TrialCall` porte `stop_reason`, usage, code fournisseur, version de rubrique, premier usage du schéma ; coût estimé par `src/server/evaluation/prices.ts` (prix lus le 2026-10-19) ; rapport : refus par catégorie, dispersion sur N exécutions ; `--limit` ; jeu `sensitive` (3 textes). **E5.15 fait** : notice élève v4 (Anthropic) ; procédure « Activer l'envoi réel à l'IA » réécrite et rejouée ; deux envois réels conformes le 2026-10-19 ; `EvaluatorError.status` affiché avec le `request-id`. Prochain : E5.16. À tenir dans le code :
  - `claude-haiku-5-5` en direct, `inference_geo: "us"` ; chaîne fixe d'appels spécialisés orchestrée par le code, ni agent ni framework ;
  - `@anthropic-ai/sdk` en version exacte `0.135.0` (`tests/ai-send-point.test.ts`), importé par `src/server/ai/anthropic.ts` seul, durci par des options explicites et le refus de variables au démarrage ; détail [P] (`annexe-ia-anthropic.md` §5), fixé au plan d'E5 (§3, révisé en E5.11), dont `messages.create` au lieu de `messages.parse` ;
  - Haiku 5.5 : aucune `temperature` (≠ 1 → 400) ; réflexion adaptative par défaut, comptée dans `max_tokens`, blocs lus par type ; refus = HTTP 200 + `stop_reason: "refusal"`, sans repli ;
  - `openrouter` reste dans l'enum stocké (lignes immuables), hors de `selectableAiProviders` ;
  - `Usage` garde les trois sommes stockées (plan §2) et un `detail` en mémoire (cache, `inference_geo`) pour l'essai (rapport et fichiers de `trial-results/`, jamais en base).
- Base dev : un compte par rôle (E1.8), migrations jusqu'à `0012`.

## Environnement

- Node uniquement dans Docker : `docker compose up` (http://localhost:3000) ; npm via `docker compose exec -T web npm …`, lancé depuis l'outil Bash (PowerShell 5.1 casse les guillemets), avec `MSYS_NO_PATHCONV=1` pour un chemin du conteneur.
- Next.js 16 (`proxy.ts`, `cacheComponents`) : lis `node_modules/next/dist/docs/` avant d'utiliser une API (`AGENTS.md`).
- Secrets : l'utilisateur crée comptes et secrets ; le code lit `process.env`. **Ne lis jamais `.env*`.** Après modification de `.env.local` : `docker compose up -d`. Clé d'Anthropic [P] : `GRADING_ANTHROPIC_API_KEY`, jamais `ANTHROPIC_API_KEY` (Claude Code la prendrait à la place de l'abonnement) ; toute variable `ANTHROPIC_*` et `NODE_DEBUG` est refusée au démarrage.
- **Tests** : `npm test` (projets `unit` et `integration`). Les `*.int.test.ts` tournent en séquence sur `DATABASE_URL_TEST`, remise à zéro et migrée. Lents (Neon `us-east-2`, ~175 ms par requête).
- **E2E** : `docker compose run --rm e2e` (serveur Next sur le port 3100, `DATABASE_URL_TEST`, email capturé). Le premier test après une modification peut dépasser 15 s : relance avant de chercher un bug. **Intégration et E2E partagent la base de test : jamais en même temps.**
- **Build** : jamais dans `web`, seulement dans `e2e` ; puis `docker compose restart web` (`next-env.d.ts` réécrit).
- Premier administrateur : `npm run admin:create -- --email … --first-name … --last-name …`.

## Architecture (`stack-technologique.md` §4)

1. Contrôle d'accès de la matrice en un point unique, dans la couche de données (SEC-01).
2. Images dans une table à part, lues par une seule route ; jamais de lien public ni dans les listes.
3. Évaluation par l'IA, lecture de l'écriture et email : chacun une interface unique avec simulateur à pannes (EXP-04).
4. Étapes de lot idempotentes, avec des identifiants seulement (PRC-01).
5. Requête à l'IA construite en un point unique, depuis une liste blanche (EVL-02).

**Accès** :
- Matrice en données (`src/server/access/matrix.ts`) ; `authorize(actor, ressource, action)` est le seul contrôle ; `ownedBy` filtre la propriété dans la requête.
- Toute table, Server Action, route ou export de `src/server/data/` s'inscrit dans `src/server/access/inventory.ts` (`tests/access-inventory.test.ts`). Une nouvelle ressource a d'abord sa ligne de matrice ; ses fonctions entrent dans `REAL` (`tests/access-matrix.int.test.ts`), où les colonnes « autre » donnent « absent », sauf `creates`.
- Ressource d'autrui : `null` comme absente ; rôle sans droit : `AccessDeniedError` ; la page répond 404 dans les deux cas.
- **404 réel** : `notFound()` sous un `Suspense` garde le statut 200. Vérifier l'accès au niveau de la page avec `export const instant = false` (modèle : `src/app/teacher/classes/[classId]/page.tsx`).

**Remises** : `src/server/data/submissions/transitions.ts` est le seul écrivain de `submissions` (`insertReceived`, `applyTransition` ; `tests/submission-writes.test.ts`). Tout changement du texte de la notice élève relève `STUDENT_NOTICE.version`.

**Classes** : lien et code jamais stockés, dérivés de `invite_nonce` et de `BETTER_AUTH_SECRET` (le changer change tous les codes) ; expiration `CLASS_INVITE_TTL` ; toute saisie passe par `tryInvite`.

**Email** : `src/server/email/` ; capture en test ; Gmail SMTP en dev si `SMTP_USER` et `SMTP_PASSWORD` existent (de vrais emails partent) ; `EMAIL_TRANSPORT=capture` force la capture.

**Authentification** : Better Auth sans gestionnaire HTTP (Server Actions → `src/server/auth/` → `src/server/data/auth/`) ; `getActor()`, `requireRole()`, `src/proxy.ts`. Liens à usage unique stockés en empreinte, consommés par POST. La déconnexion recharge la page entière.

## Base de données

- Drizzle + `pg` sur Neon ; client `src/server/db/client.ts` ; un fichier de schéma par domaine.
- **Seul `src/server/data/**` importe `@/server/db`** (ESLint). Chaque fonction reçoit l'`Actor` en premier, appelle `authorize()`, filtre par `ownedBy`, renvoie un DTO minimal. Une exception sans `Actor` est listée avec sa raison dans `inventory.ts`.
- Nommage : camelCase en TS, snake_case en SQL (`casing`, jamais écrit à la main) ; tables au pluriel ; `id uuid` ; `<entité>_id` ; `created_at`/`updated_at` en `timestamptz` ; états en `pgEnum`.
- Migrations : `npm run db:generate -- --name=<verbe_objet>`, relire le SQL (ordre : drizzle-kit place une contrainte unique après les FK qui la visent), commiter, `npm run db:migrate` sur dev. Jamais `drizzle-kit push` ; une migration commitée ne se modifie plus.
- **Deux horloges** : conteneur et Neon divergent ; une date `now()` se compare en SQL. Pour expirer une session Better Auth dans un test, la vieillir d'un jour.

## Déploiement (Vercel Hobby)

- `preview` produit la preview (publique [D], base dev) ; `main` n'est pas déployée, son build échoue exprès. Migrer dev avant de pousser.
- Variables dans Vercel, environnement Preview seulement, ajoutées par l'utilisateur. Région `cle1`. Neon se suspend après 5 min (+4 à 5 s au réveil).

## Invariants (`fonctionnalites.md` §5.3)

1. Un compte, un rôle ; l'inscription publique ne crée que des élèves ; l'administrateur crée les professeurs.
2. Toute remise appartient à un devoir reçu par l'élève.
3. Le correcteur est le professeur créateur du devoir, propriétaire des classes destinataires.
4. Ni identité de l'élève, ni niveau du devoir, ni identifiant dans l'entrée de l'IA.
5. La proposition IA est immuable ; chaque modification du professeur est journalisée.
6. La note finale peut différer de la note calculée ; l'écart est signalé au professeur.
7. Publiée implique validée ; l'élève ne lit jamais une évaluation non publiée ni la proposition brute.
8. La rubrique est en lecture seule pour tous.
9. Nom, email et classe d'un élève : visibles du seul professeur propriétaire de sa classe.
10. Un élève retiré ne revient que par réadmission du professeur.

## Valeurs, langue, fuseau

- Q1, Q3, Q5, Q6, Q7 et Q10 sont tranchées ; les autres recommandations ne sont pas des décisions. Valeur non décidée : `src/config/provisional.ts`, marquée [P], signalée, aucun chiffre inventé. Valeur décidée : `src/config/decisions.ts`.
- Application, code et identifiants en anglais ; échanges et conception en français.
- **Fuseau** [D] : `Africa/Casablanca` (`DEADLINE_TIME_ZONE`). Conversion : `src/lib/time-zone.ts` ; affichage : `formatDate`/`formatDateTime` (`src/lib/dates.ts`), jamais un `Intl.DateTimeFormat` en UTC. Les tests suivent la tzdata de Node (Maroc en GMT+0 depuis le 2026-09-20).

## Travail sur la conception

- Décision changée : mettre à jour `conception/` ([D] daté), les prompts à venir et ce fichier si la règle dure. Nouveau sujet : l'utilisateur s'exprime d'abord ; reformuler, analyser, proposer un brouillon ; enregistrer seulement à sa demande.
- Marques : **[D]** décision, **[P]** proposition, **[Q#]** question ouverte ; valeur inconnue = « à définir ».
- Compacité : le nécessaire, mesuré en mots et en Ko ; détail en annexe.
- Sources citées avec lien et limites ; dire quand seul un résumé a été lu.
- Loi 09-08 / CNDP : toujours « à confirmer par la CNDP ou un juriste ».
- Honnêteté : IA plus validation ne suppriment pas les biais (ancrage, halo) ; des copies écrites par des adultes ne représentent pas de vrais élèves.
