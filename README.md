# Grading System

Application web de notation de productions écrites d'élèves, en anglais et en français. L'élève remet un texte collé ou les photos de sa copie manuscrite ; pour les photos, l'IA lit chaque page sans rien corriger, et l'élève vérifie la lecture et corrige les mots mal lus avant d'envoyer. Une IA (`claude-haiku-5-5` d'Anthropic) propose ensuite un niveau de 0 à 4 sur chacun des cinq critères d'une rubrique fixe ; le professeur relit, modifie, valide puis publie, et l'élève ne voit que ce qui est publié. Projet académique de démonstration, données fictives. La spécification est dans [`conception/`](conception/).

## Démo en ligne

**https://grading-system-git-preview-yahya-rmili.vercel.app/sign-in**

Preview Vercel publique (protection désactivée pour la démonstration), reliée à la base Neon **dev** : un compte créé en ligne existe aussi en local. Les emails partent réellement (Gmail SMTP).

## Avancement

| Étape | Contenu | État |
|---|---|---|
| E1 | Comptes, rôles, accès | Livrée |
| E2 | Classes et invitation | Livrée |
| E3 | Devoirs et espace élève | Livrée |
| E4 | Remise d'un texte | Livrée |
| E5 | Proposition d'évaluation par l'IA | Livrée |
| E6 | Traitement par lots et relance | Livrée |
| E7 | Relecture par le professeur | Livrée |
| E8 | Validation, publication et résultat de l'élève (premier cycle complet en texte) | Livrée |
| E9 | Canal image : photos des pages, lecture fidèle, vérification par l'élève ([spec 0011](docs/specs/0011-image-channel/index.md)) | Livrée |
| E10 | Durcissement et mesure de la qualité | À venir |
| E11 | Démonstration | À venir |

Où en est le projet : [`docs/scope/scope.md`](docs/scope/scope.md) ; changements notables : [`CHANGELOG.md`](CHANGELOG.md). Suivi prompt par prompt : [`conception/prompts-implementation.md`](conception/prompts-implementation.md).

## Pile

Next.js 16 (App Router, `proxy.ts`, `cacheComponents`), React 19, Tailwind CSS 4, Better Auth, Drizzle ORM et PostgreSQL (Neon), Vercel Workflows (`workflow`), SDK Anthropic (`@anthropic-ai/sdk`, version exacte), `sharp` (contrôle et réduction des photos, version exacte), Zod, Nodemailer (Gmail SMTP), Vitest, Playwright. Hébergement : Vercel (Hobby).

## Démarrer en local

Node ne tourne que dans Docker.

1. Créer `.env.local` (jamais commité) avec :

   | Variable | Rôle |
   |---|---|
   | `DATABASE_URL` | Base Neon dev |
   | `DATABASE_URL_TEST` | Base de test, distincte : vidée à chaque exécution des tests |
   | `BETTER_AUTH_SECRET` | Secret de session (32 caractères ou plus) |
   | `BETTER_AUTH_URL` | `http://localhost:3000` (base des liens envoyés par email) |
   | `SMTP_USER`, `SMTP_PASSWORD` | Facultatif : Gmail et mot de passe d'application. Sans eux, les emails sont écrits dans `.mail-capture/` |
   | `AI_PROVIDER`, `GRADING_ANTHROPIC_API_KEY` | Facultatif : `anthropic` et une clé d'Anthropic pour un envoi réel à l'IA, données fictives seulement ([procédure](conception/procedures.md), réécrite en E5.15). Jamais `ANTHROPIC_API_KEY` : toute variable `ANTHROPIC_*` et `NODE_DEBUG` font refuser l'envoi. Sans eux, le simulateur répond |

2. Lancer :

   ```bash
   docker compose up -d
   docker compose exec web npm run db:migrate
   ```

3. Ouvrir http://localhost:3000.

## Commandes

