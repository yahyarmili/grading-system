# CLAUDE.md

Consignes durables pour Claude Code dans ce dépôt. Réponds en français.

## Produit

Application web de notation de productions écrites d'élèves, en anglais et en français. L'élève remet un texte collé ou des images de sa copie manuscrite ; le système transcrit l'écriture sans la corriger, puis une IA (Mistral) propose des niveaux de 0 à 4 sur les 5 critères d'une rubrique unique et fixe, avec des remarques, sans recevoir l'identité de l'élève. Le professeur relit, modifie librement, valide puis publie ; l'élève ne voit que le résultat publié, jamais la proposition brute de l'IA.

Trois acteurs : administrateur (crée les comptes professeur), professeur, élève. Cadre : projet académique de démonstration, budget 0 MAD, données fictives saisies par des acteurs de simulation, sans vrais élèves.

## Où trouver quoi

- `conception/` : la spécification. Le document de référence d'une étape est celui qui n'est pas une annexe ; les fichiers `annexe-*` sont des réserves de matière, pas des décisions.
- `conception/fonctionnalites.md` : décisions D1 à D10 (§1, ne pas les remettre en cause sans demande), fonctionnalités `AUTH-01`, `REV-03`…, matrice d'accès §5.4, états de la remise §5.5, plan E1 à E11 §8, questions Q1 à Q10 §9.
- `conception/besoins-non-fonctionnels.md` (`NFR-…`, statut en démonstration §2.8), `acteurs.md`, `stack-technologique.md`.
- **Suivi** : `conception/prompts-implementation.md`. L'utilisateur lance les prompts un par un et valide chacun avant le suivant ; une étape E commence par un `/plan`. Ne prends pas d'avance sur le prompt suivant.
- **Branche de travail** [D, 2026-10-14] : on travaille et on commite directement sur `preview` (checkout fait). Fin de chaque prompt : commit sur `preview`, **sans pousser** ; pousser seulement à la demande de l'utilisateur. `main` n'avance pas en attendant.

## État (2026-10-16)

