# 0005. Assignments and the student space: decision record

## Context

Step E3 of the implementation plan (`conception/fonctionnalites.md` §8.2). Requirements and acceptance criteria live in `conception/fonctionnalites.md` and `conception/besoins-non-fonctionnels.md` (French).

## Options considered

Weighed inside the approved plan below (sections "Contexte", choices marked [P] or [D], and the plan history at its end).

## Rationale

The plan below was approved by the engineer before the build, then amended in its history section as gaps were found. It is copied verbatim, in French, from `~/.claude/plans/`; only its headings moved two levels down.

## References

**Project sources**:
- `conception/fonctionnalites.md`, `conception/stack-technologique.md` §3 (provisional values per step)
- `conception/prompts-implementation.md` (prompts of step E3)

## Approved plan: `plan-e3.md` (verbatim)

### Plan E3 — Devoirs et espace élève (ASG-01 à ASG-03, SUB-01)

#### Contexte

E2 est livrée (classes, appartenances, matrice `class*`). Les écrans `/teacher/assignments` et `/student/assignments` sont des maquettes sur `src/mock/`. E3 crée le Devoir et l'Envoi, la liste et la page d'un devoir pour le professeur, la modification et la suppression sous verrou, et l'espace élève à liste fermée d'états. E3 prépare aussi deux mécanismes qu'E4 utilisera : le verrou posé par la première remise et la lecture d'un devoir par un élève retiré qui a une remise.

**Décision prise ici [D, 2026-10-14]** : la réception est **dérivée**. Un élève voit les devoirs des classes où son appartenance est active, quelle que soit la date d'envoi. Un élève qui rejoint tard voit donc les devoirs déjà envoyés ; un élève réadmis voit aussi ceux envoyés pendant son retrait. Aucune table de destinataires par élève. CLS-04 CA2 reste vrai : tant qu'il est retiré, il ne reçoit rien.

#### 1. Tables et contraintes (`src/server/db/schema/assignments.ts`, réexporté par `index.ts`)

Enums : `assignment_level` (`A1`, `A2`, `B1`, `B2`, `C1`) et `assignment_language` (`en`, `fr`).

**`assignments`** (Devoir)
| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid, défaut aléatoire | |
| `teacher_id` | uuid → `users` | créateur = correcteur (invariant 3) |
| `title`, `subject` | text non nuls | check : sans espace aux bords, non vides |
| `level` | `assignment_level` | simple étiquette (D4), lue par aucun code de l'IA |
| `language` | `assignment_language` | |
| `deadline` | timestamptz | instant UTC (voir §5) |
| `instructions` | text, nullable | check : `null` ou non vide après btrim (jamais `''`) |
| `content_version` | integer, défaut 1 | incrémentée à chaque modification de subject, language, instructions ou deadline |
| `locked_at` | timestamptz, nullable | verrou : posé par la première remise (E4) |
| `created_at`, `updated_at` | timestamptz | |

- Unique `(id, teacher_id)` : cible de la clé composée ci-dessous.
- Index `(teacher_id, deadline desc)` : pour la liste ASG-02.

**`assignment_classes`** (Envoi)
- Colonnes : `id`, `assignment_id`, `class_id`, `teacher_id`, `created_at`.
- Unique `(assignment_id, class_id)` : la même classe envoyée deux fois devient un seul envoi.
- Index `class_id` : sert la lecture côté élève.
- **Clés étrangères composées** : `(assignment_id, teacher_id)` → `assignments(id, teacher_id)` avec `on delete cascade`, et `(class_id, teacher_id)` → `classes(id, teacher_id)`. Il faut pour cela un unique `(id, teacher_id)` sur `classes`. La base refuse ainsi d'envoyer un devoir à la classe d'un autre professeur, en plus du contrôle dans le code : l'invariant 3 est garanti en base.

Les noms de colonnes viennent de `casing: "snake_case"`, comme en E2.

#### 2. Migration

Commande : `npm run db:generate -- --name=create_assignments`, qui produit `drizzle/0006_create_assignments.sql`. Contenu : les 2 enums, les 2 tables, l'unique `classes(id, teacher_id)`, les checks, les index et les clés composées. Je relis le SQL avant de le commiter, puis `npm run db:migrate` sur dev.

#### 3. Verrouillage et concurrence (ASG-03)