| Commande | Effet |
|---|---|
| `docker compose exec web npm test` | Tests unitaires et d'intégration (base de test) |
| `docker compose run --rm e2e` | Parcours Playwright, sur leur propre serveur et la base de test ; jamais en même temps que `npm test` |
| `docker compose exec web npm run lint` | ESLint |
| `docker compose exec web npm run db:generate -- --name=<verbe_objet>` | Nouvelle migration (relire le SQL, puis commiter) |
| `docker compose exec web npm run admin:create -- --email <email> --first-name <prénom> --last-name <nom>` | Premier administrateur : reçoit un lien pour choisir son mot de passe |
| `docker compose exec web npm run ai:trial [-- --provider anthropic]` | Essai de l'IA : un texte fictif, la réponse brute ; le simulateur sans `--provider anthropic` |
| `docker compose exec web npm run ai:trial -- --set all --runs 3 [--limit <n>] [--provider anthropic]` | Jeux d'essai de `scripts/fixtures/ai/` (`dev`, `adversarial`, `sensitive`, `all`) ; chaque appel affiché (modèle, `stop_reason`, usage, coût estimé) ; rapport dans `trial-results/` ; s'arrête avant 200 requêtes par jour UTC |
| `docker compose exec web npm run ai:evaluate -- --submission <id> \| --assignment <id> [--provider anthropic]` | Évalue une remise ou les remises « Received » d'un devoir, hors interface ; le simulateur par défaut |
| `docker compose exec web npm run ai:report -- [--assignment <id>] [--since <date>]` | Rapport des évaluations par devoir (délai jusqu'à « To review », usage et coût estimé par copie, tentatives, taux d'échec), sans identité ni contenu |
| `docker compose exec web npm run ai:read -- [--provider anthropic] [--runs <n>] [--limit <n>]` | Essai de lecture de l'écriture manuscrite, sur des photos fictives gardées hors de git ; résultats dans [`conception/annexe-essais-lecture.md`](conception/annexe-essais-lecture.md) |

## Déploiement (Vercel)

- La branche **`preview`** produit la preview ; `main` n'est pas déployée (`vercel.json`). Le travail se commite directement sur `preview` ; pousser `preview` met la preview à jour. Les migrations sont appliquées avant sur la base dev, que la preview utilise.
- Variables, saisies dans Vercel pour l'environnement **Preview** seulement : `DATABASE_URL` (chaîne poolée de la branche Neon dev), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (le domaine de branche ci-dessus), `SMTP_USER`, `SMTP_PASSWORD`. `AI_PROVIDER` et `GRADING_ANTHROPIC_API_KEY` n'y sont posées que le temps d'une démonstration ; sans elles, la preview répond avec le simulateur ([procédure](conception/procedures.md)). Aucune variable `WORKFLOW_*`.
- Le balayage des évaluations (remises bloquées, brouillons de photos inutilisés depuis 7 jours) tourne à chaque déclenchement et, sur la preview, à l'ouverture de la liste des copies ou d'une copie ; le cron de Vercel (`vercel.json`) ne tourne qu'en production.
- Fonctions en `cle1` (Cleveland), à côté de Neon `us-east-2` (Ohio). Neon suspend sa base après 5 min d'inactivité : la première requête qui suit prend quelques secondes.

## Organisation du code

| Dossier | Contenu |
|---|---|
| `src/app/` | Écrans et Server Actions : `(auth)`, espaces `student`, `teacher`, `admin` |
| `src/server/access/` | Matrice d'accès en données, contrôle unique `authorize()`, inventaire |
| `src/server/data/` | Seul code qui accède à la base ; applique la matrice |
| `src/server/auth/`, `src/server/email/` | Parcours d'authentification, interface email unique |
| `src/server/classes/` | Classes : validation, lien et code d'invitation (dérivés, jamais stockés), essais limités, retrait et réadmission |
| `src/server/assignments/`, `src/server/notices/` | Devoirs ; avis aux élèves et aux professeurs, à lire avant la première remise ou la première copie |
| `src/server/submissions/` | Remises en texte et en photos : brouillon de pages, contrôle des images (`sharp`), confirmation |
| `src/server/ai/` | Interfaces `Evaluator` et `Reader`, adaptateur Anthropic durci, simulateur (fournisseur par défaut) |
| `src/server/evaluation/` | Pipeline : lecture des pages non vérifiées, évaluation, plafond de coût, coupe circuit, balayage, commandes `ai:*` |
| `src/server/review/`, `src/server/results/` | Relecture, validation et publication par le professeur ; résultat publié vu par l'élève |
| `src/server/db/` | Schéma Drizzle, un fichier par domaine |
| `src/config/provisional.ts` | Valeurs non décidées, marquées provisoires |
| `src/config/decisions.ts` | Valeurs décidées [D] (par exemple : lien et code de classe valables 1 heure, 5 pages au plus par remise) |
| `drizzle/`, `scripts/` | Migrations SQL ; commandes du premier administrateur et de l'IA |
| `docs/` | Specs techniques (`docs/specs/`), avancement (`docs/scope/`), revues (`docs/reviews/`) |
| `tests/`, `e2e/` | Vitest (unitaires, intégration), Playwright |