- **E1 livrée** (E1.0 à E1.8, T1 fait). **E2 livrée** (E2.0 à E2.5, T1 fait ; T5 pour Q7 fait).
- **E3 livrée** (T1 fait) : E3.0 (plan), E3.1 (ASG-01 : création, `/teacher/assignments/new`), E3.2 (ASG-02 : liste réelle, page d’un devoir avec 404 réel ; maquettes 1.4 et 1.5 sous `/dev/mockups`, en développement seulement) et E3.3 (ASG-03 : modification `/teacher/assignments/[id]/edit` et suppression avec confirmation ; garde `locked_at IS NULL` dans la requête d’écriture, tâche renvoyée inchangée acceptée même verrouillée ; CA2 testé en posant le verrou dans le test, rejoué en E4) et E3.4 (SUB-01 : `/student/assignments` réel, `listStudentAssignments` renvoie un DTO fermé, réception par `EXISTS` dans `receivedBy`, état vide qui renvoie vers Join a class) et E3.5 (rejeux : CLS-04 CA2, second professeur, matrice étendue ; parcours `e2e/e3-journey.spec.ts`) faits. Plan approuvé d'E3 : `~/.claude/plans/pasted-content-id-faad-inspecte-l-appli-typed-meerkat.md` (verrou `locked_at` et `content_version`, propriété dérivée côté élève, lignes `assignmentRecipients` et `ownSubmissionStatus`, fuseau).
- **E4 livrée** (E4.0 à E4.6, T1 fait) : remise de texte (SUB-02, devoir verrouillé à la première remise), notice avant la première remise (NFR-DON-04 ; sa lecture est enregistrée avec `STUDENT_NOTICE.version`, à relever à chaque changement du texte), retard (SUB-04), remplacement (SUB-05). `src/server/data/submissions/transitions.ts` est le seul écrivain de `submissions` : `insertReceived` pour la transition 1, `applyTransition` pour les autres (`tests/submission-writes.test.ts`). Plan approuvé : `~/.claude/plans/pasted-content-id-a2f0-inspecte-l-appli-happy-petal.md`.
- **E5 en cours** : E5.0 (enquête), E5.1 (plan) et E5.2 faits. E5.2 (EVL-01) : registre `RUBRIC_VERSIONS` (`src/lib/rubric.ts`, `en-1` seule, gelée par empreinte dans `tests/rubric-versions.test.ts`) ; `GRADE_SCALE` dans `decisions.ts`, `calculateGrade` = somme ; écran Rubric (`/teacher/rubric`, `/student/rubric`, une version par langue publiée) ; `conception/procedures.md` (« Activer le français »). E5.3 : `src/server/ai/` (interface `Evaluator`, simulateur à pannes par défaut, adaptateur Mistral sur `@mistralai/mistralai` 2.7.0 exact, sélection par `AI_PROVIDER`), `AI_MODEL` dans `decisions.ts`, migration `0009` (`ai_request_sent`, appliquée sur dev), garde réseau dans Vitest, `npm run ai:trial`, procédure « Activer l'envoi réel à Mistral ». L'adaptateur journalise lui-même chaque requête qui part (écart [P] au `beforeSend` du plan, consigné en fin de plan) ; il refuse de démarrer si `MISTRAL_DEBUG`, `MISTRAL_SDK_TELEMETRY`, `MISTRAL_OTLP_TRACES_ENDPOINT` ou `MISTRAL_SDK_DEBUG_TRACING` est défini. Premier essai réel (2026-10-16) : Mistral répond `rate_limited` (code 1300) à chaque appel, réponse du modèle pas encore obtenue. Plan approuvé : `~/.claude/plans/partir-de-l-enqu-te-witty-eagle.md` (rubrique en registre gelé par empreinte ; `evaluation_runs` et `ai_proposals` immuables par trigger ; pointeur `current_proposal_id` lié à la version active par FK composite ; `src/server/ai/` : interface, simulateur, adaptateur Mistral 2.7.0, constructeur à liste blanche ; transitions 2 et 5 par `scripts/evaluate.ts` ; découpage E5.2 à E5.7). Décision du plan [D, 2026-10-16] : `en-1` reprend le texte de l'annexe du client (`solution.md`), qualificatifs des niveaux compris.
- **Préalables d'E4 [D, 2026-10-15]** (T5 fait) : Q3, remplacement jusqu'à la première modification ou validation du professeur, 2 remplacements au plus (3 versions), aucun avertissement d'image illisible ; Q10, consigne « pas de nom » seule (aucune notice ne promet que le nom n'est pas transmis) ; texte remis de 4000 caractères au plus. Valeurs dans `src/config/decisions.ts`.
- **Préalables d'E5 [D, 2026-10-15]** (T5 fait) : Q1, note sur 20, somme des 5 niveaux (le pas de saisie d'une note libre reste provisoire) ; Q5, remarques dans la langue du devoir, modifiables avant publication, mentions de l'IA et de la note ajustée affichées à l'élève ; Q6, pas de proposition IA pour un devoir en français avant la validation de la rubrique française par le client (« IA indisponible », correction à la main). Mistral : clé en place, limites relevées et refus d'entraînement fait (`stack-technologique.md` §3), aucun modèle `labs-*`. Après E5.0 [D, 2026-10-15] : modèle `mistral-medium-3-5`, choisi par l'utilisateur ; `AI_PROVIDER`, pointeur de proposition courante dans `submissions`, rubrique dans le code et capture jusqu'au corps HTTP, délégués à Claude (détail : préalables d'E5 dans `prompts-implementation.md`). Notice élève en version 2 : elle dit le refus d'entraînement.
- **Réception dérivée [D, 2026-10-14]** : un élève voit les devoirs des classes où son appartenance est active, quelle que soit la date d'envoi (réadmis ou arrivé tard, il voit aussi les devoirs déjà envoyés). Pas de table de destinataires par élève.
- **T5 non faits** ; à consigner dans `conception/` quand l'utilisateur le demande :
  - les valeurs de `src/config/provisional.ts` (E1 et E2) ;
  - Q2 : la recommandation est appliquée (un administrateur créé par script local, pas de désactivation de professeur), mais pas validée [D] ;
  - les lignes de matrice [P] : `teacherInvitation`, `classInvite`, `classMembership`, `classRoster` ; événements de sécurité `class_member_removed` et `class_member_readmitted` [P] ;
  - `CLASS_INVITE_INTENT_TTL` (7 jours, [P] arbitraire) : durée du cookie et de l'intention liée au compte ; depuis Q7, le lien expire avant (1 heure) ;
  - format du code de classe [P] : 8 symboles Crockford Base32, affiché `XXXX-XXXX` ; pas de réactivation après désactivation (on renouvelle) ;
  - E3 : la réception dérivée [D] ; les lignes [P] `assignmentRecipients` et `ownSubmissionStatus` ; `content_version` et l'arbitrage modification / première remise [P] ; les longueurs maximales d'un devoir (`provisional.ts`) ; heure ambiguë = première occurrence, heure sautée refusée, date limite dans le futur [P] ; le texte d'avertissement R4 et les textes du verrou (`src/lib/texts.ts`) ; date limite modifiée : dans le futur seulement si elle change [P] ;
  - E4 (plan d'E4, « Valeurs à consigner ») : 4000 caractères comptés en graphèmes [D] ; [P] normalisation des fins de ligne, U+0000 refusé, `late` stocké, refus `changed` sur `content_version`, contrat `current_version = $vue` pour E7 et E8, `requestId` côté client ; ligne de matrice [P] `noticeAcknowledgement` ;
  - E5 (plan d'E5, « Valeurs à consigner ») : texte de `en-1` [D] ; valeurs E5 de `provisional.ts` et choix [P] du plan ; exécutant de « Activer le français » = le développeur (la rubrique est dans le code), contre l'administrateur de NFR-EXP-03 [P] ; limites assumées (EVL-02 R4, Q10, EVL-03 R4) ; conservation de 30 jours chez Mistral pour la fiche DON-02 ;
  - la preview publique [D] ;
  - Vercel Hobby sans carte bancaire, Neon en `us-east-2`.
- **Base dev** : un administrateur, un professeur et un élève, créés en E1.8 par les acteurs. Migrations à jour jusqu'à `0009` (appliquée le 2026-10-16).

## Environnement

- Node tourne uniquement dans Docker : `docker compose up` (http://localhost:3000). Les commandes npm passent par le conteneur : `docker compose exec web npm …`.
- Next.js 16 diffère de versions plus anciennes (`proxy.ts` au lieu de `middleware.ts`, `cacheComponents` activé) : consulte `node_modules/next/dist/docs/` avant d'utiliser une API (voir `AGENTS.md`).
- Secrets : l'utilisateur crée comptes et secrets ; le code lit `process.env`. Ne lis jamais `.env*`.
- **Shell** : PowerShell 5.1 casse les guillemets de `sh -c`. Passe par l'outil Bash avec `docker compose exec -T web …`, et ajoute `MSYS_NO_PATHCONV=1` pour un chemin du conteneur (`/tmp/…`).
- **E2E** : `docker compose run --rm e2e` (image Playwright). Ce service lance son propre serveur Next (port 3100) sur `DATABASE_URL_TEST`, avec `EMAIL_TRANSPORT=capture`. Après une modification du code, le premier test peut dépasser 15 s (`next dev` recompile à la première requête) : relancer avant de chercher un bug.
- **Build** : ne lance pas `next build` dans `web` ; fais-le dans le conteneur `e2e`, qui a son propre `.next`. Le build réécrit ensuite `next-env.d.ts` : redémarre `web` après (`docker compose restart web`).
- **Premier administrateur** : `npm run admin:create -- --email … --first-name … --last-name …`.

## Règles d'architecture (`stack-technologique.md` §4)

1. Le contrôle d'accès de la matrice §5.4 s'applique dans la couche d'accès aux données, en un point unique, pas seulement dans `proxy.ts` (SEC-01).
2. Les images sont dans une table à part, lues par une seule route qui applique la matrice ; jamais de lien public, jamais dans les listes (SEC-01, TRT-03).
3. Mistral, la lecture de l'écriture et l'email passent chacun par une interface unique, avec un simulateur à pannes injectables pour les tests (EXP-04).
4. Les étapes d'un lot (Vercel Workflows) sont idempotentes et ne portent que des identifiants, jamais les images (PRC-01).
5. La requête vers Mistral est construite en un point unique, depuis une liste blanche de champs (EVL-02).

Ces règles sont des propositions validées avec la pile ; leur emplacement exact dans le code se décide au `/plan` de l'étape concernée.

**Règle 1 en place (E1.6)** :
- La matrice est déclarée en données dans `src/server/access/matrix.ts`.
- `authorize(actor, "<ressource>", "<action>")` (`policy.ts`) est le seul contrôle.
- `ownedBy(grant, …)` (`src/server/data/access.ts`) filtre la propriété dans la requête.
- Toute nouvelle table, Server Action, route ou export de `src/server/data/` s'inscrit dans `src/server/access/inventory.ts`. Sinon `tests/access-inventory.test.ts` échoue.
- Une nouvelle ressource reçoit d'abord sa ligne dans la matrice. Ses fonctions réelles s'ajoutent à `REAL` dans `tests/access-matrix.int.test.ts`, qui rejoue chaque cellule.
- Ressource d'autrui : `null`, comme une ressource absente. Rôle sans droit : `AccessDeniedError`. Les pages répondent 404 dans les deux cas.
- Dans `REAL`, une opération vise la ressource de la fixture (`setup`). Les colonnes « autre » doivent donner « absent », sauf pour une opération `creates` (elle crée la ressource de l'acteur).
- **404 réel** : sous `cacheComponents`, `notFound()` appelé sous un `Suspense` garde le statut 200. Une page de ressource vérifie l'accès au niveau de la page, avant tout streaming, avec `export const instant = false` (voir `src/app/teacher/classes/[classId]/page.tsx`).

**Classes (E2)** :
- Le lien et le code ne sont jamais stockés. Ils sont dérivés du `invite_nonce` de la classe avec une clé tirée de `BETTER_AUTH_SECRET` (`src/server/classes/invite-codes.ts`) ; seules leurs empreintes sont en base. Changer ce secret change tous les liens et codes.
- **Q7 [D, 2026-10-14]** : le lien et le code expirent 1 heure après la création du lien, un renouvellement en créant un nouveau (CLS-02 R4 ; date `invite_issued_at`). Valeur : `CLASS_INVITE_TTL` dans `src/config/decisions.ts`.
- Toute saisie d'un code ou d'un lien passe par `tryInvite` (`src/server/classes/attempts.ts`) : verrou après N échecs par élève, refus unique, pas de remise à zéro sur succès.

**Règle 3, email (E1)** : `src/server/email/`.
- Capture en test.
- Gmail SMTP en dev dès que `SMTP_USER` et `SMTP_PASSWORD` existent : de vrais emails partent.
- `EMAIL_TRANSPORT=capture` force la capture.

**Authentification (E1)** :
- Better Auth sans gestionnaire HTTP : Server Actions, puis `src/server/auth/`, puis `src/server/data/auth/`.
- Session lue en base : `getActor()` et `requireRole()`, plus `src/proxy.ts` sur les espaces.
- Liens à usage unique dans `auth_tokens`, stockés sous forme d'empreinte, consommés par un POST, jamais par un GET.
- La déconnexion recharge la page entière : Next garde les pages visitées dans le document.

## Base de données

- PostgreSQL (Neon) via Drizzle et `pg`. Client unique : `src/server/db/client.ts` ; schéma : un fichier par domaine dans `src/server/db/schema/`, réexporté par `index.ts`.
- **Seul `src/server/data/**` importe `@/server/db`** (règle ESLint). Chaque fonction reçoit l'`Actor` (`src/server/access/actor.ts`) en premier argument, appelle d'abord `authorize()`, filtre la propriété dans la requête (`ownedBy`) et renvoie un DTO minimal. Une exception sans `Actor` (lien à usage unique, outil interne) est listée avec sa raison dans `inventory.ts`.
- Nommage : camelCase en TypeScript, snake_case en SQL (`casing: "snake_case"`, jamais de nom de colonne écrit à la main) ; tables au pluriel ; `id uuid default gen_random_uuid()` ; `<entité>_id` ; `created_at`/`updated_at` en `timestamptz` ; états et rôles en `pgEnum`.
- Migrations : `npm run db:generate -- --name=<verbe_objet>`, relire le SQL de `drizzle/`, le commiter ; `npm run db:migrate` sur dev. Jamais `drizzle-kit push` ; une migration commitée ne se modifie plus.
- **Deux horloges** : celle du conteneur peut différer de celle de Neon d'une seconde ou plus (Docker sous Windows dérive). Une date écrite par `now()` se compare dans SQL. Better Auth compare l'expiration d'une session à l'horloge Node : un test qui expire une session la vieillit d'un jour, pas d'une seconde.
- Tests : `npm test` (projets `unit` et `integration`). Les `*.int.test.ts` tournent en séquence sur `DATABASE_URL_TEST`, remise à zéro puis migrée à chaque exécution, tables vidées avant chaque test (`truncateAll`).
- Intégration et E2E partagent `DATABASE_URL_TEST` : ne les lance jamais en même temps. Neon est en `us-east-2` : environ 175 ms par requête depuis le poste, d'où des tests lents.
- Les variables arrivent dans le conteneur par `env_file` (`compose.yaml`) : après modification de `.env.local`, `docker compose up -d`.

## Déploiement (Vercel Hobby)

- La branche `preview` produit la preview. `main` n'est pas déployée (`vercel.json`) : la Production n'a aucune variable et son build échoue, c'est voulu.
- Mise à jour de la preview : pousser `preview`, à la demande de l'utilisateur (voir « Branche de travail »). Les migrations sont appliquées sur dev avant : la preview utilise cette base.
- Variables dans Vercel, environnement **Preview** seulement : `DATABASE_URL` (chaîne poolée de la branche Neon dev), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (le domaine de branche), `SMTP_USER`, `SMTP_PASSWORD`. Toute nouvelle variable y est ajoutée par l'utilisateur.
- Fonctions en `cle1`, à côté de Neon. Preview publique [D], sur la base dev. Neon suspend sa base après 5 min : la première requête qui suit prend 4 à 5 s de plus (mesuré depuis le poste).

## Invariants (`fonctionnalites.md` §5.3)

1. Un compte a un seul rôle ; l'inscription publique ne crée que des élèves ; l'administrateur crée les comptes professeur.
2. Toute remise appartient à un devoir reçu par l'élève.
3. Le correcteur d'une remise est le professeur créateur du devoir, propriétaire des classes destinataires.
4. Ni l'identité de l'élève, ni le niveau du devoir, ni aucun identifiant ne figurent dans l'entrée de l'IA.
5. La proposition IA est immuable ; aucune modification du professeur ne l'écrase ; chaque modification est journalisée automatiquement.
6. La note finale peut différer de la note calculée ; l'écart est signalé au professeur.
7. « Publiée » implique « validée » ; l'élève ne lit jamais une évaluation non publiée ni la proposition brute.
8. La rubrique est en lecture seule pour tout le monde.
9. Nom, prénom, email et classe d'un élève ne sont visibles que du professeur propriétaire de sa classe.
10. Un élève retiré ne rejoint pas sa classe avec l'ancien lien ou code ; seule la réadmission par le professeur le rattache.

## Valeurs provisoires

`fonctionnalites.md` n'a pas été validé explicitement : les recommandations de Q1 à Q10 ne sont pas des décisions (par exemple Q4 correction de la transcription, Q8 modification après publication ; Q1, Q3, Q5, Q6, Q7 et Q10 sont tranchées). Toute valeur non décidée (format de la note, durée d'un lien, nombre d'essais…) est codée comme valeur provisoire, marquée comme telle, dans un fichier de configuration unique (`src/config/provisional.ts`) ; une valeur décidée [D] passe dans `src/config/decisions.ts`. Signale-la ; ne la présente pas comme décidée et n'invente aucun chiffre.

## Langue

Contenu de l'application en anglais (interface, emails, messages) ; code et identifiants en anglais ; échanges, prompts et documents de conception en français.

**Fuseau [D, 2026-10-14]** : `Africa/Casablanca`, pour saisir et afficher la date limite, avec son nom affiché, identique pour l'élève et le professeur (NFR-USA-02). Valeur : `DEADLINE_TIME_ZONE` dans `src/config/decisions.ts`. Conversion heure murale ↔ instant : `src/lib/time-zone.ts` (sans dépendance) ; affichage : `formatDate` et `formatDateTime` de `src/lib/dates.ts`, jamais un `Intl.DateTimeFormat` en UTC dans un écran. Le décalage suit la tzdata de Node : avec 2026c, le Maroc est en GMT+0 depuis le 2026-09-20 (les tests du fuseau en dépendent).

**Migrations générées** : relire l'ordre des instructions. drizzle-kit place une contrainte unique ajoutée à une table existante après les clés étrangères qui la visent (cas de `0006`, corrigé à la main avant commit).

## Travail sur la conception

- Quand une décision change, mets à jour la section concernée de `conception/` (marquée [D] avec la date), les prompts à venir et ce fichier si la règle est durable (prompt T5). Pour un nouveau sujet de conception, l'utilisateur s'exprime d'abord ; tu reformules et analyses avant de proposer un brouillon, et tu n'enregistres qu'à sa demande ou après sa validation.
- Marques : **[D]** décision de l'utilisateur, **[P]** proposition, **[Q#]** question ouverte. Ne présente jamais une proposition comme une décision ; une valeur inconnue s'écrit « à définir ».
- Compacité : l'utilisateur veut le nécessaire. Mesure en mots et en Ko, pas en lignes ; cellules de tableau courtes, détail renvoyé en annexe.
- Sources : faits de recherche cités avec un lien et leurs limites ; ne cite pas une étude non vérifiée ; signale quand seul un résumé ou un article de presse a été lu.
- Cadre légal marocain (loi 09-08, CNDP) : toujours « à confirmer par la CNDP ou un juriste », jamais un avis juridique.
- Honnêteté : une IA qui propose et un professeur qui valide ne suppriment pas les biais (ancrage, effet de halo). Des copies simulées par des adultes ne représentent pas de vraies écritures d'élèves : dis-le quand tu parles de mesures de qualité.