**Comment le devoir sait qu'il a une remise.** Par la colonne `locked_at`. En E4, la transaction de la première remise exécute d'abord, sur la ligne du devoir :
```sql
UPDATE assignments SET locked_at = coalesce(locked_at, now())
WHERE id = $a AND content_version = $vu RETURNING id
```
`$vu` est la `content_version` affichée à l'élève quand il a ouvert le formulaire. Si aucune ligne ne revient, la remise est refusée avec « The assignment changed, reread it ». Si une ligne revient, la remise est insérée dans la même transaction.

**Pourquoi une colonne plutôt qu'un `exists(submissions)`.** En READ COMMITTED, le test « aucune remise » d'une modification et l'insertion d'une remise concurrente ne se voient pas : les deux réussiraient. La colonne place les deux opérations sur la même ligne, et c'est le verrou de cette ligne qui les met en ordre.

**Les écritures du professeur gardent la condition dans la requête elle-même :**
- Modification d'un champ verrouillable :
  ```sql
  UPDATE … SET …, content_version = content_version + 1
  WHERE id AND teacher_id AND locked_at IS NULL
  ```
- Modification du titre et du niveau seuls : la requête n'a pas de condition sur `locked_at` et n'incrémente pas la version.
- Suppression : `DELETE … WHERE id AND teacher_id AND locked_at IS NULL`. Les envois partent avec le devoir (cascade). En E4, `submissions.assignment_id` aura `on delete restrict` en filet de sécurité.

**Arbitrage : une seule opération l'emporte.** Postgres réévalue le `WHERE` de la seconde opération sur la ligne déjà modifiée par la première.

| Ordre | Résultat |
|---|---|
| Remise, puis modification ou suppression | 0 ligne : refus `locked` |
| Modification, puis remise | la version a changé : remise refusée, l'élève relit |
| Suppression, puis remise | 0 ligne : refus « assignment no longer available » |

Il n'y a pas de verrou applicatif ni de transaction SERIALIZABLE. Le data layer distingue « absent » de « verrouillé » par une relecture filtrée par `ownedBy` après 0 ligne.

**Ce qui est fait en E3.** `locked_at` n'est jamais posé par l'application. Les tests de CA2 le posent directement en base (prompt E3.3) ; E4 rejoue le cas sur de vraies remises.

#### 4. Matrice et propriété

##### Lignes de `matrix.ts`
- **`assignment`** existe déjà. Je complète seulement son commentaire : l'élève lit par appartenance active, ou par remise à partir d'E4. Le professeur écrit sous le verrou.
- **`assignmentRecipients`** [P] (Envoi), libellé « Assignment recipient classes ».
  - `ownerTeacher: LW` ; toutes les autres colonnes : `NO`.
  - L'élève ne voit jamais les classes destinataires : avec la déduplication, elles ne lui apprennent rien.
- **`ownSubmissionStatus`** [P], libellé « Status of the own submission, closed list (SUB-01 R3) ».
  - `concernedStudent: L` ; toutes les autres colonnes : `NO`.
  - C'est cette ligne, et non `submission` où l'élève n'a pas de lecture, qui couvre l'état vu par l'élève.
  - Elle ne donne jamais accès à la remise : seule la projection `toStudentStatus` (`src/lib/submission-status.ts`, déjà écrite) en sort.
  - Le professeur n'a pas cette ligne : il lit l'état interne par `submission` (E7).
  - Effet utile : la fonction de l'espace élève refuse un professeur avec `AccessDeniedError`.

##### `ownedBy` côté élève (propriété indirecte)
Propriétaires dans `src/server/data/assignments/assignments.ts` :
```ts
const receivedBy = (userId: string) => sql`exists (
  select 1 from ${assignmentClasses} ac
  join ${classMemberships} m on m.class_id = ac.class_id
  where ac.assignment_id = ${assignments.id}
    and m.student_id = ${userId} and m.status = 'active')`;
const owners = { teacher: assignments.teacherId, student: receivedBy };
```
- `ownedBy` accepte déjà une fonction `(userId) => SQL`, comme `activeMemberOf` en E2 : rien ne change dans `access.ts`.
- **Déduplication** : la condition est un `EXISTS` dans le `WHERE`, sans jointure. Un devoir envoyé à deux classes de l'élève sort une seule fois.
- **En E4**, `receivedBy` devient `exists(appartenance active) OR exists(remise de l'élève pour ce devoir)`. La modification se fait à ce seul endroit, et l'élève retiré garde la lecture des devoirs qu'il a remis.
- Le droit de remettre (appartenance active seulement) se contrôle dans la requête de remise d'E4, pas ici.

