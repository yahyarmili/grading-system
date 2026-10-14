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

## État (2026-10-14)

- **E1 livrée** (E1.0 à E1.8, T1 fait). **E2 en cours** : E2.0 (plan), E2.1 (CLS-01), E2.2 (CLS-02) et E2.3 (CLS-03) faites ; E2.3 est commitée sur `preview`, pas poussée. **Prochain prompt : E2.4** (élèves, retrait, réadmission), puis E2.5. Plan approuvé d'E2 : `~/.claude/plans/pasted-content-id-af4b-inspecte-l-appli-noble-horizon.md` (rejoindre, intention d'invitation, matrice `classMembership` et `classRoster`).
- **T5 non faits** ; à consigner dans `conception/` quand l'utilisateur le demande :
  - les valeurs de `src/config/provisional.ts` (E1 et E2) ;
  - Q2 : la recommandation est appliquée (un administrateur créé par script local, pas de désactivation de professeur), mais pas validée [D] ;
  - Q7 : recommandation appliquée (`CLASS_INVITE_TTL = null`, pas d'expiration), non décidée ;
  - les lignes de matrice [P] : `teacherInvitation`, `classInvite`, `classMembership` ;
  - `CLASS_INVITE_INTENT_TTL` (7 jours, [P] arbitraire) : durée du cookie et de l'intention liée au compte ;
  - format du code de classe [P] : 8 symboles Crockford Base32, affiché `XXXX-XXXX` ; pas de réactivation après désactivation (on renouvelle) ;
  - la preview publique [D] ;
  - Vercel Hobby sans carte bancaire, Neon en `us-east-2`.
- **Base dev** : un administrateur, un professeur et un élève, créés en E1.8 par les acteurs. Migrations à jour jusqu'à `0004`.
- **Test instable connu** : deux tests de `tests/sign-in.int.test.ts` vieillissent une session de 1 s avec l'horloge de Neon ; un décalage avec l'horloge du conteneur les fait échouer. Une tâche séparée a été proposée.

## Environnement

- Node tourne uniquement dans Docker : `docker compose up` (http://localhost:3000). Les commandes npm passent par le conteneur : `docker compose exec web npm …`.
- Next.js 16 diffère de versions plus anciennes (`proxy.ts` au lieu de `middleware.ts`, `cacheComponents` activé) : consulte `node_modules/next/dist/docs/` avant d'utiliser une API (voir `AGENTS.md`).
- Secrets : l'utilisateur crée comptes et secrets ; le code lit `process.env`. Ne lis jamais `.env*`.
- **Shell** : PowerShell 5.1 casse les guillemets de `sh -c`. Passe par l'outil Bash avec `docker compose exec -T web …`, et ajoute `MSYS_NO_PATHCONV=1` pour un chemin du conteneur (`/tmp/…`).
- **E2E** : `docker compose run --rm e2e` (image Playwright). Ce service lance son propre serveur Next (port 3100) sur `DATABASE_URL_TEST`, avec `EMAIL_TRANSPORT=capture`.
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

`fonctionnalites.md` n'a pas été validé explicitement : les recommandations de Q1 à Q10 ne sont pas des décisions (par exemple Q1 note sur 20, Q3 remplacement d'une remise, Q4 correction de la transcription, Q6 rubrique française). Toute valeur non décidée (format de la note, durée d'un lien, nombre d'essais…) est codée comme valeur provisoire, marquée comme telle, dans un fichier de configuration unique (`src/config/provisional.ts`). Signale-la ; ne la présente pas comme décidée et n'invente aucun chiffre.

## Langue

Contenu de l'application en anglais (interface, emails, messages) ; code et identifiants en anglais ; échanges, prompts et documents de conception en français.

## Travail sur la conception

- Quand une décision change, mets à jour la section concernée de `conception/` (marquée [D] avec la date), les prompts à venir et ce fichier si la règle est durable (prompt T5). Pour un nouveau sujet de conception, l'utilisateur s'exprime d'abord ; tu reformules et analyses avant de proposer un brouillon, et tu n'enregistres qu'à sa demande ou après sa validation.
- Marques : **[D]** décision de l'utilisateur, **[P]** proposition, **[Q#]** question ouverte. Ne présente jamais une proposition comme une décision ; une valeur inconnue s'écrit « à définir ».
- Compacité : l'utilisateur veut le nécessaire. Mesure en mots et en Ko, pas en lignes ; cellules de tableau courtes, détail renvoyé en annexe.
- Sources : faits de recherche cités avec un lien et leurs limites ; ne cite pas une étude non vérifiée ; signale quand seul un résumé ou un article de presse a été lu.
- Cadre légal marocain (loi 09-08, CNDP) : toujours « à confirmer par la CNDP ou un juriste », jamais un avis juridique.
- Honnêteté : une IA qui propose et un professeur qui valide ne suppriment pas les biais (ancrage, effet de halo). Des copies simulées par des adultes ne représentent pas de vraies écritures d'élèves : dis-le quand tu parles de mesures de qualité.
