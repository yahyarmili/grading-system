# Acteurs

> Étape 6 de la démarche d'ingénierie. Statut : **validé** par l'utilisateur le 2026-10-12, avec ses réponses à A1, A2 et A3 (section 7).
> Fait suite à [problematique.md](problematique.md), [solution.md](solution.md), [fonctionnalites.md](fonctionnalites.md) (rôles en 5.1, matrice d'accès en 5.4) et [besoins-non-fonctionnels.md](besoins-non-fonctionnels.md) (validé). Ce document ne les modifie pas.

**En bref.** Trois acteurs [D] : **administrateur**, **professeur**, **élève**. Deux rôles complémentaires, qui ne sont pas des acteurs à part entière : le **visiteur** (futur élève, non connecté) et le **système** (traitements automatiques et prestataires d'IA). **[D]** = votre décision ; **[P]** = proposition à valider.

---

## 1. Vue d'ensemble

| | Administrateur | Professeur | Élève |
|---|---|---|---|
| **En une phrase** | Contrôle qui devient professeur et fait fonctionner l'application. | Corrige les copies de ses élèves, avec l'aide de l'IA. | Remet ses productions écrites et lit son résultat. |
| **Ce qu'il cherche** | Que seuls des professeurs légitimes accèdent aux copies ; que l'application reste en état de marche et conforme. | Corriger plus vite (P1), de façon plus constante (P2), sans que l'écriture ou la connaissance de l'élève pèse sur la note (P3). | Remettre facilement, depuis son téléphone, et recevoir une évaluation claire et juste. |
| **Comment il obtient son compte** | Premier compte créé hors application (EXP-03). | Invité par l'administrateur (D1). | S'inscrit lui-même avec son email, puis rejoint une classe par un lien ou un code (D2). |
| **Fonctionnalités** | 3 : AUTH-02, AUTH-03, AUTH-05 | 15 | 9 |

---

## 2. Fiche de chaque acteur

### 2.1 Administrateur
- **Responsabilités.** Créer, réémettre et annuler les invitations de professeur (AUTH-03). En V1 [D], il **exploite aussi l'application**, hors interface : restaurations, suppressions, désactivation d'urgence d'un professeur, activation de l'envoi réel à un prestataire, alertes, lecture du journal de sécurité (NFR-EXP-03, EXP-02, DON-05).
- **Dans l'application, il ne peut pas** lire une classe, une copie ni une évaluation, ni être correcteur. Il peut seulement lire la rubrique.
- **Hors application, en V1,** il garde un accès technique à toutes les données : **risque assumé**. D'où la question sur un second facteur pour son compte (QNF-7) et la journalisation de ses accès (NFR-DON-05).
- **Parcours principal.** Se connecte → invite un professeur par email → le professeur crée son mot de passe → l'administrateur peut réémettre ou annuler l'invitation tant qu'elle n'est pas utilisée.
- **Attention.** Compte critique : un mot de passe volé exposerait toutes les copies. Une équipe technique distincte est reportée à plus tard.

### 2.2 Professeur
- **Responsabilités.** Propriétaire de ses classes et **correcteur unique** de ses devoirs [D]. Il crée ses classes et invite les élèves par lien ou code (CLS-01, CLS-02) ; crée des devoirs et choisit les classes destinataires (ASG-01 à ASG-03) ; relit chaque copie avec la proposition de l'IA, modifie niveaux, remarques et note, valide (REV-01 à REV-05) ; publie le résultat ou le retire (PUB-01) ; évalue à la main quand l'IA échoue (REV-06) et relance un traitement en échec (PRC-02).
- **Il voit** l'identité de ses élèves (nom, prénom, email, classe) [D], le texte, la transcription, l'image, la proposition de l'IA, les alertes et le journal de ses copies. **Pas** d'historique des résultats précédents d'un élève à l'écran de correction [P].
- **Il ne peut pas** accéder aux classes, élèves ou copies d'un autre professeur, ni modifier la rubrique, ni publier une évaluation non validée.
- **Parcours principal.** Crée une classe → partage le lien ou le code → crée un devoir → ouvre la liste des remises (triée par note, date ou ordre alphabétique) → clique sur un élève → relit, modifie, valide → publie (ou « valider et publier »).
- **Attention.** Il peut suivre l'IA sans la remettre en cause (ancrage) et l'effet de halo reste possible : son identité de correcteur n'est pas masquée, sa note est libre (D5). Une notice l'informe de ce que le journal mesure (NFR-DON-04).

### 2.3 Élève
- **Responsabilités.** S'inscrire et confirmer son email (AUTH-01) ; rejoindre une ou plusieurs classes avec un lien ou un code (CLS-03) ; voir ses devoirs et l'état de ses remises (SUB-01) ; remettre un texte collé ou des images scannées (SUB-02, SUB-03) ; remplacer sa remise avant la correction du professeur (SUB-05) ; lire son résultat une fois publié (PUB-02).
- **Il voit** ses devoirs, l'état de sa remise (« À remettre », « Remis, en cours de correction », « Corrigé ») et, après publication, la **note, les niveaux et les remarques validées** [D]. **Jamais** la proposition brute de l'IA, les alertes, le journal, un état technique, le résultat d'un autre élève, ni l'image de sa copie après correction, ni son texte collé (A3) [D].
- **Il ne peut pas** modifier un devoir, voir la liste des élèves d'une classe, ni remettre sans devoir lié (D3). Un retard est accepté et marqué (D8).
- **Parcours principal.** S'inscrit → confirme son email → rejoint une classe → reçoit un devoir → remet sur son téléphone → attend → lit son résultat.
- **Attention.** Il ne sait pas si sa photo est lisible avant la correction (alerte de qualité d'image : V2). Une note ajustée par le professeur peut différer des niveaux affichés (Q5). Élèves supposés avoir 18 ans ou plus (QNF-1) ; en démonstration, acteurs adultes.

---

## 3. Qui fait quoi pour qui

| Étape | Qui agit | Pour qui | Fonctionnalités |
|---|---|---|---|
| 1 | Administrateur | Professeur : l'invite et lui ouvre un compte | AUTH-03 |
| 2 | Élève | Lui-même : s'inscrit, confirme son email | AUTH-01 |
| 3 | Professeur | Ses élèves : crée une classe, partage un lien ou un code | CLS-01, CLS-02 |
| 4 | Élève | Lui-même : rejoint la classe, sans approbation | CLS-03 |
| 5 | Professeur | Ses classes : crée et envoie un devoir | ASG-01 à ASG-03 |
| 6 | Élève | Son professeur : remet un texte ou des images | SUB-02, SUB-03, SUB-05 |
| 7 | Système | Le professeur : lit l'écriture, propose une évaluation selon la rubrique | TRX-01, EVL-01 à EVL-04, PRC-01, PRC-02 |
| 8 | Professeur | L'élève : relit, modifie, valide, publie | REV-01 à REV-06, PUB-01 |
| 9 | Élève | Lui-même : lit son résultat | PUB-02 |

---

## 4. Rôles complémentaires

| Rôle | Description | Ce qu'il fait ou ne fait pas |
|---|---|---|
| **Visiteur** [P] | Personne non connectée, futur élève. | S'inscrire (AUTH-01), se connecter, récupérer son accès, ouvrir un lien d'invitation. N'accède à aucune donnée. |
| **Système** [P] | Traitements automatiques et prestataires d'IA et de lecture. | Transcrit, évalue, calcule la note, marque le retard, journalise (10 fonctionnalités). Ne reçoit jamais l'identité de l'élève ni le niveau du devoir ; ne publie jamais seul. |

L'« équipe technique » de l'étape 5 n'est pas un acteur : en V1, c'est l'administrateur.

---

## 5. Fonctionnalités par acteur

| Module | Administrateur | Professeur | Élève | Système |
|---|---|---|---|---|
| AUTH comptes et accès | AUTH-02, 03, 05 | AUTH-02, 05 | AUTH-01 (visiteur), 02, 05 | AUTH-04 |
| CLS classes | — | CLS-01, 02, 04 | CLS-03 | — |
| ASG devoirs | — | ASG-01, 02, 03 | — | — |
| SUB remise | — | — | SUB-01, 02, 03, 05 | SUB-04 |
| TRX lecture de l'écriture | — | — | — | TRX-01 |
| EVL évaluation par l'IA | — | — | — | EVL-01 à 04 |
| PRC traitement | — | PRC-02 (relance) | — | PRC-01, 02 |
| REV revue et validation | — | REV-01, 02, 03, 05, 06 | — | REV-04 |
| PUB publication | — | PUB-01 | PUB-02 | — |

AUTH-02 et AUTH-05 sont partagées par les trois acteurs, et PRC-02 par le système et le professeur. Les 32 fonctionnalités sont toutes attribuées.

---

## 6. Ce qui sépare les acteurs

- **Un compte, un seul rôle** [P] : pas de professeur qui est aussi élève, pas d'administrateur qui est aussi professeur avec le même compte. Si une même personne a les deux fonctions, elle a deux comptes avec deux emails différents [D] (A1).
- **Le professeur est lié à l'élève par la classe.** Un élève dans deux classes de deux professeurs est corrigé par chacun pour ses devoirs : le professeur créateur du devoir est son correcteur [P].
- **Cloisonnement.** Les droits exacts de chaque acteur sur chaque ressource sont dans la matrice d'accès de `fonctionnalites.md` 5.4, source des tests (NFR-SEC-01). Seul changement de l'étape 5 : l'élève ne revoit pas l'image de sa copie après correction ; A3 y ajoute son texte collé.

---

## 7. Questions

### Décidées par vous [D]

| Question | Votre décision | Conséquence |
|---|---|---|
| A1. L'administrateur peut-il aussi être professeur ? | Non avec le même compte : deux comptes distincts, deux emails différents. | Aucun accès de l'administrateur aux copies dans l'application. |
| A2. Combien d'administrateurs en V1 ? | Un seul, désigné par le client. | Compte critique unique : QNF-7 (second facteur) reste ouverte. |
| A3. L'élève relit-il son texte collé après l'envoi ? | Non. | Il voit l'état de sa remise, puis le résultat publié. SUB-01 R2 est à corriger dans `fonctionnalites.md`, comme pour l'image. |

### Encore ouvertes
- **QNF-1, QNF-4, QNF-7** de l'étape 5 : responsable du traitement et CNDP, durées de conservation, second facteur pour l'administrateur. QNF-5 (choix du LLM) est tranchée : Anthropic, `claude-haiku-5-5` [D, 2026-10-19] (`besoins-non-fonctionnels.md` §6).
