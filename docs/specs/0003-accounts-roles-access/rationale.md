# 0003. Accounts, roles and access: decision record

## Context

Step E1 of the implementation plan (`conception/fonctionnalites.md` §8.2). Requirements and acceptance criteria live in `conception/fonctionnalites.md` and `conception/besoins-non-fonctionnels.md` (French).

## Options considered

Weighed inside the approved plan below (sections "Contexte", choices marked [P] or [D], and the plan history at its end).

## Rationale

The plan below was approved by the engineer before the build, then amended in its history section as gaps were found. It is copied verbatim, in French, from `~/.claude/plans/`; only its headings moved two levels down.

## References

**Project sources**:
- `conception/fonctionnalites.md`, `conception/stack-technologique.md` §3 (provisional values per step)
- `conception/prompts-implementation.md` (prompts of step E1)

## Approved plan: `plan-e1.md` (verbatim)

### E1.0 — Plan de l'authentification (AUTH-01 à AUTH-05)

#### Contexte

État actuel : squelette avant E1. Écrans maquettes `/student`, `/teacher`, `/admin` (`src/mock/*`) et `RoleSwitcher` de développement. Le schéma Drizzle est vide (`src/server/db/schema/index.ts`). `Actor` et `AccessDeniedError` existent (`src/server/access/`), `src/server/data/` est vide, et il n'y a pas de `proxy.ts`. `better-auth`, `zod` et `nodemailer` ne sont pas installés, et `node_modules` n'existe que dans le volume Docker.

But d'E1 : authentifier les trois rôles selon AUTH-01 à 05, la matrice 5.4 et les invariants 1 et 9. Ce plan couvre tout E1 ; chaque partie est livrée par son prompt (E1.1 à E1.6). Je ne prends pas d'avance.

#### Principe : Better Auth pour le cœur, liens à usage unique faits maison

**Better Auth sert à :**
- la connexion (`auth.api.signInEmail`) et la déconnexion ;
- les sessions en base (`getSession`) ;
- le hachage des mots de passe (scrypt, via `better-auth/crypto`) ;
- les cookies, avec le plugin `nextCookies()`.

**Les liens à usage unique ne passent pas par Better Auth.** Ses flux intégrés ne satisfont pas NFR-SEC-03 ni AUTH-05 R2 :
- la confirmation d'email intégrée repose sur un JWT sans état, qui ne peut pas être invalidé au renvoi ;
- le jeton de réinitialisation intégré est stocké en clair.

Confirmation, réinitialisation et invitation utilisent donc une table `auth_tokens`. Chaque jeton y est stocké sous forme d'empreinte, sert une seule fois, et l'émission d'un nouveau jeton invalide les précédents.

**Aucun gestionnaire HTTP `/api/auth/[...all]`.** Tous les parcours passent par des Server Actions, validées par Zod, qui appellent `auth.api.*` côté serveur. Aucun endpoint Better Auth n'est exposé : pas de `sign-up/email` ni d'`update-user` qui permettrait de forcer un rôle. Les Server Actions de Next vérifient déjà l'origine de la requête (CSRF).

**Les comptes sont créés uniquement par la couche de données** :
- élève à l'inscription ;
- professeur à l'acceptation de l'invitation ;
- administrateur par le script.

Chaque création insère `users` et `accounts` (`providerId: "credential"`) dans une transaction Drizzle, avec un rôle écrit en dur par le serveur.

**Emplacement.** L'instance Better Auth importe `db` : elle va donc dans `src/server/data/auth/`, ce qui respecte la règle ESLint existante.

#### Tables (`src/server/db/schema/auth.ts`, migration `create_auth`)