#### 5. Fuseau unique

- **Valeur** : dans `src/config/decisions.ts`, `DEADLINE_TIME_ZONE = "Africa/Casablanca"` [D, 2026-10-14], commentée comme `CLASS_INVITE_TTL`.
- **Fichier** : `src/lib/time-zone.ts`, sans dépendance, sur `Intl`, avec tests unitaires.
- **Saisie** : un champ `<input type="datetime-local">` donne une heure murale. `wallTimeToInstant(wall, DEADLINE_TIME_ZONE)` la convertit :
  - calcul du décalage par `Intl.DateTimeFormat(…, { timeZoneName: "longOffset" })` ;
  - deux itérations pour tomber juste ;
  - aller-retour de contrôle.
- **Heures particulières** (le Maroc passe de UTC+1 à UTC+0 pendant le Ramadan) :
  - une heure inexistante est refusée avec un message par champ ;
  - une heure ambiguë prend la première occurrence [P].
- **Édition** : `instantToWallTime` préremplit le champ.
- **Affichage** : `formatDateTime(iso)` et `formatDate(iso)` affichent toujours dans le fuseau, avec son nom. Exemple : « Oct 20, 2026, 18:00 (Casablanca, GMT+1) ».
  - Le nom vient d'une constante d'affichage dérivée de la valeur ; le décalage vient de `timeZoneName: "shortOffset"`.
  - Une légende « Times are in Casablanca time (Africa/Casablanca) » accompagne le champ de saisie.
- **Comparaisons** : « date limite dépassée » se calcule en SQL (`deadline < now()`), à cause des deux horloges.
- **Remplacement des formats UTC** par ces helpers, dans les écrans réels :
  - `student/assignments/page.tsx`
  - `teacher/assignments/assignments-table.tsx`
  - `teacher/classes/page.tsx`
  - `teacher/classes/[classId]/roster.tsx`
  - `admin/teachers/invitations-table.tsx`
  - Les maquettes déplacées et `/dev/design` restent sur données fictives : je les aligne aussi, pour ne garder qu'une façon de formater.

#### 6. Validation et valeurs provisoires

- **Schéma Zod** : `src/server/assignments/schemas.ts`, pour la création et la modification. Il donne un message par champ :
  - `title` et `subject` requis ; `instructions` facultatif (vide devient `null`) ;
  - `level` et `language` dans les enums ;
  - `deadline` : une heure murale valide, dans le futur à la création comme à la modification [P] ;
  - `classIds` : au moins 1 uuid à la création, dédupliqués ; absent à la modification.
- **Longueurs maximales** dans `provisional.ts`, marquées [PROVISIONAL, [P] arbitrary] et à consigner en T5 :
  - `ASSIGNMENT_TITLE_MAX_LENGTH = 120` ;
  - `ASSIGNMENT_SUBJECT_MAX_LENGTH = 2000` ;
  - `ASSIGNMENT_INSTRUCTIONS_MAX_LENGTH = 4000`.

#### 7. Couche données (`src/server/data/assignments/`)

`assignments.ts` : chaque fonction reçoit l'`Actor`, appelle `authorize` en premier, filtre avec `ownedBy` et renvoie un DTO minimal.

