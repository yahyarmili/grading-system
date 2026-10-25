# 0002. Data foundation: decision record

## Context

Step 2.2 of the implementation plan (`conception/fonctionnalites.md` §8.2). Requirements and acceptance criteria live in `conception/fonctionnalites.md` and `conception/besoins-non-fonctionnels.md` (French).

## Options considered

Weighed inside the approved plan below (sections "Contexte", choices marked [P] or [D], and the plan history at its end).

## Rationale

The plan below was approved by the engineer before the build, then amended in its history section as gaps were found. It is copied verbatim, in French, from `~/.claude/plans/`; only its headings moved two levels down.

## References

**Project sources**:
- `conception/fonctionnalites.md`, `conception/stack-technologique.md` §3 (provisional values per step)
- `conception/prompts-implementation.md` (prompts of step 2.2)

## Approved plan: `plan-2.2.md` (verbatim)

### Plan 2.2 — Socle de données (PostgreSQL + Drizzle)

#### Contexte

Les maquettes (phase 1) tournent sur des données fictives (`src/mock/`). La base Neon est prête (`DATABASE_URL` dev, `DATABASE_URL_TEST` test). Cette étape pose **seulement le socle** : connexion, migrations, organisation du schéma, couche d'accès unique (règle 1, SEC-01) et base de test réinitialisée. **Aucune table métier** : les tables de comptes arrivent en E1.

État constaté :
- Ni Drizzle, ni pilote PostgreSQL, ni Vitest installés ; aucun script de test.
- Les deux variables sont **absentes du conteneur** : `next dev` charge `.env.local` lui-même, mais pas `drizzle-kit` ni Vitest. En outre, Next.js **ignore `.env.local` quand `NODE_ENV=test`** (doc `environment-variables.md`), donc `@next/env` ne suffirait pas pour Vitest.
- Doc Next 16 (`data-security.md`) : recommande une *Data Access Layer* côté serveur seulement, qui autorise et renvoie des DTO minimaux. C'est notre règle 1.
- Réutilisables : `Role` dans `src/lib/roles.ts` ; `src/config/provisional.ts` reste le fichier unique des valeurs provisoires (aucune valeur nouvelle ici).

#### Choix proposés [P]

| Sujet | Choix | Raison |
|---|---|---|
| Pilote | `pg` (node-postgres) + `drizzle-orm/node-postgres` | Transactions interactives (nécessaires plus tard : modification + journal, invariant 5) ; même code en local, en test et sur Vercel. Le pilote HTTP de Neon n'a pas de transactions interactives. Regroupement des connexions sur Vercel (`attachDatabasePool`) : vu en E1.8. |
| Chargement des variables | `env_file: .env.local` (`required: false`) dans `compose.yaml` | Un seul endroit, valable pour `next dev`, `drizzle-kit` et Vitest. Exige `docker compose up -d` après modification de `.env.local`. |
| Migrations | `drizzle-kit generate` (SQL versionné dans `drizzle/`) puis `drizzle-kit migrate`. **Jamais `push`.** | Migrations relues et commitées, uniquement en avant. |
| Tests | Vitest, 2 projets : `unit` (parallèle, sans base) et `integration` (`*.int.test.ts`, séquentiel, base de test) | Les tests unitaires restent rapides ; les tests d'intégration partagent une base, d'où l'exécution séquentielle. |

#### Organisation des fichiers

```
drizzle.config.ts              # drizzle-kit : schéma, dossier drizzle/, casing snake_case, DATABASE_URL
drizzle/                       # migrations SQL générées, commitées (0000_init.sql vide, --custom)
vitest.config.ts               # projets unit / integration, alias @ -> src, alias server-only -> vide
src/server/
  db/
    client.ts                  # import "server-only" ; Pool pg unique (singleton globalThis pour le rechargement à chaud) ; export db
    schema/index.ts            # réexporte un fichier par domaine (auth.ts en E1, classes.ts en E2…) ; vide pour l'instant
  access/
    actor.ts                   # type Actor = { kind: "visitor" } | { kind: "user"; userId; role: Role }
    errors.ts                  # AccessDeniedError (un seul type d'erreur de refus)
  data/                        # couche d'accès : SEUL endroit qui importe db ; vide hors exemple de forme
tests/
  setup/global-db.ts           # globalSetup du projet integration : garde-fou, reset, migrate
  helpers/db.ts                # truncateAll() entre les tests
  db.int.test.ts               # test minimal : connexion + remise à zéro
```

Scripts `package.json` : `db:generate`, `db:migrate`, `test` (les deux projets), `test:unit`, `test:int`. Tous lancés par `docker compose exec web npm run …`.

#### Conventions de nommage

