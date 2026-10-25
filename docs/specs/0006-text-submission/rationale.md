# 0006. Text submission: decision record

## Context

Step E4 of the implementation plan (`conception/fonctionnalites.md` §8.2). Requirements and acceptance criteria live in `conception/fonctionnalites.md` and `conception/besoins-non-fonctionnels.md` (French).

## Options considered

Weighed inside the approved plan below (sections "Contexte", choices marked [P] or [D], and the plan history at its end).

## Rationale

The plan below was approved by the engineer before the build, then amended in its history section as gaps were found. It is copied verbatim, in French, from `~/.claude/plans/`; only its headings moved two levels down.

## References

**Project sources**:
- `conception/fonctionnalites.md`, `conception/stack-technologique.md` §3 (provisional values per step)
- `conception/prompts-implementation.md` (prompts of step E4)

## Approved plan: `plan-e4.md` (verbatim)

### E4 — Remise de texte, retard, remplacement : plan (E4.0)

#### Contexte

E4 crée la remise : SUB-02, SUB-04 et SUB-05 (`fonctionnalites.md` §6, §8.2), avec la machine d'états de §5.5. E5 à E9 s'y brancheront : traitement, évaluation, revue, publication et images. Le modèle doit donc être juste dès maintenant.

Ce qui existe déjà :
- **`submission-status.ts`** : déclare les 10 états, avec `toStudentStatus`.
- **`assignments`** : porte `locked_at` et `content_version`. La garde `locked_at IS NULL` est dans l'écriture du professeur (E3).
- **Matrice** : les lignes `submission` et `ownSubmissionStatus` existent.
- **`listStudentAssignments`** : renvoie un statut figé `to_submit`.
- **`receivedBy`** : n'utilise que l'appartenance active. Le commentaire « from E4, a submission… » marque ce qui reste à faire.
- **`texts.ts`** : le module des textes décisionnels, déjà en place.

Aucune table de remise n'existe ; la dernière migration est `0006`.

**Décision de l'utilisateur pour ce plan [D, 2026-10-15]** : les 4000 caractères se comptent en caractères affichés, c'est-à-dire en graphèmes.

#### 1. Tables et contraintes (migration `0007_create_submissions`)

**Enums**
- `submission_status` contient les 9 états stockés, tous sauf `to_submit`. « À remettre » correspond à l'absence de ligne ; la transition 1 est l'insertion.
- `submission_mode` vaut `text` ou `images`.

**`submissions`** : une ligne par couple (devoir, élève), jamais supprimée.

| Colonne | Rôle |
|---|---|
| `id` uuid | |
| `assignment_id`, `teacher_id` | Clé étrangère composite vers `assignments(id, teacher_id)` (invariant 3, comme `assignment_classes`). |
| `student_id` | Référence `users`. |
| `status` | `submission_status`, `received` par défaut. |
| `submitted_at` | Date de la **première** remise, `now()` de la base. Jamais modifiée. |
| `late` | Booléen calculé en SQL à l'insertion, jamais modifié (détail au §3). |
| `content_version` | Version du sujet lue par l'élève (mécanisme d'E3). |
| `current_version` smallint | Numéro de la version active, 1 au départ. |
| `teacher_started_at` | Indicateur « le professeur a commencé ». Null en E4, posé en E7 et E8. |
| `created_at`, `updated_at` | |

Contraintes de `submissions` :
- **`unique(assignment_id, student_id)`** : une seule remise active par couple.
- `check current_version >= 1`.
- Index `(assignment_id, status)` pour les listes d'E7, et index `(student_id)`.
- Clés étrangères en `restrict` : un devoir avec remise n'est pas supprimable, même si la garde `locked_at` échoue.

**`submission_versions`** : ajout seulement, une ligne par envoi (3 au plus).

| Colonne | Rôle |
|---|---|
| `id`, `submission_id` | |
| `number` smallint | 1, 2, 3. |
| `mode` | |
| `text` | Texte, nullable. |
| `request_id` uuid | Clé d'idempotence. |
| `created_at` | Date de cette version. |