| Fonction | authorize | Rôle |
|---|---|---|
| `createAssignment(actor, input)` | `assignment` write, `assignmentRecipients` write | Une transaction. Elle vérifie que `select count(*) from classes where id = any($ids) and teacher_id = $me` égale le nombre d'identifiants, sinon `{ok:false, reason:"class_not_found"}` (rollback, rien de créé). Elle insère ensuite le devoir puis les envois. La clé composée sert de filet. |
| `listTeacherAssignments(actor)` | `assignment` read | Liste ASG-02 R1 : titre, langue, niveau, date limite, classes (noms triés), nombre de remises, nombre de copies à valider, `locked`. Tri par date limite la plus récente d'abord. Les deux compteurs valent 0 jusqu'en E4 et E7. |
| `getTeacherAssignment(actor, id)` | `assignment` read | Détail, `contentVersion` et `locked` compris ; `null` si absent ou à autrui. |
| `updateAssignment(actor, id, patch)` | `assignment` write | Requête conditionnelle du §3. Résultat : `ok`, `locked` ou `null`. |
| `deleteAssignment(actor, id)` | `assignment` write | Suppression conditionnelle du §3. Résultat : `ok`, `locked` ou `null`. |
| `listStudentAssignments(actor)` | `assignment` read, `ownSubmissionStatus` read | DTO fermé `{id, title, subject, instructions \| null, language, deadline, deadlinePassed, status: StudentStatus}`. En E3, `status = toStudentStatus("to_submit")`. Ni niveau, ni classe, ni état interne, ni `contentVersion` (il arrive en E4 avec le formulaire de remise). |
| `listOwnClassesForPicker(actor)` | — | Inutile : je réutilise `listClasses` (`src/server/data/classes/classes.ts`). |

**Service** : `src/server/assignments/assignments.ts`, sur le modèle de `src/server/classes/classes.ts`. Il fait la validation Zod, traduit les résultats en états de formulaire, journalise `access_denied` par `recordSecurityEvent`, et n'utilise pas les API de requête de Next, ce qui le rend testable en intégration.

#### 8. Routes et Server Actions

**Pages**
| Route | Contenu |
|---|---|
| `/teacher/assignments` | Liste réelle, bouton « New assignment ». État vide qui renvoie vers la création, ou vers Classes s'il n'y a aucune classe. |
| `/teacher/assignments/new` | Formulaire : cases à cocher des classes du professeur ; avertissement R4 près de Subject et Instructions. |
| `/teacher/assignments/[assignmentId]` | Détail et actions : Edit, Delete avec `ConfirmDialog`. `export const instant = false`, contrôle d'accès au niveau de la page avant tout streaming, uuid validé, 404 réel (modèle `teacher/classes/[classId]/page.tsx`). La liste des remises arrive en E7. |
| `/teacher/assignments/[assignmentId]/edit` | Même formulaire, sans les classes. Champs verrouillés désactivés et marqués « Locked: the assignment has submissions ». Même contrôle 404. |
| `/student/assignments` | Liste réelle sur téléphone d'abord. Groupe « To submit » trié par date limite. Mention « Deadline passed ». Instructions absentes : aucun bloc. Élève sans devoir : état vide qui renvoie vers Join a class. |
| `/dev/mockups/assignments/[assignmentId]` (1.4) et `…/students/[studentId]` (1.5) | Déplacement des fichiers actuels de `teacher/assignments/[assignmentId]/**` avec leurs composants. `src/app/dev/mockups/layout.tsx` appelle `notFound()` quand `NODE_ENV === "production"`, donc les maquettes n'existent pas sur la preview. Elles restent hors de `/teacher`, donc hors des routes réelles. |

**Server Actions** dans `src/app/teacher/assignments/actions.ts`. Chacune lit `getActor()`, appelle le service, puis `refresh()` en cas de succès (modèle des classes).

| Action | Ressource et action |
|---|---|
| `createAssignmentAction` | `assignment` write. Redirige ensuite vers la page du devoir. |
| `updateAssignmentAction` | `assignment` write |
| `deleteAssignmentAction` | `assignment` write. Redirige ensuite vers la liste. |

L'espace élève n'a aucune action en E3.

#### 9. Inventaire (`inventory.ts`)

- **`TABLES`** :
  - `assignments: ["assignment"]` ;
  - `assignment_classes: ["assignmentRecipients"]`.
- **`ENTRY_POINTS`** : les trois actions ci-dessus, avec `{ resource: "assignment", action: "write" }`.
- **`UNGUARDED_DATA_EXPORTS`** : aucune nouvelle entrée, car toutes les fonctions appellent `authorize`.
- **`REAL`** (`tests/access-matrix.int.test.ts`), avec une fixture `ownedAssignment` : la classe de `ownedClass`, plus un devoir et son envoi.
  - `assignment` : `read` par `getTeacherAssignment`.
    - L'élève passe par une petite fonction de test `readStudentAssignment(actor, id)` qui appelle `listStudentAssignments` et y cherche `id`.
    - Ses colonnes « autre » doivent donner « absent ».
  - `assignment` : `write` par `updateAssignment` sur le titre.
  - `assignmentRecipients` : `write` par `createAssignment` (`creates`) ; `read` par `getTeacherAssignment` (classes).
  - `ownSubmissionStatus` : `read` par `listStudentAssignments`.
  - Si la règle « une fonction = une ressource » du test d'inventaire (`checkDataExports`) refuse deux `authorize` dans une même fonction, je l'adapte pour accepter plusieurs littéraux. Je vérifie ce test en premier.

