# CLAUDE.md

Consignes durables pour Claude Code dans ce dépôt. Réponds en français.

## Produit

Notation de productions écrites d'élèves (anglais, français). L'élève remet un texte ou des images de sa copie ; le système transcrit sans corriger ; une IA (modèle gratuit d'OpenRouter) propose un niveau de 0 à 4 sur les 5 critères d'une rubrique fixe, avec des remarques, sans l'identité de l'élève. Le professeur relit, modifie, valide, publie ; l'élève ne voit que le publié. Acteurs : administrateur, professeur, élève. Projet académique de démonstration, budget 0 MAD, données fictives.

## Suivi et branche

- Spécification dans `conception/` ; les `annexe-*` sont de la matière, pas des décisions. `fonctionnalites.md` : D1 à D10 (§1, intouchables sans demande), fonctionnalités, matrice §5.4, états §5.5, plan §8, questions §9. Aussi `besoins-non-fonctionnels.md`, `acteurs.md`, `stack-technologique.md`, `procedures.md`.
- **Prompts** : `conception/prompts-implementation.md`. L'utilisateur les lance un par un et valide chacun ; une étape E commence par un `/plan`. Ne prends pas d'avance sur le prompt suivant.
- **Branche** [D] : tout se fait sur `preview`. Fin de chaque prompt : commit sur `preview`, **sans pousser** ; pousser seulement à la demande. `main` n'avance pas.
- **T5 en attente** : `.claude/a-consigner.md`, à consigner dans `conception/` à la demande.

## État (2026-10-17)

- E1 à E4 livrées. Plans approuvés dans `~/.claude/plans/` : E3 `…typed-meerkat.md`, E4 `…happy-petal.md`, E5 `partir-de-l-enqu-te-witty-eagle.md` (découpage E5.2 à E5.7, « Valeurs à consigner », écart E5.3 en fin de plan).
- **E5 en cours** (E5.0 à E5.4b faits) :
  - rubrique : registre `RUBRIC_VERSIONS` (`src/lib/rubric.ts`, `en-1` = texte du client, gelée par empreinte) ; note = somme des niveaux sur 20 ;
  - `src/server/ai/` : interface `Evaluator`, simulateur à pannes (défaut partout), adaptateur réel qui journalise lui-même `ai_request_sent` avant chaque envoi ; requête : `buildEvaluationRequest` (liste blanche, `PROMPT_VERSION` figée par empreinte), `readEvaluationInput`, test d'étanchéité `tests/evaluation-leak.int.test.ts` ;
  - **Prestataire [D, 2026-10-16]** : OpenRouter (Mistral abandonné). **E5.4b fait (2026-10-17)** : `src/server/ai/openrouter.ts`, `fetch` sans bibliothèque ; `AI_MODEL = "xingchen-agi/xing4.0-29b-a4b:free"` et `AI_ROUTING` (`require_parameters`, `zdr`) dans `decisions.ts` ; `AI_PROVIDER=openrouter` + `OPENROUTER_API_KEY` ; jamais `openrouter/free`, aucun en-tête d'attribution ni champ `user`. `ai_provider` vaudra `simulator` | `openrouter` ; `provider_answered` à créer en E5.5.
  - Garanties de l'adaptateur : journal avant envoi (rien ne part s'il échoue), durée bornée lecture comprise, `NODE_DEBUG` refusé au démarrage, clé jamais lue implicitement, erreurs classées sans contenu (y compris dans un 200).
  - Limites des modèles gratuits : 20 requêtes par minute, 50 par jour UTC à 0 crédit acheté. Notice élève v3 (OpenRouter, Phala, ZDR selon la liste d'OpenRouter) ; essai `ai:trial` réel et approbation de la notice à faire par l'utilisateur.
- Base dev : un compte par rôle (E1.8), migrations jusqu'à `0009`.

## Environnement

- Node uniquement dans Docker : `docker compose up` (http://localhost:3000) ; npm via `docker compose exec -T web npm …`, lancé depuis l'outil Bash (PowerShell 5.1 casse les guillemets), avec `MSYS_NO_PATHCONV=1` pour un chemin du conteneur.
- Next.js 16 (`proxy.ts`, `cacheComponents`) : lis `node_modules/next/dist/docs/` avant d'utiliser une API (`AGENTS.md`).
- Secrets : l'utilisateur crée comptes et secrets ; le code lit `process.env`. **Ne lis jamais `.env*`.** Après modification de `.env.local` : `docker compose up -d`.
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