Conventions du dépôt : pluriel, uuid, snake_case, timestamptz, pgEnum. Better Auth est configuré avec `drizzleAdapter(db, { provider: "pg", usePlural: true, schema })` et `advanced.database.generateId: false` (l'uuid est généré par la base).

| Table | Colonnes clés | Rôle |
|---|---|---|
| `users` | email (unique, normalisé), email_verified, name (dérivé), first_name, last_name, role `user_role` (student, teacher, admin), non nul, sans valeur par défaut | Invariant 1 : un rôle par compte. `additionalFields.role` en `input: false`. |
| `sessions` | token (unique), user_id, expires_at, ip_address, user_agent | Requise par Better Auth. |
| `accounts` | user_id, provider_id, account_id, password (hash) | Requise par Better Auth. Seulement `credential`. |
| `verifications` | identifier, value, expires_at | Requise par Better Auth. Inutilisée par nos flux. |
| `auth_tokens` | purpose `auth_token_purpose` (email_verification, password_reset, teacher_invitation), token_hash (sha256, unique), user_id ?, invitation_id ?, expires_at, used_at, revoked_at | Liens à usage unique (SEC-03). |
| `teacher_invitations` | email, first_name, last_name, created_by_id, revoked_at, revoked_by_id, accepted_at, user_id ? | Une seule invitation en attente par email (index unique partiel). L'état est dérivé : pending, accepted, revoked, expired. |
| `auth_throttles` | key (empreinte de portée + valeur), failures, window_started_at, locked_until | Temporisation en base : la mémoire ne survit pas au serverless. |
| `security_events` | type `security_event_type`, actor_user_id ?, subject_id ?, created_at | Journal de sécurité (DON-05). Il trace les connexions, les échecs, les verrouillages, les déconnexions, les réinitialisations, les confirmations, les actions d'invitation (auteur et date, AUTH-03 R4) et les refus d'accès. Il ne contient ni email, ni secret, ni contenu. |

#### Valeurs provisoires (ajoutées à `src/config/provisional.ts`, marquées)

Toutes sont marquées « PROVISIONAL, à définir (étape 5, NFR-SEC-02/03) ». Les durées sont exprimées en secondes.

| Constante | Valeur proposée | Origine |
|---|---|---|
| `SESSION_EXPIRES_IN` / `SESSION_UPDATE_AGE` | 7 j / 1 j | Défauts de Better Auth |
| `EMAIL_VERIFICATION_TTL` / `PASSWORD_RESET_TTL` | 1 h / 1 h | Défauts de Better Auth |
| `TEACHER_INVITATION_TTL` | 7 j | [P] arbitraire |
| `SIGN_IN_MAX_FAILURES` (N) / `SIGN_IN_LOCKOUT` (D) | 5 / 15 min | [P] arbitraire |
| `LINK_REQUEST_MAX` / fenêtre (réinitialisation, renvoi, par email) | 3 / 1 h | [P] arbitraire (AUTH-05 R3) |
| `SIGN_UP_MAX_PER_IP` / fenêtre | 10 / 1 h | [P] arbitraire (SEC-02) |
| `PASSWORD_MIN_LENGTH` / `MAX` | 8 / 128 | Défauts de Better Auth |

#### Configuration Better Auth (`src/server/data/auth/better-auth.ts`)

- **Mots de passe.** `emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength, maxPasswordLength }`.
- **Session.** `session: { expiresIn, updateAge, cookieCache: { enabled: false } }`. Sans cache de cookie, une révocation (déconnexion, réinitialisation) prend effet tout de suite.
- **Hook de défense.** `databaseHooks.session.create.before` refuse toute session d'un compte dont l'email n'est pas confirmé.
- **Cookies et plugins.** `advanced.cookiePrefix`, cookies sécurisés en production, `plugins: [nextCookies()]`.
- **Exclusions.** Pas de `socialProviders`, de 2FA, de plugin admin ni de suspension.
- **Variables d'environnement**, que vous créez : `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (sert aussi de base aux liens des emails), et `SMTP_USER` / `SMTP_PASSWORD` en option.
- **Vérifications à faire en E1.1** dans la doc de la version installée (dans le conteneur) : les noms exacts des options, le comportement de `requireEmailVerification` sans `sendVerificationEmail`, et l'export de `hashPassword`. Je ferai de même pour `node_modules/next/dist/docs` : `proxy.ts`, `headers()` avec `cacheComponents`, et `after()`.

#### Parcours (Server Actions, Zod)

**Schémas Zod** (`src/server/auth/schemas.ts`). L'email est normalisé par `trim().toLowerCase()`. Les clés inconnues sont retirées, si bien qu'un champ `role` envoyé dans la requête est ignoré (AUTH-01 CA3).

**Envoi après la réponse.** Les emails partent via `after()` : le temps de réponse est le même que l'email existe ou non.

**Inscription (AUTH-01).** On applique la limite par IP, puis :
- email nouveau : on crée l'élève non confirmé et on émet le jeton de confirmation ;
- email existant non confirmé : on renvoie un lien ;
- email existant confirmé : on envoie un avis « vous avez déjà un compte ».

Dans les trois cas, la réponse est la même : « Check your email ».

**Confirmation.** La page `/verify-email?token=` affiche un bouton, et seule l'action POST consomme le jeton. Les antivirus de messagerie ouvrent les liens : une consommation dès le GET brûlerait le jeton. Un jeton expiré, utilisé, révoqué ou falsifié donne le même refus, et le compte reste non confirmé.

**Connexion (AUTH-02).** On vérifie d'abord le verrou par email. Puis `signInEmail` :
- échec : le compteur augmente et le message est toujours « Invalid email or password. », y compris quand le compte est verrouillé, même avec le bon mot de passe ;
- succès sur un compte non confirmé : aucune session, message de confirmation et renvoi proposé (R3) ;
- succès : le compteur est remis à zéro et l'utilisateur est redirigé vers `roleHome[role]`.

**Déconnexion.** `auth.api.signOut` supprime la session en base et efface le cookie.

**Mot de passe oublié (AUTH-05).** On applique la limite par email et la réponse est identique pour tous. Si le compte existe, on émet un jeton `password_reset`, ce qui révoque les précédents. Sur `/reset-password`, une transaction :
1. consomme le jeton ;
2. écrit le nouveau hash, et crée le compte `credential` s'il manque ;
3. passe `email_verified` à vrai (R1) ;
4. supprime toutes les sessions (CA2) ;
5. trace l'événement.

**Renvoi de la confirmation.** Même schéma : réponse identique, et l'ancien lien est révoqué.

**Invitation professeur (AUTH-03).** Chaque action contrôle `requireRole("admin")` côté serveur.
- **Création** (`{ firstName, lastName, email }`) : un email déjà pris par un compte est refusé explicitement, côté administrateur seulement (R3).
- **Réémission** : révoque l'ancien jeton et en émet un nouveau.
- **Annulation** : pose `revoked_at` et révoque les jetons.
- **Acceptation** sur `/invitation?token=` (choix du mot de passe), en une transaction : consommation du jeton, vérification que l'invitation est en attente et l'email libre, création du compte `teacher` déjà confirmé, invitation marquée acceptée. Ensuite, connexion et redirection vers `/teacher`.

**Premier administrateur (Q2, provisoire).** Le script `scripts/create-admin.ts` est lancé par `npm run admin:create -- --email … --first-name … --last-name …` (avec `tsx`, dans le conteneur).
- Il refuse s'il existe déjà un administrateur (A2) ou si l'email est déjà pris.
- Il crée le compte `admin` confirmé, sans mot de passe, puis émet un lien `password_reset` par l'interface email (fichier de capture en développement).
- Aucun mot de passe ne passe par le shell.

#### Sessions côté serveur et protection des routes

Trois niveaux de défense :

1. **`src/proxy.ts`** fait un contrôle optimiste. Sans cookie de session sur `/student`, `/teacher` ou `/admin`, il redirige vers `/sign-in`. Il pose aussi `Cache-Control: no-store` sur ces chemins pour que le bouton retour n'affiche plus rien après déconnexion (R4). Ce n'est pas une barrière de sécurité.
2. **`src/server/auth/session.ts`** fournit :
   - `getActor()`, qui lit `getSession({ headers })` en base et renvoie l'`Actor` existant (`visitor`, ou `user` avec `role`) ;
   - `requireRole(role)`, qui redirige un visiteur vers `/sign-in` et renvoie `notFound()` pour un rôle différent (même réponse qu'une ressource inexistante, AUTH-04 R3).

   Chaque `layout.tsx` d'espace l'appelle, et chaque Server Action le rappelle elle-même.
3. **La couche de données** reçoit l'`Actor`, filtre la propriété et lève `AccessDeniedError` (point unique, SEC-01). La matrice exécutable se fait en E1.6.

`/` redirige l'utilisateur connecté vers l'espace de son rôle, et le visiteur vers `/sign-in`. Le `RoleSwitcher` est retiré en E1.3.

#### Interface email (`src/server/email/`)

- `types.ts` : `EmailMessage { to, subject, text, html? }` et l'interface `EmailSender { send(msg): Promise<void> }`.
- `index.ts` : `getEmailSender()`, qui choisit le transport :
  - en test, toujours la capture ;
  - avec `SMTP_USER` et `SMTP_PASSWORD`, le transport SMTP ;
  - sinon, la capture.
- `capture.ts` :
  - en mémoire, avec `captured()`, `clear()` et `failNext(error)` pour injecter une panne (EXP-04) ;
  - en développement, écrit aussi chaque message en JSON dans `.mail-capture/` (gitignoré), avec la liste des liens en tête. [D] 2026-10-12 : pas de page `/dev/mailbox` (retirée au T1 d'E1 : Gmail SMTP actif en dev, les fichiers suffisent sans SMTP).
- `smtp.ts` : Nodemailer `service: "gmail"`, expéditeur `SMTP_USER`. Seuls l'échec et le type de message sont journalisés, jamais le destinataire ni le lien.
- `templates.ts` : les quatre emails, en anglais (confirmation, réinitialisation, invitation, avis de compte existant).

#### Fichiers principaux

- **Schéma et configuration** : `src/server/db/schema/auth.ts` (+ export dans `index.ts`), `drizzle/0001_create_auth.sql`, `src/config/provisional.ts`.
- **Couche de données** : `src/server/data/auth/` avec `better-auth.ts`, `accounts.ts`, `tokens.ts`, `throttle.ts`, `invitations.ts`, `security-events.ts`.
- **Session et validation** : `src/server/auth/session.ts`, `schemas.ts`, `messages.ts`.
- **Email** : `src/server/email/*`.
- **Routes** : `src/proxy.ts`, et les écrans de `src/app/(auth)/…` (sign-in, sign-up, check-email, verify-email, forgot-password, reset-password, invitation), faits avec `/build-ui` en E1.2 à E1.5.
- **Espaces** : `src/app/{student,teacher,admin}/layout.tsx`, et `src/app/admin/teachers/page.tsx`, qui passe de la maquette à la liste des invitations.
- **Script** : `scripts/create-admin.ts`.
- **Dépendances** (`docker compose exec web npm install …`) : `better-auth`, `zod`, `nodemailer` ; en développement, `@types/nodemailer` et `tsx`.

#### Découpage par prompt

| Prompt | Livre |
|---|---|
| E1.1 | Dépendances, schéma et migration (dev et test), config Better Auth, interface email avec capture, valeurs provisoires. Pas d'écran. |
| E1.2 | Inscription et confirmation |
| E1.3 | Connexion, déconnexion, session, `proxy.ts`, `requireRole`, retrait du RoleSwitcher |
| E1.4 | Mot de passe oublié et renvoi |
| E1.5 | Invitations, acceptation et script administrateur |
| E1.6 | Matrice exécutable et Playwright |

#### Vérification

- **Unitaires** : normalisation Zod, retrait de `role`, génération et empreinte des jetons, calcul de la temporisation, choix du transport.
- **Intégration** (`*.int.test.ts`, base de test, capture) : chaque critère d'AUTH-01 à 05. On vérifie que les réponses sont identiques (corps de réponse égaux pour un email connu et un email inconnu) et que les jetons expirés, utilisés, révoqués ou falsifiés sont refusés. On vérifie aussi :
  - qu'il n'y a pas de session pour un compte non confirmé ;
  - le verrou après N échecs, même avec le bon mot de passe ;
  - la suppression des sessions après réinitialisation ;
  - qu'un rôle forcé reste `student` ;
  - les refus d'un non-administrateur sur les actions d'invitation.
- **Les trois parcours** (Playwright en E1.6, à la main dès E1.3) :

| Cas | `/student/*` | `/teacher/*` | `/admin/*` |
|---|---|---|---|
| Visiteur | → `/sign-in` | → `/sign-in` | → `/sign-in` |
| Élève | 200 | 404 | 404 |
| Professeur | 404 | 200 | 404 |
| Administrateur | 404 | 404 | 200 |
| Après déconnexion, bouton retour | → `/sign-in` | → `/sign-in` | → `/sign-in` |

- **À la main** : `docker compose up`, puis inscription, lien lu dans l'email reçu (ou dans `.mail-capture/` sans SMTP), confirmation, connexion. Ensuite `npm run admin:create`, invitation, acceptation, et connexion du professeur. Enfin `docker compose exec web npm test` et `npm run lint`.

#### Limites assumées

- Pas de suspension de professeur (Q2, V2).
- La temporisation par email peut servir à bloquer le compte d'un tiers. Le risque est accepté pour la démonstration et sera signalé en E10.
- Gmail SMTP sert à la démonstration seulement (délivrabilité).