#### 10. Cache (`cacheComponents`)

- Aucune donnée de devoir n'est en `"use cache"` : toutes les lectures dépendent de la session (`getActor` lit les cookies), donc elles sont dynamiques et relues à chaque requête.
- Les pages ressource (`instant = false`) bloquent sur la lecture.
- Après une écriture, `refresh()` (`next/cache`) rafraîchit le routeur du client qui a écrit.
- Les autres clients, notamment l'élève, n'ont pas de copie servie par le serveur. Le cache client du routeur ne garde pas de segment dynamique pour une navigation : `staleTimes.dynamic` vaut 0 par défaut et `next.config.ts` ne le change pas. Je le confirme dans `node_modules/next/dist/docs/` à l'implémentation.
- Test E2E : le professeur modifie le sujet, puis l'élève, dans un autre contexte de navigateur qui a déjà visité la page, navigue vers `/student/assignments` par le lien du menu et voit le nouveau sujet.

#### 11. Vérification

- **Unitaires** : `time-zone.ts` (heure normale, Ramadan, heure inexistante, aller-retour), schémas Zod (champ manquant, niveau ou langue hors liste, liste de classes vide ou en double, instructions vides devenues `null`), `toStudentStatus`.
- **Intégration** (`tests/assignments.int.test.ts`) :
  - ASG-01 :
    - CA1 : C1 et C3 choisies sur trois classes ;
    - CA2 : la classe d'un autre professeur glissée dans la requête donne un refus, 0 devoir et 0 envoi ;
    - CA3.
  - ASG-02 CA1 : ordre et isolement d'un autre professeur.
  - ASG-03 :
    - CA1 ;
    - CA2, avec `locked_at` posé dans le test : modification des champs verrouillés et suppression refusées, titre et niveau acceptés ;
    - CA3 ;
    - course : deux transactions, `UPDATE locked_at` puis modification concurrente, une seule aboutit.
  - SUB-01 :
    - CA1, devoir de C2 absent ;
    - élève de C1 et C3 qui voit le devoir une fois ;
    - CA3, état vide ;
    - le DTO a exactement les clés de la liste fermée.
  - CLS-04 CA2 rejoué : un élève retiré ne voit pas le devoir, il le voit après réadmission.
- **Matrice** : `npm test` rejoue chaque cellule des trois lignes. Le test d'inventaire passe.
- **E2E** (`e2e/e3-journey.spec.ts`) :
  - le professeur crée un devoir pour C1 et C3 ; l'élève des deux classes le voit une fois, avec le fuseau affiché ;
  - un élève sans classe voit l'état vide ;
  - un sujet modifié est vu par l'élève ;
  - l'adresse d'un devoir d'autrui donne un statut 404.
  - Je lance `docker compose run --rm e2e`, jamais en même temps que les tests d'intégration. Captures Playwright envoyées à l'utilisateur.
- `lint`, `typecheck`, puis `next build` dans le conteneur `e2e`, puis `docker compose restart web`.

#### Découpage (prompts E3.1 à E3.5)

| Prompt | Contenu |
|---|---|
| E3.1 | Schéma, migration, fuseau, création, lignes de matrice et d'inventaire |
| E3.2 | Liste, page d'un devoir, maquettes vers `/dev/mockups` |
| E3.3 | Modification, suppression, verrou |
| E3.4 | Espace élève |
| E3.5 | Rejeux et E2E |

Commit sur `preview` à la fin de chaque prompt, sans pousser.

**À consigner en T5** :
- la réception dérivée [D] ;
- les lignes [P] `assignmentRecipients` et `ownSubmissionStatus` ;
- `content_version` et l'arbitrage [P] ;
- les longueurs maximales ;
- l'heure ambiguë et le refus d'une heure inexistante [P] ;
- la date limite dans le futur [P].
