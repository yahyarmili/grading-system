# 0004. Classes and invitation: decision record

## Context

Step E2 of the implementation plan (`conception/fonctionnalites.md` §8.2). Requirements and acceptance criteria live in `conception/fonctionnalites.md` and `conception/besoins-non-fonctionnels.md` (French).

## Options considered

Weighed inside the approved plan below (sections "Contexte", choices marked [P] or [D], and the plan history at its end).

## Rationale

The plan below was approved by the engineer before the build, then amended in its history section as gaps were found. It is copied verbatim, in French, from `~/.claude/plans/`; only its headings moved two levels down.

## References

**Project sources**:
- `conception/fonctionnalites.md`, `conception/stack-technologique.md` §3 (provisional values per step)
- `conception/prompts-implementation.md` (prompts of step E2)

## Approved plan: `plan-e2.md` (verbatim)

### Plan E2 — Classes et invitation (CLS-01 à CLS-04)

#### Contexte

E1 est livrée : comptes, matrice §5.4 en données (`src/server/access/matrix.ts`), `authorize()` + `ownedBy()`, inventaire testé, liens à usage unique consommés par POST, compteurs d'essais en base (`src/server/data/auth/throttle.ts`). Les pages `teacher/classes` et `student/classes` sont encore des maquettes (`src/mock/data.ts`). E2 rend les classes réelles : le professeur crée ses classes et partage un lien ou un code ; l'élève rejoint sans approbation (D2), y compris depuis un lien ouvert sans session ; le professeur retire et réadmet.

Tout chiffre ci-dessous non issu de la conception est **[P]** et va dans `src/config/provisional.ts`.

#### 1. Tables (migration `create_classes`)

Fichier `src/server/db/schema/classes.ts`, réexporté par `index.ts`.

**`classes`** : `id`, `teacher_id` → users, `name`, `invite_nonce` (32 octets aléatoires, base64url), `invite_link_digest` (unique), `invite_code_digest` (unique), `invite_issued_at`, `invite_disabled_at` (null = actif), `created_at`, `updated_at`.
- Unicité du nom : index unique `(teacher_id, lower(name))` ; nom normalisé (trim, espaces repliés) par Zod, contrôle `name = btrim(name)`.
- Le lien et le code ne sont **jamais stockés** : seuls le nonce et deux empreintes (NFR-SEC-03).

**`class_memberships`** : `id`, `class_id` → classes, `student_id` → users (cascade), `status` (`pgEnum membership_status` : `active`, `removed`), `joined_at`, `removed_at`, timestamps. Unique `(class_id, student_id)` ; index `student_id` ; contrôle `(status = 'removed') = (removed_at is not null)`.

**`class_join_intents`** (interne) : `id`, `user_id` → users (cascade), `link_digest`, `created_at`. Unique `(user_id, link_digest)`. Voir §5.

**`security_event_type`** : ajout de `class_invite_renewed`, `class_invite_disabled`, `class_member_removed`, `class_member_readmitted` [P] (DON-05).

#### 2. Format du lien et du code

Module pur `src/server/classes/invite-codes.ts` (testé unitairement) :
- Clé `K` = HKDF-SHA256(`BETTER_AUTH_SECRET`, info `"class-invite"`) : **aucune nouvelle variable** dans Vercel.
- **Lien** : `token = base64url(HMAC(K, "link:" + nonce))` (256 bits, 43 caractères, même motif que `TOKEN_PATTERN`) ; URL `appUrl("/join", { token })`, comme `/verify-email?token=`. Empreinte : SHA-256 (entropie suffisante).
- **Code** [P] : 8 symboles Crockford Base32 (sans I, L, O, U) tirés de `HMAC(K, "code:" + nonce)`, soit 40 bits ; affiché `XXXX-XXXX`. Saisie normalisée : majuscules, sans espaces ni tirets, `O→0`, `I/L→1`. Empreinte **à clé** `HMAC(K, "lookup:" + code)` : une fuite de la base ne permet pas de retrouver un code de 40 bits par force brute.
- Le professeur revoit lien et code à tout moment : ils sont recalculés depuis le nonce.
- **Renouveler** = nouveau nonce, donc nouveaux lien, code et empreintes ; `invite_disabled_at` remis à null. **Désactiver** = `invite_disabled_at = now()`. Pas de réactivation de l'ancien couple [P] : après une désactivation, on renouvelle. Les élèves rattachés restent (CA2).
- Effet de bord à connaître : changer `BETTER_AUTH_SECRET` change tous les liens et codes (et ferme les sessions).
- Collision d'empreinte unique à la création ou au renouvellement : nouveau nonce, un seul nouvel essai.