Contraintes de `submission_versions` :
- `unique(submission_id, number)` et `unique(submission_id, request_id)`.
- `check ((mode = 'text') = (text is not null))` et `check (text <> '')`.
- `unique(id, mode)` : E9 ajoutera `submission_pages(version_id, mode check = 'images', …)` avec une clé étrangère composite `(version_id, mode)`. Une version texte ne peut alors jamais avoir de page : on obtient « texte OU images » sans migration de fond, seulement une table ajoutée (règle 2 : images dans une table à part).
- La version active est celle dont `number = submissions.current_version`. Les autres sont archivées, chacune avec son horodatage.

Le résultat d'un traitement (E5, E6) portera le `version_id`. S'il ne correspond pas à la version active, ce résultat est conservé mais n'est pas courant (SUB-05 R2).

#### 2. États et table des transitions (`src/lib/submission-status.ts`)

On ajoute `storedSubmissionStatuses` (pour l'enum) et `TRANSITIONS` : une liste de `{ id, from, to, by: "student" | "system" | "teacher" }` qui transcrit §5.5 telle quelle.

| # | De | Vers | Par |
|---|---|---|---|
| 1 | to_submit | received | élève |
| 2 | received | transcribing, evaluating | système |
| 3 | transcribing | evaluating, transcription_failed, not_assessable | système |
| 4 | transcription_failed | transcribing, to_review | professeur |
| 5 | evaluating | to_review, evaluation_failed, not_assessable | système |
| 6 | evaluation_failed | evaluating, to_review | professeur |
| 7 | not_assessable | to_review, evaluating | professeur |
| 8 | to_review | validated | professeur |
| 9 | validated | published | professeur |
| 10 | published → validated ; validated, published → to_review | | professeur |
| 11 | received, transcribing, transcription_failed, evaluating, evaluation_failed, not_assessable, to_review | received | élève |

Fonctions pures :
- `canTransition(id, from, to)` ;
- `sourcesOf(id, to)`, qui renvoie la liste des `from` autorisés.

**Point unique d'écriture du statut** : `applyTransition(tx, where, id, to, extraSet?)` dans `src/server/data/submissions/transitions.ts`.
- C'est un `UPDATE submissions … WHERE status IN sourcesOf(id, to) AND <gardes>`. Il renvoie la ligne, ou `null` si la transition est refusée.
- La transition 1 est l'insertion, faite dans le même module.
- Un test statique, sur le modèle de `access-inventory`, vérifie qu'aucun autre fichier ne fait `update(submissions)` ni `insert(submissions)`.
- En E4, seules les transitions 1 et 11 sont appelées.

#### 3. Flux de première remise : `submitText(actor, { assignmentId, contentVersion, requestId, text })`

`authorize(actor, "submission", "write")`, puis la validation du texte (§5), puis une transaction en Read Committed :

1. **Verrou du devoir et contrôles en une instruction** :
   ```sql
   UPDATE assignments SET locked_at = coalesce(locked_at, now()), updated_at = updated_at
   WHERE id = $a AND content_version = $v
     AND <receivedBy actif>
     AND EXISTS (users: id = $me AND email_verified)
     [E4.3 : AND EXISTS (notice lue)]
   RETURNING teacher_id, now() > deadline AS late
   ```
   - Le verrou de ligne sérialise cette instruction avec l'écriture du professeur. Celle-ci réévalue ensuite `locked_at IS NULL` et reçoit `locked`, comme dans le mécanisme d'E3.
   - `updated_at = updated_at` neutralise `$onUpdate`.
   - Si aucune ligne n'est touchée, on relit pour départager :
     - devoir présent mais `content_version` différente → `changed` (« The assignment has changed. Read it again before submitting. », texte gardé dans le formulaire) ;
     - sinon → `null` : absent, non reçu, élève retiré sans remise, compte non confirmé. La page répond 404 ou affiche un refus.
2. **Insertion de la remise** : `INSERT submissions (…, late) … ON CONFLICT (assignment_id, student_id) DO NOTHING RETURNING`.
   - Retard : `now() > deadline`, strictement après, avec l'horloge de la base pour `submitted_at` comme pour la comparaison. Le `now()` de la transaction est le même pour les deux.
   - La date limite est verrouillée dès la première remise, donc `late` ne peut pas devenir faux. Il n'est jamais mis à jour.
3. **En cas de conflit** : on cherche une version `(submission du couple, request_id)`.
   - Si elle existe → on renvoie la **même** confirmation (`ok`, idempotent).
   - Sinon → `already_submitted`. La page affiche alors l'état « remis » et propose le remplacement.
4. **Insertion de la version 1** (`mode = 'text'`, `request_id`).

La fonction renvoie `{ ok: true, submittedAt, late, replacementsLeft }`. Le texte n'est jamais renvoyé.

**Idempotence**
- Le formulaire porte un `requestId` (`crypto.randomUUID()` créé au montage du composant client). Il reste stable pour un double clic et pour un nouvel essai après coupure, et il est renouvelé après un succès.
- Le bouton est aussi désactivé pendant l'envoi.
- Deux onglets avec deux `requestId` différents : la contrainte unique laisse passer un seul envoi ; l'autre reçoit `already_submitted`.

#### 4. Flux de remplacement : `replaceText(actor, { assignmentId, requestId, text })`

`authorize(actor, "submission", "write")`, puis une transaction :

1. `SELECT … FROM submissions WHERE assignment_id = $a AND ownedBy(student) FOR UPDATE`. Si la ligne est absente → `null`.
2. Si une version de cette remise porte déjà `request_id` → on renvoie sa confirmation, sans rien décompter.
3. **La garde est dans l'instruction d'écriture**, via `applyTransition(tx, …, 11, "received", { current_version: current_version + 1 })` :
   ```sql
   WHERE id = $s AND status IN sourcesOf(11)
     AND teacher_started_at IS NULL
     AND current_version <= SUBMISSION_MAX_REPLACEMENTS   -- 2 remplacements au plus = 3 versions
     AND <appartenance active>                            -- un élève retiré ne remplace plus (SUB-01 R4)
   RETURNING current_version
   ```
   Si aucune ligne n'est touchée, on relit : `teacher_started`, `limit_reached` ou `not_member`, chacun avec un message explicite.
4. Insertion de la version `number = current_version` renvoyée.

`submitted_at` et `late` ne changent pas (SUB-04 R2, CA2).

**Sûreté sous concurrence** : le `FOR UPDATE` puis l'`UPDATE` gardé sérialisent tous les remplacements d'une même remise. Le compteur ne peut donc pas dépasser 3 versions, et `unique(submission_id, number)` le garantit en plus.

**Contrat pour E7 et E8** : le premier acte du professeur (modification ou validation) sera :
```sql
UPDATE submissions SET teacher_started_at = coalesce(teacher_started_at, now())
WHERE id = $s AND current_version = $vue
```
Le verrou de ligne départage les deux opérations :
- si le remplacement passe d'abord, le professeur reçoit « a newer version was submitted » ;
- si le professeur passe d'abord, l'élève reçoit `teacher_started` (SUB-05 CA4).

En E4, ce contrat est un helper de test qui reproduit la même instruction (E4.5).

#### 5. Texte : validation et comptage (`src/lib/submission-text.ts`, partagé par le navigateur et le serveur)

- **Comptage** : `countCharacters(text)` compte les graphèmes avec `Intl.Segmenter(undefined, { granularity: "grapheme" })` [D, 2026-10-15]. Le compteur du formulaire appelle la même fonction, et le serveur fait foi.
  - Limite assumée : la base ne peut pas vérifier ce compte, d'où une simple garde `text <> ''`.
  - Limite assumée : une ICU plus ancienne dans un navigateur peut compter différemment une séquence d'emoji très récente.
- **Normalisation unique [P]** : CRLF et CR isolé deviennent LF, des deux côtés, avant de compter et de stocker. C'est le navigateur qui envoie des CRLF, alors que la valeur que voit l'élève est en LF.
- **Aucune autre transformation** : pas de trim, pas de NFC, pas de correction. Les fautes, accents, apostrophes typographiques et formes Unicode non normalisées sont gardés tels quels (SUB-02 R2, NFR-TRT-02).
- **Refus avec un message explicite** :
  - texte vide ou sans caractère visible (`!/\S/u`) ;
  - texte de plus de `SUBMISSION_TEXT_MAX_LENGTH` graphèmes ;
  - texte contenant U+0000, que PostgreSQL refuse.

  Rien n'est stocké en cas de refus.
- **Pas de `maxLength` sur le `textarea`** : il tronquerait un collage en silence. On affiche à la place un compteur visible et `aria-describedby`, avec `autocorrect="off" spellcheck={false} autocapitalize="off" autoComplete="off"`.

#### 6. Configuration et textes

- **`src/config/decisions.ts`** :
  - `SUBMISSION_TEXT_MAX_LENGTH = 4000`, en graphèmes [D] ;
  - `SUBMISSION_MAX_REPLACEMENTS = 2` (Q3 [D]).
- **`src/lib/texts.ts`**, le module unique existant :
  - `NO_NAME_INSTRUCTION = "Do not write your name in your text."` (Q10 [D], consigne seule) ;
  - textes de la notice en E4.3, où les éléments non décidés s'affichent « to be defined » ;
  - `TEXT_LIMIT_NOTICE`.
- **Messages d'erreur** : `SUBMISSION_MESSAGES` dans `src/server/submissions/`, sur le modèle de `ASSIGNMENT_MESSAGES`.

#### 7. Lecture côté élève (A3 : jamais la Version)

- `receivedBy` est séparé en deux prédicats :
  - `receivedBy` (appartenance active) sert à l'**écriture** ;
  - `visibleTo` = `receivedBy` OU `EXISTS(submission de l'élève)` sert à la **lecture** du devoir (SUB-01 R4, CA3).
- **`listStudentAssignments`** : `LEFT JOIN submissions` donne `status` via `toStudentStatus`, ainsi que `late`. Le DTO reste fermé.
- **Nouveau `getStudentAssignment(actor, id)`** pour la page `/student/assignments/[assignmentId]` (`instant = false`, 404 réel). Il renvoie : le devoir, `contentVersion`, `studentStatus`, `late`, `submittedAt`, `lastVersionAt`, `replacementsLeft`, `canSubmit` et `canReplace`.
  - `canSubmit` et `canReplace` sont faux pour un élève retiré, qui garde la lecture seule.
  - Aucune requête côté élève ne sélectionne `submission_versions.text` : le type du DTO n'a pas de champ texte.

#### 8. Lignes de matrice et d'inventaire

**Matrice** (`matrix.ts`), sans nouvelle ressource en E4.1 et E4.2 :
- `submission` reste W pour l'élève (remettre et remplacer, sans lecture) et L pour le professeur propriétaire (lecture réelle en E7). On met le commentaire à jour.
- `ownSubmissionStatus` (élève, L) : le libellé est complété par « status, late flag, dates, replacements left; never the text ».
- `assignment` : la lecture de l'élève passe par `visibleTo`.
- E4.3 ajoute la ligne [P] `noticeAcknowledgement` : élève LW la sienne, tout le reste NO.

**Inventaire** (`inventory.ts`) :
- `TABLES` :
  - `submissions: ["submission", "ownSubmissionStatus"]` ;
  - `submission_versions: ["submission"]` ;
  - E4.3 : `notice_acknowledgements: ["noticeAcknowledgement"]`.
- `ENTRY_POINTS` :
  - `src/app/student/assignments/[assignmentId]/actions.ts#submitTextAction` → `{submission, write}` ;
  - `src/app/student/assignments/[assignmentId]/actions.ts#replaceTextAction` → `{submission, write}` ;
  - E4.3 : `#acknowledgeNoticeAction` → `{noticeAcknowledgement, write}`.
- **Exports de données** avec `authorize` : `submitText`, `replaceText`, `getStudentAssignment`. `applyTransition` est interne : il reçoit `tx` et non un `Actor`, et figure dans `UNGUARDED_DATA_EXPORTS` avec sa raison.
- `tests/access-inventory.test.ts` : on étend la liste figée des ressources.
- `tests/access-matrix.int.test.ts` : on ajoute à `REAL` `submission.write` (fixture : devoir reçu par `concernedStudent`). L'opération `submitText` est marquée `creates`.

#### 9. Découpage (prompts E4.1 à E4.6, inchangés)

| Prompt | Contenu |
|---|---|
| E4.1 | Schéma, migration `0007` relue (ordre des contraintes : voir CLAUDE.md), `TRANSITIONS`, `applyTransition`, tests unitaires des transitions. |
| E4.2 | `submitText`, page et formulaire (`/build-ui`), consigne « no name », compteur. |
| E4.3 | Notice, table `notice_acknowledgements` (migration `0008`) et garde EXISTS dans l'instruction du §3. |
| E4.4 | Affichage « Late » et tests de frontière. |
| E4.5 | `replaceText`. |
| E4.6 | Rejeux et E2E. |

#### 10. Vérification

**Tests unitaires** (`npm test`, projet `unit`)
- Transitions :
  - chaque couple de la table est accepté, tout autre couple des 10×10 est refusé ;
  - `published` n'est atteignable que depuis `validated` ;
  - les sources de la transition 11 correspondent exactement à la table.
- Texte :
  - vide, espaces, NBSP seule et U+0000 sont refusés ;
  - 4000 graphèmes passent et 4001 sont refusés, avec emoji, drapeau et « é » NFD (1 graphème, 2 points de code) ;
  - CRLF et CR deviennent LF ;
  - fautes, accents, `’` et NFD sont conservés octet pour octet.
- La correspondance `toStudentStatus` couvre les 10 états.

**Tests d'intégration** (`*.int.test.ts`, Neon de test ; jamais en même temps que l'E2E)
- SUB-02 :
  - CA1 : le texte relu en base est strictement égal au texte envoyé, et `submitted_at` est daté ;
  - CA2 : texte refusé, rien n'est stocké ;
  - CA3 : compte non confirmé refusé, élève retiré refusé, élève A refusé pour une classe non rejointe.
