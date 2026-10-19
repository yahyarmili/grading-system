# Objectif, périmètre et fonctionnalités

> Étapes 3 et 4 de la démarche d'ingénierie. Statut : **brouillon à valider ensemble**.
> Fait suite à [problematique.md](problematique.md) et [solution.md](solution.md), validés, qu'il ne modifie pas. L'[analyse détaillée](annexe-analyse-detaillee.md) (73 fonctionnalités) n'est pas validée : elle reste une réserve pour l'étape 5.

## Comment lire ce document

| Marque | Sens |
|---|---|
| **[D]** | Décision utilisateur : vos 15 fonctionnalités (F1 à F15), les décisions D1 à D10 et les étapes 1 et 2. Non remise en cause ici. |
| **[P]** | Proposition ajoutée par l'analyse, à valider. |
| **[Q#]** | Question ouverte (section 9), avec une recommandation qui n'est pas une décision. |

- Une valeur non décidée est notée « à définir ». Aucun chiffre n'est inventé.
- **E1 à E11** sont les étapes de construction (section 8), à ne pas confondre avec les étapes 1 à 8 du projet. La technologie relève de l'étape 7, les prompts d'implémentation de l'étape 8.
- **En bref.** Vos 15 demandes deviennent 32 fonctionnalités atomiques en 9 modules, livrées en 11 étapes, avec 10 questions ouvertes. Tout est construit sans condition (D10) : la mesure de la qualité est une activité de test après construction.
- **Honnêteté.** Une IA qui propose et un professeur qui valide ne suppriment ni l'ancrage sur la proposition, ni l'effet de halo. Une note libre peut différer des niveaux montrés à l'élève. Ce document le dit là où cela compte (sections 5, 6 et 7).

---

## 1. Décisions déjà prises

| Réf. | Décision | Se retrouve dans |
|---|---|---|
| Étapes 1-2 | Problèmes : P1 temps ; P2 fiabilité (écarts entre professeurs, inconstance d'un même correcteur) ; P3 validité (écriture, connaissance de l'élève). | Sections 2 et 7 |
| Étapes 1-2 | Rubrique unique et fixe, non modifiable, pour l'anglais et le français : 5 critères à 20 %, niveaux de 0 à 4. Version française à adapter et à faire valider. | EVL-01, Q6 |
| Étapes 1-2 | Entrées : images de copies manuscrites scannées (une ou plusieurs pages) et texte collé ; plusieurs copies traitées en même temps. | SUB-02, SUB-03, PRC-01 |
| Étapes 1-2 | L'IA propose, le professeur valide ou modifie ; un seul correcteur par copie ; identité non transmise à l'IA ; transcription fidèle, sans correction ; identité non masquée pour le professeur. | EVL-02, EVL-03, TRX-01, REV-02 |
| F1 à F15 | Vos 15 fonctionnalités. | Section 4 |
| D1 | Les comptes professeur sont créés par un administrateur (acteur à interface minimale). | AUTH-03 |
| D2 | Le professeur invite par lien ou code, sans approbation. Par défaut non contredit [P] : un élève peut être dans plusieurs classes ; une classe a un seul professeur ; le correcteur est le professeur créateur du devoir. | CLS-01 à CLS-04, AUTH-04 |
| D3 | Toute remise est liée à un devoir ; pas de dépôt libre. | SUB-01 à SUB-03 |
| D4 | Le niveau d'un devoir est une étiquette d'une liste fermée (A1, A2, B1, B2, C1), non transmise à l'IA. | ASG-01, EVL-02 |
| D5 | Le professeur modifie la note librement, y compris indépendamment des niveaux, sans justification obligatoire. Complément délégué à Claude, à confirmer : la proposition d'origine de l'IA et chaque modification (qui, quand, ancienne et nouvelle valeur) sont conservées automatiquement. | REV-03, REV-04 |
| D6 | Valider et publier sont deux actes distincts, avec un raccourci « valider et publier ». | REV-05, PUB-01 |
| D7 | L'élève voit la note, les niveaux et les remarques validées, jamais la proposition brute. | PUB-02 |
| D8 | Le délai est une date limite ; un retard est accepté et marqué « en retard ». | SUB-04 |
| D9 | Un clic sur le nom d'un élève affiche son nom, prénom, email, sa classe et la copie du devoir. Pas d'historique de ses résultats à l'écran de correction [P], car non précisé. | REV-02 |
| D10 | Option B : tout construire sans condition. Aucun jalon de mesure bloquant, aucune décision « arrêter ». La mesure (accord IA/experts, fidélité de lecture, gain de temps) est une activité de test après construction. | Sections 3 et 8, E10 |

---

## 2. Objectifs

Toutes les mesures se font après construction (D10), valeurs cibles « à définir » avec le client. Un résultat insuffisant est rapporté tel quel.

| Id | Objectif | Mesure |
|---|---|---|
| O1 | Réduire le temps de correction d'un gros volume de copies (P1) : le professeur valide une proposition au lieu de corriger de zéro, et un lot est prêt à relire sans action de sa part. | Temps total du professeur par devoir, du premier accès à la liste (REV-01) à la dernière validation, copies manuelles et relances comprises, rapporté par copie et tiré du journal (REV-04) ; plafond d'inactivité entre deux événements : à définir. Comparé à un temps de correction papier chronométré avant la mise en service sur un échantillon de professeurs (facultatif en démonstration : sans chronométrage, O1 est rapporté sans comparaison, NFR-QUA-01). Délai entre le dernier dépôt d'un lot et l'état « à valider ». |
| O2 | Obtenir une proposition de l'IA proche de celle d'experts et stable, et rendre mesurable la tendance du professeur à la suivre (P2). | Accord de la proposition avec des experts sur des copies réelles, par critère et sur la note, comparé à l'accord entre experts ; stabilité sur exécutions répétées ; concordance entre proposition d'origine et version finale, extraite du journal hors application (indicateurs visibles dans l'application : V2). Corpus, nombre d'experts, seuils : à définir avant la mesure. |
| O3 | Limiter l'influence de l'écriture et de l'identité sur la proposition initiale (P3). | Fidélité de la transcription sur de vraies écritures d'élèves (fautes conservées, passages illisibles marqués) ; écart de niveau entre évaluation sur transcription automatique et sur transcription de référence ; absence de toute donnée d'identité et du niveau du devoir dans les requêtes vers l'IA (valeurs repérables) ; part des copies où l'élève écrit son nom (Q10). Seuils : à définir. |
| O4 | Livrer le parcours complet : devoir, remise, traitement, revue, validation, publication, consultation. | Des acteurs jouant un professeur et une classe réalisent le cycle sans intervention technique. Toute évaluation publiée issue d'une proposition conserve cette proposition et son journal ; toute évaluation manuelle est journalisée « sans proposition IA ». Aucun résultat visible avant publication ni après retrait. Matrice d'accès (5.4) vérifiée pour chaque ressource. Effectif des acteurs : à définir. |

---

## 3. Périmètre

### 3.1 MVP (construit en entier, sans condition, D10)

| Module | Contenu | Livré en |
|---|---|---|
| AUTH | Inscription de l'élève avec confirmation, connexion et session, récupération d'accès, comptes professeur créés par l'administrateur (D1), cloisonnement des accès. | E1 |
| CLS | Classes, invitation par lien ou code sans approbation (D2), rattachement de l'élève à une ou plusieurs classes, retrait et réadmission. | E2 |
| ASG | Devoir (sujet, niveau A1 à C1 non transmis à l'IA, langue, date limite, instructions, classes), liste, modification et suppression avant la première remise. | E3 |
| SUB | Espace de l'élève, remise par texte collé ou par images scannées, toujours liée à un devoir (D3), retard marqué (D8), remplacement. | E3, E4, E9 |
| TRX | Transcription fidèle, sans correction de l'orthographe ni de la ponctuation. | E9 |
| EVL | Rubrique fixe, contenu transmis à l'IA limité, proposition par critère avec remarques, copies non évaluables signalées. | E5 |
| PRC | Traitement automatique de plusieurs copies à la fois, échecs bornés et relance. | E6 |
| REV | Liste triable, copie ouverte par clic sur le nom (D9), modification libre (D5), journal automatique, validation, évaluation manuelle de repli. | E7, E8 |
| PUB | Publication distincte de la validation avec raccourci (D6), consultation par l'élève (D7). | E8 |

### 3.2 Reporté en V2 (une ligne chacun, sans fonctionnalité détaillée)

- Notifications par email (nouveau devoir, résultat publié).
- Validation en lot et publication en lot.
- Tableaux de bord de classe et indicateurs de concordance IA/professeur dans l'application.
- Import CSV de classes ; comptes élève créés par le professeur pour les élèves sans email (peut remonter au MVP selon Q9).
- Dépôt de scans par le professeur au nom des élèves.
- Droits de l'élève sur ses données (page « mes données », accès, rectification, suppression).
- Alerte de qualité d'image avant l'envoi (flou, sombre, coupé) et état élève « à revoir » (Q3).
- Gestion avancée du devoir et de la classe : ajouter une classe, prolonger, clore, archiver, dupliquer ; archivage de classe en fin d'année.
- Correction de la transcription par le professeur, selon Q4.
- Retour d'une copie à l'élève pour un nouveau dépôt, modes de remise par devoir, import de fichier texte, brouillon enregistré.
- Suspension de compte professeur, changement d'adresse email, classes à plusieurs professeurs.
- Masquage automatique d'un nom écrit dans la copie (Q10), export des notes, relecture à l'aveugle de la proposition de l'IA.

### 3.3 Hors périmètre

| Exclusion | Statut | Pourquoi |
|---|---|---|
| Modifier la rubrique par professeur, niveau ou langue | [D] | La rubrique unique et fixe est le standard commun qui porte la réponse à P2. |
| Masquer l'identité de l'élève au professeur | [D] | Solution, principe 6 : le risque d'effet de halo est assumé et documenté. |
| Double correction, second correcteur | [D] | Solution, principe 5 : la cohérence vient du standard commun. |
| Évaluer l'écriture ou la présentation comme critère | [D] | Problématique, section 5 : facteurs parasites, pas critères. |
| Autres matières, exercices à réponse unique, langue arabe, autres langues | [D] | Problématique, section 6. |
| Transmettre le niveau du devoir à l'IA | [D] | D4 : transmis, il changerait le sens d'un niveau de la rubrique. |
| Approbation des demandes de rattachement | [D] | D2 : le lien ou le code suffit ; le retrait (CLS-04) est le contrôle a posteriori. |
| Dépôt libre sans devoir | [D] | D3 : sans sujet, Task Achievement n'est pas évaluable. |
| Inscription libre d'un professeur | [D] | D1. |
| Justification obligatoire d'une modification de note | [D] | D5. |
| Jalons de mesure bloquants, décision « arrêter » | [D] | D10. |
| Publication automatique d'un résultat | [D] | F6, F11, D6 : le professeur valide puis publie. |
| Historique des résultats précédents à l'écran de correction | [P] | D9 ne le précise pas ; il réintroduirait l'effet de halo. |
| Détection de plagiat ou de texte généré par une IA | [P] | Peu fiable, risque de fausses accusations. L'application ne sait pas qui a écrit un texte collé : limite assumée. |
| Pénalité de retard automatique | [P] | D8 demande seulement de marquer le retard ; la décision revient au professeur. |
| Contestation de note, messagerie professeur-élève, comptes parents | [P] | Non demandés. |
| Intégration à un logiciel de vie scolaire, application mobile native, paiement, multi-établissements | [P] | Sans lien avec P1 à P3. |

### 3.4 Renvoyé à l'étape 5 (besoins non fonctionnels, non développé ici)

- Confidentialité et protection des données d'élèves (18 ans, Maroc ; données fictives en démonstration) : minimisation, accès, journalisation des accès.
- Cadre légal : pays, âge réel, consentement, responsable du traitement, mention de l'IA (voir Q5, Q9) ; conditions des prestataires d'IA et de lecture (pas d'usage des contenus pour l'entraînement, localisation). Aucune copie réelle n'est envoyée à un prestataire avant vérification de ses conditions.
- Information des professeurs sur ce que le journal mesure (temps de revue, concordance avec l'IA) et sur l'usage de ces données.
- Conservation et suppression : images, textes, propositions de l'IA, évaluations, journal.
- Sécurité : règles de mot de passe, durée des sessions, temporisation, durée de vie des liens, images sans lien public.
- Performance et volumétrie : copies par lot et délai visés, formats, poids et nombre de pages, longueur maximale d'un texte ; disponibilité, sauvegarde, reprise, coût d'IA par copie.
- Méthode de mesure de la qualité après construction : corpus, experts, seuils, chronométrage, suivi de la concordance.
- Accessibilité, langue de l'interface, appareils et navigateurs visés (l'élève scanne ou photographie sa copie).

---

## 4. Vos 15 fonctionnalités : traçabilité

| F# | Ce que vous avez demandé | Verdict | Problème relevé | Devient |
|---|---|---|---|---|
| F1 | Un élève s'inscrit avec son adresse email. | Fidèle, complétée | Aucun compte professeur n'était prévu (D1). Nom et prénom nécessaires à D9 et au tri. Confirmation de l'email ajoutée. Élèves sans email non servis (Q9). | AUTH-01, AUTH-03, AUTH-05 |
| F2 | L'utilisateur se connecte avec son compte. | Fidèle, précisée (tous les rôles) | Rôle non dit. Messages identiques, temporisation, session et récupération d'accès ajoutés. | AUTH-02, AUTH-03, AUTH-04, AUTH-05 |
| F3 | Chaque élève a son espace de remise, dont le travail va vers son professeur. | Décomposée | « Son professeur » = créateur du devoir ; un élève peut en avoir plusieurs. Lien ou code sans approbation (D2). Remise liée à un devoir (D3). Trois états visibles de l'élève. | SUB-01, CLS-02, CLS-03, CLS-04, AUTH-04 |
| F4 | L'élève dépose une ou plusieurs images scannées de sa production manuscrite. | Fidèle, précisée | Le scan est à la charge de l'élève (dépôt par le professeur : V2). Formats, poids, pages : à définir. Un nom écrit sur la copie peut atteindre l'IA (Q10). Photo défectueuse : remplacement (Q3). | SUB-03, SUB-04, SUB-05, EVL-02 |
| F5 | L'élève colle sa production sous forme de texte. | Fidèle | Forme exacte à définir ; 4000 caractères au plus [D, 2026-10-15]. Authenticité non vérifiable ; l'autocorrection de l'éditeur peut modifier Mechanics. Limites assumées. | SUB-02, SUB-04, SUB-05 |
| F6 | L'élève consulte sa note et le résultat une fois validé et rendu visible par le professeur. | Fidèle ; D6 et D7 précisent les actes et le contenu | Rien d'exposé avant publication, par aucune voie. Langue des remarques, mention de l'IA, note ajustée : Q5. | PUB-02, PUB-01, REV-05, SUB-01, AUTH-04 |
| F7 | Si une image est remise, son texte est extrait pour le professeur. | Fidèle, étendue à la fidélité (étape 2) | Le texte extrait est aussi l'entrée de l'IA : une erreur de lecture devient une erreur de note. Correction par le professeur : Q4. | TRX-01, REV-02, PRC-01, PRC-02, EVL-04 |
| F8 | Chaque remise est évaluée par un LLM selon la rubrique. | Décomposée, sens conservé | Fiabilité non acquise : mesurée après construction (D10). Un nom écrit dans la copie peut passer. Rubrique française à valider (Q6). Repli manuel si l'IA échoue. | EVL-01 à EVL-04, PRC-01, PRC-02, REV-06 |
| F9 | Après l'évaluation, une note est donnée avec des remarques. | Fidèle, scindée en remarques (IA) et note (règle de calcul) | Format de la note : Q1. Langue des remarques : Q5. Le professeur peut fixer la note (D5). | EVL-01, EVL-03, REV-03 |
| F10 | Le professeur consulte chaque résultat, le supervise, modifie la note et l'évaluation. | Décomposée : consultation, modification, journal, validation, repli manuel | Note libre (D5) : elle peut différer des niveaux. Ancrage et halo possibles, non empêchés. | REV-02 à REV-06, AUTH-04 |
| F11 | Le professeur autorise la visibilité de la note dans l'espace de l'élève. | Fidèle ; publication distincte de la validation (D6) | Copie par copie dans le MVP, avec retrait. Après modification d'une évaluation publiée : Q8. | PUB-01, REV-05 |
| F12 | Le professeur ajoute un devoir : sujet, niveau, langue, délai, instructions facultatives. | Fidèle, précisée par D4 et D8 | Niveau = étiquette non transmise à l'IA. Les instructions ne peuvent pas modifier la rubrique. Modification et suppression avant la première remise ajoutées. | ASG-01, ASG-02, ASG-03, SUB-04, EVL-02 |
| F13 | Le professeur consulte les soumissions en cliquant sur le nom d'un élève, triées par note, date ou ordre alphabétique. | Décomposée : liste triable, ouverture de la copie | D9 : nom, prénom, email, classe, copie du devoir ; pas d'historique (halo). Tri par note : note du professeur, sinon note proposée « provisoire ». | ASG-02, REV-01, REV-02, AUTH-04 |
| F14 | Un professeur a plusieurs classes, chacune avec plusieurs élèves, et leur envoie un devoir. | Décomposée : classes (ici) et envoi (avec F15) | Lien ou code sans approbation (D2) : le retrait devient le seul contrôle. Lien et code valables 1 heure [D, 2026-10-14] (Q7). | CLS-01 à CLS-04, ASG-01 |
| F15 | À la création d'un devoir, le professeur choisit les classes destinataires. | Fidèle, fusionnée avec la création | Une seule étiquette de niveau pour des classes différentes. Ajout de classe ensuite : V2. Élève dans deux classes : un seul devoir. | ASG-01 |

---

## 5. Rôles, entités et états

### 5.1 Rôles

| Rôle | Description | Peut | Ne peut pas |
|---|---|---|---|
| Visiteur | Non connecté. | S'inscrire comme élève, se connecter, récupérer son accès ; ouvrir un lien d'invitation (orienté vers connexion ou inscription). | Accéder à une donnée d'élève, de classe ou de devoir. |
| Élève | Espace personnel ; reçoit les devoirs de ses classes. | Rejoindre des classes (compte confirmé), voir ses devoirs et l'état de ses remises, remettre et remplacer (SUB-05), consulter ses résultats publiés et la rubrique. | Voir la proposition brute de l'IA, les alertes, le journal, un état technique, le résultat d'un autre élève. |
| Professeur | Correcteur unique des copies de ses devoirs ; propriétaire de ses classes ; voit l'identité de ses élèves. | Gérer ses classes (lien, code, retrait, réadmission), ses devoirs, la revue, la modification libre, la validation, la publication et le retrait, le journal de ses copies, l'évaluation manuelle, la relance d'un traitement en échec. | Accéder aux classes, élèves ou copies d'un autre professeur ; modifier la rubrique. |
| Administrateur | Interface minimale (D1) ; absent des 15 demandes ; rôle précisé à l'étape 6 (Q2). | Créer, réémettre et annuler des invitations de professeur. | Accéder aux classes, copies ou évaluations ; éditer la rubrique ; être correcteur [P]. |
| Système | Acteur technique : transcription, évaluation par l'IA, calcul de la note, marquage du retard, journal. | Transcrire, évaluer, calculer, marquer, journaliser. | Transmettre une identité ou le niveau du devoir à l'IA ; rendre quoi que ce soit visible à l'élève ; publier seul. |

### 5.2 Entités

| Entité | Attributs principaux | Statut |
|---|---|---|
| Compte | email (unique), mot de passe, rôle unique, nom, prénom, état (non confirmé, actif) | Email et connexion [D] F1, F2 ; comptes professeur [D] D1 ; rôle unique, nom, prénom, confirmation [P] |
| Classe | nom, professeur (un seul), lien et code d'invitation (actifs ou désactivés) | Plusieurs classes [D] F14 ; lien ou code [D] D2 ; un seul professeur [P] |
| Appartenance | élève, classe, date, statut (active, retirée) ; immédiate, sans attente | [D] D2 ; plusieurs classes par élève, statut « retirée » [P] |
| Devoir | titre, sujet, niveau (A1 à C1), langue, date limite, instructions facultatives, créateur (= correcteur) | Champs [D] F12, D4, D8 ; titre, correcteur = créateur [P] |
| Envoi | devoir x classe destinataire | [D] F14, F15 |
| Remise | élève, devoir, version active, date de première remise, indicateur « en retard », état interne | Lien au devoir [D] D3 ; retard [D] D8 ; une seule remise active par (élève, devoir) [P] |
| Version de remise | texte collé OU pages-images ordonnées, mode, horodatage | [D] F4, F5 ; versions conservées [P] |
| Transcription | texte fidèle d'une version image, marqueurs d'illisibilité, version du moteur | [D] F7 et étape 2 |
| Rubrique | version, langue, 5 critères à 20 %, niveaux entiers de 0 à 4, règle de conversion en note | [D] étape 2 ; version française [Q6] ; format de la note [Q1] |
| Proposition IA | remise, version évaluée, versions de rubrique et de consigne, modèle, 5 niveaux avec justification, commentaire général, pistes, note proposée, alertes ; immuable, une seule courante | Existence [D] F8, F9 ; traçabilité [P] |
| Évaluation du professeur | 5 niveaux, une remarque par critère (justification de l'IA, modifiable), commentaire général, pistes, note finale, indicateur « note fixée par le professeur », origine (proposition ou saisie manuelle), validée par/le, publiée le | [D] F10, D5, D6 ; remarque par critère, saisie manuelle [P] |
| Journal | acteur, action, cible, ancienne et nouvelle valeur, horodatage | Proposition d'origine et modifications [D] D5 (complément délégué) ; autres événements [P] |

Relations : Professeur 1-N Classe ; Classe 1-N Appartenance N-1 Élève ; Professeur 1-N Devoir ; Devoir 1-N Envoi N-1 Classe ; Devoir 1-N Remise N-1 Élève (au plus une active par couple) ; Remise 1-N Version ; Version image 0..1 Transcription ; Remise 1-N Proposition IA (une courante) ; Remise 0..1 Évaluation du professeur 1-N Journal.

### 5.3 Invariants

1. Un compte a un seul rôle ; l'inscription publique ne produit que des élèves ; les comptes professeur sont créés par l'administrateur (D1).
2. Toute remise appartient à un devoir reçu par l'élève (D3).
3. Le correcteur d'une remise est le professeur créateur du devoir, propriétaire des classes destinataires.
4. Ni l'identité de l'élève, ni le niveau du devoir, ni aucun identifiant ne figurent dans l'entrée de l'IA.
5. La proposition IA est immuable ; aucune modification du professeur ne l'écrase ; chaque modification est journalisée automatiquement.
6. La note finale peut différer de la note calculée (D5) ; l'écart est signalé au professeur ; ce que l'élève en voit : Q5.
7. « Publiée » implique « validée » ; l'élève ne lit jamais une évaluation non publiée ni la proposition brute.
8. La rubrique est en lecture seule pour tout le monde.
9. Nom, prénom, email et classe d'un élève ne sont visibles que du professeur propriétaire de sa classe (= correcteur de ses devoirs).
10. Un élève retiré ne peut pas rejoindre sa classe avec l'ancien lien ou code ; seule la réadmission par le professeur le rattache à nouveau.

### 5.4 Matrice d'accès (source des tests d'AUTH-04 et de E10)

L = lecture, É = écriture, — = refus (test négatif exécutable). « Propriétaire » = le professeur propriétaire de la classe et correcteur du devoir.

| Ressource | Élève concerné | Autre élève | Professeur propriétaire | Autre professeur | Administrateur | Visiteur |
|---|---|---|---|---|---|---|
| Compte élève (nom, prénom, email) | L É (le sien) | — | L (élèves de ses classes) | — | — | — |
| Compte professeur | — | — | L É (le sien) | — | É (invitation) | — |
| Classe, lien, code, liste d'élèves | L (ses classes, sans la liste) | — | L É | — | — | — |
| Devoir | L (ceux de ses classes, ou avec remise) | — | L É (selon verrouillage) | — | — | — |
| Remise et images | É (la sienne : remplacement SUB-05, pas de lecture) | — | L | — | — | — |
| Transcription | — | — | L | — | — | — |
| Proposition IA et alertes | — | — | L | — | — | — |
| Évaluation non publiée | — | — | L É | — | — | — |
| Évaluation publiée (note, niveaux, remarques, commentaire, pistes) | L | — | L É (retrait) | — | — | — |
| Journal | — | — | L (ses copies) | — | — | — |
| Rubrique | L | L | L | L | L | — |

### 5.5 États de la remise (internes)

États : **À remettre** ; **Remise reçue** ; **Transcription en cours** (image) ; **Transcription échouée** ; **Évaluation en cours** ; **Évaluation échouée** ; **Non évaluable / IA indisponible** (avec sa cause) ; **À valider** ; **Validée** ; **Publiée**. Indicateur transversal : **en retard** (D8). Pas d'état « brouillon » : la remise est atomique.

| # | Transition | Déclencheur et gardes |
|---|---|---|
| 1 | À remettre -> Remise reçue | L'élève remet (SUB-02, SUB-03). Compte confirmé, membre actif d'une classe destinataire, devoir lié (D3). Après la date limite : acceptée et marquée « en retard » (D8). |
| 2 | Remise reçue -> Transcription en cours (image) ou Évaluation en cours (texte) | Traitement automatique (PRC-01). |
| 3 | Transcription en cours -> Évaluation en cours, ou Transcription échouée (tentatives épuisées), ou Non évaluable (aucune écriture lisible) | TRX-01, PRC-02, EVL-04. |
| 4 | Transcription échouée -> Transcription en cours, ou À valider | Relance du professeur, ou évaluation manuelle (REV-06). |
| 5 | Évaluation en cours -> À valider, ou Évaluation échouée, ou Non évaluable / IA indisponible | Sortie conforme (EVL-03) ; échec (PRC-02) ; texte sans contenu évaluable ou devoir en français sans rubrique française validée (contrôlé avant l'appel à l'IA, après transcription pour une image). |
| 6 | Évaluation échouée -> Évaluation en cours, ou À valider | Relance du professeur, ou évaluation manuelle (REV-06). |
| 7 | Non évaluable / IA indisponible -> À valider, ou Évaluation en cours | Évaluation manuelle ; ou relance proposée au professeur quand la cause disparaît (rubrique française validée, PRC-02). Le texte existe déjà. |
| 8 | À valider -> Validée | Le professeur valide (REV-05). |
| 9 | Validée -> Publiée | Le professeur publie (PUB-01). « Valider et publier » enchaîne 8 et 9 en une action (D6). |
| 10 | Publiée -> Validée ; Validée ou Publiée -> À valider | Retrait de la publication (PUB-01) ; modification de l'évaluation (REV-03, Q8). |
| 11 | Remise reçue ... À valider -> Remise reçue | L'élève remplace sa remise (SUB-05) tant que le professeur n'a ni modifié ni validé, 2 fois au plus (Q3 [D]). Un traitement lancé sur une version devenue non active produit un résultat conservé mais non courant. |

Règles transverses :
- Aucune remise ne reste indéfiniment « en cours » ; l'échec d'une remise ne bloque aucune autre.
- Seul le professeur déclenche « Validée » et « Publiée » ; « Publiée » n'est atteignable que depuis « Validée ».
- « Non évaluable / IA indisponible » n'est pas un échec technique : pas de relance en boucle.
- Vue de l'élève, liste fermée : « À remettre » (mention « date limite dépassée ») ; « Remis, en cours de correction » (mention « en retard ») pour tous les états de Remise reçue à Validée, échecs et non évaluable compris ; « Corrigé, résultat disponible » pour Publiée. Aucun état technique n'est montré à l'élève.
- **Devoir** : « créé sans remise » (tous champs modifiables sauf les classes ; supprimable) puis « avec remises » (sujet, langue, instructions, date limite verrouillés ; titre et niveau modifiables ; non supprimable). La date limite ne ferme jamais le devoir (D8).

---

## 6. Catalogue des fonctionnalités

Chaque bloc : énoncé, ligne de métadonnées, règles de gestion (**R**), critères d'acceptation (**CA**). Les critères marqués « rejoué » sont vérifiés dans l'étape indiquée en section 8.3.

### Module AUTH : comptes et accès (livré en E1)

#### AUTH-01 — Inscription de l'élève avec confirmation de l'email
Un visiteur peut créer un compte élève (email, mot de passe, nom, prénom) puis confirmer son adresse, afin d'accéder à son espace personnel.
*Acteur : Visiteur · Origine et statut : F1 [D] ; nom, prénom, confirmation [P] · Dépend de : — · Problèmes : — · Tests : unitaire, intégration, E2E*
- **R1** [D] Inscription avec l'adresse email de l'élève (F1). [P] Données collectées : email, mot de passe, nom, prénom, nécessaires à l'affichage au professeur (D9) et au tri ; aucune autre. Public réel et élèves sans email : Q9.
- **R2** [P] Un email correspond à un seul compte ; l'inscription publique ne produit que le rôle élève.
- **R3** [P] Tant que l'adresse n'est pas confirmée (lien à usage unique, durée à définir), le compte ne peut ni rejoindre une classe ni remettre. Renvoi du lien : AUTH-05. Règles de mot de passe : étape 5.
- **CA1** Email jamais utilisé, mot de passe conforme, nom, prénom : un compte non confirmé est créé et un lien est envoyé.
- **CA2** Email déjà inscrit (casse ou espaces différents) : aucun second compte, et le message ne révèle pas l'existence du compte.
- **CA3** Requête directe demandant le rôle professeur ou administrateur : le compte créé reste élève.
- **CA4** Lien expiré, déjà utilisé ou falsifié : le compte reste non confirmé et ne peut ni rejoindre une classe ni remettre.

#### AUTH-02 — Connexion, déconnexion et session
Un utilisateur peut se connecter pour accéder à l'espace de son rôle, se déconnecter, et sa session expire.
*Acteur : Élève, professeur, administrateur · Origine et statut : F2 [D] · Dépend de : AUTH-01 · Problèmes : — · Tests : unitaire, intégration, E2E*
- **R1** [D] Connexion avec le compte créé (F2), valable pour les trois rôles. [P] Un compte a un seul rôle ; l'utilisateur arrive dans l'espace de son rôle.
- **R2** [P] Message d'erreur identique pour un email inconnu et un mauvais mot de passe. Après N échecs (N à définir), tentatives refusées pendant une durée D (à définir).
- **R3** [P] Identifiants corrects mais compte non confirmé : aucune session ; le renvoi du lien est proposé (AUTH-05).
- **R4** [P] Après déconnexion ou expiration (durée à définir), plus aucune page ni donnée protégée n'est accessible, bouton retour compris.
- **CA1** Compte confirmé et identifiants corrects : l'utilisateur arrive dans l'espace de son rôle.
- **CA2** Identifiants incorrects : aucune session, message identique quel que soit le motif.
- **CA3** Après N échecs (N à définir) : tentatives refusées pendant D (à définir), même avec le bon mot de passe.
- **CA4** Déconnexion ou session expirée : une page ou donnée protégée est refusée. Compte non confirmé : aucune session, renvoi proposé.

#### AUTH-03 — Création des comptes professeur par l'administrateur
L'administrateur peut créer un compte professeur depuis une interface minimale, afin que seules des personnes autorisées corrigent des copies et voient l'identité des élèves.
*Acteur : Administrateur · Origine et statut : D1 [D] · Dépend de : AUTH-02 · Problèmes : — · Tests : intégration, E2E, recette*
- **R1** [D] Les comptes professeur sont créés par un administrateur ; aucune inscription publique de professeur (D1). [D] Interface minimale : créer un compte professeur (nom, prénom, email), rien d'autre dans le MVP. [P] Il peut réémettre ou annuler une invitation non utilisée.
- **R2** [P] Le professeur reçoit un lien à usage unique (durée à définir) pour choisir son mot de passe : adresse confirmée par construction.
- **R3** [P] Un email déjà utilisé par un compte d'un autre rôle est refusé explicitement côté administrateur (rôle unique).
- **R4** [P] Le premier compte administrateur est créé hors interface publique à la mise en place (Q2). Création, réémission, annulation sont tracées (auteur, date). Aucune élévation de rôle par requête.
- **CA1** Invitation émise : le professeur ouvre le lien, choisit son mot de passe, son compte est actif et il se connecte à l'espace professeur.
- **CA2** Élève, visiteur ou professeur qui tente de créer un compte professeur : refus.
- **CA3** Lien expiré, utilisé ou annulé : refusé ; l'administrateur réémet une invitation non utilisée et l'ancien lien est invalidé.
- **CA4** Email déjà inscrit (autre rôle) : refus explicite. Chaque action consigne l'auteur et la date.

#### AUTH-04 — Cloisonnement des accès par rôle et par propriété
Le système ne donne accès à une classe, un devoir, une copie, une transcription, une évaluation ou un journal qu'à la personne concernée, afin de protéger copies, identités et notes.
*Acteur : Système · Origine et statut : condition de F2, F3, F6, F10, F13 ; valeurs par défaut de D2 [P] · Dépend de : AUTH-02, AUTH-03 · Problèmes : — · Tests : intégration, E2E, recette*
- **R1** [P] La matrice 5.4 est appliquée en un point unique à chaque accès, images comprises (aucun lien public ni permanent).
- **R2** [P] Le correcteur est le professeur créateur du devoir, propriétaire des classes destinataires (défaut de D2) ; un seul correcteur par copie. L'administrateur n'accède à aucune classe, copie ou évaluation.
- **R3** [P] Une ressource inexistante et une ressource d'autrui donnent la même réponse. Aucune recherche d'élèves hors de ses classes. Les refus propres à une ressource sont rejoués dans l'étape qui la crée.
- **CA1** Visiteur sans session : toute page ou donnée protégée est refusée.
- **CA2** Élèves A et B : A ne peut ouvrir la remise de B (identifiant, adresse ou requête directe).
- **CA3** Professeurs P1 et P2 : P2 demande une classe, un devoir ou une copie de P1 et reçoit la réponse d'une ressource inexistante.
- **CA4** Élève membre de deux classes de deux professeurs : chaque professeur ne voit que les remises de ses propres devoirs. Chaque cellule « — » de la matrice 5.4 est un test négatif exécutable.

#### AUTH-05 — Récupération d'accès : mot de passe oublié et renvoi du lien de confirmation
Un utilisateur peut réinitialiser son mot de passe par email, et un élève dont le lien de confirmation a expiré peut en recevoir un nouveau, afin de ne pas rester bloqué.
*Acteur : Élève, professeur, administrateur · Origine et statut : F2 (complément) [P] · Dépend de : AUTH-01 · Problèmes : — · Tests : unitaire, intégration, E2E*
- **R1** [P] Réinitialisation : lien à usage unique et durée limitée (à définir) envoyé à l'adresse du compte ; réponse identique que l'email ait un compte ou non ; les sessions ouvertes sont fermées. Une réinitialisation réussie confirme l'adresse d'un compte non confirmé.
- **R2** [P] Renvoi du lien de confirmation depuis l'écran de connexion d'un compte non confirmé ; réponse identique quel que soit l'email ; l'ancien lien est invalidé.
- **R3** [P] Nombre de demandes limité (valeur à définir).
- **CA1** Email inconnu : réponse identique à celle d'un email connu, aucun email envoyé ; lien de réinitialisation expiré ou déjà utilisé refusé.
- **CA2** Réinitialisation réussie : anciennes sessions fermées ; compte non confirmé devenu confirmé.
- **CA3** Renvoi demandé : nouveau lien valable, ancien invalidé, réponse identique pour un email sans compte. Demandes répétées : limitées.

### Module CLS : classes et invitation (livré en E2)

#### CLS-01 — Créer et nommer ses classes
Le professeur peut créer et nommer plusieurs classes afin d'organiser ses élèves et de leur envoyer des devoirs.
*Acteur : Professeur · Origine et statut : F14 [D] · Dépend de : AUTH-03, AUTH-04 · Problèmes : — · Tests : unitaire, intégration, E2E*
- **R1** [D] Un professeur a plusieurs classes, chacune avec plusieurs élèves (F14). [P] Une classe a un seul professeur (défaut de D2).
- **R2** [P] Le nom d'une classe est unique chez un même professeur ; deux professeurs peuvent avoir des classes de même nom.
- **CA1** Deux classes de noms distincts : elles apparaissent dans la liste du professeur, vides.
- **CA2** Nom déjà utilisé par ce professeur : création refusée.
- **CA3** Deux professeurs avec une classe de même nom : chacun ne voit que la sienne.

#### CLS-02 — Inviter par un lien ou un code
Le professeur peut obtenir, pour chaque classe, un lien et un code d'invitation à partager, et les désactiver ou les renouveler.
*Acteur : Professeur · Origine et statut : D2 [D] · Dépend de : CLS-01 · Problèmes : — · Tests : unitaire, intégration*
- **R1** [D] Le professeur invite en partageant un lien ou un code ; aucune étape d'approbation (D2).
- **R2** [P] Le lien et le code ouvrent la même classe, ne sont pas devinables et ne donnent accès à aucune donnée avant le rattachement.
- **R3** [P] Désactiver ou renouveler rend l'ancien lien et l'ancien code inopérants ; les élèves déjà rattachés restent. Essais de saisie limités.
- **R4** [D, 2026-10-14] Le lien et le code expirent automatiquement 1 heure après la création du lien (Q7) ; un renouvellement crée un nouveau lien, valable 1 heure. Pour inviter de nouveau, le professeur les renouvelle.
- **CA1** Lien et code affichés ; ils ne servent que cette classe.
- **CA2** Code renouvelé : l'ancien est refusé, les élèves déjà rattachés restent.
- **CA3** Code désactivé, expiré ou inconnu : rattachement refusé sans révéler l'existence de classes.
- **CA4** Après N saisies échouées (N à définir) : toute saisie est refusée pendant une durée à définir.

#### CLS-03 — Rejoindre une classe par lien ou code
L'élève peut rejoindre une ou plusieurs classes avec le lien ou le code de son professeur, afin de recevoir ses devoirs.
*Acteur : Élève · Origine et statut : D2, F14 [D] · Dépend de : CLS-02, AUTH-01 · Problèmes : — · Tests : intégration, E2E*
- **R1** [D] Rattachement immédiat : pas de demande à approuver (D2).
- **R2** [P] Un élève peut appartenir à plusieurs classes avec un seul compte ; chaque classe a un seul professeur (défauts de D2). Un élève qui rejoint après l'envoi d'un devoir le reçoit aussi.
- **R3** [P] Lien ouvert sans session : connexion ou inscription, puis rattachement. Compte non confirmé : refus. Réutiliser le code d'une classe déjà rejointe ne crée pas de doublon.
- **R4** [P] Un élève retiré (CLS-04) ne peut pas rejoindre à nouveau avec le même lien ou code : refus neutre, identique à celui d'un code inconnu.
- **CA1** Compte confirmé et lien ou code valide : l'élève est membre immédiatement.
- **CA2** Lien ou code inconnu ou désactivé : refus. Élève déjà membre : aucun doublon.
- **CA3** Élève membre de deux classes : les deux apparaissent dans son espace.
- **CA4** Élève retiré et code encore actif : refus neutre, aucun rattachement.

#### CLS-04 — Consulter les élèves d'une classe, en retirer et les réadmettre
Le professeur peut consulter la liste des élèves de sa classe (nom, prénom, email), en retirer un et le réadmettre, afin de garder des classes exactes.
*Acteur : Professeur · Origine et statut : conséquence de D2 [P] ; identité visible [D] · Dépend de : CLS-03 · Problèmes : — · Tests : intégration, E2E*
- **R1** [P] Sans approbation (D2), le retrait est le contrôle a posteriori ; il est effectif parce que l'élève retiré ne peut pas se rattacher seul (CLS-03).
- **R2** [P] La réadmission est une initiative du professeur depuis la liste des élèves retirés : ce n'est pas l'approbation d'une demande (D2).
- **R3** [P] Un élève retiré ne reçoit plus les nouveaux devoirs et ne peut plus remettre ; ses remises existantes restent consultables par son correcteur (REV-01) ; lui voit seulement l'état et le résultat publié (SUB-01). L'identité n'est pas masquée pour le professeur propriétaire [D].
- **CA1** Classe de trois élèves : la liste montre les trois avec nom, prénom, email.
- **CA2** Élève retiré : un nouveau devoir de la classe ne lui est pas envoyé (rejoué en E3).
- **CA3** Élève retiré qui a une remise : elle reste visible de son correcteur (rejoué en E4 et E7).
- **CA4** Élève retiré puis réadmis : il est de nouveau membre et reçoit les devoirs suivants. Un autre professeur n'accède pas à la liste.

### Module ASG : devoirs (livré en E3)

#### ASG-01 — Créer un devoir et choisir les classes destinataires
Le professeur peut créer un devoir (sujet, niveau, langue, date limite, instructions facultatives) et choisir, à la création, les classes qui le reçoivent.
*Acteur : Professeur · Origine et statut : F12, F14, F15, D4, D8 [D] ; titre [P] · Dépend de : CLS-01, AUTH-04 · Problèmes : — · Tests : unitaire, intégration, E2E*
- **R1** [D] Champs : sujet, niveau, langue (français ou anglais), date limite, instructions facultatives (F12). [P] Un titre court s'ajoute.
- **R2** [D] Le niveau est une étiquette de la liste fermée A1, A2, B1, B2, C1, non transmise à l'IA (D4). La date limite n'empêche pas la remise (D8, SUB-04).
- **R3** [D] Les classes sont choisies à la création (F14, F15) : au moins une, parmi les siennes ; la classe d'un autre professeur est refusée sans création partielle.
- **R4** [P] Sujet et instructions servent à juger l'adéquation à la tâche ; ils ne peuvent ni ajouter, ni retirer, ni repondérer un critère. Avertissement affiché : pas de nom d'élève, ni de mention du niveau ou de la classe, dans ces champs transmis à l'IA (EVL-02).
- **R5** [P] Un élève présent dans plusieurs classes destinataires voit un seul devoir et n'a qu'une remise possible. Fuseau horaire de la date limite : `Africa/Casablanca` [D, 2026-10-14].
- **CA1** Professeur à trois classes qui choisit C1 et C3 : le devoir est envoyé à C1 et C3 uniquement.
- **CA2** Champ obligatoire manquant, langue hors français et anglais, niveau hors liste, aucune classe : création refusée avec un message par champ, aucun devoir partiel.
- **CA3** Devoir sans instructions : création valide, aucun bloc vide chez l'élève. Élève membre de C1 et C3 : un seul devoir.

#### ASG-02 — Lister ses devoirs et ouvrir un devoir
Le professeur peut lister ses devoirs et en ouvrir un, afin d'accéder aux remises de ses élèves.
*Acteur : Professeur · Origine et statut : point d'entrée de F13 [P] · Dépend de : ASG-01 · Problèmes : P1 · Tests : intégration, E2E*
- **R1** [P] Par ligne : titre, langue, niveau, date limite, classes, nombre de remises, nombre de copies à valider.
- **R2** [P] Seuls les devoirs du professeur connecté ; date limite la plus récente d'abord par défaut. Ouvrir un devoir mène à la liste de ses remises (REV-01).
- **CA1** Professeur à trois devoirs : la liste les montre avec leurs champs ; un autre professeur ne les voit pas.
- **CA2** Clic sur un devoir : la liste de ses remises s'ouvre (rejoué avec REV-01).

#### ASG-03 — Modifier ou supprimer un devoir, avec verrouillage dès la première remise
Le professeur peut modifier ou supprimer un devoir tant qu'il n'a reçu aucune remise ; ensuite le sujet, la langue, les instructions et la date limite sont verrouillés, afin que toutes les copies soient évaluées sur la même tâche.
*Acteur : Professeur · Origine et statut : F12 [P] · Dépend de : ASG-02 · Problèmes : P2 · Tests : unitaire, intégration, E2E*
- **R1** [P] Avant la première remise, tous les champs sont modifiables sauf les classes (ajout de classe : V2) ; la modification est immédiatement visible des élèves.
- **R2** [P] Après la première remise, seuls le titre et l'étiquette de niveau restent modifiables ; prolongation de la date limite : V2. Un devoir ayant une remise ne peut pas être supprimé (archivage : V2).
- **CA1** Devoir sans remise, sujet modifié : les élèves voient le nouveau sujet. Devoir sans remise supprimé : il disparaît des listes.
- **CA2** Devoir avec au moins une remise : changer le sujet, la langue, les instructions ou la date limite, ou le supprimer, est refusé (rejoué en E4).
- **CA3** Un autre professeur ne peut ni modifier ni supprimer le devoir.

### Module SUB : espace élève et remise (livré en E3, E4 et E9)

#### SUB-01 — Espace personnel de l'élève : devoirs reçus et état de chaque remise
L'élève dispose d'un espace qui liste les devoirs reçus de ses classes et l'état de sa remise pour chacun.
*Acteur : Élève · Origine et statut : F3, D3 [D] · Dépend de : CLS-03, ASG-01 · Problèmes : — · Tests : intégration, E2E*
- **R1** [D] Chaque élève a son espace de remise ; toute remise est liée à un devoir reçu, pas de dépôt libre (F3, D3).
- **R2** [P] Par devoir : titre, sujet, instructions, langue, date limite, état. L'élève ne relit ni son texte ni ses images après l'envoi (étape 5, A3). Un devoir envoyé à deux classes de l'élève n'apparaît qu'une fois ; sans classe, état vide explicite.
- **R3** [P] États visibles, liste fermée : « À remettre » (mention « date limite dépassée »), « Remis, en cours de correction » (mention « en retard »), « Corrigé, résultat disponible ». Les états techniques ne sont jamais montrés.
- **R4** [P] Un élève retiré d'une classe garde en lecture seule les devoirs pour lesquels il a une remise (état et résultat publié) ; il ne reçoit plus de nouveau devoir et ne peut plus remettre.
- **CA1** Élève de C1 et devoir envoyé à C1 : le devoir apparaît avec sujet, langue, date limite et état « À remettre ». Devoir envoyé à C2 seulement : absent.
- **CA2** Remise en échec, non évaluable ou à valider : l'élève voit « Remis, en cours de correction » sans détail technique (rejoué en E6 et E8).
- **CA3** Élève retiré qui a une remise : le devoir reste visible en lecture seule (rejoué en E4 et E8). Élève sans classe : état vide explicite.

#### SUB-02 — Remettre une production en texte collé
L'élève peut coller ou saisir le texte de sa production pour un devoir, afin de la remettre à son professeur.
*Acteur : Élève · Origine et statut : F5, D3 [D] · Dépend de : SUB-01 · Problèmes : P1, P3 · Tests : unitaire, intégration, E2E*
- **R1** [D] La production est remise sous forme de texte, rattachée à un devoir (F5, D3). [P] Texte brut non vide ; refus explicite au-delà de la limite, jamais de troncature silencieuse. [D, 2026-10-15] Limite : 4000 caractères.
- **R2** [P] Fautes d'orthographe, de ponctuation et de majuscules conservées telles quelles jusqu'à l'IA : aucune correction automatique.
- **R3** [P] Une version de remise est faite de texte OU d'images, jamais des deux ; le mode est enregistré et visible du professeur.
- **R4** [D, 2026-10-15] Consigne seule, affichée avant l'envoi : ne pas écrire son nom dans la production ; pas d'alerte ni de masquage dans le MVP (Q10). [P] Limite assumée : l'application ne sait pas si le texte a été écrit par l'élève, copié ou généré.
- **CA1** Devoir et texte non vide : une remise est créée avec ce texte à l'identique et une confirmation datée s'affiche.
- **CA2** Texte vide, fait d'espaces ou au-delà de la limite : remise refusée avec un message explicite.
- **CA3** Texte contenant des fautes : elles sont conservées inchangées dans le texte transmis à l'évaluation. Compte non confirmé ou élève retiré : remise refusée.

#### SUB-03 — Remettre une ou plusieurs images scannées
L'élève peut déposer une ou plusieurs images scannées de sa production manuscrite pour un devoir, afin de la remettre à son professeur.
*Acteur : Élève · Origine et statut : F4, D3 [D] · Dépend de : SUB-01, SUB-04, SUB-05 · Problèmes : P1 · Tests : unitaire, intégration, E2E*
- **R1** [D] Une ou plusieurs pages de copie manuscrite scannée, rattachées à un devoir (F4, D3). [P] Pages ordonnées, avec aperçu et réordonnancement avant l'envoi.
- **R2** [P] Formats, poids, nombre de pages maximum : à définir ; type vérifié sur le contenu du fichier. Un fichier refusé ne crée aucune remise et rien n'est stocké.
- **R3** [P] Image stockée sans ses métadonnées d'origine, accessible au seul professeur correcteur et à l'élève auteur (matrice 5.4) ; durée de conservation : étape 5. Un nouvel essai après coupure réseau ne crée pas de doublon.
- **R4** [P] Mêmes consignes que SUB-02. Le scan est à la charge de l'élève ; dépôt par le professeur : V2.
- **CA1** Devoir et image conforme : une remise est créée, l'image stockée, une confirmation datée affichée.
- **CA2** Format refusé, fichier trop lourd ou corrompu, extension qui ne correspond pas au contenu : remise refusée, rien de créé ni de stocké.
- **CA3** Trois pages réordonnées avant l'envoi : l'ordre enregistré est celui choisi. Coupure réseau puis nouvel essai : une seule remise.

#### SUB-04 — Accepter les remises tardives et les marquer « en retard »
Le système accepte une remise déposée après la date limite et la marque « en retard », visible du professeur et de l'élève.
*Acteur : Système · Origine et statut : D8 [D] · Dépend de : SUB-02 · Problèmes : — · Tests : unitaire, intégration*
- **R1** [D] La date limite n'empêche pas la remise ; le retard est accepté et marqué (D8).
- **R2** [P] Est en retard la première remise horodatée strictement après la date limite (horodatage du serveur, fuseau unique `Africa/Casablanca` [D, 2026-10-14]). L'indicateur suit la date de première remise : un remplacement (SUB-05) ne le crée ni ne le retire ; le professeur voit aussi la date de la version active. Limite assumée : déposer à l'heure puis remplacer après la date limite n'est pas marqué.
- **R3** [P] Le retard n'entre pas dans la requête à l'IA et n'a aucun effet sur la note proposée ; aucune pénalité automatique, la décision revient au professeur.
- **CA1** Remise strictement après la date limite : créée et marquée « en retard ». Remise avant ou exactement à la date limite : non marquée.
- **CA2** Remise à l'heure puis remplacée après la date limite : non marquée ; le professeur voit les deux dates.
- **CA3** La requête à l'IA d'une remise en retard est identique à celle d'une remise à l'heure : aucun champ de retard (l'égalité des notes se mesure en E10). L'indicateur est visible dans la liste du professeur (rejoué en E7).

#### SUB-05 — Remplacer sa remise avant que le professeur ne la corrige
L'élève peut remplacer sa remise tant que le professeur n'a ni modifié ni validé l'évaluation, afin de corriger un envoi défectueux (photo floue, mauvais fichier).
*Acteur : Élève · Origine et statut : F4, F5 (complément) [P] · Dépend de : SUB-02 · Problèmes : — · Tests : intégration, E2E*
- **R1** [P] Une seule remise active par couple (devoir, élève) ; les anciennes versions sont conservées et horodatées.
- **R2** [P] Un remplacement relance le traitement ; la proposition précédente n'est plus courante mais reste conservée. Le résultat d'un traitement lancé sur une version non active est conservé, non courant, et ne fait pas passer la remise à « À valider ».
- **R3** [P] Refus dès que le professeur a modifié ou validé l'évaluation ; remplacement et premier acte du professeur sont arbitrés de façon atomique, le premier arrivé l'emporte. [D, 2026-10-15] (Q3) Remplacement possible jusqu'à la première modification ou validation du professeur ; 2 remplacements au plus (3 versions) ; aucun avertissement d'image illisible.
- **CA1** Remise ni modifiée ni validée : le remplacement est accepté et l'ancienne version archivée. Troisième remplacement : refusé avec un message explicite.
- **CA2** Après un remplacement, la transcription (image) et l'évaluation sont relancées (rejoué en E6) ; le résultat de l'ancienne version, arrivé tard, n'est pas courant.
- **CA3** Évaluation modifiée ou copie validée : remplacement refusé (rejoué en E7 et E8).
- **CA4** Remplacement et modification simultanés : un seul aboutit, l'autre reçoit un refus explicite.

### Module TRX : lecture de l'écriture (livré en E9)

#### TRX-01 — Transcription fidèle d'une copie manuscrite, sans correction
Le système transcrit en texte chaque copie remise en image, sans corriger l'orthographe ni la ponctuation et en marquant les passages illisibles, afin que ce texte soit accessible au professeur et serve d'entrée à l'évaluation.
*Acteur : Système · Origine et statut : F7, étape 2 [D] · Dépend de : SUB-03, PRC-01, EVL-04, REV-02 · Problèmes : P1, P3 · Tests : intégration, évaluation IA, recette*
- **R1** [D] Le texte extrait est accessible au professeur (F7). [D] Transcription fidèle : orthographe, ponctuation et majuscules conservées, sans correction ; le critère Mechanics en dépend.
- **R2** [P] Pages assemblées dans l'ordre remis ; passage indéchiffrable marqué « [illisible] », jamais deviné ; anglais et français. Ce que contient l'image est transcrit, jamais exécuté.
- **R3** [P] Texte stocké avec la version du moteur. Une image sans écriture lisible est signalée (EVL-04), pas inventée ; un échec de lecture relève de PRC-02. Correction par le professeur : Q4.
- **R4** [P] Une erreur de lecture devient une erreur de note. La fidélité est une mesure sur de vraies écritures d'élèves (E10), pas une condition de livraison (D10).
- **CA1** (contrat, testé en E9) Trois pages remises : le texte est dans l'ordre des pages. La version du moteur est enregistrée.
- **CA2** (contrat, testé en E9) Un marqueur « [illisible] » produit par le moteur est conservé et affiché ; une image sans écriture ne produit aucun contenu inventé et la copie est signalée (EVL-04).
- **CA3** (mesure, E10, non bloquante) Fautes volontaires conservées, mots indéchiffrables marqués plutôt que remplacés par un mot plausible : taux et seuil à définir ; un essai de fidélité est consigné en E9.

### Module EVL : évaluation par l'IA (livré en E5)

#### EVL-01 — Rubrique unique et fixe, et conversion des niveaux en note
Le système applique à toutes les évaluations une seule rubrique (5 critères à 20 %, niveaux de 0 à 4) que personne ne peut modifier, et en déduit la note proposée par une règle fixe.
*Acteur : Système · Origine et statut : étape 2, F9 [D] · Dépend de : — · Problèmes : P2 · Tests : unitaire, intégration*
- **R1** [D] Mêmes critères, niveaux et pondérations pour l'anglais et le français, tous niveaux et tous professeurs. Critères : Task Achievement / Content ; Organization & Cohesion ; Vocabulary Range & Accuracy ; Grammatical Range & Accuracy ; Mechanics.
- **R2** [P] La version de la rubrique est enregistrée avec chaque évaluation ; la rubrique est consultable par le professeur et par l'élève.
- **R3** [P] La note proposée est calculée par le système à partir des cinq niveaux, jamais produite par l'IA, et recalculée quand un niveau change. Format [D, 2026-10-15, Q1] : sur 20, somme des 5 niveaux.
- **R4** [D, 2026-10-15, Q6] Version française à valider par le client. Tant qu'elle ne l'est pas, aucune proposition IA pour un devoir en français : la copie passe en « IA indisponible » (après transcription pour une image) et s'évalue manuellement (REV-06). L'activation se fait par publication d'une nouvelle version de la rubrique, sans écran d'administration ; la relance est proposée au professeur (PRC-02).
- **CA1** Professeur ou élève qui tente de modifier la rubrique, par l'interface ou par requête directe : refus.
- **CA2** La rubrique comporte exactement 5 critères de 20 % et des niveaux entiers de 0 à 4.
- **CA3** Toutes les combinaisons de niveaux donnent la note de la règle de conversion, dans ses bornes (tous à 0 : minimum ; tous à 4 : maximum).
- **CA4** Devoir en français et rubrique française non validée : aucune proposition IA, copie marquée « IA indisponible ».

#### EVL-02 — Contenu transmis à l'IA limité à une liste blanche
Le système ne transmet à l'IA que le texte de la copie, le sujet, les instructions, la langue du devoir et la rubrique : ni l'identité de l'élève, ni le niveau du devoir, ni aucun identifiant.
*Acteur : Système · Origine et statut : étapes 1-2, D4 [D] · Dépend de : EVL-01, ASG-01 · Problèmes : P3 · Tests : intégration, évaluation IA*
- **R1** [D] Pas d'identité : ni nom, prénom, email, classe, ni professeur, établissement ou identifiant persistant. La corrélation avec la remise se fait côté serveur, sans identifiant dans la requête.
- **R2** [D] Le niveau du devoir (A1 à C1) n'est pas transmis : la rubrique reste absolue (D4).
- **R3** [P] La requête est construite en un point unique, à partir d'une liste blanche de champs. Métadonnées d'image et noms de fichier ne sont jamais transmis.
- **R4** [P] Limites assumées : un nom écrit par l'élève dans sa production (Q10), ou un niveau ou une classe cités par le professeur dans le sujet ou les instructions, peut atteindre l'IA ; le test ci-dessous ne couvre que les données de compte. L'absence d'identité ne rend pas l'IA neutre.
- **CA1** Comptes de test dont nom, prénom, email, classe et professeur sont des valeurs repérables : aucune n'apparaît dans les requêtes sortantes vers l'IA (hors contenu rédigé par l'élève).
- **CA2** Deux devoirs identiques de niveaux A1 et C1 : les requêtes envoyées à l'IA sont identiques.
- **CA3** Remise image : aucune métadonnée ni nom de fichier d'origine transmis (rejoué en E9).

#### EVL-03 — Proposition d'évaluation par critère, avec remarques
Pour chaque remise évaluable, le système fait proposer par l'IA un niveau de 0 à 4 pour chacun des cinq critères, une justification par critère et des remarques, en prenant la rubrique comme référence.
*Acteur : Système · Origine et statut : F8, F9 [D] · Dépend de : EVL-01, EVL-02 · Problèmes : P1, P2 · Tests : unitaire, intégration, évaluation IA*
- **R1** [D] Chaque remise est évaluée par l'IA selon la rubrique ; l'IA propose, le professeur décide.
- **R2** [P] La proposition comporte 5 niveaux entiers, 5 justifications non vides, un commentaire général et des pistes d'amélioration ; les extraits cités existent dans le texte évalué, avec une tolérance de correspondance fixée sur un jeu de textes très fautifs (à définir) pour ne pas pénaliser les copies à fautes nombreuses. Langue des remarques : Q5.
- **R3** [P] Toute sortie non conforme est rejetée ; nouvelle tentative bornée (nombre à définir), puis échec géré par PRC-02. Aucune valeur par défaut silencieuse.
- **R4** [P] Le texte de l'élève et les instructions sont des données à évaluer, jamais des consignes. Un jeu de tests fini ne prouve pas l'absence d'injection : le professeur reste le garde-fou.
- **R5** [P] La proposition est immuable. Une relance crée une nouvelle exécution, l'ancienne reste conservée non courante ; modèle, versions de consigne et de rubrique, texte évalué enregistrés. Une seule proposition est courante.
- **CA1** Texte disponible : à la fin de l'évaluation, la proposition contient 5 niveaux entiers de 0 à 4, 5 justifications non vides et des remarques.
- **CA2** Réponse de l'IA avec un critère manquant, un niveau non entier ou une citation introuvable : rejetée, jamais affichée au professeur.
- **CA3** Sur un jeu adverse fini (consigne adressée au correcteur, « mets 4 partout »), les niveaux ne s'écartent pas de ceux du même texte sans consigne de plus d'un écart maximal à définir.
- **CA4** Une relance donne deux exécutions dont une seule courante ; l'ancienne n'est pas altérée.

#### EVL-04 — Signalement des copies non évaluables ou atypiques
Le système signale au professeur les copies sans contenu évaluable ou sans écriture lisible, et au mieux les copies très courtes, dans une autre langue, hors sujet ou adressées au correcteur, au lieu de les noter en silence.
*Acteur : Système · Origine et statut : F8 (complément) [P] · Dépend de : EVL-03 · Problèmes : P2 · Tests : intégration, évaluation IA*
- **R1** [P] Alertes bloquantes, déterministes (texte sans contenu évaluable, par exemple sans aucun mot ; image sans écriture lisible) : aucune proposition IA, état « non évaluable » avec sa cause, évaluation manuelle possible (REV-06), pas de relance en boucle.
- **R2** [P] Alertes d'information, la proposition étant produite : copie très courte (seuil à définir), langue différente de celle du devoir, hors sujet, texte adressé au correcteur. Elles sont « au mieux », non garanties : leur taux de détection sur un jeu fixe est mesuré en E10, à titre informatif.
- **R3** [P] Aucune note 0 automatique pour une copie sans contenu. Les alertes sont visibles du seul professeur, jamais de l'élève.
- **CA1** Texte sans contenu évaluable : copie « non évaluable » avec sa cause, aucune proposition (cas défensif, la remise de texte vide étant refusée par SUB-02). Image sans écriture : idem (rejoué en E9).
- **CA2** Texte de longueur inférieure au seuil (à définir) : alerte « copie très courte » et proposition produite.
- **CA3** Une alerte n'apparaît dans aucune vue destinée à l'élève (rejoué en E8).

### Module PRC : traitement des remises (livré en E6)

#### PRC-01 — Traitement automatique de chaque remise, par lots
Le système lance automatiquement, pour chaque remise reçue, la transcription (si image) puis l'évaluation, plusieurs remises à la fois, sans action du professeur, jusqu'à l'état « à valider ».
*Acteur : Système · Origine et statut : étape 2 (principes 2 et 7), F7, F8 [D] · Dépend de : SUB-02, EVL-03 · Problèmes : P1 · Tests : intégration, E2E, recette*
- **R1** [D] La lecture de l'écriture et le temps sont gérés par l'application ; plusieurs copies sont traitées en même temps (solution, principes 2 et 7).
- **R2** [P] Déclenchement dès la remise ou le remplacement ; une copie texte saute la transcription ; un déclenchement répété ne crée ni doublon ni seconde proposition courante.
- **R3** [P] Chaque remise suit son propre cycle : l'échec ou la lenteur de l'une ne bloque aucune autre ; aucune remise n'est perdue ni attribuée à un mauvais élève ; reprise après panne sans perte ni doublon ; un traitement lancé survit à la fermeture de la page.
- **R4** [P] Ni l'ordre d'arrivée ni la composition du lot n'entrent dans la requête à l'IA ; l'égalité des résultats sur exécutions répétées se mesure (E10), elle ne se présume pas. Volume et délai cibles : à définir (scénario haut : plus de 100 copies en une journée).
- **R5** [P] Une remise n'atteint « À valider » que si une proposition conforme existe ; sinon échec ou non évaluable (PRC-02, EVL-04).
- **CA1** Remise texte : l'évaluation démarre sans transcription et la remise atteint « À valider » sans intervention. Remise image : transcription puis évaluation (rejoué en E9).
- **CA2** Double déclenchement d'une même remise : un seul traitement actif, une seule proposition courante.
- **CA3** Lot déposé en parallèle par plusieurs comptes, marqueur unique par texte : chaque proposition ne cite que sa propre copie ; chaque remise atteint un état final.
- **CA4** Une remise en échec dans le lot n'empêche pas les autres d'atteindre « À valider ». Panne en cours de lot : reprise sans perte ni doublon.

#### PRC-02 — Gestion des échecs et relance par le professeur
Le système réessaie un traitement échoué un nombre borné de fois, puis le signale au professeur, qui peut le relancer, afin qu'aucune copie ne reste bloquée sans que personne le sache.
*Acteur : Système, professeur · Origine et statut : F7, F8 (complément) [P] · Dépend de : PRC-01, EVL-04 · Problèmes : P1 · Tests : unitaire, intégration*
- **R1** [P] Tentatives et durée maximale par étape : à définir. Aucune remise ne reste indéfiniment « en cours ».
- **R2** [P] États distincts : « transcription échouée » et « évaluation échouée » (techniques, relançables) ; « non évaluable » ou « IA indisponible » (cause connue, sans relance en boucle). Visibles du professeur (REV-01), jamais de l'élève (SUB-01).
- **R3** [P] Le professeur peut relancer depuis un échec ou passer à l'évaluation manuelle (REV-06) ; pas de relance d'une copie « À valider » (Q4).
- **R4** [P] Quand la rubrique française est activée, le professeur se voit proposer de relancer l'évaluation IA des copies « IA indisponible » pour cette cause ; jamais automatiquement, jamais sur une copie déjà évaluée à la main.
- **CA1** Échec technique répété : après le nombre borné de tentatives, la remise passe en échec visible du professeur.
- **CA2** Relance manuelle réussie : la remise reprend son cycle jusqu'à « À valider ». Panne du service d'IA pendant un lot : aucune remise perdue, les remises touchées passent en échec visible.
- **CA3** Rubrique française activée : la relance est proposée pour les copies « IA indisponible » non évaluées à la main, et pour elles seules.
- **CA4** Quel que soit l'échec, l'élève voit seulement « Remis, en cours de correction ».

### Module REV : revue et validation par le professeur (livré en E7 et E8)

#### REV-01 — Liste des remises d'un devoir, triée et filtrée
Le professeur peut consulter, pour un devoir, la liste des élèves des classes destinataires avec l'état de leur remise, et la trier par note, par date de remise ou par ordre alphabétique.
*Acteur : Professeur · Origine et statut : F13 [D] · Dépend de : ASG-02, SUB-04, PRC-02 · Problèmes : P1 · Tests : unitaire, intégration, E2E*
- **R1** [D] La partie « soumissions » liste, pour un devoir, la remise de chaque élève, triable par note, date de remise ou ordre alphabétique ; l'identité n'est pas masquée.
- **R2** [P] Sont listés les membres actifs des classes destinataires, « non remis » compris, une seule fois même dans plusieurs classes (avec leurs classes), et tout élève ayant une remise, avec la mention « retiré de la classe » s'il a été retiré.
- **R3** [P] Par ligne : nom, prénom, classe(s), état (non remis, remis, en cours, échec, non évaluable, à valider, validée, publiée), « en retard », mode de remise (texte ou image), note.
- **R4** [P] Le tri porte sur toute la liste. Par note : note du professeur, sinon note proposée marquée « provisoire » ; les copies sans note restent en fin de liste dans les deux sens, jamais comptées comme 0. Alphabétique : nom puis prénom, insensible à la casse et aux accents. Par date : version active.
- **R5** [P] Filtres par classe et par état, combinables avec le tri ; compteurs des copies à valider, en échec et non évaluables ; action de relance (PRC-02).
- **CA1** Devoir envoyé à une classe de 8 élèves dont 5 ont remis : 8 lignes, dont 3 « non remis ».
- **CA2** Plus de remises que la taille d'une page d'affichage, tri par note : l'ordre porte sur toute la liste, copies sans note en fin dans les deux sens.
- **CA3** Noms « Émile », « Eric », « d'Aubigné » : ordre alphabétique insensible aux accents et à la casse. Filtre « à valider » combiné à un tri par date : seules ces remises, dans l'ordre demandé.
- **CA4** Élève retiré qui a une remise : listé avec « retiré de la classe » (rejoué avec CLS-04). Élève retiré sans remise : absent.

#### REV-02 — Ouverture de la copie d'un élève par un clic sur son nom
En cliquant sur le nom d'un élève, le professeur voit son nom, son prénom, son email et sa classe, ainsi que sa copie pour ce devoir avec la proposition de l'IA, ses remarques et ses alertes.
*Acteur : Professeur · Origine et statut : F13, F10, F7, D9 [D] · Dépend de : REV-01, EVL-03 · Problèmes : P1, P3 · Tests : intégration, E2E*
- **R1** [D] Un clic sur le nom ouvre la copie pour ce devoir avec nom, prénom, email, classe (D9). Sont affichées toutes les classes de l'élève destinataires du devoir et appartenant à ce professeur. L'identité n'est pas masquée.
- **R2** [P] Aucun historique des résultats précédents de l'élève à l'écran de correction (ni note ni moyenne), pour ne pas ajouter d'effet de halo.
- **R3** [D] Le texte de la copie est accessible (F7). Copie texte : texte seul. Copie image : transcription en premier avec la mention « transcrit automatiquement », image à la demande, côte à côte (rejoué en E9).
- **R4** [P] Sont affichés : 5 niveaux avec justifications, remarques, note proposée, alertes, mode de remise, « en retard ». La proposition d'origine n'est pas modifiable à l'écran. Un élève « non remis » ouvre une page de statut sans formulaire.
- **CA1** Clic sur un nom : s'ouvre la copie de cet élève pour ce devoir avec nom, prénom, email, classe. Deux élèves homonymes : chaque clic ouvre la bonne copie.
- **CA2** Élève membre de deux classes du professeur et d'une classe d'un autre professeur, toutes destinataires : les deux premières sont affichées, pas la troisième.
- **CA3** Copie ouverte : aucune note ni moyenne antérieure de l'élève. Copie image : transcription avec sa mention, image à la demande seulement.

#### REV-03 — Modification libre des niveaux, des remarques et de la note
Le professeur peut modifier les niveaux, les remarques et la note, chacun librement et indépendamment des autres, sans justification obligatoire.
*Acteur : Professeur · Origine et statut : D5, F10 [D] · Dépend de : REV-02, EVL-01 · Problèmes : — · Tests : unitaire, intégration, E2E*
- **R1** [D] Modification libre, y compris de la note indépendamment des niveaux, sans justification (D5). [P] L'évaluation du professeur est initialisée à partir de la proposition : 5 niveaux, une remarque par critère (justification de l'IA, modifiable), commentaire général, pistes, note.
- **R2** [P] Niveau entier de 0 à 4. Tant que le professeur n'a pas fixé la note, elle est recalculée à chaque changement de niveau ; une fois fixée, plus de recalcul, l'écart avec la note calculée lui est signalé, et il peut revenir à la note calculée. Format et bornes : Q1.
- **R3** [P] Une remarque de critère dont le niveau a changé est marquée « à relire » pour le professeur, sans bloquer ni exiger de texte (D5).
- **R4** [P] Limite assumée : note et remarques peuvent différer des niveaux montrés à l'élève et l'application ne l'empêche pas (Q5). Ancrage sur l'IA et effet de halo restent possibles.
- **R5** [P] Toute écriture suppose que la version de remise et la proposition courante soient celles vues à l'ouverture ; sinon refus « la remise a été remplacée » et rechargement. Un conflit entre deux sessions du même professeur est signalé, jamais résolu par perte silencieuse. Modifier une évaluation validée ou publiée la repasse à « À valider » (Q8).
- **CA1** Niveau modifié, note non fixée : note recalculée, critère marqué « modifié », remarque « à relire ».
- **CA2** Note modifiée seule : niveaux inchangés, modification acceptée sans justification. Note fixée puis niveau modifié : note conservée, écart signalé.
- **CA3** Niveau hors de 0 à 4 : saisie refusée. Remise remplacée pendant l'ouverture : enregistrement refusé avec message, copie rechargée.
- **CA4** Même évaluation modifiée dans deux onglets : conflit signalé, aucune perte silencieuse.

#### REV-04 — Conservation automatique de la proposition d'origine et journal des modifications
Le système conserve automatiquement la proposition d'origine de l'IA et enregistre chaque modification (qui, quand, ancienne et nouvelle valeur), sans rien demander au professeur.
*Acteur : Système · Origine et statut : D5, complément délégué à Claude, à confirmer [D] ; autres événements du journal [P] · Dépend de : REV-03, EVL-03 · Problèmes : P2, P3 · Tests : unitaire, intégration*
- **R1** [D] Proposition d'origine et chaque modification conservées automatiquement, sans action ni justification (D5).
- **R2** [P] Le journal couvre aussi : ouverture de la liste et de la copie, validation, publication, retrait, relances, saisie manuelle. L'ouverture et la validation horodatées servent à mesurer le temps de revue (O1) ; c'est une mesure du comportement du professeur, à lui communiquer (étape 5).
- **R3** [P] Le journal n'est ni modifiable ni supprimable par le professeur, invisible de l'élève ; le correcteur le consulte sur ses propres copies. Aucun écran d'indicateurs (V2).
- **R4** [P] Limite : la concordance entre l'IA et la version finale ne distingue pas un professeur influencé d'un professeur d'accord parce que l'IA a raison.
- **CA1** Modification d'un niveau, d'une remarque ou de la note : le journal contient ancienne et nouvelle valeur, auteur et date, sans action supplémentaire. La proposition d'origine reste lisible et inchangée.
- **CA2** Ouverture puis validation d'une copie : le journal contient les deux événements horodatés (rejoué en E8).
- **CA3** Élève : journal et proposition d'origine inaccessibles, y compris après publication (rejoué en E8).

#### REV-05 — Validation de l'évaluation
Le professeur peut valider l'évaluation d'une copie, telle quelle ou après modification, pour la reconnaître comme la sienne, sans la rendre visible de l'élève.
*Acteur : Professeur · Origine et statut : D6, F10 [D] · Dépend de : REV-03, REV-04 · Problèmes : P1, P2 · Tests : unitaire, intégration, E2E*
- **R1** [D] Valider et publier sont deux actes distincts ; la validation ne rend rien visible (D6).
- **R2** [P] La validation exige 5 niveaux et une note ; elle est journalisée avec sa nature : « sans modification » ou « après modification ». Validation en lot : V2.
- **CA1** Copie « À valider » validée : elle passe à « Validée » avec auteur et date ; l'élève ne voit toujours rien.
- **CA2** Copie en échec sans évaluation : validation refusée. Copie validée puis modifiée : elle repasse à « À valider ».

#### REV-06 — Évaluation manuelle sans proposition de l'IA
Le professeur peut évaluer lui-même une copie sans proposition de l'IA, avec le même formulaire, quand la transcription ou l'évaluation échoue, que la copie est non évaluable ou que l'IA est indisponible.
*Acteur : Professeur · Origine et statut : F10 (complément) [P] · Dépend de : PRC-02, REV-03 · Problèmes : P1 · Tests : intégration, E2E*
- **R1** [P] Même formulaire que pour une copie avec proposition (5 niveaux, remarques, note) et mêmes validation et publication.
- **R2** [P] Évaluation journalisée « saisie manuellement, sans proposition IA ». Cas couverts : transcription ou évaluation échouée, non évaluable, devoir en français tant que la rubrique française n'est pas validée (Q6).
- **CA1** Copie en échec ou non évaluable : le professeur saisit 5 niveaux et des remarques, la copie passe à « À valider » (rejoué en E9 après échec de transcription).
- **CA2** Devoir en français sans rubrique française validée : évaluation manuelle avec le même formulaire. Le journal indique « sans proposition IA ».

### Module PUB : publication et consultation par l'élève (livré en E8)

#### PUB-01 — Publication d'une évaluation validée, avec raccourci « valider et publier »
Le professeur peut rendre visible de l'élève une évaluation validée (la publier), directement ou par le raccourci « valider et publier », et retirer cette publication.
*Acteur : Professeur · Origine et statut : F11, D6 [D] · Dépend de : REV-05 · Problèmes : — · Tests : unitaire, intégration, E2E*
- **R1** [D] Seule une évaluation validée peut être publiée ; jamais de publication automatique, ni par délai ni par défaut (F6, F11). Le raccourci « valider et publier » enchaîne les deux actes (D6), journalisés séparément.
- **R2** [P] Publication copie par copie dans le MVP (en lot : V2). Le retrait ramène la copie à « Validée » ; l'élève ne voit plus rien à son prochain accès. Une action répétée ne crée qu'une publication.
- **R3** [P] Si la publication échoue après la validation du raccourci, la copie reste validée et le professeur en est informé. Après modification d'une évaluation publiée : Q8.
- **CA1** Copie validée publiée : l'élève la voit. Copie non validée : publication refusée en interface et par requête directe.
- **CA2** Copie « À valider », « valider et publier » : validée puis publiée, le journal contient les deux actes. Échec du second acte : copie validée, professeur informé.
- **CA3** Après un retrait : l'élève ne voit plus le résultat à son prochain accès, bouton retour compris.

#### PUB-02 — Consultation par l'élève de sa note, de ses niveaux et des remarques validées
L'élève peut consulter la note, les niveaux par critère et les remarques de l'évaluation de sa production une fois que le professeur l'a validée et publiée.
*Acteur : Élève · Origine et statut : F6, D7 [D] · Dépend de : PUB-01, SUB-01, AUTH-04 · Problèmes : — · Tests : intégration, E2E*
- **R1** [D] L'élève voit la note, les niveaux et les remarques validées (D7). Précisément [P] : note, niveaux par critère, remarque par critère, commentaire général et pistes, dans leur version validée par le professeur, plus la rubrique. Jamais la proposition brute, le journal, les alertes, la transcription ni un état technique.
- **R2** [D] Rien n'est visible avant validation et publication (F6) : la règle vaut pour l'interface, les listes, les états, les messages d'erreur et toute réponse reçue par l'élève.
- **R3** [P] L'élève ne voit que ses résultats. Note affichée telle que fixée par le professeur, même si elle diffère des niveaux (D5). Mention de l'IA, langue des remarques, mention d'une note ajustée : Q5.
- **CA1** Copie publiée : l'élève voit la note, les niveaux par critère, les remarques, le commentaire et les pistes.
- **CA2** Copie évaluée par l'IA ou validée mais non publiée : aucune donnée de résultat dans les réponses reçues par l'élève (liste, détail, état, messages d'erreur).
- **CA3** Évaluation modifiée avant publication : l'élève voit la version modifiée, jamais la proposition d'origine. Élève B qui ouvre le résultat de l'élève A : refus.

---

## 7. Couverture des problèmes et risques résiduels

| Problème | Couvert par | Risque résiduel |
|---|---|---|
| **P1 Temps** | SUB-02, SUB-03, TRX-01, EVL-03, PRC-01, PRC-02, ASG-02, REV-01, REV-02, REV-05, REV-06 | Plausible, non démontré. Le gain dépend du temps de revue, de la fréquence des modifications et des erreurs de lecture ; un écran lent ou une proposition peu fiable peut coûter autant que la correction manuelle. La numérisation reste à la charge de l'élève (dépôt par le professeur et validation en lot : V2). Aucun temps de référence n'existe encore : il est chronométré avant la mise en service. |
| **P2 Écarts entre professeurs** | EVL-01, EVL-03, EVL-04, ASG-03, REV-04 | Largement couvert si la proposition est proche de celle d'experts, hypothèse non vérifiée avant la mesure. Les modifications libres (D5), dont une note indépendante des niveaux, réintroduisent des écarts. Le niveau du devoir (D4) étant sans effet sur l'IA, les élèves de niveau débutant reçoivent structurellement des niveaux bas, compensés seulement par la note libre, donc par un facteur de plus entre professeurs. Les devoirs en français n'ont pas de proposition tant que la rubrique française n'est pas validée. |
| **P2 Inconstance d'un même correcteur** | EVL-01, EVL-03, REV-05 | Partiel. La fatigue pèse sur la validation plutôt que sur la correction complète, mais une validation machinale annule le gain et l'ancrage sur l'IA est réel. L'IA peut varier d'une exécution à l'autre : sa stabilité se mesure. Le journal mesure la concordance IA/professeur, sans distinguer ancrage et accord légitime. |
| **P3 Écriture** | SUB-02, TRX-01, REV-02 | Réduit, pas supprimé. La proposition ne dépend pas de la lecture humaine de l'écriture, mais la qualité de la transcription en dépend, surtout pour Mechanics : une erreur de lecture devient une erreur de note. Le professeur peut voir l'image en modifiant, donc l'écriture peut encore l'influencer. Un texte collé supprime l'écriture sans garantir l'authenticité. |
| **P3 Connaissance de l'élève** | EVL-02, REV-02, REV-04 | Partiel. L'IA ne reçoit ni l'identité ni le niveau du devoir, mais un nom écrit dans la copie peut lui parvenir (Q10) et l'absence d'identité ne la rend pas neutre. L'identité reste visible du professeur : le halo peut se réintroduire quand il modifie, et une note libre peut s'écarter des niveaux. L'absence d'historique à l'écran (D9) limite le halo sans l'éliminer. |

---

## 8. Étapes progressives de conception, d'implémentation et de test

### 8.1 Principe

Option B (D10) : tout est construit, sans jalon de mesure bloquant ni décision « arrêter ». L'ordre suit les dépendances et vise un premier cycle complet en texte dès E8 ; le canal image s'y greffe en E9. Conventions :
1. E1 à E11 sont des étapes de construction ; les 32 fonctionnalités figurent chacune dans une seule étape.
2. Les branches « image » des fonctionnalités livrées avant E9 sont rejouées en E9 ; les autres critères différés le sont selon la table 8.3. Les dépendances du catalogue ne pointent plus vers l'image pour les branches texte.
3. Les refus d'AUTH-04 propres à une ressource sont rejoués dans l'étape qui crée la ressource et vérifiés ensemble en E10.
4. E10 est une activité de test : partie A (durcissement) prérequis de E11, partie B (mesure) non bloquante. Elle produit une liste d'ajustements priorisée, jamais un arrêt ni le retrait d'une fonctionnalité.
5. Toute valeur non décidée reste « à définir » (étape 5). La préparation de E5 (rubrique, contrat de sortie, jeu de développement synthétique) peut démarrer pendant E3 et E4.
6. Coût assumé de l'option B : un mauvais résultat de mesure arrive après la construction et se traduit par des ajustements tardifs.

### 8.2 Les étapes

#### E1 — Fondations : comptes, rôles, accès
**Objectif.** L'élève s'inscrit, confirme et se connecte ; l'administrateur crée les comptes professeur ; chaque accès est contrôlé. **Fonctionnalités.** AUTH-01 à AUTH-05. **Dépend de.** —
- **Conception.** Un compte, un rôle, un état (non confirmé, actif) ; l'inscription publique ne produit que des élèves ; un mécanisme unique de liens à usage unique et de durée limitée (à définir) pour la confirmation, la réinitialisation et l'invitation d'un professeur. Matrice 5.4 appliquée en un point unique et complétée par chaque étape. Messages identiques, temporisation (N et D à définir), expiration de session (à définir). Interface administrateur : un écran (créer, réémettre, annuler une invitation).
- **Implémentation.** Inscription, confirmation, connexion, déconnexion, récupération d'accès, création d'un professeur, contrôle d'accès avec ressources fictives pour l'éprouver ; emails transactionnels capturés en test ; environnements séparés des données réelles ; tests automatiques à chaque modification.
- **Tests.** Unitaires : jetons expirés, utilisés ou falsifiés, normalisation de l'email, rôle forcé, temporisation. Intégration : critères d'AUTH-01 à AUTH-05, réponses identiques, accès sans session et après déconnexion. E2E : inscription, confirmation, connexion de l'élève ; invitation, mot de passe et connexion d'un professeur ; lien expiré puis renvoi. Recette : démonstration par l'administrateur.
- **Critères de sortie.** Critères d'AUTH-01 à AUTH-05 passés ; aucune route publique ne produit un autre rôle qu'élève ; la matrice 5.4 existe comme test exécutable qui échoue si une ressource est exposée sans contrôle ; Q2 et Q9 tranchées ou recommandations consignées comme provisoires.
- **Risques.** Emails non reçus (délivrabilité) ; contrôle d'accès « ajouté plus tard » sur les ressources suivantes (limité par le point unique et le test de matrice) ; administrateur non désigné (Q2) ; aucune désactivation de professeur dans le MVP.
- **Suivi publié, hors chemin critique** (n'en conditionne pas la sortie ni E2, D10) : (a) adaptation puis validation de la rubrique française (Q6) ; (b) corpus de copies de référence et experts indépendants, taille et seuils à définir ; (c) chronométrage de la correction papier avant toute mise en service (référence de O1, non rattrapable ; facultatif en démonstration) ; (d) acteurs de simulation (un administrateur, un professeur, plusieurs élèves) ; (e) vérification des conditions des prestataires d'IA et de lecture. Échéances des questions : voir section 9.

#### E2 — Classes et invitation par lien ou code
**Objectif.** Le professeur crée ses classes et partage un lien ou un code ; l'élève rejoint immédiatement une ou plusieurs classes ; le professeur consulte, retire et réadmet. **Fonctionnalités.** CLS-01 à CLS-04. **Dépend de.** E1
- **Conception.** Classe et Appartenance (statut active ou retirée) ; nom unique par professeur ; élève dans plusieurs classes, une classe un professeur. Lien et code non devinables, désactivation et renouvellement, essais limités, validité 1 heure (Q7 [D]). Un lien ouvert sans session survit à la connexion ou l'inscription et à la confirmation, sans rattacher un compte non confirmé. Rattachement immédiat et idempotent (D2) ; retrait = statut « retirée », refus neutre à la nouvelle tentative, réadmission par le professeur. Matrice étendue à Classe, Appartenance, liste d'élèves.
- **Implémentation.** Création et liste des classes ; génération, affichage, désactivation, renouvellement du lien et du code ; écran « Rejoindre une classe » ; liste des élèves, retrait, réadmission.
- **Tests.** Unitaires : unicité du nom, validité du code, idempotence. Intégration : critères de CLS-01 à CLS-04 (code renouvelé, désactivé, essais limités, deux classes, retiré refusé, réadmis) ; un second professeur n'accède à rien. E2E : le professeur partage le code, l'élève s'inscrit via le lien, confirme, apparaît dans la liste, est retiré puis refusé.
- **Critères de sortie.** Critères de CLS-01 à CLS-04 passés, hors ceux rejoués (table 8.3) ; démonstration à deux professeurs et une élève rattachée aux deux, chacun ne voyant que sa classe ; matrice étendue avec tests négatifs ; Q7 tranchée ou recommandation provisoire.
- **Risques.** Sans approbation, toute personne ayant le lien ou le code peut rejoindre : renouvellement, retrait et refus de rattachement sont les seuls contrôles ; saisie de codes par essais répétés ; intention d'invitation perdue pendant l'inscription ; email des élèves visible du professeur (D9), à encadrer à l'étape 5.

#### E3 — Devoirs et espace personnel de l'élève
**Objectif.** Le professeur crée un devoir pour une ou plusieurs classes, le liste, le modifie ou le supprime tant qu'aucune remise n'existe ; l'élève voit ses devoirs. **Fonctionnalités.** ASG-01, ASG-02, ASG-03, SUB-01. **Dépend de.** E1, E2
- **Conception.** Devoir et Envoi ; le niveau est une étiquette à part, jamais utilisée dans une requête à l'IA (D4). Création en une opération, message par champ, aucune création partielle ; avertissements du formulaire (pas de nom, de niveau ni de classe dans sujet et instructions). Un élève dans plusieurs classes destinataires voit un seul devoir. États du devoir (5.5). Espace élève : projection à liste fermée d'états (seul « À remettre » est atteignable en E3), état vide, devoirs avec remise gardés en lecture seule pour un élève retiré. Matrice étendue à Devoir et Envoi.
- **Implémentation.** Formulaire de création, liste (date limite la plus récente d'abord), modification et suppression conditionnelles, espace élève avec déduplication et état vide.
- **Tests.** Unitaires : validation des champs, niveau ou langue hors liste, déduplication, verrouillage. Intégration : critères d'ASG-01 à ASG-03 et SUB-01 ; élève retiré qui ne reçoit pas le nouveau devoir (CLS-04) ; un autre professeur ne voit rien. E2E : devoir pour C1 et C3, un seul devoir chez l'élève des deux classes, état vide.
- **Critères de sortie.** Critères d'ASG-01 à ASG-03 et SUB-01 passés, hors ceux rejoués (table 8.3) ; la chaîne « le professeur crée un devoir, l'élève le voit » est démontrée ; matrice étendue ; la vue élève ne contient aucun champ hors liste fermée d'états.
- **Risques.** Une étiquette unique pour des classes de niveaux différents, sans effet sur l'IA : les élèves débutants recevront des niveaux structurellement bas, compensés seulement par la note libre (D5), qui réintroduit des écarts (P2) ; modification d'un devoir déjà vu des élèves ; fuseau horaire et changement d'heure ; un nom ou un niveau cité dans le sujet atteindrait l'IA (avertissement, pas garantie).

#### E4 — Remise de texte, retard et remplacement
**Objectif.** L'élève remet un texte collé pour un devoir ; la remise est datée, marquée « en retard » le cas échéant, conservée à l'identique, remplaçable tant que le professeur n'a pas commencé. **Fonctionnalités.** SUB-02, SUB-04, SUB-05. **Dépend de.** E3
- **Conception.** Remise (une seule active par couple) et Version (texte OU pages-images, jamais les deux) ; le modèle accueille déjà les images, sans migration de fond en E9. Table centrale des transitions d'état (5.5) : toute transition hors table est refusée ; tous les états sont déclarés dès maintenant. Texte brut non vide, 4000 caractères au plus [D], refus explicite, aucune correction. Consigne « pas de nom » seule (Q10 [D]). Retard calculé sur la date de première remise (SUB-04), sans effet sur l'IA. Remplacement : versions archivées ; refus après modification ou validation, via un indicateur alimenté en E7 et E8 ; arbitrage atomique entre remplacement et premier acte du professeur ; 2 remplacements au plus (Q3 [D]).
- **Implémentation.** Écran de remise avec confirmation datée ; contrôles (compte confirmé, membre actif d'une classe destinataire, devoir lié) ; création atomique et idempotente (double clic) ; marquage du retard ; remplacement avec archivage ; état « Remis, en cours de correction » ; verrouillage du devoir à la première remise.
- **Tests.** Unitaires : texte vide ou d'espaces, longueur, conservation à l'identique (fautes, accents, retours à la ligne), frontière exacte de la date limite et fuseau. Intégration : critères de SUB-02, SUB-04 et SUB-05 (branche texte) ; ASG-03 rejoué après première remise ; élève non confirmé ou retiré refusé ; élève A ne remet pas pour une classe non rejointe. E2E : remise avant puis après la date limite, remplacement.
- **Critères de sortie.** Critères de SUB-02, SUB-04, SUB-05 passés pour le texte, hors ceux rejoués (table 8.3) ; verrouillage d'ASG-03 vérifié sur des remises réelles ; texte stocké strictement identique au texte saisi ; aucun état technique chez l'élève ; décisions Q3 et Q10 appliquées.
- **Risques.** L'autocorrection de l'éditeur de l'élève altère Mechanics avant la remise ; authenticité non vérifiable ; remplacement après la date limite non marqué (limite assumée de SUB-04, les deux dates sont visibles) ; fuseau horaire ; texte volumineux ou adressé au correcteur (E5).

#### E5 — Rubrique fixe et proposition d'évaluation par l'IA
**Objectif.** Pour toute remise de texte évaluable, produire une proposition conforme, immuable, par critère, avec remarques et note calculée, en ne transmettant que ce qui est autorisé ; signaler les copies atypiques. **Fonctionnalités.** EVL-01 à EVL-04. **Dépend de.** E3, E4
- **Conception.** Rubrique versionnée en lecture seule, conversion en note par le système (Q1), version enregistrée avec chaque évaluation. Français : pas de proposition tant que la rubrique française n'est pas validée (Q6) ; activation par nouvelle version de rubrique ; tests en français sur un brouillon « test uniquement ». Requête construite en un point unique depuis une liste blanche, sans identifiant ; le fournisseur d'IA doit être remplaçable sans modifier les règles métier (choix : étape 7). Contrat de sortie strict, rejet des sorties non conformes, tentatives bornées, tolérance de correspondance des citations fixée sur un jeu de textes très fautifs ; langue des remarques selon Q5. Texte et instructions traités comme des données ; jeu adverse fini. Proposition immuable ; alertes bloquantes et d'information, aucun 0 automatique. Déclenchement par commande d'exploitation interne (enchaînement en E6). Jeu de développement synthétique ; aucune copie réelle envoyée à un prestataire avant vérification de ses conditions. Essai exploratoire de lecture manuscrite : déplacé en E9.0, non lancé ici [D, 2026-10-19].
- **Implémentation.** Stockage de la rubrique et règle de conversion ; constructeur de requête à liste blanche ; validateur de sortie, tentatives bornées, stockage immuable avec traçabilité ; détection des alertes et états « non évaluable » ou « IA indisponible » ; affichage de la rubrique en lecture seule.
- **Tests.** Unitaires : conversion pour toutes les combinaisons de niveaux (bornes), validateur de sortie. Intégration : étanchéité par interception des requêtes avec valeurs repérables ; devoirs de niveaux A1 et C1 identiques côté requête ; relance = deux exécutions dont une courante ; rubrique non modifiable. Évaluation IA : jeu adverse fini, copies de développement en anglais et en français, stabilité observée à titre informatif.
- **Critères de sortie.** Critères d'EVL-01 à EVL-04 passés pour le texte, hors ceux rejoués (table 8.3) ; test d'étanchéité automatique à chaque modification ; aucune sortie non conforme jamais stockée comme proposition courante ; Q1, Q5, Q6 tranchées ou recommandations provisoires ; premier essai informatif consigné tel quel.
- **Risques.** Injection non exhaustivement testable ; sorties non conformes fréquentes et instabilité d'une exécution à l'autre ; nom écrit par l'élève (Q10) ; rubrique française retardée (devoirs en français évalués à la main plus longtemps) ; conditions des prestataires non vérifiées ; coût d'IA par copie mesuré en E5.16 : environ 0,0011 $ ([essai](annexe-essais-ia.md)) ; refus du modèle, sans repli côté serveur ([annexe-ia-anthropic.md](annexe-ia-anthropic.md) §1), classé `refused` et jamais relancé automatiquement [P], écart à EVL-03 R3 : la même requête est en général refusée à nouveau ; la relance manuelle (PRC-02 R3) reste permise ; dépendance au crédit API mensuel du développeur (100 $, sans report) [D, 2026-10-19].

#### E6 — Traitement automatique, par lots, avec gestion des échecs (texte)
**Objectif.** Chaque remise de texte est traitée automatiquement jusqu'à « À valider », plusieurs copies à la fois ; les échecs sont bornés, visibles du professeur et relançables. **Fonctionnalités.** PRC-01, PRC-02. **Dépend de.** E4, E5
- **Conception.** Déclenchement dès la remise ou le remplacement ; idempotence ; cycle propre par remise ; une remise n'atteint « À valider » qu'avec une proposition conforme. Exigences testables : un traitement lancé survit à la fermeture de la page et reprend après panne sans perte ni doublon (mécanisme : étape 7). Relance exposée comme action dès E6 (bouton en E7). L'élève voit « Remis, en cours de correction » dans tous les cas. Volume et délai : à définir ; indicateurs techniques internes, pas d'écran.
- **Implémentation.** Exécution parallèle bornée, nouvelles tentatives, délais d'expiration, reprise ; enchaînement remise -> évaluation -> « À valider » ; relance et passage à l'évaluation manuelle comme actions du service ; simulation de pannes du fournisseur d'IA.
- **Tests.** Intégration : critères de PRC-01 (texte) et PRC-02 ; remplacement qui relance (SUB-05) ; double déclenchement. Charge et isolement : lot parallèle avec marqueur unique par texte, une remise en échec n'arrête pas les autres. Pannes : indisponibilité du fournisseur, arrêt en cours de lot puis reprise. E2E : l'élève remet, la remise atteint « À valider ».
- **Critères de sortie.** Critères de PRC-01 et PRC-02 passés pour le texte ; sous injection de pannes, chaque remise du lot atteint un état final (zéro perdue, dupliquée ou mélangée) ; aucune remise « en cours » au-delà de la durée maximale (à définir) ; délai d'un lot de test mesuré et rapporté tel quel, même au-dessus de la cible.
- **Risques.** Limites de débit ou de coût du fournisseur ; remises « fantômes » après une panne ; mélange entre copies d'un lot (le plus grave : une note pour le mauvais élève) ; relances en cascade ; délai réel inconnu avant mesure.

#### E7 — Revue par le professeur : liste, copie, modification libre, journal
**Objectif.** Le professeur trie la liste des remises, ouvre une copie par clic sur le nom, modifie librement niveaux, remarques et note (D5) ; toute modification est journalisée automatiquement. **Fonctionnalités.** REV-01 à REV-04. **Dépend de.** E3, E4, E5, E6
- **Conception.** Liste complète (non remis, élèves retirés ayant une remise), colonnes et tris de REV-01, portant sur toute la liste. Écran de copie (D9) : classes de l'élève destinataires du devoir et appartenant au professeur ; aucun historique de résultats. Évaluation du professeur distincte de la proposition immuable, initialisée depuis elle ; remarques par critère, « à relire » après changement de niveau ; note recalculée tant qu'elle n'est pas fixée. Journal automatique dans la même opération atomique que la modification : aucune écriture sans trace. Toute écriture conditionnée à la version de remise et à la proposition vues à l'ouverture ; deux modifications concurrentes détectées, jamais de perte silencieuse. Matrice étendue à Évaluation, Journal, Copie, identité.
- **Implémentation.** Liste avec tri et filtres sur l'ensemble des données ; navigation devoir -> liste -> copie ; formulaire d'évaluation ; journalisation ; consultation du journal par le correcteur.
- **Tests.** Unitaires : ordre alphabétique (« Émile », « Eric », « d'Aubigné »), copies sans note en fin, recalcul et fixation de la note, niveau hors 0-4. Intégration : critères de REV-01 à REV-04 ; invariant « aucune écriture d'évaluation sans entrée de journal » ; l'élève n'accède ni au journal ni à la proposition. E2E : clic sur un nom, modification d'un niveau puis de la note seule, conflit entre deux onglets, remise remplacée pendant l'ouverture.
- **Critères de sortie.** Critères de REV-01 à REV-04 passés, hors ceux rejoués en E8 et E9 (table 8.3) ; toute modification laisse une trace et la proposition d'origine reste intacte ; relance d'un échec possible depuis la liste ; Q4 et Q8 tranchées ou recommandations provisoires ; démonstration : une remise texte arrive « À valider », le professeur l'ouvre et la modifie, le journal le montre, l'élève ne voit rien.
- **Risques.** Ancrage et effet de halo à la modification : documentés et mesurables après coup, non supprimés ; note libre différente des niveaux (Q5) ; le journal ne distingue pas ancrage et accord légitime ; temps de revue biaisé par une copie ouverte puis laissée ; tri par note qui mélange notes provisoires et notes du professeur ; lenteur de la liste sur un gros volume.

#### E8 — Validation, publication, consultation : premier cycle complet en texte
**Objectif.** Fermer le premier cycle en texte : le professeur valide, publie (ou « valide et publie ») ou évalue à la main ; l'élève consulte la version du professeur, et elle seule. **Fonctionnalités.** REV-05, REV-06, PUB-01, PUB-02. **Dépend de.** E1, E3, E6, E7
- **Conception.** Validation journalisée « sans » ou « après modification » ; publication acte distinct, copie par copie, retrait, action répétée sans doublon ; le raccourci enchaîne deux actes journalisés séparément. Évaluation manuelle avec le même formulaire, journalisée « sans proposition IA ». Vue de l'élève sur une projection dédiée (liste blanche) : note, niveaux, remarques par critère, commentaire, pistes, rubrique ; jamais la proposition brute, le journal, les alertes, la transcription ni un état technique ; aucune donnée de résultat avant publication, dans aucune réponse. Mentions pour l'élève selon Q5 (recommandations provisoires).
- **Implémentation.** Transitions « Validée » et « Publiée », raccourci, retrait ; formulaire d'évaluation manuelle depuis les états d'échec et d'indisponibilité ; vue de résultat de l'élève et état « Corrigé, résultat disponible » ; journalisation.
- **Tests.** Unitaires : machine d'états (seules les transitions de la table ; « Publiée » seulement depuis « Validée »). Intégration : critères de REV-05, REV-06, PUB-01, PUB-02 ; publication d'une copie non validée refusée par requête directe ; retrait puis bouton retour. Fuite : balayage de toutes les réponses reçues par l'élève avant publication, après retrait, et pour une copie évaluée mais non publiée. Critères rejoués de la table 8.3. E2E complet en texte.
- **Critères de sortie.** Cycle complet en texte démontré par un professeur et une classe sans intervention technique (O4, texte) ; aucun résultat visible avant publication ni après retrait (balayage) ; journal complet du cycle, proposition d'origine intacte et inaccessible à l'élève ; critères rejoués depuis E4, E5 et E7 vérifiés ; matrice 5.4 passée pour chaque ressource existante ; Q5 et Q8 tranchées ou recommandations provisoires.
- **Risques.** Validation machinale que le raccourci « valider et publier » peut favoriser ; fuite d'un résultat par un canal indirect (liste, message d'erreur, cache, bouton retour) ; note incohérente avec les niveaux, vue élève sans explication (Q5) ; mention de l'IA non tranchée (étape 5) ; le texte seul ne répond pas encore au besoin des copies papier (P1).

#### E9 — Canal image : remise de copies scannées et lecture fidèle
**Objectif.** Étendre le cycle aux copies manuscrites scannées : remise d'images, transcription fidèle, affichage au professeur, rejeu des critères d'image des fonctionnalités déjà livrées. **Fonctionnalités.** SUB-03, TRX-01. **Dépend de.** E4 à E8
- **Ouverture (E9.0) [D, 2026-10-19].** Essai exploratoire de lecture manuscrite repris d'E5.8 : hors produit, avec `claude-haiku-5-5`, sur des copies fictives, consigné tel quel (D10) pour informer le contrat de transcription ; script d'exploration gardé, à réécrire. [P] Lecture par un appel séparé, derrière une interface `Reader` distincte de l'évaluation, puis évaluation du texte stocké ; à confirmer ou non par cet essai.
- **Conception.** Pages ordonnées avec aperçu ; formats, poids, pages : à définir ; type vérifié sur le contenu ; fichier refusé = ni remise ni stockage ; métadonnées retirées ; nouvel essai sans doublon. Images sans lien public ni permanent, accès contrôlé à chaque lecture (professeur correcteur et élève auteur). Transcription fidèle : fautes conservées, « [illisible] » jamais deviné, pages ordonnées, contenu transcrit jamais exécuté, version du moteur enregistrée. Le moteur de lecture doit être remplaçable sans modifier les règles métier (choix : étape 7). Branchement au traitement : états « transcription en cours » et « échouée » (PRC-02), image sans écriture -> « non évaluable » (EVL-04). Écran de copie : transcription en premier (« transcrit automatiquement »), image à la demande ; pas de correction de la transcription (Q4) ; relance de la transcription seulement après un échec ; limite assumée : l'image visible peut réintroduire l'influence de l'écriture. Critères rejoués pour l'image : SUB-04, SUB-05, PRC-01, PRC-02, EVL-02, EVL-04, REV-01 (mode et états image), REV-02, REV-06 (après échec de transcription).
- **Implémentation.** Dépôt de plusieurs fichiers, ordre, aperçu, reprise ; validation du type ; retrait des métadonnées ; moteur de lecture, assemblage des pages, marqueurs d'illisibilité ; raccordement au traitement et aux états d'échec ; affichage dans l'écran de copie ; matrice étendue aux images.
- **Tests.** Unitaires : ordre des pages, marqueurs, extension incohérente. Intégration : critères de SUB-03 et de TRX-01 (contrat) ; tous les critères rejoués ; lot mixte texte et image dont une lecture en échec ; aucune métadonnée dans les requêtes sortantes. Sécurité : fichier corrompu, accès direct à l'image d'autrui, absence de lien public, consigne cachée dans l'image. E2E : trois pages scannées, transcription, proposition, comparaison image/transcription, « valider et publier », consultation.
- **Critères de sortie.** Critères de SUB-03 et du contrat de TRX-01 passés ; liste des critères rejoués passée en entier ; cycle image démontré sans intervention technique, lot mixte compris ; matrice 5.4 vérifiée pour les images ; Q4 tranchée ou recommandation provisoire ; essai de fidélité consigné tel quel, non bloquant (D10).
- **Risques.** La lecture est le point technique le plus incertain : une erreur devient une erreur de note, surtout sur Mechanics ; un moteur qui corrige les fautes fausse Mechanics et se détecte difficilement sans copies de référence ; photos floues ou coupées (alerte : V2) ; poids, coût et confidentialité d'images d'élèves (18 ans ; données fictives en démonstration) ; scan à la charge de l'élève.

#### E10 — Durcissement (partie A), puis mesure de la qualité (partie B)
**Objectif.** A : durcir et vérifier les permissions avant la démonstration et tout usage réel. B : mesurer la qualité (accord IA/experts, stabilité, fidélité de lecture, étanchéité, gain de temps, concordance IA/professeur). Les résultats mènent à des ajustements, jamais à un arrêt automatique. **Fonctionnalités.** aucune. **Dépend de.** E8, E9
- **Conception A.** Matrice 5.4 complète (chaque ressource x rôle x propriétaire ou non, requêtes directes, images, journal, états, messages d'erreur) ; balayage « rien avant publication » ; étanchéité IA sur tout le flux, texte et image ; pannes ; volumétrie contre les cibles de l'étape 5 ; sécurité des sessions et des liens ; accessibilité et appareils ; sauvegarde et reprise.
- **Conception B.** Protocole validé par le client avant de mesurer (corpus de copies simulées, experts, seuils : à définir). Les experts notent à l'aveugle de l'IA ; accord IA/experts comparé à l'accord entre experts, par critère et sur la note (O2). Stabilité sur exécutions répétées ; fidélité de transcription et écart de niveau avec une transcription de référence ; part des copies où l'élève écrit son nom (O3) ; taux de détection des alertes d'information (EVL-04) ; temps total du professeur contre le chronométrage papier de E1 et délai d'un lot (O1) ; concordance proposition d'origine / version finale lors de revues par des volontaires ; distribution des notes par étiquette de niveau, à titre informatif. En démonstration, le corpus est fait de copies fictives rédigées par des adultes consentants (manuscrites et collées) ; aucune copie réelle d'élève. Copies réelles seulement avant un usage réel, si les conditions des prestataires sont vérifiées.
- **Implémentation.** Corrections issues de A ; scripts d'extraction des mesures depuis le journal (pas de tableau de bord, V2) ; corpus, notes d'experts, outils de comparaison, rejeux ; ajustements retenus par le client (consigne de l'IA, alertes, paramètres du moteur de lecture, textes), chacun suivi de tests de non-régression. Aucune fonctionnalité nouvelle.
- **Tests.** E2E complets (texte, image, lot mixte, échecs, évaluation manuelle, retrait) ; matrice complète automatisée, énumération et accès directs, jeu adverse élargi ; charge et pannes ; mesures de qualité selon le protocole ; recette O4.
- **Critères de sortie.** **A (bloquant pour E11)** : matrice passée pour chaque ressource et chaque rôle, sans exception ouverte non acceptée par le client ; balayage et étanchéité verts ; correctifs de sécurité livrés ; Q9 tranchée ou son statut explicite. **B (non bloquant)** : protocole validé avant la mesure ; rapport produit tel quel pour chaque indicateur, ou report consigné avec sa raison ; liste d'ajustements priorisée avec une décision du client par ligne (corriger, reporter, accepter la limite) ; aucune fonctionnalité retirée, aucun arrêt par seuil.
- **Risques.** Seuils, corpus et nombre d'experts non définis avant la mesure (seuils fixés après coup) ; corpus trop petit ; désaccord entre experts ; experts influencés par la proposition ; copies simulées par des adultes qui ne représentent pas de vraies écritures d'élèves, donc des mesures non transposables ; gain de temps non transposable ; coût de l'option B : un résultat défavorable arrive après la construction.

#### E11 — Démonstration avec acteurs de simulation
**Objectif.** Démontrer le cycle complet devant le client : des acteurs jouant un administrateur, un professeur et plusieurs élèves le réalisent sans intervention technique, avec repli manuel et mesures sur copies simulées. Remplace le pilote avec de vrais élèves (2026-10-12) ; un usage réel reste soumis aux exigences marquées « avant tout usage réel » (étape 5, 2.8). **Fonctionnalités.** aucune. **Dépend de.** E10 (partie A)
- **Conception.** Acteurs de simulation (effectif à définir) qui saisissent des données fictives : noms fictifs, textes inventés, seul l'email est réel pour recevoir les liens [P]. Anglais et français selon l'état de la rubrique française, texte et images. Scénarios joués : remise de texte et d'image, lot, échec de l'IA suivi du repli manuel (REV-06), retrait d'une publication, élève qui ne voit rien avant publication. Cadre : notice « démonstration, données fictives » (NFR-DON-04), consigne « pas de nom » aux élèves, consigne de relire au professeur. Mesures sur copies simulées : temps de revue du professeur, délai de traitement, concordance IA/professeur, part de copies en échec ou non évaluables, incidents ; effectif réduit, pas de conclusion statistique.
- **Implémentation.** Déploiement gratuit de la démonstration ; comptes professeur créés par l'administrateur, classes, liens ou codes ; jeu de données fictif et scénarios scriptés ; préchauffage de la base avant la séance ; corrections courantes avec non-régression ; aucune fonctionnalité nouvelle.
- **Tests.** Recette par le client sur les scénarios joués ; suivi des incidents ; vérification par échantillon avec un compte élève de test qu'aucun résultat n'est visible avant publication ; contrôle par requête que chaque évaluation publiée issue d'une proposition la conserve avec son journal, et que chaque évaluation manuelle est journalisée « sans proposition IA » ; mesures répétées.
- **Critères de sortie.** Des acteurs jouant un professeur et une classe réalisent le cycle sans intervention technique (O4) ; aucun résultat visible avant publication ni après retrait ; rapport de démonstration (incidents, O1 à O3 sur copies simulées rapportés tels quels, limites de transposition, ajustements) sur lequel le client décide de la suite, sans règle d'arrêt automatique.
- **Risques.** Acteurs qui saisissent leur vraie identité ou de vraies données ; IA arrêtée pendant la séance (repli manuel prêt) : crédit API du développeur épuisé, ou abonnement Max inactif (plus de crédit mensuel), limite de dépense de l'espace de travail atteinte [P], refus du modèle, surcharge d'Anthropic (529) ; démonstration en direct ; démarrage à froid de la base Neon après 5 minutes d'inactivité ; copies simulées non représentatives de vraies écritures d'élèves : les mesures illustrent, elles ne prouvent pas.

### 8.3 Critères différés et étape de rejeu

| Critère différé | Livré avec | Rejoué en |
|---|---|---|
| CLS-04 CA2 : l'élève retiré ne reçoit pas le nouveau devoir | E2 | E3 |
| CLS-04 CA3 : remises de l'élève retiré visibles de son correcteur ; SUB-01 CA3 (lecture seule pour lui) | E2, E3 | E4 (remise conservée), E7 (liste, REV-01 CA4), E8 (résultat publié) |
| ASG-02 CA2 : un clic sur un devoir ouvre la liste des remises | E3 | E7 |
| ASG-03 CA2 : verrouillage et suppression refusée après la première remise | E3 | E4 |
| SUB-01 CA2 : états « Remis, en cours de correction » (échec, non évaluable, à valider) et « Corrigé » | E3 | E6, E8 |
| SUB-04 CA3 : indicateur « en retard » visible du professeur | E4 | E7 |
| SUB-05 CA2 : un remplacement relance le traitement ; résultat d'une version non active non courant | E4 | E6 |
| SUB-05 CA3 : remplacement refusé après modification, puis après validation | E4 | E7, E8 |
| EVL-04 CA3 : alertes absentes de toute vue élève | E5 | E8 |
| PRC-02 : relance depuis la liste du professeur | E6 | E7 |
| REV-03 R5 : évaluation validée ou publiée modifiée repasse à « À valider » (testée avec REV-05 CA2) | E7 | E8 |
| REV-04 CA2 (ouverture puis validation au journal) et CA3 (journal inaccessible à l'élève après publication) | E7 | E8 |
| Branches image : SUB-04, SUB-05, PRC-01, PRC-02, EVL-02 CA3, EVL-04 CA1 (image sans écriture), REV-01 (mode et états image), REV-02 (transcription et image), REV-06 (après échec de transcription) | E4 à E8 | E9 |
| AUTH-04 : refus propres à chaque ressource | étape qui crée la ressource | E10 (matrice complète) |

### 8.4 Récapitulatif fonctionnalité -> étape

| Fonctionnalité | Étape | Fonctionnalité | Étape |
|---|---|---|---|
| AUTH-01 Inscription de l'élève | E1 | REV-01 Liste des remises | E7 |
| AUTH-02 Connexion et session | E1 | REV-02 Copie par clic sur le nom | E7 |
| AUTH-03 Comptes professeur | E1 | REV-03 Modification libre | E7 |
| AUTH-04 Cloisonnement des accès | E1 (étendu à chaque étape, vérifié en E10) | REV-04 Conservation et journal | E7 |
| AUTH-05 Récupération d'accès | E1 | REV-05 Validation | E8 |
| CLS-01 Créer ses classes | E2 | REV-06 Évaluation manuelle | E8 |
| CLS-02 Lien ou code | E2 | PUB-01 Publication | E8 |
| CLS-03 Rejoindre une classe | E2 | PUB-02 Consultation par l'élève | E8 |
| CLS-04 Élèves, retrait, réadmission | E2 | EVL-01 Rubrique et note | E5 |
| ASG-01 Créer un devoir | E3 | EVL-02 Liste blanche vers l'IA | E5 |
| ASG-02 Lister ses devoirs | E3 | EVL-03 Proposition par critère | E5 |
| ASG-03 Modifier, supprimer, verrouiller | E3 | EVL-04 Copies non évaluables ou atypiques | E5 |
| SUB-01 Espace de l'élève | E3 | PRC-01 Traitement automatique par lots | E6 |
| SUB-02 Texte collé | E4 | PRC-02 Échecs et relance | E6 |
| SUB-04 Retard | E4 | SUB-03 Images scannées | E9 |
| SUB-05 Remplacement | E4 | TRX-01 Transcription fidèle | E9 |

---

## 9. Questions ouvertes

### Q1 — Quel format de note (sur 20 ou sur 100) et quelle règle de conversion des niveaux ?
- **Pourquoi.** Point reporté de l'étape 2 ; fixe la règle d'EVL-01, les bornes de REV-03 et l'affichage de PUB-02.
- **Options.** Sur 20 : somme des 5 niveaux (0 à 20), sans demi-point ; sur 100 : 5 fois la somme ; autre barème à définir.
- **Recommandation.** Sur 20, somme des 5 niveaux : directe et lisible avec cinq critères à 20 % et des niveaux entiers de 0 à 4. **Échéance** : avant E5.
- **Décision** [D, 2026-10-15]. Note sur 20, somme des 5 niveaux (0 à 20, entière). Le pas de saisie d'une note libre par le professeur (D5) n'est pas tranché : il reste une valeur provisoire.

### Q2 — Qui est l'administrateur, comment est créé le premier compte, la désactivation d'un professeur est-elle dans le MVP ?
- **Pourquoi.** Acteur absent des 15 demandes mais requis par D1 : il décide qui accède aux copies et aux identités. Sans désactivation (V2), une adresse mal saisie ou un professeur parti garde son accès jusqu'à une intervention technique.
- **Options.** Une personne désignée par le client, compte créé à la mise en place ; un responsable par établissement (hors périmètre) ; plusieurs administrateurs ; désactivation dans le MVP ou non.
- **Recommandation.** Un administrateur désigné ; désactivation en V2, risque assumé ; rôle repris à l'étape 6. **Échéance** : avant E1.

### Q3 — Jusqu'à quand l'élève peut-il remplacer sa remise, avec quel plafond, et est-il averti d'une image illisible ?
- **Pourquoi.** Un remplacement relance les traitements et peut rendre caduc le travail du professeur. Avec trois états visibles, l'élève ne sait jamais que sa photo est illisible (alerte de qualité : V2) et n'a aucun déclencheur pour remplacer. Le retard suit la date de première remise (SUB-04).
- **Options.** Jusqu'à la première modification ou validation du professeur (SUB-05) ; jusqu'à la validation, avec avertissement du professeur ; jusqu'à la date limite ; plafond de remplacements (à définir). Image illisible : aucun avertissement (le professeur contacte l'élève hors application) ou un 4e état élève « À revoir ».
- **Recommandation.** Jusqu'à la première modification ou validation, versions conservées, plafond à définir ; pas d'avertissement dans le MVP, état « À revoir » en V2 avec l'alerte de qualité. Limite connue : l'élève ne peut plus corriger une photo une fois le professeur à l'œuvre. **Échéance** : avant E4.
- **Décision** [D, 2026-10-15]. Jusqu'à la première modification ou validation du professeur ; 2 remplacements au plus (3 versions) ; aucun avertissement d'image illisible dans le MVP.

### Q4 — Le professeur peut-il corriger la transcription d'une copie image, avec relance de l'évaluation ?
- **Pourquoi.** Sans correction, une erreur de lecture devient une erreur de note et le professeur ne peut qu'ajuster niveaux et note ; avec correction, il peut normaliser les fautes de l'élève, ce qui fausse Mechanics. La réponse change l'écran de copie, le journal et l'entité Transcription.
- **Options.** Non dans le MVP : le professeur lit transcription et image, modifie niveaux et note ; relance de la transcription seulement après un échec. Oui : version du professeur conservée à côté de celle du moteur, écart journalisé, évaluation relancée.
- **Recommandation.** Non dans le MVP ; à reconsidérer en V2 si E10 montre des erreurs de lecture fréquentes. **Échéance** : avant E7.

### Q5 — Que lit l'élève : langue des remarques, mention de l'IA, mention d'une note qui diffère des niveaux ?
- **Pourquoi.** Détermine le contrat de sortie de l'IA et PUB-02. Un jeune apprenant peut ne pas comprendre des remarques dans la langue apprise ; la mention de l'IA relève de la transparence et du cadre légal ; D5 permet une note différente des niveaux, que l'élève verra.
- **Options.** Remarques en langue du devoir, en français, ou au choix du professeur avant publication. Mention « évaluation assistée par IA et validée par votre professeur » affichée ou non. Note différente des niveaux : aucune mention, ou « note ajustée par le professeur » sans justification.
- **Recommandation.** Langue du devoir par défaut, modifiable avant publication ; mention de l'IA affichée (à confirmer avec le cadre légal, étape 5) ; mention « note ajustée » affichée sans justification. **Échéance** : avant E5 (contrat de sortie), confirmée avant E8.
- **Décision** [D, 2026-10-15]. La recommandation : remarques dans la langue du devoir, modifiables avant publication ; mention de l'IA affichée à l'élève (formulation à confirmer avec le cadre légal) ; mention « note ajustée par le professeur » affichée sans justification quand la note diffère de la note calculée.

### Q6 — Quand la version française de la rubrique sera-t-elle adaptée et validée, et que fait-on des devoirs en français d'ici là ?
- **Pourquoi.** F12 ouvre le français, mais l'IA n'a pas de standard approuvé pour cette langue tant que la version française n'est pas validée (Mechanics couvre accents et accords). C'est une donnée à fournir par le client, pas un jalon de mesure.
- **Options.** Devoirs en français créables, proposition IA désactivée jusqu'à la validation, évaluation manuelle dans l'intervalle (EVL-01, REV-06) ; livraison par langue (anglais d'abord) ; rubrique française provisoire (contredit la rubrique unique et fixe).
- **Recommandation.** La première option : tout est construit, l'IA est activée en français à la date de validation par le client (à définir). **Échéance** : avant E5.
- **Décision** [D, 2026-10-15]. Première option : devoirs en français créables ; aucune proposition IA tant que la rubrique française n'est pas validée par le client (date à définir) ; la copie passe en « IA indisponible » et s'évalue à la main (REV-06) ; à l'activation, la relance est proposée au professeur (PRC-02 R4).

### Q7 — Le lien et le code d'invitation d'une classe expirent-ils, et quand ?
- **Pourquoi.** Sans approbation (D2), toute personne qui obtient le lien ou le code peut rejoindre la classe et voir les devoirs ; les contrôles sont le renouvellement (CLS-02), le retrait et le refus de rattachement (CLS-03, CLS-04).
- **Options.** Pas d'expiration automatique, désactivation et renouvellement manuels ; expiration automatique après une durée à définir ; usage unique par élève.
- **Recommandation** (non retenue). Pas d'expiration automatique dans le MVP ; ajouter une expiration (durée à définir) si l'usage montre des rattachements indésirables. **Échéance** : avant E2.
- **Décision** [D, 2026-10-14]. Expiration automatique 1 heure après la création du lien ; désactivation et renouvellement manuels restent possibles (CLS-02 R4).

### Q8 — Que voit l'élève quand le professeur modifie une évaluation déjà publiée ?
- **Pourquoi.** D6 sépare validation et publication mais ne dit rien d'une correction après coup ; cela fixe les transitions de la machine à états et ce que l'élève peut avoir déjà vu.
- **Options.** Toute modification retire la publication, la copie redevient « À valider » et la republication est explicite (règle actuelle de REV-03) ; la version publiée reste affichée jusqu'à la republication, avec « mise à jour le [date] » ; modification interdite après publication sans retrait préalable.
- **Recommandation.** La première option : simple, sans incohérence visible. **Échéance** : avant E7.

### Q9 — Les élèves visés ont-ils chacun une adresse email personnelle, et quel est leur âge réel ?
- **Pourquoi.** F1 suppose que l'élève s'inscrit avec son propre email. S'il est trop jeune ou n'en a pas, AUTH-01 et CLS-03 sont à refaire et le consentement change des écrans d'inscription. Le cadre légal (pays, responsable du traitement, consentement, prestataires, conservation) est renvoyé à l'étape 5, mais cette sous-question conditionne E1.
- **Options.** Email personnel de l'élève (F1, MVP) ; email d'un parent ; comptes élève créés par le professeur (V2 aujourd'hui, à remonter au MVP).
- **Recommandation.** Confirmer avant E1 que les élèves visés ont un email personnel ; sinon remonter au MVP les comptes créés par le professeur. Aucune copie réelle n'est envoyée à un prestataire sans vérification de ses conditions. **Échéance** : avant E1. **Statut (2026-10-12)** : close pour la démonstration (acteurs adultes avec un email réel pour recevoir les liens) ; reste ouverte pour un usage réel.

### Q10 — Que faire d'un nom écrit par l'élève dans sa copie, que l'IA recevrait ?
- **Pourquoi.** Sur une copie manuscrite le nom figure souvent en tête ; il est transcrit puis transmis à l'IA, ce qui affaiblit le principe validé « l'identité n'est pas transmise ». La consigne ne suffira pas toujours ; l'absence d'identité ne rend de toute façon pas l'IA neutre.
- **Options.** Consigne seule, affichée avant l'envoi (SUB-02, SUB-03) ; consigne et alerte au professeur en revue quand un nom semble présent ; masquage automatique dans le MVP.
- **Recommandation.** Consigne seule dans le MVP, taux de présence mesuré en E10 (O3), masquage automatique en V2 si le taux est significatif. **Échéance** : avant E4.
- **Décision** [D, 2026-10-15]. Consigne seule dans le MVP, affichée avant l'envoi (SUB-02, SUB-03).