**Validité (Q7 ouverte)** : `CLASS_INVITE_TTL: number | null = null` [PROVISOIRE, recommandation de Q7 : pas d'expiration automatique, non décidée]. Fonction pure `isInviteUsable({ disabledAt, issuedAt }, ttl, now)`, testée avec un TTL non nul pour que l'expiration soit prête si Q7 la retient.

#### 3. Extension de la matrice

Détail [P] de la ligne §5.4 « Classe, lien, code, liste d'élèves », comme `teacherInvitation` en E1 :

| Ressource | Élève concerné | Autre élève | Prof. propriétaire | Autre prof. | Admin | Visiteur |
|---|---|---|---|---|---|---|
| `class` (nom ; inchangée) | L (classes actives) | — | L É | — | — | — |
| `classInvite` (lien, code) — nouvelle | — | — | L É | — | — | — |
| `classMembership` (sa propre appartenance : rejoindre) — nouvelle | É | — | — | — | — | — |
| `classRoster` (liste des élèves avec nom, prénom, email ; retrait, réadmission) — nouvelle | — | — | L É | — | — | — |

- Séparer `classMembership` et `classRoster` évite qu'un professeur passe `authorize(…, "write")` sur « rejoindre ».
- Propriété (`ownedBy`) : professeur = `classes.teacher_id` ; élève sur `class` = `exists` d'une appartenance **active** (un élève retiré ne voit plus la classe [P]).
- `tests/access-matrix.int.test.ts` : les sondes rejouent automatiquement les nouvelles lignes ; `REAL` reçoit `class`, `classInvite`, `classMembership`, `classRoster`.
- `inventory.ts` : `classes → ["class", "classInvite"]`, `class_memberships → ["classMembership", "classRoster"]`, `class_join_intents → internal`, chaque Server Action et les exports non gardés avec leur raison.

#### 4. Couche de données et actions serveur

Organisation comme E1 : données `src/server/data/classes/` (seules à importer `@/server/db`), logique avec Zod et états `src/server/classes/` (sans API Next, appelable par les tests), Server Actions minces.

**Données** (`Actor` en premier, `authorize`, `ownedBy`, DTO minimal) :
- `classes.ts` : `createClass` (class/write), `listClasses` (class/read : celles du professeur avec nombre d'élèves actifs, ou classes actives de l'élève avec nom du professeur), `getClass` (class/read, `null` si absente ou d'autrui).
- `invites.ts` : `getClassInvite` (classInvite/read : lien, code, état), `renewClassInvite`, `disableClassInvite` (classInvite/write).
- `memberships.ts` :
  - `joinClass(actor, { code } | { linkToken })` (classMembership/write) : compte confirmé vérifié en base ; `isLocked` → refus « trop d'essais » ; recherche par empreinte et `isInviteUsable` ; `INSERT … ON CONFLICT (class_id, student_id) DO NOTHING` puis lecture du statut. Résultats : `joined`, `alreadyMember` (même écran), `refused` (inconnu, désactivé, expiré **ou retiré** : réponse identique, CA4), `locked`. Chaque `refused` appelle `recordFailure("class_join_user", userId)`. **Pas de remise à zéro sur succès** : sinon rejoindre sa propre classe effacerait le compteur.
  - `listClassStudents(actor, classId, status)` (classRoster/read), `removeStudent`, `readmitStudent` (classRoster/write, ownership par la classe).
- `join-intents.ts` (internes, listés dans `UNGUARDED_DATA_EXPORTS`) : `recordJoinIntent(tx, userId, linkDigest)`, `joinFromIntents(tx, userId)`.
- `throttle.ts` : `LockScope` += `"class_join_user"`.

**Server Actions** :
- `src/app/teacher/classes/actions.ts` : `createClassAction`, `renewInviteAction`, `disableInviteAction`, `removeStudentAction`, `readmitStudentAction`.
- `src/app/student/classes/actions.ts` : `joinClassByCodeAction`.
- `src/app/(auth)/actions.ts` : `rememberInviteAction` (visiteur : pose le cookie, redirige vers sign-in ou sign-up), `joinByLinkAction` (élève connecté) ; `signUpAction`, `signInAction` modifiés (§5).

**Valeurs provisoires ajoutées** : `CLASS_INVITE_TTL = null` [Q7] ; `CLASS_JOIN_MAX_FAILURES = 5`, `CLASS_JOIN_LOCKOUT = 15 min` [P arbitraire, alignés sur la connexion] ; `CLASS_INVITE_INTENT_TTL = 7 jours` [P arbitraire] ; `CLASS_NAME_MAX_LENGTH = 60` [P arbitraire].

#### 5. Conservation de l'intention d'invitation

Le lien ne rattache jamais sur un GET ; il ne montre aucune donnée de classe avant le rattachement (CLS-02 R2), donc la page ne révèle pas si le lien est valide.

1. **`/join?token=…`** (public, groupe `(auth)`, hors `proxy.ts`) :
   - visiteur : « You've been invited to join a class » + « Sign in » / « Create an account », deux formulaires vers `rememberInviteAction` : cookie `class_invite` (le jeton du lien ; httpOnly, SameSite=Lax, Secure en prod, durée `CLASS_INVITE_INTENT_TTL`), puis redirection ;
   - élève connecté : bouton « Join class » → `joinByLinkAction` → `/student/classes?join=done|refused` ;
   - professeur ou admin : « Only student accounts can join a class. »
   - En-tête `Referrer-Policy: no-referrer` sur cette page.
2. **Connexion** (`signInAction`) : rôle élève et cookie présent → `joinClass({ linkToken })`, cookie effacé, redirection vers `/student/classes?join=…` au lieu de l'accueil. Autre rôle : cookie effacé.
3. **Inscription** (`signUpAction` → `signUpStudent`) : cookie présent et issue `created` ou `unconfirmed` → `recordJoinIntent` dans la transaction de `registerStudent`, **lié au compte en base**. Rien pour un compte déjà confirmé (le visiteur n'a rien prouvé ; il se connectera, étape 2).
4. **Confirmation** (`confirmEmail`) : dans la même transaction, après `emailVerified = true`, `joinFromIntents` rattache via chaque intention encore valable (lien actif, non expiré, élève non retiré ; sinon rien), puis les supprime. Ça marche **même si le lien de confirmation est ouvert dans un autre navigateur** (application mail du téléphone), où le cookie n'existe pas. Un compte non confirmé n'est jamais rattaché.
5. Même navigateur : le cookie rejoue à la connexion suivante ; c'est sans effet grâce à l'idempotence. `email-confirmed` ajoute une phrase neutre : « If you opened a class link, you'll find the class in My classes. »

#### 6. Écrans (`/build-ui`, contenu en anglais)

- **`/teacher/classes`** : liste réelle (nom, élèves actifs), « New class » (dialogue, erreur de nom dupliqué par champ), état vide. Les maquettes de classes sortent de `src/mock/data.ts` ; celles des devoirs restent jusqu'à E3.
- **`/teacher/classes/[classId]`** : carte Invite (lien et code, copie en un clic, état actif ou désactivé, « Disable » et « Generate new link and code » avec confirmation) ; onglets élèves Active / Removed (first name, last name, email, date), « Remove » avec confirmation, « Readmit ». `notFound()` si `getClass` renvoie `null`.
- **`/student/classes`** : My classes (nom, professeur), formulaire « Join a class » (code), messages : rejoint, refus neutre (« This link or code doesn't work. Check it with your teacher. »), trop d'essais. D'abord pour le téléphone.

#### 7. Découpage (prompts E2.1 à E2.5)

- **E2.1** : schéma `classes` et migration, `class` dans la matrice, `createClass`, `listClasses`, `getClass`, écran Classes (CA1-3). La migration contient déjà nonce et empreintes, générés à la création.
- **E2.2** : `invite-codes.ts`, `classInvite`, afficher, renouveler, désactiver (CLS-02 CA1-3) ; CA4 (essais) testé en E2.3 où la saisie existe.
- **E2.3** : `class_memberships`, `class_join_intents`, `joinClass`, `/join`, cookie, modifications de sign-in, sign-up et confirmation, My classes (CLS-03 CA1-4, CLS-02 CA4).
- **E2.4** : `classRoster`, liste, retrait, réadmission (CLS-04 CA1, CA4).
- **E2.5** : E2E et démonstration, puis T1 et T5 (Q7).

#### 8. Vérification

**Unitaires** (`npm test`, projet unit) : format, normalisation (`o0`, `i1`, tirets, casse) et dérivation déterministe du code ; un nonce différent donne un autre lien et un autre code ; `isInviteUsable` (désactivé, TTL null, TTL non nul expiré) ; schéma du nom (trim, vide, longueur).

**Intégration** (`*.int.test.ts`, base de test) :
- `classes.int.test.ts` : CLS-01 CA1 à CA3 ; nom en casse différente refusé.
- `class-invites.int.test.ts` : CLS-02 CA1 à CA3 ; ancien code et ancien lien refusés après renouvellement, membres conservés.
- `class-join.int.test.ts` :
  - CLS-03 CA1 à CA4 ; deux classes ; double saisie sans doublon ; jointures concurrentes ;
  - un retiré reçoit **exactement** la réponse d'un code inconnu ; N échecs puis verrou, même avec un bon code ; le succès ne remet pas le compteur à zéro ; un professeur ne peut pas rejoindre ;
  - intention : inscription avec cookie, rien avant confirmation, membre après ; lien renouvelé entre-temps, pas de rattachement ; retiré, pas de rattachement.
- `class-roster.int.test.ts` : CLS-04 CA1, CA4 ; un second professeur reçoit `null` partout.
- `access-matrix.int.test.ts` (sondes et `REAL`) et `access-inventory.test.ts` passent avec les nouvelles lignes.

**E2E** (`e2e/classes.spec.ts`, `docker compose run --rm e2e`, jamais en même temps que l'intégration) :
- le professeur crée une classe et lit le lien ;
- un visiteur l'ouvre, s'inscrit ; l'email de confirmation (capture) s'ouvre dans un **nouveau contexte de navigateur**, ce qui prouve la survie hors cookie ;
- l'élève se connecte et voit la classe ; le professeur le voit dans la liste, le retire ;
- l'élève saisit le code et reçoit le refus neutre ; réadmis, la classe revient ;
- scénario de sortie : deux professeurs, une élève dans les deux classes, chacun ne voit que sa classe et ses élèves.

**Contrôles** : `docker compose exec -T web npm test`, lint et types ; build dans le conteneur `e2e` puis `docker compose restart web` ; vérification visuelle téléphone et ordinateur (`/build-ui`).

**Fichiers clés** : `src/server/db/schema/classes.ts`, `drizzle/0002_create_classes.sql`, `src/server/access/matrix.ts`, `inventory.ts`, `src/server/data/classes/*`, `src/server/classes/*`, `src/server/data/auth/accounts.ts` (registerStudent, confirmEmail), `src/server/data/auth/throttle.ts`, `src/server/auth/sign-up.ts`, `src/app/(auth)/actions.ts`, `src/app/(auth)/join/page.tsx`, `src/app/teacher/classes/**`, `src/app/student/classes/**`, `src/config/provisional.ts`.

#### À consigner en T5 (fin d'E2)

Q7 (recommandation appliquée, non décidée) ; les lignes [P] de la matrice ; le format du code ; les valeurs [P] d'essais, de durée de l'intention et de longueur du nom ; pas de réactivation après désactivation ; un élève retiré ne voit plus la classe dans My classes.