- SUB-04, frontière du retard :
  - `deadline` posée en SQL à `now() ± 1 s` ;
  - l'égalité exacte se teste en évaluant l'expression partagée `lateSql(at, deadline)` sur des littéraux, à la seconde avant, pile et à la seconde après ;
  - même test avec une date limite au moment d'un changement d'heure d'`Africa/Casablanca`.
- SUB-04 CA2 : remise à l'heure, puis `deadline` passée, puis remplacement : `late` reste faux et les deux dates sont distinctes.
- ASG-03 rejoué sur une vraie remise : `locked_at` posé, modification du sujet refusée (`locked`), suppression refusée.
- `content_version` changée entre l'affichage et l'envoi : refus `changed`.
- SUB-01 CA3 et CLS-04 CA3 : élève retiré avec une remise → le devoir reste visible, `canSubmit` et `canReplace` faux, la remise est conservée.
- A3 : les DTO élève ne contiennent pas le texte (sérialisation vérifiée). La matrice rejoue `submission.write` pour les 6 colonnes.

**Tests de concurrence** (`Promise.all` sur la base réelle, plus la variante déterministe d'E3 où une transaction tient le verrou pendant 1 s)
1. Deux `submitText` avec le même `requestId` : 1 remise, 1 version, deux résultats `ok` identiques.
2. Deux `submitText` avec des `requestId` différents : un `ok` et un `already_submitted`.
3. Trois `replaceText` simultanés sur une remise neuve : 2 `ok` et 1 `limit_reached` ; 3 versions, `current_version = 3`.
4. Remplacement contre le helper « premier acte du professeur », dans les deux ordres : un seul aboutit, l'autre reçoit son refus explicite (CA4).
5. Première remise contre une modification du sujet par le professeur, dans les deux ordres :
   - si la remise passe d'abord, le professeur reçoit `locked` ;
   - si le professeur passe d'abord, l'élève reçoit `changed`.
6. Le même `requestId` rejoué après le succès d'un remplacement ne décompte rien.

**E2E** (`docker compose run --rm e2e`, E4.6)
- Le parcours enchaîne : remise sur téléphone, remise en retard, remplacement jusqu'au refus du troisième, et double clic.
- On vérifie que le HTML de l'élève ne contient ni son texte ni un état interne.
- Captures envoyées à l'utilisateur, qui ne voit pas le volet navigateur.

#### Valeurs à consigner (T5, à la demande)

- **[D]** Unité de comptage : graphèmes.
- **[P]** Normalisation des fins de ligne, U+0000 refusé, `late` stocké, refus `changed` sur `content_version`, contrat `current_version = $vue` pour E7 et E8, `requestId` côté client.
