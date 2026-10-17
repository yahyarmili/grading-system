# Grading System

Application web de notation de productions écrites d'élèves, en anglais et en français. L'élève remet un texte ou des images de sa copie ; une IA (modèle gratuit via OpenRouter) propose des niveaux sur une rubrique fixe ; le professeur relit, modifie, valide puis publie. Projet académique de démonstration, données fictives. La spécification est dans [`conception/`](conception/).

## Démo en ligne

**https://grading-system-git-preview-yahya-rmili.vercel.app/sign-in**

Preview Vercel publique (protection désactivée pour la démonstration), reliée à la base Neon **dev** : un compte créé en ligne existe aussi en local. Les emails partent réellement (Gmail SMTP).

## Avancement

| Étape | Contenu | État |
|---|---|---|
| E1 | Comptes, rôles, accès (AUTH-01 à AUTH-05) | Livrée |
| E2 | Classes et invitation (CLS-01 à CLS-04) | En cours : créer et lister ses classes (CLS-01), lien et code d'invitation (CLS-02), rejoindre par lien ou code (CLS-03), liste des élèves, retrait et réadmission (CLS-04) livrés ; parcours E2E et démonstration à deux professeurs faits ; T1 et T5 à venir |

Suivi prompt par prompt : [`conception/prompts-implementation.md`](conception/prompts-implementation.md).

## Pile

Next.js 16 (App Router, `cacheComponents`), Better Auth, Drizzle ORM et PostgreSQL (Neon), Zod, Nodemailer (Gmail SMTP), Vitest, Playwright. Hébergement : Vercel (Hobby).

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
   | `AI_PROVIDER`, `OPENROUTER_API_KEY` | Facultatif : `openrouter` et une clé OpenRouter pour un envoi réel à l'IA, données fictives seulement ([procédure](conception/procedures.md)). Sans eux, le simulateur répond |

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
| `docker compose exec -e AI_PROVIDER=openrouter web npm run ai:trial` | Essai de l'IA réelle : un texte fictif, la réponse brute ; sans `-e`, le simulateur |

## Déploiement (Vercel)

- La branche **`preview`** produit la preview ; `main` n'est pas déployée (`vercel.json`). Le travail se commite directement sur `preview` ; pousser `preview` met la preview à jour. Les migrations sont appliquées avant sur la base dev, que la preview utilise.
- Variables, saisies dans Vercel pour l'environnement **Preview** seulement : `DATABASE_URL` (chaîne poolée de la branche Neon dev), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (le domaine de branche ci-dessus), `SMTP_USER`, `SMTP_PASSWORD`.
- Fonctions en `cle1` (Cleveland), à côté de Neon `us-east-2` (Ohio). Neon suspend sa base après 5 min d'inactivité : la première requête qui suit prend quelques secondes.

## Organisation du code

| Dossier | Contenu |
|---|---|
| `src/app/` | Écrans et Server Actions : `(auth)`, espaces `student`, `teacher`, `admin` |
| `src/server/access/` | Matrice d'accès en données, contrôle unique `authorize()`, inventaire |
| `src/server/data/` | Seul code qui accède à la base ; applique la matrice |
| `src/server/auth/`, `src/server/email/` | Parcours d'authentification, interface email unique |
| `src/server/classes/` | Classes : validation, lien et code d'invitation (dérivés, jamais stockés), essais limités, retrait et réadmission |
| `src/config/provisional.ts` | Valeurs non décidées, marquées provisoires |
| `src/config/decisions.ts` | Valeurs décidées [D] (Q7 : lien et code de classe valables 1 heure) |
| `drizzle/`, `scripts/` | Migrations SQL, script du premier administrateur |
| `tests/`, `e2e/` | Vitest (unitaires, intégration), Playwright |
