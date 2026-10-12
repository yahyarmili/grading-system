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

## Environnement

- Node tourne uniquement dans Docker : `docker compose up` (http://localhost:3000). Les commandes npm passent par le conteneur : `docker compose exec web npm …`.
- Next.js 16 diffère de versions plus anciennes (`proxy.ts` au lieu de `middleware.ts`, `cacheComponents` activé) : consulte `node_modules/next/dist/docs/` avant d'utiliser une API (voir `AGENTS.md`).
- Secrets : l'utilisateur crée comptes et secrets ; le code lit `process.env`. Ne lis jamais `.env*`.

## Règles d'architecture (`stack-technologique.md` §4)

1. Le contrôle d'accès de la matrice §5.4 s'applique dans la couche d'accès aux données, en un point unique, pas seulement dans `proxy.ts` (SEC-01).
2. Les images sont dans une table à part, lues par une seule route qui applique la matrice ; jamais de lien public, jamais dans les listes (SEC-01, TRT-03).
3. Mistral, la lecture de l'écriture et l'email passent chacun par une interface unique, avec un simulateur à pannes injectables pour les tests (EXP-04).
4. Les étapes d'un lot (Vercel Workflows) sont idempotentes et ne portent que des identifiants, jamais les images (PRC-01).
5. La requête vers Mistral est construite en un point unique, depuis une liste blanche de champs (EVL-02).

Ces règles sont des propositions validées avec la pile ; leur emplacement exact dans le code se décide au `/plan` de l'étape concernée.

## Base de données

- PostgreSQL (Neon) via Drizzle et `pg`. Client unique : `src/server/db/client.ts` ; schéma : un fichier par domaine dans `src/server/db/schema/`, réexporté par `index.ts`.
- **Seul `src/server/data/**` importe `@/server/db`** (règle ESLint). Chaque fonction reçoit l'`Actor` (`src/server/access/actor.ts`) en premier argument, filtre la propriété dans la requête, lève `AccessDeniedError` sinon (refus par défaut) et renvoie un DTO minimal.
- Nommage : camelCase en TypeScript, snake_case en SQL (`casing: "snake_case"`, jamais de nom de colonne écrit à la main) ; tables au pluriel ; `id uuid default gen_random_uuid()` ; `<entité>_id` ; `created_at`/`updated_at` en `timestamptz` ; états et rôles en `pgEnum`.
- Migrations : `npm run db:generate -- --name=<verbe_objet>`, relire le SQL de `drizzle/`, le commiter ; `npm run db:migrate` sur dev. Jamais `drizzle-kit push` ; une migration commitée ne se modifie plus.
- Tests : `npm test` (projets `unit` et `integration`). Les `*.int.test.ts` tournent en séquence sur `DATABASE_URL_TEST`, remise à zéro puis migrée à chaque exécution, tables vidées avant chaque test (`truncateAll`).
- Les variables arrivent dans le conteneur par `env_file` (`compose.yaml`) : après modification de `.env.local`, `docker compose up -d`.

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

`fonctionnalites.md` n'a pas été validé explicitement : les recommandations de Q1 à Q10 ne sont pas des décisions (par exemple Q1 note sur 20, Q3 remplacement d'une remise, Q4 correction de la transcription, Q6 rubrique française). Toute valeur non décidée (format de la note, durée d'un lien, nombre d'essais…) est codée comme valeur provisoire, marquée comme telle, dans un fichier de configuration unique. Signale-la ; ne la présente pas comme décidée et n'invente aucun chiffre.

## Langue

Contenu de l'application en anglais (interface, emails, messages) ; code et identifiants en anglais ; échanges, prompts et documents de conception en français.

## Travail sur la conception

- Quand une décision change, mets à jour la section concernée de `conception/` (marquée [D] avec la date), les prompts à venir et ce fichier si la règle est durable (prompt T5). Pour un nouveau sujet de conception, l'utilisateur s'exprime d'abord ; tu reformules et analyses avant de proposer un brouillon, et tu n'enregistres qu'à sa demande ou après sa validation.
- Marques : **[D]** décision de l'utilisateur, **[P]** proposition, **[Q#]** question ouverte. Ne présente jamais une proposition comme une décision ; une valeur inconnue s'écrit « à définir ».
- Compacité : l'utilisateur veut le nécessaire. Mesure en mots et en Ko, pas en lignes ; cellules de tableau courtes, détail renvoyé en annexe.
- Sources : faits de recherche cités avec un lien et leurs limites ; ne cite pas une étude non vérifiée ; signale quand seul un résumé ou un article de presse a été lu.
- Cadre légal marocain (loi 09-08, CNDP) : toujours « à confirmer par la CNDP ou un juriste », jamais un avis juridique.
- Honnêteté : une IA qui propose et un professeur qui valide ne suppriment pas les biais (ancrage, effet de halo). Des copies simulées par des adultes ne représentent pas de vraies écritures d'élèves : dis-le quand tu parles de mesures de qualité.