- TypeScript en camelCase, SQL en snake_case par l'option `casing: "snake_case"` (client **et** drizzle-kit) : on n'écrit pas les noms de colonnes à la main.
- Tables au pluriel (`classes`, `submission_versions`). Better Auth : `usePlural` à confirmer en E1.0.
- Clé primaire `id uuid default gen_random_uuid()` ; clés étrangères `<entité>_id` ; `created_at` / `updated_at` en `timestamp with time zone`.
- États (§5.5) et rôles : `pgEnum`, valeurs en snake_case anglais.
- Migrations nommées : `drizzle-kit generate --name=<verbe_objet>` (ex. `create_auth_tables`).

#### Stratégie de migrations

1. On modifie `src/server/db/schema/*.ts`, puis `npm run db:generate -- --name=…` ; on relit le SQL ; on le commite avec le code.
2. Dev : `npm run db:migrate` (sur `DATABASE_URL`).
3. Test : appliquées automatiquement par le globalSetup (sur `DATABASE_URL_TEST`).
4. Production : à décider en E1.8 (proposition : `db:migrate` lancé à la main avant le déploiement).
5. Une migration fusionnée ne se modifie plus ; une correction est une nouvelle migration.

#### Comment la couche d'accès appliquera la matrice §5.4

- **Point unique** : seules les fonctions de `src/server/data/**` importent `db`. Une règle ESLint `no-restricted-imports` interdit `@/server/db/*` ailleurs (sauf `tests/` et `drizzle.config.ts`). Pages, Server Actions et routes appellent la couche, jamais `db`.
- **Signature** : chaque fonction reçoit l'`Actor` en premier argument (`listClasses(actor)`, `getSubmission(actor, id)`). L'`Actor` vient de la session en E1 (`getActor()` mis en cache par `react.cache`) ; les tests le construisent directement, sans HTTP.
- **Deux mécanismes, une ligne de la matrice par fonction** :
  - filtre de propriété dans la requête elle-même (ex. `where teacher_id = actor.userId`) : un objet d'un autre professeur est **absent**, pas seulement masqué ;
  - refus explicite (`AccessDeniedError`) pour un rôle qui n'a aucun droit sur la ressource. Refus par défaut : un rôle non prévu est refusé.
- **DTO minimaux** : la couche renvoie des objets choisis champ par champ (ex. un élève ne reçoit jamais la proposition IA, invariant 7 ; identité de l'élève réservée au propriétaire, invariant 9).
- `proxy.ts` ne fait que rediriger ; il n'est pas une barrière de sécurité.
- En 2.3, on n'écrit que `Actor`, `AccessDeniedError`, la règle ESLint et le dossier `data/` vide. Les règles de la matrice arrivent avec leurs tables (E1, E2…), chacune avec ses tests négatifs (AUTH-04).

#### Base de test

- **globalSetup** (`tests/setup/global-db.ts`), une fois par exécution :
  1. garde-fou : arrêt si `DATABASE_URL_TEST` est absente ou **égale** à `DATABASE_URL` ;
  2. `DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;` ;
  3. application des migrations (`migrate` de `drizzle-orm/node-postgres/migrator`) : la base de test reflète exactement les migrations commitées.
- Le projet `integration` définit `env.DATABASE_URL = DATABASE_URL_TEST` : le code testé utilise `db` sans modification.
- Entre les tests : `truncateAll()` (`TRUNCATE … RESTART IDENTITY CASCADE` sur toutes les tables de `public`, lues dans `pg_tables`) dans un `beforeEach`.
- `fileParallelism: false` pour ce projet ; délai du globalSetup allongé pour le démarrage à froid de Neon (compute suspendu après 5 min).

#### Fichiers modifiés

- `package.json` : `drizzle-orm`, `pg` ; dev : `drizzle-kit`, `@types/pg`, `vitest`, `server-only` (si absent) ; scripts.
- `compose.yaml` : `env_file`.
- `eslint.config.mjs` : `no-restricted-imports`.
- `CLAUDE.md` : section courte « Base de données » (conventions ci-dessus), en 2.3.
- Nouveaux : `drizzle.config.ts`, `vitest.config.ts`, `drizzle/0000_init.sql`, `src/server/**`, `tests/**`.

#### Vérification

1. `docker compose up -d`, puis vérifier que les deux variables sont présentes dans le conteneur (sans les afficher).
2. `docker compose exec web npm run db:generate -- --custom --name=init` crée une migration vide ; `npm run db:migrate` l'applique sur dev (table `drizzle.__drizzle_migrations` à 1 ligne).
3. `docker compose exec web npm test` : le test d'intégration `db.int.test.ts` vérifie que `select 1` répond sur la base de test ; il crée une table jetable dans `public` (supprimée au prochain reset), insère une ligne, appelle `truncateAll()` et constate 0 ligne ; le garde-fou refuse une URL de test identique à celle de dev (test unitaire de la fonction de garde).
4. `npm run lint` : un import de `@/server/db/client` depuis `src/app/` est signalé (vérifié une fois, puis retiré).
5. `npm run build` passe toujours.
