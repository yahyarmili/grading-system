# Annexe : analyse détaillée (brouillon de travail)

> **Ce fichier n'est pas le document de référence.** Il garde l'analyse détaillée produite avant la validation des décisions de l'étape 4 (73 fonctionnalités, 17 étapes, 22 questions). Plusieurs de ses propositions ont été écartées par vos décisions : jalons de mesure bloquants, approbation des demandes de rattachement, note non modifiable librement, niveau transmis à l'IA. Le document de référence est [fonctionnalites.md](fonctionnalites.md). Ce fichier sert de réserve pour l'étape 5 (besoins non fonctionnels : confidentialité, qualité, mesure).

# Objectif, périmètre et fonctionnalités (version détaillée, dépassée)

> Étapes 3 et 4 de la démarche d'ingénierie. Statut : **brouillon à valider ensemble**.
> Fait suite à [problematique.md](problematique.md) et [solution.md](solution.md), tous deux validés. Ce document ne les modifie pas.

## Comment lire ce document

Chaque affirmation porte l'une de ces trois marques.

| Marque | Sens |
|---|---|
| **[D]** décision utilisateur | Vient de vos 15 fonctionnalités (F1 à F15) ou des décisions déjà validées (problématique, solution). Non remise en cause ici. |
| **[P]** proposition | Ajoutée par l'analyse. Elle n'a de valeur qu'une fois validée par vous. |
| **[Q#]** question ouverte | Exige une réponse de votre part (section 9). La valeur par défaut indiquée est une recommandation, pas une décision. |

Les valeurs chiffrées (seuils, durées, effectifs) sont des **valeurs de travail** à valider avec le client, pas des références publiées. Les technologies ne sont pas choisies ici (étape 7) et aucun prompt d'implémentation n'est écrit (étape 8).

**En bref.** Vos 15 demandes deviennent 73 fonctionnalités atomiques réparties en 12 modules (61 pour le MVP, 8 reportées en V2, 4 à décider), livrées en 17 étapes (E0 à E16). Le chemin critique n'est pas le développement mais la mesure de la qualité de l'IA et de la lecture de l'écriture (jalons G1 et G2) : elle exige de vraies copies d'élèves, des experts et des seuils fixés d'avance. Le canal texte est livré avant le canal image. Quatre lacunes sont bloquantes et demandent votre décision (section 4) : le compte professeur et le rattachement élève-classe, le lien entre une remise et un devoir, la note modifiable indépendamment des niveaux, et le cadre légal des données d'élèves.

---

## 1. Objectifs

Tous les objectifs sont des **propositions** [P]. Les seuils sont des valeurs de travail à valider (Q13b) et à figer **avant** la mesure. Un résultat dont l'intervalle de confiance chevauche le seuil est consigné « non concluant », jamais « réussi ».

**O1 — Réduire le temps de correction par copie (P1).** [P] Le professeur valide une proposition au lieu de corriger de zéro, y compris pour un lot d'une centaine de copies.
- Mesure : temps médian de revue par copie (ouverture jusqu'à la validation), enregistré par l'application, comparé à un temps de correction papier chronométré sur 30 copies par professeur pilote **avant** le pilote. Valeur de travail : au moins -50 % en médiane, avec intervalle de confiance. On rapporte aussi le temps total du professeur par lot (revues, échecs, repli manuel, corrections de transcription), en moyenne et au 90e centile.
- Lot : pour 100 remises, au moins 95 % à l'état « à valider » dans les 30 minutes suivant le dernier dépôt (valeur de travail), avec le fournisseur d'IA réel. Une copie en échec ne compte pas comme prête.

**O2 — Obtenir une proposition IA proche de celle des experts et stable (P2).** [P] La fiabilité de l'IA n'est pas acquise : elle se mesure, elle ne se suppose pas.
- Mesure, **par langue** : jeu scellé d'au moins 100 vraies copies d'élèves, noté indépendamment par au moins 2 experts (3 recommandés). Kappa pondéré quadratique et accord à plus ou moins 1 niveau, par critère et sur la note, avec intervalle de confiance, comparés à l'accord expert/expert. Stabilité : part des couples (copie, critère) au niveau identique sur 5 exécutions, valeur de travail 90 % ou plus. On rapporte aussi l'erreur signée par niveau scolaire du devoir, par tranche de longueur et par classe de lisibilité, pour déceler un biais de sous-groupe que l'accord global masquerait.

**O3 — Limiter l'influence de l'écriture et de l'identité sur la proposition initiale (P3).** [P]
- (a) Fidélité de transcription : au moins 30 copies manuscrites d'élèves avec transcription de référence double. Taux d'erreur de caractères, taux de préservation des fautes, écart de niveau par critère entre l'évaluation sur transcription automatique et sur transcription de référence, par classe de lisibilité. Valeur de travail : écart moyen signé en valeur absolue inférieur ou égal à 0,25 niveau **et** écart absolu moyen borné (valeur à définir), sans biais systématique sur Mechanics.
- (b) Identité : 0 donnée d'identité du compte dans 100 % des requêtes sortantes vers l'IA (test à valeurs canaris). Le nom écrit par l'élève dans sa production est mesuré en deux temps : taux de présence avant retrait sur le corpus de mesure, puis taux de fuite avec la consigne « pas de nom » (PRV-02) au pilote, sur les textes collés comme sur les transcriptions.

**O4 — Mesurer, sans le juger, la concordance entre la proposition de l'IA et la version finale du professeur.** [P] Cet objectif répond à la demande de solution.md de mesurer la tendance du professeur à suivre l'IA.
- Mesure : taux de copies validées sans modification, écart moyen absolu et signé IA/final par critère, temps par copie. Rapportés sans seuil, de façon agrégée et non nominative tant que Q14 n'est pas tranchée.
- Limite : la concordance ne distingue pas un professeur ancré d'un professeur qui est d'accord parce que l'IA a raison. L'ancrage lui-même ne se mesure qu'avec un échantillon de contrôle corrigé à l'aveugle (Q14).

**O5 — Démontrer le parcours complet de bout en bout en conditions réelles.** [P] Devoir, remise, extraction, proposition IA, revue, validation, publication, consultation par l'élève.
- Mesure : au moins 1 professeur et 1 classe de 20 élèves ou plus font le cycle sans intervention technique (une intervention technique est toute action d'un développeur sur une copie ou un compte, consignée au journal d'incidents). Au moins 95 % des remises atteignent « à valider » sans relance manuelle. 100 % des évaluations publiées conservent la proposition IA d'origine et l'historique des modifications.

**O6 — Garantir l'étanchéité des données.** [P] Un élève ne voit que ses résultats publiés, un professeur que ses classes, aucun résultat n'est exposé avant publication.
- Mesure : matrice de permissions (acteur x ressource x action, section 5.5) entièrement verte en intégration, y compris sur l'API, les adresses de fichiers et les caches. Zéro exposition de résultat avant publication dans les corps de réponse réseau. Test d'intrusion léger manuel avant ouverture à de vrais élèves, sans constat grave ouvert (constat grave : exposition de donnée à un tiers non autorisé, perte ou mauvaise attribution d'une copie, résultat visible avant publication).

---

## 2. Périmètre

### 2.1 Dans le périmètre (MVP)

- **[D]** Inscription de l'élève par email et connexion (F1, F2). **[P]** Complétées par la vérification de l'email, la réinitialisation du mot de passe et un compte professeur créé de façon contrôlée.
- **[D]** Classes d'un professeur, avec plusieurs élèves par classe (F14). **[P]** Rattachement par code d'invitation et approbation par le professeur (mécanisme à confirmer, Q2).
- **[D]** Création d'un devoir (sujet, niveau, langue français ou anglais, délai, instructions facultatives) et envoi aux classes choisies à la création (F12, F15). **[P]** Liste des devoirs du professeur, modification et suppression avant la première remise.
- **[D]** Espace personnel de l'élève et remise par texte collé ou par image(s) scannée(s) (F3, F4, F5). **[P]** Toute remise est rattachée à un devoir (Q3).
- **[D]** Extraction du texte des images, transcription fidèle sans correction, texte accessible au professeur (F7).
- **[D]** Évaluation par un LLM selon la rubrique unique et fixe : niveaux par critère et remarques (F8, F9). **[P]** Note calculée par une formule fixe (Q5a). **[D]** Identité jamais transmise à l'IA.
- **[D]** Revue par le professeur : liste triable, ouverture de la copie par clic sur le nom, consultation, modification, validation (F10, F13).
- **[D]** Autorisation de visibilité par le professeur, puis consultation de la note et du résultat par l'élève (F11, F6).
- **[P]** Traitement de plusieurs copies à la fois avec états visibles, gestion des échecs, évaluation manuelle de repli et copies non évaluables.
- **[P]** Conservation de la proposition IA d'origine et journal des modifications du professeur.
- **[P]** Cloisonnement strict des accès, notice d'information, consigne de ne pas écrire de nom dans sa production, politique de conservation des données.
- **[P]** Jalons de mesure avant usage réel : accord IA/experts, stabilité, fidélité de transcription, gain de temps.

### 2.2 Reporté (V2 et plus)

Tout ce qui suit est **[P]**.

- Dépôt de lots de scans par le professeur au nom des élèves (V2 si les copies sont collectées en classe, Q9).
- Validation en lot encadrée et publication en lot par devoir ou classe (Q14).
- Indicateurs de concordance IA/professeur dans l'application.
- Notifications par email (devoir reçu, résultat publié).
- Alerte de qualité d'image à l'envoi (flou, sombre, coupé).
- Gestion avancée du devoir : ajouter une classe a posteriori, prolonger, clore, archiver, dupliquer.
- Archivage de classe en fin d'année, suspension de compte professeur, inscription libre des professeurs avec validation, changement d'adresse email.
- Page « mes données » et demandes d'accès, de rectification ou de suppression par l'élève.
- Import CSV de classes, création de comptes élèves par le professeur pour les élèves sans email, classes à plusieurs professeurs.
- Import de texte par fichier (.docx, .txt), brouillon enregistré du texte.
- Tableaux de bord de classe et export des notes (CSV).
- Masquage automatique d'un nom écrit dans la copie, si le taux de fuite mesuré est significatif (seuil de déclenchement à définir).
- Mode de relecture à l'aveugle de la proposition IA, après mesure de l'ancrage.

### 2.3 Hors périmètre

| Exclusion | Statut | Pourquoi |
|---|---|---|
| Masquer l'identité de l'élève au professeur | **[D]** | Décision validée (solution.md, principe 6). Le halo reste un risque, voir section 7. |
| Double correction ou second correcteur | **[D]** | Décision validée : un seul correcteur par copie, la cohérence vient du standard commun. |
| Rubrique modifiable ou personnalisée par professeur, niveau ou langue | **[D]** | Décision validée : rubrique unique et fixe. |
| Évaluer l'écriture ou la présentation comme critère | **[D]** | Problématique, section 5 : ce sont des facteurs parasites. |
| Autres matières, exercices à réponse unique, langue arabe, autres langues que l'anglais et le français | **[D]** | Problématique, section 6. |
| Publication automatique d'un résultat sans validation ni autorisation du professeur | **[P]** | Contredit F6 et F11. |
| Détection de plagiat ou de texte généré par une IA | **[P]** | Peu fiable, risque de fausses accusations. La limite est assumée et écrite : l'application ne sait pas qui a écrit un texte collé (SUB-02, Q10). |
| Contestation de note par l'élève, messagerie professeur-élève, comptes parents | **[P]** | Non demandés ; à reconsidérer seulement si Q12b l'impose. |
| Intégration LMS ou logiciel de vie scolaire, application mobile native, paiement, multi-établissements | **[P]** | Hors du problème posé ; coût sans lien avec P1 à P3. |
| Niveau scolaire du devoir comme paramètre de sévérité de l'IA | **[P]** | La rubrique est absolue : transmettre le niveau changerait le sens d'un « 4 » et contredit la décision validée (Q4). |

### 2.4 Ordre de livraison (proposition, Q17)

- **[P]** Canal texte d'abord, canal image ensuite : une copie collée n'a besoin d'aucune transcription. Le cycle complet texte (E10) est livrable sans attendre le corpus de copies manuscrites.
- **[P]** Les canaux image et français sont ouverts seulement après leurs jalons : G2 pour l'image, validation de la rubrique française pour le français.
- **[P]** Les demandes F4 et F7 (image) et F8 (évaluation par IA) sont des demandes de l'utilisateur, mais leur livraison dépend des jalons G2 et G1. Si les mesures sont insuffisantes, le plan prévoit « ajuster » ou « arrêter » : l'utilisateur doit accepter cette conditionnalité (Q17).

---

## 3. Analyse de vos 15 fonctionnalités

Les fautes de frappe sont lues ainsi : « oar » = « par » ; « sans image scanné » = « une image scannée » ; « class » = classe ; « assignment » = devoir.

| F# | Ce que vous avez demandé (reformulé) | Verdict | Problème relevé | Devient |
|---|---|---|---|---|
| F1 | Un élève s'inscrit avec son adresse email. | Fidèle, complétée | Aucun compte professeur n'est prévu (bloquant). Nom et prénom ne sont pas collectés alors que F13 les exige. Pas de vérification d'email ni de réinitialisation du mot de passe. Élèves sans email non traités. | AUTH-01, AUTH-02, AUTH-04, AUTH-05, PRV-01 |
| F2 | L'utilisateur se connecte avec son compte. | Fidèle, précisée (aussi pour les professeurs) | Le rôle de la personne connectée n'est pas dit. Ni déconnexion, ni expiration de session, ni limitation d'essais. | AUTH-03, AUTH-05, AUTH-06 |
| F3 | Chaque élève a son espace de remise, dont le travail va vers son professeur. | Décomposée | « Son professeur » au singulier, alors qu'un élève peut en avoir deux (anglais, français). Le rattachement élève-classe-professeur n'est défini nulle part (bloquant). Une remise doit être liée à un devoir pour que Task Achievement soit évaluable. | SUB-01, SUB-05, CLS-02, CLS-03, CLS-06, AUTH-06 |
| F4 | L'élève dépose une image scannée de sa production manuscrite pour la remettre. | Fidèle, précisée | Le scan est à la charge de l'élève : la pile de copies papier du professeur n'est couverte que si les élèves numérisent (Q9). Multi-pages, formats, poids et qualité non définis. Un nom écrit sur la copie peut fuiter. | SUB-03, SUB-04, SUB-06, SUB-07, PRV-02, PRV-05 |
| F5 | L'élève colle sa production sous forme de texte pour la remettre. | Fidèle | Forme exacte (saisie, import, longueur) non précisée. Un texte collé ne prouve pas que l'élève l'a écrit ; l'autocorrection change la nature du critère Mechanics. | SUB-02, SUB-04, PRV-02 |
| F6 | L'élève consulte sa note et le résultat de l'évaluation une fois que le professeur a validé et autorisé la visibilité. | Fidèle ; la règle d'étanchéité devient une fonctionnalité testable à part | Contenu du « résultat » non défini (note seule, niveaux, remarques, copie). Transparence sur l'IA non tranchée. Retrait ou modification après publication non traités. « Validé » et « autorisé » : un ou deux actes (Q6) ? | PUB-02, PUB-03, PUB-04, REV-07, SUB-05 |
| F7 | Si une image est remise, son texte est extrait pour être accessible au professeur. | Fidèle ; étendue à la fidélité de transcription (décision validée) et à la correction par le professeur (proposition) | Le texte extrait est aussi l'entrée de l'IA : une erreur de lecture devient une erreur de note, l'écriture influence encore la note (P3 déplacé). Aucune règle d'échec. Aucune mesure de fidélité sur écritures d'élèves. | TRX-01, TRX-02, TRX-03, TRX-04, PRC-01, PRC-04, QLT-03 |
| F8 | Chaque remise est évaluée par un LLM selon la rubrique. | Décomposée en fonctionnalités atomiques ; sens conservé | Fiabilité non démontrée (stabilité, injection par le texte de l'élève, cas limites). Identité atteignable par le contenu de la copie. Rubrique française non validée. Aucune règle d'échec, aucun seuil de qualité. | EVL-01, EVL-02, EVL-05 à EVL-10, PRC-01, PRC-02, PRC-04, PRV-02, PRV-05, QLT-01, QLT-02 |
| F9 | Après l'évaluation, une note est donnée avec des remarques. | Fidèle ; scindée en remarques et calcul de la note | Format de la note non fixé ; elle doit découler des 5 niveaux sinon elle peut contredire la rubrique (Q5a). Deux publics pour les remarques (professeur, élève). Langue des remarques non précisée (Q7). | EVL-03, EVL-04, REV-09 |
| F10 | Le professeur consulte chaque résultat, le supervise, et modifie la note et l'évaluation. | Décomposée : consultation, modification, validation, historique. La « modification de la note » séparée des niveaux reste en question ouverte pour ne pas changer le sens | F10 est composite. Modifier la note indépendamment des niveaux contredit la rubrique fixe (Q5b). Le suivi aveugle de l'IA et la réintroduction de biais en modifiant ne sont pas traités. | REV-05, REV-06, REV-07, REV-08, REV-09, REV-10, REV-11, REV-12, PRC-05, TRX-04, AUTH-06 |
| F11 | Le professeur autorise la visibilité de la note dans l'espace de l'élève. | Fidèle ; publication distincte de la validation (proposition, Q6) | Granularité (copie, devoir, classe), retrait, modification après publication et notification non précisés. Recoupe F6 vu de l'autre côté. | PUB-01, PUB-04, PUB-05, NTF-01 |
| F12 | Le professeur ajoute un devoir : sujet, niveau des élèves, langue (français ou anglais), délai, instructions facultatives. | Fidèle | « Niveau » indéfini et en tension avec la rubrique unique et avec F15 (Q4). « Délai » ambigu (Q8a). Pas de titre court. Cycle de vie du devoir non défini : ni liste, ni modification, ni suppression. Les instructions pourraient contourner la rubrique. L'évaluation en français dépend de la rubrique française validée. | ASG-01, ASG-03, ASG-04, ASG-05, ASG-06, ASG-07, EVL-07, EVL-09 |
| F13 | Le professeur consulte les soumissions de chaque élève en cliquant sur son nom, dans la partie « soumissions », triées par note, date ou ordre alphabétique. | Décomposée en liste, tris, filtres, ouverture de la copie | Lecture A retenue : la copie de l'élève pour ce devoir. Lecture B (dossier historique de l'élève) réintroduirait le halo (Q16). Le tri par note ne dit pas laquelle (IA ou validée). La liste ne montrerait que ceux qui ont rendu. Aucun point d'entrée vers un devoir. | REV-01, REV-02, REV-03, REV-04, PRC-03, ASG-06, AUTH-06 |
| F14 | Un professeur a plusieurs classes, chacune avec plusieurs élèves, et leur envoie un devoir. | Décomposée : gestion des classes (ici) et envoi (avec F15) | Recoupe F15 (même action d'envoi). Mécanisme d'entrée dans une classe absent (bloquant). Une classe a un seul professeur en v1 (Q2). | CLS-01 à CLS-06, ASG-02 |
| F15 | À la création d'un devoir, le professeur sélectionne les classes destinataires. | Fidèle ; fusionnée en pratique avec l'envoi de F14 | Un même devoir pour des classes de niveaux différents contredit un niveau unique (Q4). Ajout de classe après coup non prévu (V2). Délai commun ou par classe (Q8a). | ASG-02, ASG-05 |

---

## 4. Principaux constats

| # | Constat | Gravité | Décision requise |
|---|---|---|---|
| C1 | **Aucun compte professeur ni mécanisme de rattachement élève, classe, professeur.** F1 ne vise que l'élève ; F3 dit « son professeur » ; F14 décrit des classes sans dire comment un élève y entre. Sans cela, « un seul correcteur : le professeur lié à l'élève » n'a aucun support, et une inscription libre laisserait n'importe qui se déclarer professeur et lire des copies. Proposé : compte professeur créé de façon contrôlée (AUTH-05), code d'invitation (CLS-02, CLS-03) avec approbation (CLS-06), correcteur égal au créateur du devoir. Un acteur administrateur apparaît (étape 6). | Bloquant | **Oui** (Q1, Q2) |
| C2 | **Une remise doit être rattachée à un devoir.** Task Achievement (20 % de la note) ne s'évalue pas sans sujet ni instructions. F3 décrit un espace de remise sans parler du devoir. Proposé : pas de dépôt libre, une seule remise active par couple (élève, devoir). | Bloquant | **Oui**, confirmation (Q3) |
| C3 | **Modifier « la note » indépendamment des niveaux contredit la rubrique fixe.** Avec 5 critères à 20 % et des niveaux de 0 à 4, la note sur 20 est la somme des niveaux. Une note saisie librement peut contredire les niveaux montrés à l'élève et ruine le standard commun (P2). Le sens de F10 n'est pas changé : le professeur modifie niveaux et remarques (REV-06) ; l'ajustement direct de la note (REV-10) reste à décider. | Bloquant | **Oui** (Q5a, Q5b) |
| C4 | **Données d'élèves, probablement mineurs, traitées par des services d'IA tiers ; cadre légal inconnu.** Pays, âge réel, responsable de traitement, consentement, durées de conservation, élèves sans email, conditions des prestataires (pas d'entraînement sur les contenus) ne sont pas connus. Aucune conclusion juridique n'est tirée ici. Cela ne bloque pas la conception, mais aucune vraie copie ne doit partir chez un prestataire avant ces réponses. | Bloquant avant production avec de vrais élèves | **Oui** (Q12a, Q12b, Q12c) |
| C5 | **Parcours de bout en bout incomplet dans les 15 demandes.** Absents : l'approbation des demandes de rattachement (CLS-06), la liste des devoirs du professeur, point d'entrée de F13 (ASG-06), la modification et la suppression d'un devoir avant remise (ASG-07), un état « non évaluable » pour les copies vides, illisibles ou en français sans rubrique validée, et l'état « à redéposer » visible de l'élève. Sans eux, F3 à F15 ne se déroulent pas. | Important | Non (ajouts proposés) ; CLS-06 suit la réponse à Q2 |
| C6 | **Le « niveau » du devoir (F12) est indéfini et en tension avec la rubrique unique et F15.** Transmis à l'IA, il ferait varier le niveau obtenu par une même copie, contre la décision validée. Un devoir envoyé à plusieurs classes de niveaux différents n'a pas un niveau unique. Retenu : étiquette du devoir, non transmise à l'IA. | Important | **Oui** (Q4) |
| C7 | **« Valider » et « autoriser » : un ou deux actes, et règles de publication non définies.** F6 exige « validé et autorisé », F10 ne nomme pas la validation, F11 parle d'autoriser. Non précisés : granularité, retrait, modification après publication, contenu visible, mention de l'IA. Proposé : deux états (validée, publiée) avec raccourci « valider et publier », l'élève ne voyant jamais la proposition IA brute. | Important | **Oui** (Q6, Q7) |
| C8 | **Les copies papier de la problématique ne sont couvertes que si l'élève numérise lui-même.** Seul l'élève dépose (F4, F5), alors que la problématique part d'un professeur devant une pile de copies manuscrites. Si les copies sont collectées en classe, le gain de temps peut être annulé. Population réelle (âge, équipement) inconnue. | Important | **Oui** (Q9) |
| C9 | **La transcription est l'entrée de l'IA : P3 est déplacé, non supprimé.** Une transcription qui corrige les fautes gonfle Mechanics ; une mauvaise lecture d'une écriture difficile l'abaisse à tort. Le professeur peut lui-même normaliser en corrigeant la transcription. Proposé : transcription fidèle, convention affichée, écarts journalisés, mesure sur écritures d'élèves avant d'ouvrir le canal image. | Important | **Oui** (Q15, Q17) |
| C10 | **Ne pas transmettre l'identité ne rend pas l'IA « neutre ».** Un nom est souvent écrit dans la copie et peut atteindre l'IA ; d'autres biais du modèle subsistent (longueur, registre, tournures d'apprenant). Proposé : consigne « pas de nom » dès le texte collé (PRV-02), métadonnées d'image supprimées (PRV-05), test à valeurs canaris (EVL-05), taux de fuite mesuré, erreur signée par sous-groupe (QLT-01). Limite assumée : 100 % n'est pas garanti. | Important | Non (limite assumée) |
| C11 | **La fiabilité de l'IA n'est pas prouvée et dépend de ressources externes.** Accord IA/experts, stabilité et fidélité exigent de vraies copies, des experts, des seuils fixés d'avance et la rubrique française validée. Sans cela, l'évaluation peut être livrée sans savoir si elle est utile. À lancer avant l'implémentation : c'est le chemin critique. | Important | **Oui** (Q11, Q12a, Q13a, Q13b) |
| C12 | **Le professeur peut suivre l'IA sans la remettre en cause et réintroduire des biais en modifiant.** L'ancrage et le halo subsistent. La validation en lot sert P1 mais favorise le « clic-valide ». La proposition d'origine doit être conservée dès le premier jour (REV-08), sinon aucune mesure n'est possible. Les indicateurs peuvent être lus comme une surveillance des professeurs. | Important | **Oui** (Q14) |
| C13 | **F13 peut se lire comme un dossier historique de l'élève.** Cela mettrait sous les yeux du correcteur ses performances antérieures : l'effet de halo, source de P3. Lecture retenue : la copie de l'élève pour ce devoir, sans note ni moyenne antérieure à l'écran. | Important | **Oui** (Q16) |
| C14 | **Délai, retard, remplacement de remise et cycle de vie du devoir non définis.** « Délai » peut être une date limite ou une durée ; rien sur le dépôt tardif, le remplacement d'une remise (relance de l'extraction et de l'évaluation, protection du travail du professeur), la modification d'un devoir après des remises. | Important | **Oui** (Q8a, Q8b) |
| C15 | **Le canal texte doit pouvoir être livré sans attendre le corpus de copies manuscrites.** Les remises texte ne requièrent aucune transcription. Un plan qui lie le cycle texte au jalon G2 le bloquerait inutilement. Proposé : texte d'abord, image ensuite (section 8). | Important | **Oui** (Q17) |
| C16 | **Chevauchements et fonctionnalités composites.** F14 et F15 décrivent le même envoi ; F6 et F11 la même règle de visibilité vue des deux côtés ; F8 et F9 une seule sortie ; F4 et F5 deux modes d'une même remise ; F3, F10 et F14 sont composites. Le catalogue les redécoupe en 73 fonctionnalités atomiques sans en supprimer aucune ; les 15 demandes sont toutes tracées. | Mineur | Non |

---

## 5. Modèle du domaine préliminaire

Les acteurs seront formalisés à l'étape 6. Le modèle reste neutre vis-à-vis de la technologie.

### 5.1 Rôles et permissions

| Rôle | Description | Permissions principales |
|---|---|---|
| **Visiteur** | Personne non connectée. | S'inscrire comme élève uniquement ; se connecter ; réinitialiser son mot de passe. Aucun accès à une donnée d'élève, de classe ou de devoir. |
| **Élève** **[D]** (F1 à F6) | A un espace personnel, reçoit les devoirs de ses classes, remet son travail, consulte ses résultats publiés. | Rejoindre une ou plusieurs classes avec un code [P]. Voir les devoirs de ses classes et l'état de ses remises. Remettre ou remplacer sa remise tant que le professeur n'a pas validé et selon Q8b [P]. Consulter ses résultats **uniquement** après validation ET autorisation. Ne voit jamais la proposition IA, les notes internes, les états techniques ni les résultats d'un autre élève. Ne corrige ni la transcription ni un devoir ni une évaluation. |
| **Professeur** **[D]** (F10 à F15) | Seul correcteur de ses élèves ; créateur de ses devoirs, propriétaire des classes par lesquelles ils sont reçus. Voit l'identité des élèves **[D]**. | Créer et gérer ses classes, inviter, approuver et retirer des élèves. Créer, modifier (avant remise) et supprimer (sans remise) des devoirs ; les envoyer à ses classes. Lister et trier les soumissions, ouvrir une copie. Voir image, transcription, proposition IA, alertes, journal de ses copies. Corriger la transcription, modifier niveaux et remarques, valider, demander un nouveau dépôt. Autoriser (et, selon Q6, retirer) la visibilité. Aucun accès aux classes, élèves ou copies d'un autre professeur. Ne modifie pas la rubrique. |
| **Administrateur** **[P]** | Acteur minimal absent des 15 demandes, requis pour créer les comptes professeur de façon contrôlée (Q1). À confirmer à l'étape 6. | Créer les comptes professeur (invitation). V2 : suspendre un compte, transférer les classes, consulter les indicateurs agrégés (REV-12), traiter les suppressions de comptes. Aucune édition de la rubrique ; aucun rôle de correcteur. |
| **Système** (traitement automatique et IA) | Acteur technique : extraction, évaluation par LLM, calcul de la note, contrôle des sorties, journalisation. | Extraire, évaluer, calculer, marquer les états. Ne transmet à l'IA ni identité ni donnée de compte. Ne rend rien visible à l'élève sans l'autorisation du professeur. Ne publie jamais seul. |

### 5.2 Entités

| Entité | Attributs principaux | Statut |
|---|---|---|
| **Compte** | email (unique), secret d'authentification, rôle unique (élève, professeur, administrateur), nom, prénom, état (non vérifié, actif, suspendu) | Email et connexion **[D]** F1, F2 ; rôle unique, nom et prénom, vérification **[P]** |
| **Classe** | nom, professeur propriétaire (un seul en v1), code d'invitation, état (active, archivée) | Existence et pluralité **[D]** F14 ; le reste **[P]**, Q2 |
| **Appartenance** | élève, classe, statut (demandée, active, refusée, retirée), dates | Plusieurs élèves par classe **[D]** F14 ; statut et mécanisme **[P]**, Q2 |
| **Devoir** | titre court, sujet, niveau (étiquette), langue (français ou anglais), échéance, accepter les remises en retard, instructions (facultatives), créateur (= correcteur), état | Sujet, niveau, langue, délai, instructions **[D]** F12 ; titre, option de retard, état **[P]** ; sens du niveau Q4 ; sens du délai Q8a |
| **Envoi** (devoir x classe) | devoir, classe, date d'envoi | Choix des classes **[D]** F15 ; entité **[P]** |
| **Soumission** | élève, devoir, état, date de première remise, indicateur « en retard » (sur la version active), version active | Existence **[D]** F3 à F5 ; le reste **[P]**. Le correcteur est le créateur du devoir. |
| **Pièce** | version de remise, rang ; soit page image (fichier nettoyé de ses métadonnées), soit texte collé ; mode de remise | **[D]** F4, F5 ; une version est faite d'images OU d'un texte **[P]** |
| **Transcription** | page image, texte, version, origine (moteur ou professeur), marqueurs d'illisibilité, écart avec la version précédente | Existence **[D]** F7 ; fidélité **[D]** solution §5 ; versions et écarts **[P]** |
| **Rubrique, Critère, Niveau** | version, 5 critères (C1 à C5, 20 % chacun), niveaux entiers 0 à 4, libellés EN et FR | **[D]** ; version française à valider Q11 ; versionnage **[P]** |
| **Évaluation IA** (une par exécution) | soumission, texte évalué, version de rubrique, modèle, version de la consigne, date, 5 résultats (niveau, justification), remarques, note calculée, alertes, indicateur « courante » | Existence **[D]** F8, F9 ; traçabilité et immuabilité **[P]** |
| **Évaluation du professeur** | soumission, version du texte de départ, évaluation IA de base (si elle existe), 5 résultats (niveau, justification, indicateur « modifié »), remarques pour l'élève, notes internes, note calculée, validée par/le, publiée le, révision | Existence **[D]** F10, F11 ; séparation remarques élève / internes **[P]** |
| **Journal** | acteur, action (dont ouverture et fermeture de copie, correction de transcription avec son écart), cible, valeurs avant/après, horodatage | **[P]** (mesure de la concordance, solution §3) |
| **Prise de connaissance** | élève, version de la notice, date | **[P]** (PRV-01) |

### 5.3 Relations et invariants

**Relations**
- Professeur 1 — 0..N Classe ; Classe 1 — 0..N Appartenance — 1 Élève (un élève peut être dans plusieurs classes **[P]**, Q2).
- Professeur 1 — 0..N Devoir ; Devoir 1 — 1..N Envoi — 1 Classe (les classes d'un devoir sont toutes à son créateur).
- Devoir 1 — 0..N Soumission ; Élève 1 — 0..N Soumission ; au plus 1 soumission active par couple (devoir, élève) **[P]**.
- Soumission 1 — 1..N Pièce (une par version de remise) ; Pièce image 0..1 — N Transcription (versions).
- Soumission 1 — 0..N Évaluation IA (une seule « courante ») ; Soumission 1 — 0..1 Évaluation du professeur.
- Évaluation (IA ou professeur) 1 — exactement 5 résultats, un par critère.

**Invariants**
1. Un compte a un seul rôle ; l'inscription publique ne peut produire qu'un élève **[P]**.
2. Le correcteur d'une soumission est le professeur créateur du devoir, qui est aussi propriétaire des classes destinataires ; il est figé à la remise. **[D]** « un seul correcteur » ; définition **[P]**.
3. Une soumission est toujours rattachée à un devoir reçu ; pas de dépôt libre **[P]**, Q3. Un élève présent dans deux classes ciblées par le même devoir n'a qu'une seule soumission active.
4. Une remise n'est acceptée que d'un compte vérifié ayant une appartenance active à une classe destinataire **[P]**.
5. La note est une fonction de 5 niveaux entiers : sur 20, somme des niveaux ; sur 100, 5 fois la somme **[P]**, Q5a.
6. L'évaluation IA est immuable. Les modifications du professeur ne l'écrasent jamais. Un remplacement de remise ou une correction de transcription n'écrase jamais l'évaluation du professeur **[P]**.
7. « Publiée » implique « validée » ; l'élève ne lit jamais une évaluation non publiée ni la proposition IA **[D]** F6, F11.
8. Aucune donnée d'identité (nom, prénom, email, classe, professeur) dans l'entrée envoyée à l'IA **[D]**.
9. La rubrique est en lecture seule pour tout le monde **[D]**.
10. Sujet, langue et instructions d'un devoir sont verrouillés dès la première remise ; l'échéance n'est plus modifiable en MVP (ASG-05, V2) **[P]**.

**Limites du modèle.** Il ne prouve rien sur la fiabilité de la notation : seule la mesure sur de vraies copies le fera (QLT-01 à QLT-03). Il isole et trace la proposition de l'IA, il n'empêche pas le professeur de réintroduire des biais en modifiant.

### 5.4 Machines à états

**Soumission (états internes)** **[P]**. La machine est la référence de recette : chaque étape du plan active les transitions dont elle livre le déclencheur (traitement en E7, validation en E9, publication en E10, image en E11).

États : **Remise** (confirmée, en file) ; **Extraction en cours** (images seulement) ; **Extraction échouée** ; **Évaluation en cours** ; **Évaluation échouée** ; **Non évaluable / IA indisponible** (avec sa cause : copie vide, image sans écriture lisible, rubrique française non validée) ; **À valider** (proposition IA prête ou saisie manuelle) ; **Validée** ; **Publiée** ; **Retournée** (nouvelle remise demandée). Indicateur transversal : **en retard**. Il n'y a pas d'état « brouillon » en MVP : la remise est atomique (brouillon enregistré en V2).

Transitions :
1. (création) -> Remise : l'élève remet. Gardes : devoir non clos, appartenance active à une classe destinataire, compte vérifié, contenu valide, plafond de remplacements non atteint.
2. Remise -> Extraction en cours (pièces image) | Évaluation en cours (texte collé) | Non évaluable (devoir en français et rubrique française non validée).
3. Extraction en cours -> Évaluation en cours (texte extrait) | Extraction échouée (échec après N tentatives, durée maximale dépassée) | Non évaluable (aucune écriture lisible).
4. Extraction échouée -> Extraction en cours (relance) | Évaluation en cours (transcription saisie par le professeur, TRX-04) | Retournée.
5. Évaluation en cours -> À valider (sortie conforme : 5 niveaux entiers de 0 à 4) | Évaluation échouée (sortie non conforme, panne, délai) | Non évaluable (alerte bloquante, EVL-08).
6. Évaluation échouée -> Évaluation en cours (relance) | À valider (évaluation manuelle sans IA, PRC-05).
7. Non évaluable -> À valider (évaluation manuelle, PRC-05) | Retournée | Évaluation en cours (relance quand la cause disparaît : rubrique française validée, transcription saisie).
8. À valider -> Évaluation en cours (relance après correction de la transcription) | Validée | Retournée.
9. Validée -> À valider (réouverture) | Publiée (autorisation de visibilité).
10. Publiée -> Validée (retrait de visibilité, si PUB-04 est retenue, Q6).
11. Retournée -> Remise (nouveau dépôt de l'élève).

Règles transverses :
- Aucune soumission ne reste indéfiniment « en cours » : durée maximale, puis échec visible du professeur.
- Chaque soumission suit son cycle ; l'échec de l'une ne bloque aucune autre (traitement par lot).
- Seul le correcteur déclenche « Validée » et « Publiée ». « Publiée » n'est atteignable que depuis « Validée » **[D]** F6, F11.
- Le remplacement de la remise est possible tant que l'état n'est pas « Validée », sous réserve de Q8b. L'ancienne version est archivée et l'évaluation IA précédente devient non courante. L'évaluation du professeur n'est jamais écrasée (SUB-04).
- Les états « Extraction échouée », « Évaluation échouée » et « Non évaluable » sont distincts : une copie non évaluable n'est pas un échec technique et n'est pas relancée en boucle.

**Ce que l'élève voit de l'état** **[P]** (liste fermée) :

| Vue de l'élève | Correspond à |
|---|---|
| **À remettre** | aucune remise, devoir non clos (si l'échéance est dépassée et le retard accepté : « À remettre, échéance dépassée ») |
| **Remis, en cours de correction** | Remise, Extraction en cours ou échouée, Évaluation en cours ou échouée, Non évaluable, À valider, Validée ; mention « en retard » le cas échéant. Aucun état technique ni échec n'est montré. |
| **À redéposer** | Retournée, avec le message du professeur et un bandeau à la connexion (les notifications sont en V2) |
| **Corrigé, résultat disponible** | Publiée |
| **Non remis** | échéance dépassée sans remise et devoir clos |

S'y ajoute l'état d'appartenance **« En attente d'approbation »** (demande de rattachement non encore approuvée, SUB-01).

**Devoir** **[P]**. États : **Ouvert** (remises acceptées) -> **Clos** (remises refusées) -> **Archivé** (lecture seule, V2). L'échéance seule ne ferme pas le devoir : elle pose l'indicateur « en retard » sur les remises tardives. Le devoir ne passe à « Clos » que si le professeur a choisi de refuser les remises en retard (alors à l'échéance) ou, en V2, par clôture manuelle (ASG-05). Sujet, langue et instructions sont verrouillés dès la première remise ; un devoir ayant des remises ne se supprime pas (archivage en V2). Brouillon de devoir, réouverture, prolongation et ajout de classe sont reportés (ASG-05).

**Visibilité de l'évaluation** **[D/P]**. Proposition IA (jamais visible de l'élève) -> évaluation du professeur en revue (invisible) -> validée (invisible) -> publiée (visible : version du professeur seulement). La validation et la publication sont deux actes distincts (proposition, Q6), avec raccourci « valider et publier ». Après publication, une modification crée une révision invisible de l'élève ; la version publiée reste affichée jusqu'à la nouvelle publication, datée « mise à jour le [date] » (PUB-04, si retenue).

### 5.5 Matrice de permissions (synthèse)

Lecture : L lecture, E écriture, C création, - aucun accès. « Propriétaire » : l'élève concerné ou le professeur correcteur. Toute case non listée est un refus par défaut, renvoyé comme « introuvable ». Chaque fonctionnalité qui crée une ressource porte les critères de refus de cette ressource ; le banc de test de la matrice (E4) est réutilisé à chaque étape.

| Ressource | Élève propriétaire | Autre élève | Professeur correcteur | Autre professeur | Visiteur |
|---|---|---|---|---|---|
| Compte et profil | L, E (le sien) | - | L (nom, prénom, email de ses élèves) | - | C (élève seulement) |
| Classe et appartenances | C (rejoindre), L (les siennes) | - | C, L, E | - | - |
| Devoir et envois | L (ceux de ses classes) | - | C, L, E (selon ASG-04, ASG-07) | - | - |
| Soumission et pièces (texte, images) | C, L, E avant validation | - | L | - | - |
| Transcription | - (sa copie publiée, Q7) | - | L, E | - | - |
| Évaluation IA | - | - | L (lecture seule) | - | - |
| Évaluation du professeur | L, seulement si publiée | - | C, L, E, validation, publication | - | - |
| Journal | - | - | L (historique de ses copies) | - | - |
| Rubrique | L | L | L | L | - |

---

## 6. Catalogue des fonctionnalités optimisées

73 fonctionnalités en 12 modules. Chaque bloc donne : énoncé, origine et statut, acteur, priorité, étape de livraison (section 8), règles de gestion, critères d'acceptation, dépendances, problèmes couverts, niveaux de test. Les critères d'acceptation sont écrits « Étant donné / quand / alors » ; ceux qui supposent un état livré plus tard sont signalés et rejoués à l'étape indiquée (tableau 8.4). Les paramètres chiffrés (durées, seuils, limites) sont dans le tableau 8.3.

| Module | MVP | V2 | À décider | Total |
|---|---|---|---|---|
| AUTH Comptes et accès | 6 | 0 | 0 | 6 |
| CLS Classes | 5 | 1 | 0 | 6 |
| ASG Devoirs | 6 | 1 | 0 | 7 |
| SUB Espace élève et remise | 5 | 1 | 1 | 7 |
| TRX Lecture de l'écriture | 4 | 0 | 0 | 4 |
| EVL Évaluation par l'IA | 9 | 0 | 1 | 10 |
| PRC Traitement des remises | 6 | 0 | 0 | 6 |
| REV Revue par le professeur | 9 | 2 | 1 | 12 |
| PUB Publication et consultation | 3 | 1 | 1 | 5 |
| NTF Notifications | 0 | 1 | 0 | 1 |
| PRV Confidentialité et données | 4 | 1 | 0 | 5 |
| QLT Mesure de la qualité | 4 | 0 | 0 | 4 |
| **Total** | **61** | **8** | **4** | **73** |

### 6.1 Module AUTH — Comptes et accès

Identités, rôles, sessions et cloisonnement. Rend possible tout le reste ; ne résout aucun des problèmes P1 à P3 par lui-même.

#### AUTH-01 — Inscription de l'élève
*Acteur : Visiteur · Priorité : MVP · Étape : E4 · Origine : F1 · Statut : décision utilisateur (compléments en proposition)*

**Énoncé.** Un visiteur peut créer un compte élève avec son adresse email et un mot de passe afin d'accéder à son espace personnel.

**Règles de gestion.**
- [D] L'inscription se fait par adresse email.
- [P] Données collectées : email, mot de passe, nom et prénom séparés (nécessaires au tri et à l'affichage de REV-01 et REV-02). Aucune autre donnée tant que Q12b ne l'impose pas.
- [P] Un email égale un compte ; l'inscription publique ne produit que le rôle élève.
- [P] Le compte est sans droit tant que l'email n'est pas vérifié (AUTH-02).
- [Q12b] Les élèves sans adresse email ne sont pas servis en v1.

**Critères d'acceptation.**
- Étant donné un email jamais utilisé, un mot de passe conforme, un nom et un prénom, quand le visiteur valide, alors un compte élève non vérifié est créé et un lien de vérification est envoyé.
- Étant donné un email déjà inscrit (casse ou espaces différents), alors aucun second compte n'est créé et le message ne révèle pas l'existence du compte.
- Étant donné une requête forgée contenant un rôle professeur, alors le compte créé reste de rôle élève.
- Étant donné un nom ou un prénom manquant, alors l'inscription est refusée avec un message par champ.

**Dépend de :** — · **Problèmes :** — · **Tests :** unitaire, intégration, E2E

#### AUTH-02 — Vérification de l'adresse email
*Acteur : Système · Priorité : MVP · Étape : E4 · Origine : ajoutée (F1) · Statut : proposition*

**Énoncé.** Le système vérifie l'adresse email d'un nouveau compte par un lien à usage unique avant toute remise ou rattachement à une classe, afin d'empêcher l'ouverture d'un compte au nom d'autrui.

**Règles de gestion.**
- [P] Lien à usage unique et à durée limitée ; renvoi possible.
- [P] Un compte non vérifié ne peut ni rejoindre une classe ni remettre un travail.
- [P] Les comptes professeur créés par invitation (AUTH-05) sont vérifiés par construction : le lien d'invitation prouve la possession de l'adresse.
- [P] Le changement d'adresse n'existe pas en MVP (V2) ; il redemanderait la vérification et préviendrait l'ancienne adresse.

**Critères d'acceptation.**
- Étant donné un lien valide, quand l'utilisateur l'ouvre, alors le compte devient actif.
- Étant donné un lien expiré, déjà utilisé ou falsifié, alors le compte reste non vérifié et un renvoi est proposé.
- Étant donné un compte non vérifié, quand il tente de rejoindre une classe, alors l'action est refusée.

**Dépend de :** AUTH-01 · **Problèmes :** — · **Tests :** unitaire, intégration

#### AUTH-03 — Connexion et déconnexion
*Acteur : Visiteur · Priorité : MVP · Étape : E4 · Origine : F2 · Statut : décision utilisateur (compléments en proposition)*

**Énoncé.** Un utilisateur peut se connecter avec son compte afin d'accéder à l'espace correspondant à son rôle (élève, professeur ou administrateur), et se déconnecter.

**Règles de gestion.**
- [D] La connexion se fait avec le compte créé.
- [P] Même message d'erreur pour un email inconnu et un mauvais mot de passe.
- [P] Temporisation après des échecs répétés (paramètres 8.3). Après déconnexion ou expiration, la session précédente n'ouvre plus aucun accès.
- [P] Un compte non vérifié est refusé avec proposition de renvoi du lien.

**Critères d'acceptation.**
- Étant donné un compte vérifié et des identifiants corrects, quand l'utilisateur se connecte, alors il arrive dans l'espace de son rôle.
- Étant donné des identifiants incorrects, alors aucune session n'est ouverte et le message est identique quel que soit le motif.
- Étant donné n échecs consécutifs (paramètre), alors le compte est temporisé pendant t minutes (paramètre).
- Étant donné une session expirée ou une déconnexion, quand l'utilisateur appelle une page ou une API protégée, alors l'accès est refusé.
- Étant donné un utilisateur déconnecté, quand il utilise le bouton retour, alors aucun résultat n'est affiché.

**Dépend de :** AUTH-01, AUTH-05 · **Problèmes :** — · **Tests :** unitaire, intégration, E2E

#### AUTH-04 — Réinitialisation du mot de passe
*Acteur : Visiteur · Priorité : MVP · Étape : E4 · Origine : ajoutée (F2) · Statut : proposition*

**Énoncé.** Un utilisateur peut réinitialiser son mot de passe par email afin de ne pas perdre l'accès à ses copies et à ses résultats.

**Règles de gestion.**
- [P] Lien à usage unique et à durée limitée envoyé à l'adresse du compte.
- [P] La réponse est identique que l'email possède un compte ou non.
- [P] Les sessions ouvertes sont invalidées après la réinitialisation.

**Critères d'acceptation.**
- Étant donné un email inscrit, quand la demande est faite, alors un lien est envoyé et le nouveau mot de passe permet la connexion.
- Étant donné un email inconnu, alors la réponse affichée est identique et aucun email n'est envoyé.
- Étant donné un lien expiré ou déjà utilisé, alors la réinitialisation est refusée.

**Dépend de :** AUTH-01 · **Problèmes :** — · **Tests :** unitaire, intégration

#### AUTH-05 — Création contrôlée des comptes professeur
*Acteur : Administrateur (proposition) · Priorité : MVP · Étape : E4 · Origine : ajoutée (F1, F2) · Statut : proposition*

**Énoncé.** Un administrateur peut créer les comptes professeur, par invitation, afin que seules des personnes qualifiées accèdent aux copies et aux identités des élèves.

**Règles de gestion.**
- [P] Le compte professeur n'est jamais créé par le formulaire public d'inscription de l'élève.
- [P] MVP : création par l'administrateur via un outil minimal, sans interface publique (mode à confirmer, Q1).
- [P] Le premier compte administrateur est créé hors de l'interface publique (procédure d'installation) ; l'administrateur se connecte ensuite comme tout compte (AUTH-03).
- [P] Le professeur reçoit un lien d'invitation à usage unique pour définir son mot de passe ; son compte est actif par construction.
- [P] Chaque création est tracée (auteur, date).
- [P] Un compte égale un seul rôle ; aucune élévation de rôle par requête.
- [P] Un compte professeur n'a accès à aucune donnée d'élève tant qu'il n'a pas de classe.

**Critères d'acceptation.**
- Étant donné une invitation émise par l'administrateur, quand le professeur ouvre le lien et définit son mot de passe, alors son compte est actif et il se connecte à l'espace professeur.
- Étant donné une requête forgée tentant d'attribuer le rôle professeur à un élève, alors elle est refusée.
- Étant donné un professeur sans classe, alors il ne voit aucune donnée d'élève.
- Étant donné une invitation expirée ou déjà utilisée, alors elle est refusée.
- Étant donné une création de compte professeur, alors l'auteur et la date sont consignés.

**Dépend de :** — · **Problèmes :** — · **Tests :** intégration, E2E, recette

#### AUTH-06 — Cloisonnement des accès par rôle, classe et correcteur
*Acteur : Système · Priorité : MVP · Étape : E4 (mécanisme) · Origine : F3, F6, F10, F13 · Statut : proposition*

**Énoncé.** Le système ne donne accès à un devoir, une copie, une image, une transcription ou une évaluation qu'à l'élève concerné ou au professeur correcteur concerné, afin de protéger les copies et les notes.

**Règles de gestion.**
- [D] Un seul correcteur par copie : le professeur lié à l'élève (solution §2.5).
- [P] Le correcteur d'une soumission est le créateur du devoir, propriétaire des classes destinataires.
- [P] Élève : ses remises, les devoirs de ses classes, ses résultats publiés ; jamais l'identité, la liste ni les résultats d'un autre élève.
- [P] Professeur : ses classes, ses devoirs, les copies de ses devoirs ; aucune recherche d'élèves hors de ses classes.
- [P] Contrôle côté serveur à chaque accès, y compris pour les images (aucun lien public ni permanent) ; réponse « introuvable » plutôt que « interdit ».
- [P] Portée : le mécanisme (refus par défaut, rôles, réponse neutre) est livré en E4. Les critères de refus propres à chaque ressource sont des critères d'acceptation de la fonctionnalité qui crée la ressource (matrice 5.5).

**Critères d'acceptation (mécanisme, E4).**
- Étant donné un visiteur sans session, quand il appelle une page ou une API protégée, alors l'accès est refusé.
- Étant donné un compte élève, quand il appelle une action réservée au professeur ou à l'administrateur, alors elle est refusée.
- Étant donné un professeur sans classe, alors il ne voit aucune donnée d'élève.
- Étant donné une ressource inexistante ou appartenant à un autre compte, alors la réponse est identique (« introuvable »).

**Critères rejoués par les ressources.** Élèves A et B : A n'ouvre pas la copie de B par identifiant, adresse ou API (SUB-01, E6). Professeurs P1 et P2 : P2 n'obtient rien d'une classe, d'un devoir ou d'une copie de P1 (CLS-01, E5 ; REV-01, E8). Élève membre de deux classes de deux professeurs : chaque professeur ne voit que les remises de ses propres devoirs (E6). Adresse d'image copiée hors session : aucun accès (SUB-03, E11).

**Dépend de :** AUTH-03 · **Problèmes :** — · **Tests :** intégration, E2E, recette

### 6.2 Module CLS — Classes

Organiser les élèves d'un professeur et définir de façon explicite qui est « le professeur lié à l'élève ». Aucune de ces fonctions n'était décrite dans les 15 demandes au-delà de F14.

#### CLS-01 — Créer et nommer plusieurs classes
*Acteur : Professeur · Priorité : MVP · Étape : E5 · Origine : F14 · Statut : décision utilisateur*

**Énoncé.** Un professeur peut créer et nommer plusieurs classes afin d'organiser ses élèves et de leur envoyer des devoirs.

**Règles de gestion.**
- [D] Un professeur peut avoir plusieurs classes.
- [D] Une classe comporte plusieurs élèves (voir CLS-03).
- [P] Une classe appartient à un seul professeur en v1.
- [P] Nom de classe unique chez un même professeur ; deux professeurs peuvent avoir des classes de même nom.

**Critères d'acceptation.**
- Étant donné un professeur connecté, quand il crée deux classes de noms distincts, alors elles apparaissent dans sa liste, vides.
- Étant donné un nom déjà utilisé par ce professeur, alors la création est refusée.
- Étant donné deux professeurs ayant chacun une classe « Seconde B », alors chacun ne voit que la sienne.

**Dépend de :** AUTH-05, AUTH-03 · **Problèmes :** — · **Tests :** unitaire, intégration, E2E

#### CLS-02 — Générer un code d'invitation de classe
*Acteur : Professeur · Priorité : MVP · Étape : E5 · Origine : ajoutée (F3, F14) · Statut : proposition*

**Énoncé.** Un professeur peut générer un code d'invitation propre à une classe afin d'y rattacher ses élèves.

**Règles de gestion.**
- [P] Un code par classe, désactivable et renouvelable, non prévisible ; nombre d'essais limité (paramètres 8.3).
- [P] Le code ne donne accès à aucune donnée avant le rattachement.
- [Q2] Option d'approbation de chaque demande par le professeur (CLS-06).

**Critères d'acceptation.**
- Étant donné une classe, quand le professeur génère un code, alors ce code est affiché et lié à cette classe seulement.
- Étant donné un code désactivé, quand un élève le saisit, alors le rattachement est refusé.
- Étant donné des saisies de code échouées répétées, alors les essais sont limités.

**Dépend de :** CLS-01 · **Problèmes :** — · **Tests :** unitaire, intégration

#### CLS-03 — Rejoindre une classe avec un code
*Acteur : Élève · Priorité : MVP · Étape : E5 · Origine : F14, ajoutée · Statut : proposition*

**Énoncé.** Un élève peut rejoindre une ou plusieurs classes avec un code d'invitation afin de recevoir les devoirs de son professeur.

**Règles de gestion.**
- [P] Un élève peut appartenir à plusieurs classes de professeurs différents (anglais et français) ; un seul compte par élève.
- [Q2] Avec approbation, la demande est « demandée » puis « active » (CLS-06) ; sans approbation, elle est « active » immédiatement.
- [P] Sans classe, l'élève ne voit aucun devoir et un état vide explicite s'affiche.
- [P] Un compte non vérifié ne peut pas rejoindre une classe.

**Critères d'acceptation.**
- Étant donné un compte vérifié et un code valide, quand l'élève le saisit, alors une appartenance est créée (active ou demandée selon Q2).
- Étant donné un code inconnu ou désactivé, alors le rattachement est refusé sans révéler l'existence de classes.
- Étant donné un élève dans deux classes, alors il voit les devoirs des deux et seulement ceux-là (rejoué en E6).

**Dépend de :** CLS-02, AUTH-02 · **Problèmes :** — · **Tests :** intégration, E2E

#### CLS-04 — Consulter les élèves d'une classe et en retirer
*Acteur : Professeur · Priorité : MVP · Étape : E5 · Origine : ajoutée (F14) · Statut : proposition*

**Énoncé.** Un professeur peut consulter la liste des élèves de sa classe et retirer un élève afin de garder des classes exactes.

**Règles de gestion.**
- [P] Nom, prénom et email visibles uniquement du professeur propriétaire (identité non masquée [D]).
- [P] Un élève retiré ne reçoit plus les nouveaux devoirs et ne peut plus remettre sur les devoirs encore ouverts de cette classe ; ses remises passées restent accessibles à son correcteur et à lui-même.
- [P] Un élève ajouté après l'envoi d'un devoir reçoit les devoirs encore ouverts.

**Critères d'acceptation.**
- Étant donné une classe de 3 élèves, quand le professeur ouvre la liste, alors les 3 apparaissent avec nom et prénom.
- Étant donné un élève retiré, quand un nouveau devoir est envoyé à la classe, alors cet élève ne le voit pas.
- Étant donné un élève retiré, alors ses remises existantes restent visibles de son correcteur.

**Dépend de :** CLS-03 · **Problèmes :** — · **Tests :** intégration, E2E

#### CLS-06 — Approuver ou refuser les demandes de rattachement
*Acteur : Professeur · Priorité : MVP (si Q2 retient l'approbation) · Étape : E5 · Origine : ajoutée (F14) · Statut : proposition*

**Énoncé.** Un professeur peut approuver ou refuser les demandes d'élèves qui souhaitent rejoindre sa classe, afin que seuls ses élèves reçoivent ses devoirs.

**Règles de gestion.**
- [Q2] Liste d'attente par classe, avec nom, prénom et email du demandeur (contrôle anti-usurpation).
- [P] Approuver rend l'appartenance « active » ; refuser ne donne aucun accès et ne révèle rien de la classe.
- [P] Si Q2 retient la variante sans approbation, cette fonctionnalité est retirée, ainsi que les mentions d'approbation de CLS-02, CLS-03 et SUB-01.

**Critères d'acceptation.**
- Étant donné une demande « demandée », quand le professeur l'approuve, alors l'appartenance est active et les devoirs encore ouverts de la classe apparaissent chez l'élève.
- Étant donné une demande refusée, alors l'élève n'a accès à aucun devoir de cette classe.
- Étant donné une demande en attente, alors l'élève voit « En attente d'approbation » et aucun devoir de la classe (SUB-01).
- Étant donné un autre professeur, alors la liste d'attente est inaccessible.

**Dépend de :** CLS-03 · **Problèmes :** — · **Tests :** intégration, E2E

#### CLS-05 — Archiver une classe en fin d'année
*Acteur : Professeur · Priorité : V2 · Étape : E14 · Origine : ajoutée · Statut : proposition*

**Énoncé.** Un professeur peut archiver une classe afin de la passer en lecture seule à la fin de l'année scolaire.

**Règles de gestion.**
- [P] Une classe archivée n'accepte plus de nouveaux devoirs ni de nouveaux élèves.
- [P] L'archivage déclenche le délai de conservation (PRV-03).

**Critères d'acceptation.**
- Étant donné une classe archivée, quand le professeur lui envoie un devoir, alors l'envoi est refusé.
- Étant donné une classe archivée, alors ses copies et résultats restent consultables en lecture seule.

**Dépend de :** CLS-01, PRV-03 · **Problèmes :** — · **Tests :** intégration

### 6.3 Module ASG — Devoirs

Créer un devoir et l'envoyer aux classes. Le devoir est aussi ce qui permet d'évaluer le critère Task Achievement.

#### ASG-01 — Créer un devoir
*Acteur : Professeur · Priorité : MVP · Étape : E5 · Origine : F12 · Statut : décision utilisateur (compléments en proposition)*

**Énoncé.** Un professeur peut créer un devoir comportant un sujet, le niveau des élèves, la langue (français ou anglais), un délai et, de façon facultative, des instructions.

**Règles de gestion.**
- [D] Champs : sujet, niveau, langue (français ou anglais), délai ; instructions optionnelles.
- [P] Titre court en plus du sujet (nécessaire pour se retrouver dans les listes).
- [Q8a] « Délai » lu comme date et heure limites de remise, communes aux classes ciblées en v1.
- [P] Champ « accepter les remises en retard » (oui par défaut, Q8a) ; voir ASG-03.
- [Q4] Le niveau reste porté par le devoir comme demandé ; valeurs d'une liste fermée à fixer avec le client ; étiquette non transmise à l'IA en v1.
- [P] Sujet et instructions servent à juger l'adéquation à la tâche (Task Achievement) ; ils ne peuvent ni ajouter, ni retirer, ni repondérer un critère ; la règle est affichée sous le champ « Instructions ».
- [P] Avertissement : pas de nom d'élève dans le sujet ni les instructions (ils sont transmis à l'IA).

**Critères d'acceptation.**
- Étant donné un professeur connecté, quand il renseigne sujet, niveau, langue, délai et au moins une classe, alors le devoir est créé (« le devoir apparaît chez les élèves » est vérifié en E6).
- Étant donné un champ obligatoire manquant ou une langue hors français/anglais, alors la création est refusée avec un message par champ et aucun devoir partiel n'est créé.
- Étant donné un devoir sans instructions, alors la création est valide et aucun bloc vide n'apparaît chez l'élève.
- Étant donné l'option « refuser les remises en retard » cochée, alors elle est enregistrée avec le devoir.
- Étant donné un compte élève, quand il appelle la création de devoir, alors l'accès est refusé.

**Dépend de :** CLS-01 · **Problèmes :** — · **Tests :** unitaire, intégration, E2E

#### ASG-02 — Sélectionner les classes destinataires à la création
*Acteur : Professeur · Priorité : MVP · Étape : E5 · Origine : F15, F14 · Statut : décision utilisateur*

**Énoncé.** Lors de la création d'un devoir, le professeur peut sélectionner une ou plusieurs de ses classes afin d'y envoyer le devoir.

**Règles de gestion.**
- [D] La sélection se fait à la création du devoir.
- [D] Chaque classe sélectionnée reçoit le devoir (F14) ; un devoir envoyé à N classes crée N envois suivis séparément [P].
- [P] Au moins une classe est requise ; seules les classes du professeur sont proposées ; une requête forgée avec la classe d'un autre professeur est refusée, sans création partielle.
- [P] Un élève présent dans deux classes ciblées n'a qu'une soumission possible pour ce devoir ; il est listé une seule fois chez le professeur (REV-01).

**Critères d'acceptation.**
- Étant donné un professeur ayant 3 classes, quand il coche C1 et C3, alors le devoir est envoyé à C1 et C3 uniquement.
- Étant donné aucune classe cochée, alors la création est refusée.
- Étant donné une requête forgée visant la classe d'un autre professeur, alors rien n'est créé, même pour les classes valides.
- Étant donné un élève membre de C1 et C3, alors il voit un seul devoir et ne peut y déposer qu'une soumission active.

**Dépend de :** ASG-01, CLS-01 · **Problèmes :** — · **Tests :** intégration, E2E

#### ASG-06 — Lister mes devoirs et ouvrir un devoir
*Acteur : Professeur · Priorité : MVP · Étape : E5 · Origine : F13, F12 · Statut : proposition*

**Énoncé.** Le professeur peut lister ses devoirs et en ouvrir un afin d'accéder à ses soumissions : c'est le point d'entrée de la partie « soumissions » de F13.

**Règles de gestion.**
- [P] Pour chaque devoir : titre, langue, échéance, classes destinataires, nombre de remises, compteur « à valider » (PRC-03, rejoué en E7).
- [P] Seuls les devoirs du professeur connecté sont listés ; défaut : échéance la plus récente d'abord.
- [P] Ouvrir un devoir mène à la liste des soumissions (REV-01).

**Critères d'acceptation.**
- Étant donné un professeur ayant 3 devoirs, alors la liste montre les 3 avec titre, langue, échéance, classes et nombre de remises.
- Étant donné un autre professeur, alors ces devoirs sont invisibles.
- Étant donné un clic sur un devoir, alors s'ouvre la liste de ses soumissions.

**Dépend de :** ASG-02 · **Problèmes :** P1 · **Tests :** intégration, E2E

#### ASG-07 — Modifier ou supprimer un devoir sans remise
*Acteur : Professeur · Priorité : MVP · Étape : E6 · Origine : F12 · Statut : proposition*

**Énoncé.** Le professeur peut corriger ou supprimer un devoir tant qu'aucune remise n'existe, afin qu'une faute dans le sujet ne soit pas irréparable.

**Règles de gestion.**
- [P] Avant la première remise, tous les champs sont modifiables, échéance comprise ; la modification est visible immédiatement des élèves. Les classes destinataires ne se modifient pas (ajout de classe : ASG-05, V2) ; pour changer de classes, supprimer puis recréer.
- [P] La suppression n'est possible que s'il n'existe aucune remise ; elle retire le devoir de la vue des élèves.
- [P] Après la première remise, ASG-04 s'applique.

**Critères d'acceptation.**
- Étant donné un devoir sans remise, quand le professeur modifie le sujet, alors les élèves voient le sujet modifié.
- Étant donné un devoir sans remise, quand le professeur le supprime, alors il disparaît de sa liste et de celle des élèves.
- Étant donné un devoir avec au moins une remise, alors la suppression est refusée.
- Étant donné un autre professeur, alors la modification et la suppression sont refusées.

**Dépend de :** ASG-02, ASG-06 · **Problèmes :** — · **Tests :** intégration, E2E

#### ASG-03 — Appliquer le délai et marquer les remises en retard
*Acteur : Système · Priorité : MVP · Étape : E6 · Origine : F12 · Statut : proposition*

**Énoncé.** Le système compare la date de remise à l'échéance du devoir afin de marquer « en retard » les remises tardives.

**Règles de gestion.**
- [Q8a] L'échéance est un seuil de retard. Par défaut, une remise tardive est acceptée et marquée « en retard » ; le refus du retard est un choix du professeur par devoir (champ d'ASG-01), le devoir passant alors à « Clos » à l'échéance.
- [P] La date de remise est l'horodatage serveur ; fuseau horaire unique à fixer. Chaque version de remise est horodatée.
- [P] « En retard » est calculé sur la version active ; la date de première remise reste affichée (SUB-04).
- [P] Le professeur voit l'indicateur « en retard » dans la liste (REV-01).

**Critères d'acceptation.**
- Étant donné un délai dépassé et le retard accepté, quand l'élève remet, alors la soumission est créée et marquée « en retard ».
- Étant donné un devoir configuré pour refuser le retard, quand l'élève remet après l'échéance, alors la remise est refusée avec un message clair.
- Étant donné une remise remplacée après l'échéance, alors « en retard » est calculé sur la version active et la date de première remise reste affichée.

**Dépend de :** ASG-01, SUB-02 · **Problèmes :** — · **Tests :** unitaire, intégration

#### ASG-04 — Verrouiller le devoir dès la première remise
*Acteur : Système · Priorité : MVP · Étape : E6 · Origine : ajoutée (F12) · Statut : proposition*

**Énoncé.** Le système empêche de modifier le sujet, la langue et les instructions d'un devoir dès qu'une remise existe, afin que les copies soient évaluées sur la tâche réellement donnée.

**Règles de gestion.**
- [P] Après la première remise, sujet, langue et instructions ne sont plus modifiables. Le titre et le niveau (étiquette) restent modifiables.
- [P] L'échéance n'est plus modifiable après la première remise en MVP : la prolongation relève d'ASG-05 (V2).
- [P] Un devoir ayant des remises ne peut pas être supprimé ; l'archivage le remplacera en V2 (ASG-05).
- [P] La modification et la suppression avant la première remise relèvent d'ASG-07.

**Critères d'acceptation.**
- Étant donné un devoir avec au moins une remise, quand le professeur tente de changer le sujet, la langue ou les instructions, alors la modification est refusée.
- Étant donné un devoir avec remises, quand le professeur tente de le supprimer, alors l'action est refusée.
- Étant donné un devoir avec remises, quand le professeur modifie le titre, alors la modification est acceptée.

**Dépend de :** ASG-01, SUB-02 · **Problèmes :** P2 · **Tests :** unitaire, intégration

#### ASG-05 — Gérer la vie du devoir : ajouter une classe, prolonger, clore, archiver
*Acteur : Professeur · Priorité : V2 · Étape : E14 · Origine : F15, ajoutée · Statut : proposition*

**Énoncé.** Le professeur peut ajouter une classe à un devoir existant, prolonger l'échéance, le clore et l'archiver.

**Règles de gestion.**
- [P] Contournement en MVP : créer un nouveau devoir (ou, avant remise, ASG-07).
- [P] Ajouter une classe crée un nouvel envoi ; prolonger ne change pas les remises existantes.
- [P] Le désarchivage est possible ; l'archivage rend le devoir lisible seulement.
- [Q8a] Un délai propre à chaque classe est examiné ici.

**Critères d'acceptation.**
- Étant donné un devoir ouvert, quand le professeur ajoute une classe, alors les élèves actifs de cette classe le voient.
- Étant donné un devoir clos, quand le professeur prolonge l'échéance, alors il redevient ouvert.

**Dépend de :** ASG-02, ASG-04 · **Problèmes :** — · **Tests :** intégration

### 6.4 Module SUB — Espace élève et remise

L'élève reçoit ses devoirs, remet son travail (texte ou image scannée) et suit l'état de sa remise.

#### SUB-01 — Espace personnel de remise de l'élève
*Acteur : Élève · Priorité : MVP · Étape : E6 · Origine : F3 · Statut : décision utilisateur (compléments en proposition)*

**Énoncé.** L'élève dispose d'un espace personnel qui liste les devoirs reçus de ses classes et où il remet son travail à son professeur.

**Règles de gestion.**
- [D] Chaque élève a son propre espace de remise ; le travail va vers son professeur.
- [P] « Son professeur » est le créateur du devoir, propriétaire de la classe par laquelle l'élève l'a reçu ; un élève peut donc avoir plusieurs professeurs (CLS-03).
- [P] Pour chaque devoir : titre, sujet, instructions, langue, échéance, état de la remise (SUB-05).
- [Q3] Toute soumission est rattachée à un devoir reçu ; pas de dépôt libre.
- [P] État vide explicite pour un élève sans classe ; état « En attente d'approbation » pour une demande de rattachement non approuvée (CLS-06).
- [P] Un devoir envoyé à deux classes de l'élève n'apparaît qu'une fois.

**Critères d'acceptation.**
- Étant donné un élève de C1 et un devoir D envoyé à C1, alors D apparaît avec sujet, langue, échéance et état « à remettre ».
- Étant donné un devoir envoyé à C2 seulement, quand l'élève de C1 ouvre son espace, l'adresse ou l'API, alors rien n'apparaît.
- Étant donné un élève sans classe, alors un état vide explicite s'affiche sans erreur.
- Étant donné une demande de rattachement en attente, alors l'élève voit « En attente d'approbation » et aucun devoir de cette classe.
- Étant donné deux élèves A et B, quand A tente d'ouvrir la remise de B par identifiant, adresse ou API, alors l'accès est refusé.
- Étant donné un élève membre de C1 et C3 ciblées par le même devoir, alors il voit un seul devoir.
- Étant donné la création d'un devoir (ASG-01), alors il apparaît chez les élèves des classes choisies.

**Dépend de :** CLS-03, ASG-02, AUTH-06 · **Problèmes :** — · **Tests :** intégration, E2E

#### SUB-02 — Remise par texte collé
*Acteur : Élève · Priorité : MVP · Étape : E6 · Origine : F5 · Statut : décision utilisateur (compléments en proposition)*

**Énoncé.** L'élève peut coller sa production écrite sous forme de texte afin de faire sa remise.

**Règles de gestion.**
- [D] La production est collée sous forme de texte.
- [P] Saisie directe permise ; import de fichier hors v1 ; texte brut (mise en forme retirée).
- [P] Texte non vide ; limite de longueur à fixer (8.3) ; refus explicite au-delà, jamais de troncature silencieuse.
- [P] Une version de remise est faite de texte OU d'images, jamais des deux (SUB-03).
- [P] Fautes d'orthographe, de ponctuation et de majuscules conservées telles quelles jusqu'à l'IA.
- [P] Le mode de remise (texte ou image) est enregistré et visible du professeur (Q10).
- [P] La consigne « pas de nom dans votre production » est affichée avant l'envoi (PRV-02).
- [Q10] Limite assumée : l'application ne peut pas savoir si le texte a été écrit par l'élève, copié ou généré.

**Critères d'acceptation.**
- Étant donné un devoir ouvert, quand l'élève valide un texte non vide, alors une remise est créée avec ce texte à l'identique.
- Étant donné un texte vide ou fait d'espaces, alors la remise est refusée.
- Étant donné un texte au-delà de la limite, alors la remise est refusée avec un message explicite.
- Étant donné un texte à fautes, alors elles sont conservées inchangées dans le texte transmis à l'évaluation.
- Étant donné un compte non vérifié ou une appartenance non active, alors la remise est refusée.

**Dépend de :** SUB-01 · **Problèmes :** P1, P3 · **Tests :** unitaire, intégration, E2E

#### SUB-03 — Remise par image(s) scannée(s)
*Acteur : Élève · Priorité : MVP · Étape : E11 (après la décision G2) · Origine : F4 · Statut : décision utilisateur (compléments en proposition)*

**Énoncé.** L'élève peut déposer une ou plusieurs images scannées de sa production écrite manuscrite afin de faire sa remise.

**Règles de gestion.**
- [D] Dépôt d'une image scannée (lecture de la coquille « sans image scanné » en « une image scannée »).
- [P] Plusieurs pages ordonnées, aperçu avant envoi.
- [P] Formats JPEG et PNG (PDF et formats de téléphone à confirmer) ; poids et nombre de pages limités (8.3) ; type vérifié sur le contenu du fichier.
- [P] Fichier refusé : aucune remise créée, rien n'est stocké. Fichier accepté : version nettoyée de ses métadonnées (PRV-05) conservée et visible du seul professeur correcteur, jusqu'à la durée fixée par PRV-03.
- [P] La consigne « pas de nom dans votre production » est affichée avant l'envoi (PRV-02).

**Critères d'acceptation.**
- Étant donné un devoir ouvert et une image conforme, quand l'élève la dépose, alors une remise est créée, l'image est stockée et une confirmation datée s'affiche.
- Étant donné un format refusé, un fichier trop gros, corrompu, ou une extension qui ne correspond pas au contenu, alors la remise est refusée et rien n'est créé ni stocké.
- Étant donné 3 pages réordonnées avant envoi, alors l'ordre des pages enregistré est celui choisi.
- Étant donné une coupure réseau pendant l'envoi puis un nouvel essai, alors une seule remise existe.
- Étant donné une adresse d'image copiée hors session, alors elle ne donne pas accès au fichier ; un autre élève ou un autre professeur n'y accède pas.

**Dépend de :** SUB-01 · **Problèmes :** P1 · **Tests :** unitaire, intégration, E2E

#### SUB-04 — Remplacer sa remise avant validation
*Acteur : Élève · Priorité : MVP · Étape : E7 (texte), branche image en E11 · Origine : ajoutée (F4, F5) · Statut : proposition*

**Énoncé.** L'élève peut remplacer sa remise tant que le professeur ne l'a pas validée, afin de corriger un envoi défectueux (par exemple une photo floue).

**Règles de gestion.**
- [P] Une seule soumission active par couple (devoir, élève) ; remplacement possible jusqu'à la validation, sous réserve de Q8b.
- [P] Les anciennes versions sont conservées et horodatées ; l'évaluation IA précédente devient non courante et le traitement est relancé.
- [P] Un remplacement n'écrase jamais l'évaluation du professeur : celle-ci référence la version du texte sur laquelle elle a été commencée. Un bandeau « texte modifié depuis votre revue » impose un choix explicite (repartir de la nouvelle proposition ou conserver ses niveaux), tracé au journal.
- [Q8b] Recommandé : remplacement refusé dès qu'une évaluation du professeur existe ; le professeur utilise alors « Retournée » (PRC-05). Après l'échéance, remplacement possible seulement si la copie a été retournée. Plafond de remplacements par couple (devoir, élève) : paramètre 8.3.
- [P] Comme l'élève ne voit pas l'évaluation avant publication, il ne peut pas s'entraîner contre l'IA.

**Critères d'acceptation.**
- Étant donné une soumission non validée, quand l'élève dépose une nouvelle version, alors elle remplace l'ancienne, qui reste archivée.
- Étant donné un remplacement, alors extraction (images) et évaluation sont relancées sur la nouvelle version.
- Étant donné le plafond de remplacements atteint, alors le remplacement est refusé.
- Étant donné une évaluation du professeur commencée et un remplacement autorisé, alors l'évaluation n'est pas écrasée et le bandeau impose un choix tracé.
- Étant donné une soumission validée, quand l'élève tente de la remplacer, alors l'action est refusée (rejoué en E9, quand la validation existe).

**Dépend de :** SUB-02 ; branche image : SUB-03 · **Problèmes :** — · **Tests :** intégration, E2E

#### SUB-05 — Suivre l'état de sa remise
*Acteur : Élève · Priorité : MVP · Étape : E6 · Origine : F3 · Statut : proposition*

**Énoncé.** L'élève peut voir l'état de sa remise afin de savoir où en est son travail.

**Règles de gestion.**
- [P] Liste fermée des états visibles : « À remettre », « Remis, en cours de correction » (avec la mention « en retard » le cas échéant), « À redéposer » (avec le message du professeur), « Corrigé, résultat disponible », « Non remis ». S'y ajoute « En attente d'approbation » pour l'appartenance (SUB-01).
- [P] Les états techniques et les échecs ne sont jamais montrés.
- [P] Confirmation datée de la remise ; bandeau à la connexion quand une copie est à redéposer (les notifications sont en V2).
- [P] Aucun résultat avant publication (PUB-03).

**Critères d'acceptation.**
- Étant donné une remise en échec d'extraction, d'évaluation ou « non évaluable », alors l'élève voit « Remis, en cours de correction » sans détail technique.
- Étant donné une échéance dépassée sans remise et un devoir clos, alors l'élève voit « Non remis ».
- Étant donné une copie retournée par le professeur, alors l'élève voit « À redéposer » avec le message et un bandeau à la connexion (rejoué en E9).
- Étant donné une remise publiée, alors l'élève voit « Corrigé, résultat disponible » (rejoué en E10).

**Dépend de :** SUB-01, PUB-03 · **Problèmes :** — · **Tests :** intégration, E2E

#### SUB-06 — Alerte de qualité d'image avant l'envoi
*Acteur : Élève · Priorité : V2 · Étape : E14 · Origine : F4 · Statut : proposition*

**Énoncé.** Le système signale à l'élève une image floue, sombre, tournée ou coupée avant l'envoi afin qu'il reprenne sa photo.

**Règles de gestion.**
- [P] Avertissement, non bloquant sauf image inexploitable.
- [P] Seuils à calibrer sur les échecs de lecture constatés au pilote.

**Critères d'acceptation.**
- Étant donné une image très floue, quand l'élève la dépose, alors un avertissement lui propose de la reprendre.
- Les taux de fausses alertes et de non-détections sur un jeu échantillonné au pilote sont rapportés.

**Dépend de :** SUB-03 · **Problèmes :** P3 · **Tests :** intégration, recette

#### SUB-07 — Dépôt par le professeur au nom d'un élève
*Acteur : Professeur · Priorité : à décider (Q9) · Étape : E16 si retenue · Origine : ajoutée (F4) · Statut : proposition*

**Énoncé.** Le professeur peut déposer des copies scannées au nom d'élèves de ses classes afin de traiter une pile de copies papier rédigées en classe.

**Règles de gestion.**
- [Q9] Sans cette fonction, la numérisation incombe à l'élève et le scénario papier de la problématique n'est couvert que partiellement.
- [P] Chaque scan est attribué à un élève de la classe et vérifié par le professeur ; attribut « déposée par » enregistré.

**Critères d'acceptation.**
- Étant donné un lot de scans attribués à des élèves, quand le professeur les dépose, alors une soumission est créée par élève et chacune suit le traitement normal.
- Étant donné un scan attribué à un élève d'une autre classe, alors le dépôt est refusé.

**Dépend de :** SUB-03, CLS-04 · **Problèmes :** P1 · **Tests :** intégration, E2E

### 6.5 Module TRX — Lecture de l'écriture

Transformer les images manuscrites en texte fidèle, accessible au professeur et utilisé par l'évaluation. C'est le point technique le plus incertain.

#### TRX-01 — Extraire le texte d'une image
*Acteur : Système · Priorité : MVP · Étape : E2 (module), intégration en E11 · Origine : F7 · Statut : décision utilisateur*

**Énoncé.** Le système extrait le texte de chaque image remise afin que ce texte soit accessible au professeur et utilisable par l'évaluation.

**Règles de gestion.**
- [D] Le texte est extrait de l'image pour être accessible au professeur dans son espace.
- [P] Les pages sont assemblées dans l'ordre des pages remises.
- [P] Ce texte est aussi l'entrée de l'évaluation IA : une erreur de lecture devient une erreur de note.
- [P] Un échec est traité par PRC-04, jamais en silence.

**Critères d'acceptation.**
- Étant donné un jeu d'images, quand le module d'extraction s'exécute, alors il renvoie le texte avec ses marqueurs d'illisibilité et la version du moteur (E2).
- Étant donné une image sans écriture lisible, alors la copie est marquée non évaluable pour le professeur et aucun contenu n'est inventé : tout mot de la sortie absent de l'image est une erreur.
- Étant donné une page manuscrite portant une consigne adressée au moteur ou à l'IA, alors elle est transcrite telle quelle, sans être exécutée.
- Rejoués en E11 sur une vraie remise : le texte est stocké, associé à la remise et affiché au professeur ; une remise de 3 pages donne un texte dans l'ordre des pages.

**Dépend de :** — · **Problèmes :** P1, P3 · **Tests :** intégration, évaluation IA

#### TRX-02 — Transcription fidèle, sans correction
*Acteur : Système · Priorité : MVP · Étape : E2 · Origine : ajoutée (F7) · Statut : décision utilisateur*

**Énoncé.** Le système transcrit l'écriture sans corriger l'orthographe ni la ponctuation, afin de ne pas fausser le critère Mechanics.

**Règles de gestion.**
- [D] Transcrire sans corriger l'orthographe ni la ponctuation (solution.md, points reportés).
- [P] Majuscules, ponctuation et fautes conservées telles qu'écrites.
- [P] Les passages indéchiffrables sont marqués « [illisible] », jamais devinés.
- [P] Fidélité mesurée par QLT-03.

**Critères d'acceptation.**
- Étant donné une copie contenant une faute d'orthographe volontaire, alors la faute figure dans la transcription.
- Étant donné un mot indéchiffrable, alors il est remplacé par un marqueur d'illisibilité et non par un mot plausible.
- Sur le jeu de référence, la préservation des fautes et le taux d'erreur de caractères atteignent les seuils figés au préalable (Q13b, 8.3).

**Dépend de :** TRX-01 · **Problèmes :** P3 · **Tests :** évaluation IA, recette

#### TRX-03 — Consulter le texte transcrit, l'image à la demande
*Acteur : Professeur · Priorité : MVP · Étape : E11 · Origine : F7 · Statut : décision utilisateur pour l'accès au texte ; proposition pour la vue image et texte (Q15)*

**Énoncé.** Le professeur peut consulter la transcription d'une copie image, l'image étant accessible à la demande, côte à côte, afin de vérifier le texte que l'IA a évalué.

**Règles de gestion.**
- [D] Le texte extrait est accessible au professeur dans son espace.
- [P] La mention « transcrit automatiquement » est affichée.
- [Q15] Vue par défaut : texte d'abord, image à la demande, pour limiter l'influence de l'écriture.
- [P] Accessible au seul professeur correcteur (AUTH-06).

**Critères d'acceptation.**
- Étant donné une copie image transcrite, quand le professeur l'ouvre, alors le texte est affiché avec la mention de transcription automatique et l'image est masquée.
- Étant donné une action explicite du professeur, alors l'image apparaît à côté du texte.
- Étant donné une copie remise en texte collé, alors aucun bloc image n'est affiché.
- Étant donné un autre professeur ou un élève, quand il tente d'ouvrir la transcription, alors l'accès est refusé.

**Dépend de :** TRX-01, REV-05, SUB-03 · **Problèmes :** P3 · **Tests :** intégration, E2E

#### TRX-04 — Corriger la transcription et relancer l'évaluation
*Acteur : Professeur · Priorité : MVP · Étape : E11 · Origine : F7, F10 · Statut : proposition*

**Énoncé.** Le professeur peut corriger ou saisir la transcription et relancer l'évaluation afin qu'une erreur de lecture ne devienne pas une erreur de note.

**Règles de gestion.**
- [P] La correction est conservée comme version distincte de la sortie du moteur, avec l'origine « professeur ».
- [P] La convention de transcription (fautes conservées, marqueur [illisible]) est affichée sur l'écran d'édition. L'écart entre la sortie du moteur et la version du professeur est affiché et journalisé.
- [P] Une correction rend la proposition IA courante périmée (avertissement) et permet de la relancer ; l'ancienne reste conservée comme non courante.
- [P] Une correction ne peut jamais écraser l'évaluation du professeur déjà commencée : même bandeau et même choix explicite que pour SUB-04.
- [P] L'élève ne peut pas corriger la transcription, sinon il corrigerait ses propres fautes (Mechanics).
- [Q15] À confirmer.

**Critères d'acceptation.**
- Étant donné une transcription corrigée, quand le professeur relance l'évaluation, alors une nouvelle proposition est produite sur le texte corrigé.
- Étant donné une extraction échouée, quand le professeur saisit la transcription, alors l'évaluation démarre.
- Étant donné une correction, alors la version du moteur reste consultable, l'écran d'édition affiche la convention, l'écart est journalisé et la version porte l'origine « professeur ».
- Étant donné une évaluation du professeur déjà commencée, quand la transcription est corrigée, alors le bandeau impose un choix tracé.
- Étant donné un compte élève, quand il tente de modifier la transcription, alors l'action est refusée.

**Dépend de :** TRX-03, EVL-02, REV-06 · **Problèmes :** P3 · **Tests :** intégration, E2E

### 6.6 Module EVL — Évaluation par l'IA

L'IA propose, selon la rubrique unique et fixe, un niveau par critère, des remarques et une note. Elle ne décide jamais seule.

#### EVL-01 — Rubrique unique, fixe et versionnée
*Acteur : Système · Priorité : MVP · Étape : E1 · Origine : F8 · Statut : décision utilisateur (versionnage en proposition)*

**Énoncé.** Le système applique une seule rubrique (5 critères pondérés à 20 %, niveaux de 0 à 4) à toutes les évaluations, sans qu'aucun professeur ne puisse la modifier.

**Règles de gestion.**
- [D] Rubrique unique et fixe pour l'anglais et le français, tous les niveaux scolaires, tous les professeurs.
- [D] Critères : Task Achievement / Content, Organization & Cohesion, Vocabulary Range & Accuracy, Grammatical Range & Accuracy, Mechanics ; 20 % chacun.
- [D] Les professeurs ne peuvent pas la modifier.
- [P] La version de la rubrique est enregistrée avec chaque évaluation ; la rubrique est consultable par le professeur et l'élève.
- [Q11] Libellés anglais de l'annexe de solution.md ; libellés français en attente de validation par le client.

**Critères d'acceptation.**
- Étant donné un professeur ou un élève, quand il tente de modifier la rubrique par l'interface ou l'API, alors l'action est refusée.
- Étant donné une évaluation, alors la version de rubrique utilisée est enregistrée.
- Étant donné la rubrique, alors elle comporte exactement 5 critères de 20 % et 5 niveaux de 0 à 4.

**Dépend de :** — · **Problèmes :** P2 · **Tests :** unitaire, intégration

#### EVL-02 — Proposition d'évaluation par critère
*Acteur : Système · Priorité : MVP · Étape : E1 (module), branché en E7 · Origine : F8 · Statut : décision utilisateur*

**Énoncé.** Pour chaque remise, le système fait proposer par un LLM un niveau de 0 à 4 pour chacun des cinq critères de la rubrique, avec une justification.

**Règles de gestion.**
- [D] La remise est évaluée selon la rubrique par un LLM.
- [D] L'IA propose, le professeur décide.
- [P] Entrée de l'IA : texte de référence, sujet, instructions, langue, rubrique ; rien d'autre (EVL-05). Le niveau du devoir n'en fait pas partie (Q4).
- [P] Une seule proposition courante par remise (idempotence).
- [P] Aucune garantie de reproductibilité absolue : la stabilité se mesure (QLT-02).

**Critères d'acceptation.**
- Étant donné un texte disponible, quand l'évaluation se termine, alors 5 niveaux entiers de 0 à 4 et 5 justifications non vides sont présents.
- Étant donné un devoir en français ou en anglais, alors la version de rubrique correspondante est appliquée.
- Étant donné un double déclenchement avec la même clé, alors une seule proposition reste courante.
- Rejoués en E7 sur de vraies remises : double déclenchement d'une même remise ; panne du service IA sans perte de remise (PRC-04).

**Dépend de :** EVL-01 · **Problèmes :** P1, P2 · **Tests :** unitaire, intégration, évaluation IA

#### EVL-03 — Remarques de l'évaluation
*Acteur : Système · Priorité : MVP · Étape : E1 · Origine : F9 · Statut : décision utilisateur*

**Énoncé.** Chaque proposition d'évaluation comporte des remarques : une justification par critère appuyée sur le texte, un commentaire général et des pistes d'amélioration.

**Règles de gestion.**
- [D] Une note est donnée avec des remarques.
- [P] Les extraits cités existent mot pour mot dans le texte évalué (contrôle automatique, EVL-06).
- [P] Langue des remarques : celle du devoir par défaut (Q7).
- [P] Ton neutre, centré sur le texte et non sur la personne.

**Critères d'acceptation.**
- Étant donné une proposition, alors chaque critère a une remarque non vide et un commentaire général existe.
- Étant donné une citation dans une remarque, alors elle est trouvée à l'identique dans le texte évalué.
- Étant donné une remarque, alors elle ne contient aucune donnée d'identité de l'élève.

**Dépend de :** EVL-02 · **Problèmes :** P1, P2 · **Tests :** unitaire, évaluation IA

#### EVL-04 — Calcul de la note à partir des cinq niveaux
*Acteur : Système · Priorité : MVP · Étape : E1 · Origine : F9 · Statut : proposition*

**Énoncé.** Le système calcule la note de chaque évaluation à partir des cinq niveaux par une formule fixe, jamais produite par le LLM.

**Règles de gestion.**
- [D] Une note est donnée après l'évaluation (F9).
- [P] Note sur 20 égale à la somme des 5 niveaux (0 à 20) ; sur 100 : cinq fois la somme ; format à confirmer (Q5a).
- [P] Pas de demi-point ; 21 valeurs possibles sur 20.
- [P] La note est recalculée à chaque modification d'un niveau.

**Critères d'acceptation.**
- Test exhaustif des 3125 combinaisons de niveaux : note égale à la somme, bornée de 0 à 20.
- Tous niveaux à 0 donne 0 ; tous à 4 donne 20 ; (0, 4, 0, 4, 0) donne 8.
- Étant donné une modification d'un niveau par le professeur, alors la note affichée est recalculée (rejoué en E9).

**Dépend de :** EVL-02 · **Problèmes :** P2 · **Tests :** unitaire

#### EVL-05 — Aucune donnée d'identité transmise à l'IA
*Acteur : Système · Priorité : MVP · Étape : E3 · Origine : F8 · Statut : décision utilisateur*

**Énoncé.** Le système ne transmet à l'IA aucune donnée d'identité de l'élève : sa proposition est établie sans donnée d'identité, ce qui ne la rend pas pour autant neutre (voir constat C10).

**Règles de gestion.**
- [D] Ne pas transmettre l'identité de l'élève à l'IA (solution.md, points reportés).
- [P] Jamais transmis : nom, prénom, email, classe, professeur, établissement, identifiant persistant ; un identifiant de soumission aléatoire sert de lien technique. Un point de sortie unique construit la requête en liste blanche.
- [P] Limite assumée : un nom écrit dans la copie ou dans le texte collé peut atteindre l'IA ; 100 % n'est pas garanti (PRV-02).
- [P] Le taux de productions contenant le nom de l'auteur est mesuré en deux temps (O3b) et rapporté, pour les textes collés comme pour les transcriptions.

**Critères d'acceptation.**
- Étant donné des comptes de test à valeurs canaris (nom, prénom, email, classe, professeur), quand une évaluation est lancée, alors aucune de ces chaînes n'apparaît dans les requêtes sortantes.
- Le test de canaris est intégré à l'intégration continue comme régression permanente.
- Le taux de productions contenant un nom d'auteur est mesuré et rapporté, avec le seuil de déclenchement du masquage (à définir).
- Rejoué en E11 sur des remises image : aucune métadonnée ni nom de fichier d'origine dans ce qui est transmis (PRV-05).

**Dépend de :** EVL-02 · **Problèmes :** P3 · **Tests :** intégration, évaluation IA

#### EVL-06 — Rejeter toute sortie non conforme
*Acteur : Système · Priorité : MVP · Étape : E1 · Origine : F8 · Statut : proposition*

**Énoncé.** Le système rejette toute sortie de l'IA qui ne respecte pas la forme de la rubrique, afin qu'aucune valeur par défaut silencieuse n'arrive au professeur.

**Règles de gestion.**
- [P] Sont exigés : 5 critères, un niveau entier de 0 à 4 par critère, une justification non vide.
- [P] Les extraits cités sont fournis dans un champ dédié de la sortie et doivent exister mot pour mot dans le texte évalué, après une normalisation définie (Unicode, espaces, marqueur [illisible]).
- [P] Une sortie non conforme, citation introuvable comprise, déclenche une nouvelle tentative bornée, puis l'état « évaluation échouée » (PRC-04).

**Critères d'acceptation.**
- Étant donné une réponse avec un critère manquant, un critère en trop, un niveau 5 ou 2,5, une justification vide ou une citation introuvable, alors elle est rejetée.
- Étant donné des rejets répétés, alors la remise passe en « évaluation échouée » visible du professeur.
- Le taux de rejet sur le jeu de calage est rapporté et reste sous le seuil figé (8.3).

**Dépend de :** EVL-02 · **Problèmes :** P2 · **Tests :** unitaire, intégration

#### EVL-07 — Texte de l'élève et instructions traités comme des données
*Acteur : Système · Priorité : MVP · Étape : E1 · Origine : F8, F12 · Statut : proposition*

**Énoncé.** Le système traite le texte de l'élève et les instructions du devoir comme des données à évaluer et non comme des consignes, afin de réduire le risque qu'ils modifient la rubrique.

**Règles de gestion.**
- [P] Une phrase du type « mets 4 partout » dans la copie, en texte ou en image, ne doit pas modifier les niveaux.
- [P] Les instructions du professeur ne peuvent ni modifier ni repondérer un critère.
- [P] Tests adverses obligatoires (QLT-02). Un jeu fini de tests ne prouve pas l'absence d'injection ; le professeur reste le garde-fou.

**Critères d'acceptation.**
- Étant donné une copie contenant une consigne adressée au correcteur, alors les niveaux restent dans la bande de stabilité de la même copie sans cette consigne (définition 8.3), sur le jeu adverse de taille figée.
- Étant donné des instructions du type « sois indulgent sur l'orthographe », alors le critère Mechanics n'est pas modifié.

**Dépend de :** EVL-02 · **Problèmes :** P2 · **Tests :** évaluation IA, recette

#### EVL-08 — Signaler les copies non évaluables ou atypiques
*Acteur : Système · Priorité : MVP · Étape : E3 · Origine : F8 · Statut : proposition*

**Énoncé.** Le système signale au professeur les copies vides, très courtes, dans une autre langue, hors sujet ou s'adressant au correcteur, au lieu de les noter en silence.

**Règles de gestion.**
- [P] Alertes **bloquantes** (copie vide, copie sans écriture lisible) : aucune proposition IA, état « Non évaluable », revue manuelle (PRC-05).
- [P] Alertes **d'information** (la proposition est produite) : copie très courte (seuil à définir), langue différente de celle du devoir, hors sujet, texte s'adressant au correcteur. Un hors-sujet reste notable par la rubrique (Task Achievement niveau 0).
- [P] Alertes visibles du seul professeur ; jamais publiées à l'élève.
- [P] Aucune note 0 automatique pour une copie sans contenu : décision laissée au professeur.
- [P] Précision et rappel de chaque alerte sont mesurés sur le jeu scellé (QLT-02).

**Critères d'acceptation.**
- Étant donné une image sans écriture ou un texte vide, alors la copie est signalée, passe en « Non évaluable » et aucune note n'est proposée.
- Étant donné un texte dans une autre langue que celle du devoir, alors une alerte « langue non conforme » s'affiche et la proposition est produite.
- Étant donné une alerte, alors elle n'apparaît dans aucune vue de l'élève (balayage en E6, rejoué en E9).

**Dépend de :** EVL-02 · **Problèmes :** P2 · **Tests :** intégration, évaluation IA

#### EVL-09 — Évaluation des devoirs en français conditionnée à la rubrique française validée
*Acteur : Système · Priorité : à décider (Q11) · Étape : E3 · Origine : F12, F8 · Statut : proposition*

**Énoncé.** Le système n'active l'évaluation IA des devoirs en français que lorsque la version française de la rubrique est validée par le client.

**Règles de gestion.**
- [P] Le devoir en français reste créable. Tant que la rubrique française n'est pas validée, la remise passe à l'état « Non évaluable / IA indisponible » avec la cause « rubrique française non validée » et le professeur l'évalue manuellement (PRC-05) : ce cas n'est pas un échec technique et ne déclenche aucune relance.
- [P] La rubrique française garde les mêmes codes de critères et les mêmes niveaux (Mechanics : accents, accords).
- [Q11] Livraison par langue acceptée ou non. Le canal image en français reste fermé tant que des copies manuscrites en français n'ont pas été mesurées (QLT-03).

**Critères d'acceptation.**
- Étant donné une rubrique française non validée, quand une remise en français est reçue, alors aucune proposition IA n'est produite, la copie est « Non évaluable » avec sa cause et le professeur en est informé.
- Étant donné la rubrique française validée, alors l'évaluation française s'exécute et son accord est mesuré séparément de l'anglais.

**Dépend de :** EVL-01 · **Problèmes :** P2 · **Tests :** intégration, évaluation IA

#### EVL-10 — Tracer chaque exécution de l'IA
*Acteur : Système · Priorité : MVP · Étape : E1 · Origine : F8 · Statut : proposition*

**Énoncé.** Le système enregistre, pour chaque évaluation IA, le modèle, la version de la consigne, la version de la rubrique et le texte évalué, afin de pouvoir comparer et mesurer.

**Règles de gestion.**
- [P] L'évaluation IA est immuable ; une relance crée une nouvelle exécution, l'ancienne reste conservée comme non courante.
- [P] Aucun changement de modèle ou de consigne silencieux : tout changement est une version nouvelle.
- [P] Lisible du seul professeur correcteur.

**Critères d'acceptation.**
- Étant donné une évaluation, alors modèle, consigne, rubrique, texte évalué et date sont enregistrés.
- Étant donné une relance, alors deux exécutions existent dont une seule courante.
- Étant donné une modification du professeur, alors l'évaluation IA d'origine n'est pas altérée.

**Dépend de :** EVL-02 · **Problèmes :** P2 · **Tests :** unitaire, intégration

### 6.7 Module PRC — Traitement des remises

Enchaîner automatiquement extraction et évaluation pour plusieurs copies à la fois, avec états visibles, échecs gérés et repli manuel.

#### PRC-01 — Traiter automatiquement chaque remise
*Acteur : Système · Priorité : MVP · Étape : E7 (texte), branche image en E11 · Origine : F7, F8 · Statut : proposition*

**Énoncé.** Le système lance automatiquement l'extraction puis l'évaluation de chaque remise confirmée, sans action du professeur.

**Règles de gestion.**
- [D] L'application gère la lecture de l'écriture et le temps de correction.
- [P] Déclenchement à la remise (alternative : à l'échéance, à la demande du professeur).
- [P] Une copie texte saute l'extraction.
- [P] Idempotence : un déclenchement répété ne crée pas de doublon.
- [P] Le point de sortie vers l'IA est celui d'EVL-05 (liste blanche).

**Critères d'acceptation.**
- Étant donné une remise texte, alors l'évaluation démarre sans extraction et la remise atteint « à valider » sans intervention.
- Étant donné un double déclenchement, alors un seul traitement est actif.
- Rejoué en E11 : étant donné une remise image confirmée, alors extraction puis évaluation s'enchaînent jusqu'à « à valider » sans intervention.

**Dépend de :** SUB-02, EVL-02 ; branche image : SUB-03, TRX-01 · **Problèmes :** P1 · **Tests :** intégration, E2E

#### PRC-02 — Traiter plusieurs copies à la fois
*Acteur : Système · Priorité : MVP · Étape : E7 (texte), charge mixte en E11 · Origine : décision validée (solution §2, plusieurs copies à la fois) · Statut : décision utilisateur*

**Énoncé.** Le système traite plusieurs copies simultanément afin qu'un lot d'une centaine de remises soit prêt à relire dans un délai court.

**Règles de gestion.**
- [D] L'application traite plusieurs copies à la fois.
- [P] Chaque soumission suit son propre cycle ; l'échec de l'une ne bloque aucune autre.
- [P] Critère de passage : au moins 95 % de 100 remises à l'état « à valider » dans les 30 minutes suivant le dernier dépôt (valeur de travail, 8.3). Une copie en échec visible n'est pas comptée comme prête.
- [P] Le test utilise le fournisseur d'IA réel, avec des textes autorisés ou synthétiques : un fournisseur simulé ne valide ni les limites de débit ni le délai.
- [P] Aucune remise perdue ni mal attribuée ; l'ordre d'arrivée n'influence pas le résultat.

**Critères d'acceptation.**
- Étant donné 100 remises déposées en parallèle par 100 comptes, alors au moins 95 % sont « à valider » dans le délai, les autres en erreur visible, et aucune n'est perdue.
- Étant donné un marqueur unique dans chaque texte, alors chaque résultat ne cite que le contenu de sa propre copie.
- Étant donné la panne d'un composant en plein lot, alors le traitement reprend sans perte ni doublon.
- Si le seuil n'est pas tenu, le résultat est déclaré « non atteint » et l'écart est documenté.

**Dépend de :** PRC-01 · **Problèmes :** P1 · **Tests :** intégration, E2E, recette

#### PRC-03 — Suivre l'état de chaque soumission
*Acteur : Professeur · Priorité : MVP · Étape : E7 · Origine : F13 · Statut : proposition*

**Énoncé.** Le professeur peut voir l'état de traitement de chaque soumission afin de savoir où agir.

**Règles de gestion.**
- [P] États détaillés en 5.4 : remise, extraction, évaluation, non évaluable, à valider, validée, publiée, en échec.
- [P] Compteurs des copies « à valider », « en échec » et « non évaluable » dans l'espace du professeur.
- [P] L'état est filtrable (REV-03).

**Critères d'acceptation.**
- Étant donné une soumission en cours d'évaluation, alors le professeur voit l'état correspondant.
- Étant donné 3 copies en échec, alors le compteur indique 3.
- Étant donné une copie « non évaluable », alors elle apparaît dans son propre compteur, distinct des échecs.
- Les états « validée » et « publiée » sont rejoués en E9 et E10.

**Dépend de :** PRC-01, AUTH-06 · **Problèmes :** P1 · **Tests :** intégration, E2E

#### PRC-04 — Gérer les échecs d'extraction et d'évaluation
*Acteur : Système · Priorité : MVP · Étape : E7 · Origine : F7, F8 · Statut : proposition*

**Énoncé.** Le système gère les échecs de traitement par des relances bornées et une relance manuelle du professeur, afin qu'aucune copie ne reste bloquée sans que personne le sache.

**Règles de gestion.**
- [P] Nombre de tentatives automatiques borné ; durée maximale par étape (8.3).
- [P] États « extraction échouée » et « évaluation échouée » visibles du professeur, jamais de l'élève.
- [P] Relance manuelle possible ; repli par PRC-05.

**Critères d'acceptation.**
- Étant donné un échec technique répété, alors la remise passe en « échec » visible du professeur après N tentatives.
- Étant donné une relance manuelle réussie, alors la remise reprend son cycle.
- Étant donné un échec, alors l'élève voit seulement « Remis, en cours de correction ».

**Dépend de :** PRC-01, PRC-03 · **Problèmes :** P1 · **Tests :** unitaire, intégration

#### PRC-05 — Évaluer une copie manuellement sans proposition IA, ou la retourner
*Acteur : Professeur · Priorité : MVP · Étape : E9 · Origine : F10 · Statut : proposition*

**Énoncé.** Le professeur peut évaluer une copie sans proposition de l'IA, avec le même formulaire de rubrique, quand l'extraction ou l'évaluation échoue ou que la copie est non évaluable, ou la retourner à l'élève pour un nouveau dépôt.

**Règles de gestion.**
- [P] Même formulaire de rubrique : 5 niveaux et remarques ; note calculée (EVL-04).
- [P] Si l'image est inexploitable, le professeur peut retourner la copie avec un message ; l'élève voit « À redéposer » (SUB-05).
- [P] L'évaluation manuelle est tracée comme telle.

**Critères d'acceptation.**
- Étant donné une copie en « évaluation échouée » ou « non évaluable », quand le professeur saisit 5 niveaux et des remarques, alors la copie passe à « à valider ».
- Étant donné une image inexploitable, quand le professeur retourne la copie avec un message, alors l'élève voit « À redéposer » avec ce message et peut redéposer.
- Étant donné une copie en français sans rubrique française validée, alors le professeur l'évalue avec le même formulaire (EVL-09).

**Dépend de :** PRC-04, EVL-04 · **Problèmes :** P1 · **Tests :** intégration, E2E

#### PRC-06 — Mesurer durées, taux d'échec et coût par copie
*Acteur : Système · Priorité : MVP · Étape : E7 · Origine : O1, O5 · Statut : proposition*

**Énoncé.** Le système enregistre la durée de chaque étape de traitement, le nombre de tentatives, les échecs et le coût par copie, afin de mesurer O1 et O5 sans reconstitution manuelle.

**Règles de gestion.**
- [P] Pour chaque soumission : durée de chaque étape (extraction, évaluation), tentatives, échecs, coût des appels aux prestataires.
- [P] Données techniques sans donnée d'identité, consultables par l'équipe projet.
- [P] Le rapport donne médiane et 90e centile par étape, taux d'échec et coût moyen par copie.

**Critères d'acceptation.**
- Étant donné un lot traité, alors un rapport donne la durée médiane et au 90e centile par étape, le taux d'échec et le coût moyen par copie.
- Étant donné une relance, alors les durées de chaque exécution sont enregistrées séparément.

**Dépend de :** PRC-01 · **Problèmes :** P1 · **Tests :** intégration

### 6.8 Module REV — Revue par le professeur

Liste, tri, consultation, supervision, modification et validation des évaluations. Le professeur est le seul décideur.

#### REV-01 — Liste des soumissions d'un devoir
*Acteur : Professeur · Priorité : MVP · Étape : E8 · Origine : F13 · Statut : décision utilisateur (compléments en proposition)*

**Énoncé.** Le professeur peut consulter, pour un devoir, la liste des élèves des classes ciblées avec l'état de leur soumission.

**Règles de gestion.**
- [D] La partie « soumissions » de l'espace professeur affiche les soumissions de chaque élève ; l'identité n'est pas masquée.
- [P] La liste montre tous les élèves ciblés, y compris les « non remis » et les « en retard ».
- [P] Un élève présent dans plusieurs classes ciblées est listé une seule fois, avec ses classes, et compté une fois dans les totaux du devoir ; le regroupement ou le filtre par classe le montre dans chacune.
- [P] Regroupement par classe ; compteur « à valider ».
- [P] Le mode de remise (texte ou image) est affiché pour chaque remise (Q10).
- [P] Le périmètre est limité aux devoirs du professeur (AUTH-06).

**Critères d'acceptation.**
- Étant donné un devoir envoyé à C1 avec 5 remises sur 8 élèves, alors la liste contient 8 lignes dont 3 « non remis ».
- Étant donné un élève retiré de la classe, alors ses remises existantes restent listées pour ce professeur.
- Étant donné un élève membre de deux classes ciblées, alors une seule ligne est affichée et le total le compte une fois.
- Étant donné une remise texte et une remise image, alors le mode de remise est affiché pour chacune.
- Étant donné un autre professeur, alors la liste est inaccessible.

**Dépend de :** ASG-02, ASG-06, SUB-02, PRC-03, AUTH-06 · **Problèmes :** P1 · **Tests :** intégration, E2E

#### REV-02 — Trier les soumissions par note, date ou ordre alphabétique
*Acteur : Professeur · Priorité : MVP · Étape : E8 · Origine : F13 · Statut : décision utilisateur (compléments en proposition)*

**Énoncé.** Le professeur peut trier la liste des soumissions par note, par date de soumission ou par ordre alphabétique.

**Règles de gestion.**
- [D] Tri par note, par date de soumission ou par ordre alphabétique.
- [P] Sens inversable par un second clic ; défauts : note décroissante, date de remise la plus récente d'abord, ordre alphabétique A vers Z.
- [P] Tri par note : note validée sinon proposition IA marquée « provisoire » ; les copies sans note restent en fin de liste dans les deux sens, jamais comptées comme 0.
- [P] Tri alphabétique : nom puis prénom, insensible à la casse et aux accents, noms composés et apostrophes gérés.
- [P] Tri par date : horodatage serveur de la version active ; départage déterministe ; le tri porte sur toute la liste.

**Critères d'acceptation.**
- Étant donné 150 remises, quand le professeur trie par note, alors l'ordre porte sur les 150 et non sur la page affichée.
- Étant donné des copies sans note, alors elles sont en fin de liste.
- Étant donné les noms « Émile », « Eric » et « d'Aubigné », alors l'ordre alphabétique est insensible aux accents et à la casse.
- Étant donné deux notes égales, alors l'ordre est départagé de façon stable.
- Étant donné un second clic sur le critère, alors l'ordre s'inverse et les copies sans note restent en fin de liste.
- Rejoué en E9 : le tri par note distingue note validée et proposition provisoire sur de vrais états.

**Dépend de :** REV-01 · **Problèmes :** P1 · **Tests :** unitaire, intégration, E2E

#### REV-03 — Filtrer la liste par classe et par état
*Acteur : Professeur · Priorité : MVP · Étape : E8 · Origine : F13 · Statut : proposition*

**Énoncé.** Le professeur peut filtrer la liste des soumissions par classe et par état afin de traiter d'abord ce qui est à valider ou en échec.

**Règles de gestion.**
- [P] Filtres : classe, état (non remis, en retard, à valider, en échec, non évaluable, validée, publiée).
- [P] Les filtres se combinent avec les tris.

**Critères d'acceptation.**
- Étant donné un filtre « à valider », alors seules ces soumissions sont listées.
- Étant donné un filtre de classe combiné à un tri par date, alors le résultat respecte les deux.
- Les filtres « validée » et « publiée » sont rejoués en E9 et E10.

**Dépend de :** REV-01 · **Problèmes :** P1 · **Tests :** intégration, E2E

#### REV-04 — Ouvrir la copie d'un élève par un clic sur son nom
*Acteur : Professeur · Priorité : MVP · Étape : E8 · Origine : F13 · Statut : décision utilisateur (lecture à confirmer, Q16)*

**Énoncé.** Le professeur peut ouvrir la soumission d'un élève en cliquant sur son nom dans la liste afin de la superviser.

**Règles de gestion.**
- [D] Un clic sur le nom de l'élève ouvre sa soumission.
- [Q16] Lecture retenue : la copie de cet élève pour CE devoir, pas un dossier historique de l'élève.
- [P] Un clic sur un élève « non remis » ouvre une page de statut (« Non remis », échéance) sans action de correction.
- [P] Navigation « copie suivante » dans la liste, sans quitter l'écran de revue.

**Critères d'acceptation.**
- Étant donné un clic sur un nom, alors s'ouvre la copie de cet élève pour ce devoir.
- Étant donné deux élèves homonymes, alors chaque clic ouvre la bonne copie.
- Étant donné la copie ouverte, alors aucune note ni moyenne antérieure de l'élève n'est affichée.
- Étant donné un élève « non remis », alors la page de statut s'ouvre sans formulaire d'évaluation.

**Dépend de :** REV-01, REV-05 · **Problèmes :** P1, P3 · **Tests :** intégration, E2E

#### REV-05 — Consulter une copie et la proposition de l'IA
*Acteur : Professeur · Priorité : MVP · Étape : E8 · Origine : F10 · Statut : décision utilisateur*

**Énoncé.** Le professeur peut consulter une copie avec sa transcription, la proposition de l'IA, les remarques et les alertes afin de la superviser.

**Règles de gestion.**
- [D] Le professeur consulte chaque résultat de production écrite et le supervise.
- [P] Écran de revue : texte de la copie (image à la demande pour une copie image, TRX-03), mode de remise, 5 niveaux avec justifications, remarques, note, alertes (EVL-08).
- [P] Cet écran n'affiche pas l'historique de notes de l'élève, pour ne pas ajouter de halo.
- [P] La proposition IA d'origine n'est pas modifiable.

**Critères d'acceptation.**
- Étant donné une copie texte « à valider », quand le professeur l'ouvre, alors il voit le texte seul, sans bloc image, avec 5 niveaux, justifications, remarques, alertes et mode de remise.
- Étant donné une copie d'un autre professeur, alors l'ouverture est refusée.
- Étant donné une copie image, alors texte d'abord et image à la demande (rejoué en E11).

**Dépend de :** EVL-03, EVL-04 ; copie image : TRX-03 · **Problèmes :** P1, P3 · **Tests :** intégration, E2E

#### REV-06 — Modifier les niveaux et les remarques
*Acteur : Professeur · Priorité : MVP · Étape : E9 · Origine : F10 · Statut : décision utilisateur*

**Énoncé.** Le professeur peut modifier les niveaux par critère et les remarques de l'évaluation, la note étant recalculée.

**Règles de gestion.**
- [D] Le professeur modifie librement l'évaluation.
- [P] Niveau entier de 0 à 4 par critère ; la note est recalculée (EVL-04).
- [P] Indicateur « modifié » par critère ; la valeur de l'IA reste lisible en lecture seule.
- [P] L'évaluation du professeur référence la version du texte sur laquelle elle a été commencée.
- [P] Conflit de sessions signalé, pas de perte silencieuse.
- [Q5b] La modification de la note globale seule est traitée séparément (REV-10).

**Critères d'acceptation.**
- Étant donné un niveau modifié, alors la note est recalculée et l'indicateur « modifié » apparaît.
- Étant donné un niveau hors de 0 à 4, alors la saisie est refusée.
- Étant donné deux sessions du même professeur sur la même copie, alors un conflit est signalé.

**Dépend de :** REV-05, EVL-04 · **Problèmes :** — · **Tests :** unitaire, intégration, E2E

#### REV-07 — Valider l'évaluation
*Acteur : Professeur · Priorité : MVP · Étape : E9 · Origine : F10, F6 · Statut : décision utilisateur*

**Énoncé.** Le professeur peut valider une évaluation, telle quelle ou modifiée, afin de la reconnaître comme sienne.

**Règles de gestion.**
- [D] L'élève ne voit la note qu'après validation (F6).
- [P] La validation est un acte distinct de la publication (Q6).
- [P] Exige 5 niveaux complets ; une copie jamais évaluée ne se valide pas.
- [P] Réouverture possible ; la validation devient alors caduque.
- [P] Chaque validation est tracée (auteur, date, « sans modification » ou « après modification »).

**Critères d'acceptation.**
- Étant donné une copie « à valider », quand le professeur valide, alors l'état devient « validée » avec auteur et date.
- Étant donné une copie en échec sans évaluation, alors la validation est refusée.
- Étant donné une validation rouverte, alors la copie repasse à « à valider ».

**Dépend de :** REV-06 · **Problèmes :** P1, P2 · **Tests :** unitaire, intégration, E2E

#### REV-08 — Conserver la proposition d'origine et le journal des modifications
*Acteur : Système · Priorité : MVP · Étape : E9 · Origine : F10 · Statut : proposition*

**Énoncé.** Le système conserve la proposition IA d'origine à côté de la version du professeur, avec le journal de ses actions, afin de pouvoir mesurer la concordance IA/professeur et le temps de revue.

**Règles de gestion.**
- [D] Il faut mesurer la tendance du professeur à suivre la proposition de l'IA (solution.md).
- [P] Journal : auteur, date, valeur avant/après des niveaux, remarques, validations, décisions de visibilité, ouverture et fermeture de la copie, correction de transcription avec son écart.
- [P] Temps de revue : de l'ouverture de la copie à sa validation (O1) ; le temps actif est ajouté si la mesure est possible.
- [P] Non modifiable par le professeur ni par l'élève ; non visible de l'élève.
- [Q14] Export pseudonymisé pour l'équipe projet ; usage agrégé et non nominatif tant que le client n'en décide pas autrement. Ces indicateurs mesurent une concordance, pas l'ancrage.

**Critères d'acceptation.**
- Étant donné une modification, alors le journal contient l'ancienne et la nouvelle valeur avec auteur et date.
- Étant donné une validation, alors sa nature est enregistrée.
- Étant donné l'ouverture puis la validation d'une copie, alors le journal contient les deux événements horodatés et le temps de revue en découle.
- Étant donné une correction de transcription, alors l'événement et son écart sont journalisés.
- Étant donné un export pour l'équipe projet, alors professeurs et élèves sont remplacés par des identifiants aléatoires.
- Étant donné un élève, alors le journal est inaccessible.

**Dépend de :** EVL-10, REV-06 · **Problèmes :** P2, P3 · **Tests :** intégration

#### REV-09 — Séparer les remarques pour l'élève et les notes internes
*Acteur : Professeur · Priorité : MVP · Étape : E9 · Origine : F9, F10 · Statut : proposition*

**Énoncé.** Le professeur dispose de deux champs distincts : « remarques pour l'élève » (publiées) et « notes internes et alertes » (jamais publiées).

**Règles de gestion.**
- [P] Les alertes IA et les notes internes ne sont jamais visibles de l'élève.
- [P] Les remarques pour l'élève sont éditables avant publication.
- [Q7] Langue et contenu visibles de l'élève à confirmer.

**Critères d'acceptation.**
- Étant donné une alerte « langue non conforme » ou « texte s'adressant au correcteur », alors elle ne figure dans aucun résultat publié.
- Étant donné une remarque pour l'élève modifiée, alors c'est la version modifiée qui est publiée.

**Dépend de :** REV-06, EVL-08 · **Problèmes :** — · **Tests :** intégration, E2E

#### REV-10 — Ajuster directement la note globale
*Acteur : Professeur · Priorité : à décider (Q5b) · Étape : E15 si retenue · Origine : F10 · Statut : proposition*

**Énoncé.** Le professeur peut ajuster la note globale indépendamment des niveaux, avec une justification obligatoire.

**Règles de gestion.**
- [D] F10 dit « modifier la note » ; la rubrique impose que la note découle des niveaux (Q5b).
- [P] Si retenu : ajustement explicite, justifié, tracé et affiché distinctement de la note calculée ; l'élève voit la cohérence ou l'écart.
- [P] Par défaut (recommandé) : non, la note ne se modifie qu'en modifiant les niveaux. Si Q5b répond oui, cette fonction est avancée en E9.

**Critères d'acceptation.**
- Étant donné cette fonction activée, quand le professeur ajuste la note sans justification, alors l'ajustement est refusé.
- Étant donné un ajustement, alors la note calculée reste visible à côté de la note ajustée dans le journal.

**Dépend de :** REV-06 · **Problèmes :** — · **Tests :** unitaire, intégration

#### REV-11 — Valider plusieurs copies en lot, avec friction
*Acteur : Professeur · Priorité : V2 · Étape : E15 · Origine : F10 · Statut : proposition*

**Énoncé.** Le professeur peut valider plusieurs copies à la fois sous conditions, afin de gagner du temps sans valider à l'aveugle.

**Règles de gestion.**
- [P] Réservé aux copies sans alerte et déjà ouvertes, par exemple.
- [P] Consigné comme « validée par lot » dans le journal.
- [Q14] Niveau de friction acceptable.

**Critères d'acceptation.**
- Étant donné une sélection incluant une copie avec alerte, alors cette copie est exclue ou la validation est refusée.
- Étant donné une validation en lot, alors le journal la marque comme telle.

**Dépend de :** REV-07, REV-08 · **Problèmes :** P1 · **Tests :** intégration, E2E

#### REV-12 — Indicateurs de concordance IA/professeur
*Acteur : Administrateur ou équipe projet (agrégé) · Priorité : V2 · Étape : E15 · Origine : F10 · Statut : proposition*

**Énoncé.** Le système calcule dans l'application des indicateurs agrégés (copies validées sans modification, écart IA/final par critère, temps par copie, concordance selon le rang de la copie dans la séance).

**Règles de gestion.**
- [D] Mesurer la tendance du professeur à suivre l'IA (solution.md).
- [P] À usage de mesure du produit, non d'évaluation du professeur.
- [P] Au pilote, ces mesures viennent d'un export du journal traité hors produit par l'équipe projet : REV-12 n'est pas un prérequis du pilote.
- [Q14] Qui voit les indicateurs ; usage nominatif ou agrégé.

**Critères d'acceptation.**
- Étant donné un jeu de validations, alors les indicateurs sont calculés à partir du journal.
- Étant donné un utilisateur non autorisé, alors les indicateurs sont inaccessibles.

**Dépend de :** REV-08 · **Problèmes :** P2, P3 · **Tests :** unitaire, intégration

### 6.9 Module PUB — Publication et consultation par l'élève

Rendre le résultat visible de l'élève uniquement après validation et autorisation du professeur.

#### PUB-01 — Autoriser la visibilité du résultat pour l'élève
*Acteur : Professeur · Priorité : MVP · Étape : E10 · Origine : F11 · Statut : décision utilisateur (compléments en proposition)*

**Énoncé.** Le professeur peut autoriser la visibilité de la note et de l'évaluation validées dans l'espace personnel de l'élève.

**Règles de gestion.**
- [D] Le professeur autorise la visibilité de la note dans l'espace personnel de l'élève.
- [D] Seul un résultat validé peut être autorisé (F6).
- [P] La publication est un acte distinct de la validation, avec raccourci « valider et publier » (Q6).
- [P] Jamais de publication automatique, ni par délai ni par défaut.
- [P] Action tracée ; idempotente.

**Critères d'acceptation.**
- Étant donné une copie validée, quand le professeur autorise, alors elle est publiée et l'élève la voit.
- Étant donné une copie non validée, quand le professeur tente d'autoriser, alors l'action est refusée en interface et en API.
- Étant donné un élève, quand il tente de s'autoriser par requête forgée, alors l'action est refusée.
- Étant donné un double clic, alors une seule publication est enregistrée.

**Dépend de :** REV-07 · **Problèmes :** — · **Tests :** unitaire, intégration, E2E

#### PUB-02 — Consulter sa note et le résultat de l'évaluation
*Acteur : Élève · Priorité : MVP · Étape : E10 · Origine : F6 · Statut : décision utilisateur (périmètre exact, Q7)*

**Énoncé.** L'élève peut consulter la note et le résultat de l'évaluation de sa production écrite après que le professeur l'a validée et autorisée.

**Règles de gestion.**
- [D] L'élève consulte la note et le résultat de l'évaluation après validation et autorisation.
- [P] Contenu : note, niveau et justification par critère, remarques pour l'élève, sa propre copie ; périmètre exact à confirmer (Q7).
- [P] Version du professeur seulement, jamais la proposition IA ni les notes internes.
- [P] Mention « évaluation assistée par IA et validée par votre professeur » (à confirmer, Q7).

**Critères d'acceptation.**
- Étant donné une copie publiée, quand l'élève ouvre le devoir, alors il voit la version du professeur.
- Étant donné une copie publiée de l'élève A, quand l'élève B tente de l'ouvrir, alors l'accès est refusé.
- Étant donné une évaluation modifiée par le professeur avant publication, alors l'élève voit la version modifiée et jamais la proposition d'origine.

**Dépend de :** PUB-01, SUB-01 · **Problèmes :** — · **Tests :** intégration, E2E

#### PUB-03 — Aucun résultat exposé avant publication
*Acteur : Système · Priorité : MVP · Étape : E6 (liste blanche, données fictives), rejoué en E10 avec de vrais résultats · Origine : F6 · Statut : décision utilisateur*

**Énoncé.** Le système n'expose à l'élève aucune note, aucun niveau, aucune remarque ni proposition IA tant que la copie n'est pas publiée.

**Règles de gestion.**
- [D] Pas de visibilité avant validation et autorisation.
- [P] La règle vaut pour l'interface, l'API, les listes, la mémoire des navigateurs et les notifications, pas seulement pour l'affichage.
- [P] Les états internes de traitement ne divulguent aucun résultat. Le modèle de lecture de l'élève est une liste blanche de champs, sans champ de résultat.

**Critères d'acceptation.**
- Étant donné une copie évaluée par l'IA mais non publiée, alors aucune donnée de résultat n'est présente dans le corps des réponses réseau reçues par l'élève (liste, détail, état, messages d'erreur).
- Étant donné une copie validée mais non autorisée, alors l'élève ne voit aucun résultat.
- Étant donné une copie dépubliée (si PUB-04 est retenue), alors le bouton retour ne réaffiche pas le résultat (rejoué en E10).

**Dépend de :** AUTH-06 · **Problèmes :** — · **Tests :** intégration, E2E

#### PUB-04 — Retirer la visibilité et gérer la modification après publication
*Acteur : Professeur · Priorité : à décider (Q6) · Étape : E10 si retenue · Origine : F11 · Statut : proposition*

**Énoncé.** Le professeur peut retirer la visibilité d'un résultat publié ou le corriger, l'élève voyant alors une version à jour datée.

**Règles de gestion.**
- [P] Retrait : l'élève ne voit plus rien.
- [P] Modification après publication : une révision invisible de l'élève est préparée ; la version publiée reste affichée jusqu'à la nouvelle publication, puis la mention « mise à jour le [date] » s'affiche ; l'ancienne valeur reste au journal.
- [Q6] Fonction à confirmer.

**Critères d'acceptation.**
- Étant donné un retrait, alors l'élève ne voit plus le résultat à son prochain accès.
- Étant donné une correction après publication, alors l'élève voit la version à jour avec sa date, jamais l'ancienne note avec de nouvelles remarques.

**Dépend de :** PUB-01 · **Problèmes :** — · **Tests :** intégration, E2E

#### PUB-05 — Publier plusieurs résultats validés en lot
*Acteur : Professeur · Priorité : V2 · Étape : E15 · Origine : F11 · Statut : proposition*

**Énoncé.** Le professeur peut publier en une fois les résultats déjà validés d'un devoir ou d'une classe.

**Règles de gestion.**
- [P] Seules les copies validées sont publiées ; écran de confirmation avec le nombre de copies et le devoir.
- [P] En cas d'échec partiel, rapport explicite des copies publiées et non publiées.

**Critères d'acceptation.**
- Étant donné une sélection de N copies validées, quand le professeur publie, alors exactement ces N sont publiées.
- Étant donné une copie non validée dans la sélection, alors elle n'est pas publiée.

**Dépend de :** PUB-01 · **Problèmes :** P1 · **Tests :** intégration, E2E

### 6.10 Module NTF — Notifications

Signaler les événements utiles sans exposer de résultat.

#### NTF-01 — Notifier par email un nouveau devoir ou un résultat publié
*Acteur : Système · Priorité : V2 · Étape : E14 · Origine : ajoutée (F6, F11) · Statut : proposition*

**Énoncé.** Le système envoie à l'élève un email lors de la réception d'un devoir, lors du retour d'une copie à redéposer et lors de la publication d'un résultat.

**Règles de gestion.**
- [P] L'email ne contient ni note ni remarque ; il renvoie à un lien exigeant la connexion.
- [P] Pour le professeur, un compteur « à valider » dans l'espace plutôt qu'un email par copie.
- [P] Non demandé dans les 15 fonctionnalités ; confort.

**Critères d'acceptation.**
- Étant donné une publication, alors l'email envoyé ne contient aucune donnée de résultat.
- Étant donné un lien de notification ouvert sans session, alors une connexion est exigée.

**Dépend de :** PUB-01, ASG-02 · **Problèmes :** — · **Tests :** intégration

### 6.11 Module PRV — Confidentialité et données

Règles fonctionnelles de protection des données d'élèves, probablement mineurs. Le cadre légal est inconnu : aucune conclusion juridique n'est tirée ici.

#### PRV-01 — Notice d'information avant la première remise
*Acteur : Élève · Priorité : MVP · Étape : E6 (mécanisme), contenu final validé en E12 · Origine : ajoutée (F1, F4, F5) · Statut : proposition*

**Énoncé.** L'élève prend connaissance d'une notice claire avant sa première remise, indiquant les données collectées, l'analyse par une IA fournie par un tiers, la validation par le professeur et les durées de conservation.

**Règles de gestion.**
- [P] Version et date de prise de connaissance enregistrées ; rappel court à chaque remise.
- [P] Contenu final et base juridique dépendent de Q12b ; durées fournies par Q12c ; aucune qualification juridique avant ces réponses.
- [P] Obligatoire avant tout pilote avec de vrais élèves : le texte provisoire livré en E6 est remplacé en E12.

**Critères d'acceptation.**
- Étant donné un élève qui n'a pas pris connaissance de la notice, quand il tente une première remise, alors elle lui est présentée avant l'envoi.
- Étant donné une prise de connaissance, alors sa version et sa date sont enregistrées.

**Dépend de :** AUTH-01, SUB-01 · **Problèmes :** — · **Tests :** E2E, recette

#### PRV-02 — Consigne « pas de nom dans votre production »
*Acteur : Système · Priorité : MVP · Étape : E6 · Origine : F4, F5, F8 · Statut : proposition*

**Énoncé.** Le système demande à l'élève, avant chaque remise texte ou image, de ne pas écrire son nom dans sa production.

**Règles de gestion.**
- [P] Consigne affichée avant l'envoi, pour le texte collé comme pour l'image (cadrer la page seule pour l'image).
- [P] Aucune promesse de masquage automatique des noms dans le texte (non fiable) ; le taux de fuite est mesuré (EVL-05).

**Critères d'acceptation.**
- Étant donné une remise, texte ou image, alors la consigne a été affichée avant l'envoi.
- Étant donné un texte contenant un nom d'auteur, alors la fuite est comptée dans la mesure d'EVL-05.

**Dépend de :** SUB-01 · **Problèmes :** P3 · **Tests :** E2E, recette

#### PRV-05 — Suppression des métadonnées des images
*Acteur : Système · Priorité : MVP · Étape : E11 · Origine : F4 · Statut : proposition*

**Énoncé.** Le système supprime les métadonnées des images dès réception et attribue un nom de fichier neutre, afin qu'aucune donnée de l'appareil ou du lieu ne soit stockée ni transmise.

**Règles de gestion.**
- [P] Métadonnées (géolocalisation, appareil, date) supprimées dès réception ; jamais stockées ni transmises.
- [P] Nom de fichier d'origine remplacé par un nom neutre.

**Critères d'acceptation.**
- Étant donné une image avec métadonnées de géolocalisation, alors elles sont absentes du fichier stocké et de ce qui est transmis à l'IA.
- Étant donné une image au nom de fichier contenant un nom d'élève, alors ce nom n'apparaît ni dans le stockage ni dans les requêtes sortantes.

**Dépend de :** SUB-03 · **Problèmes :** P3 · **Tests :** intégration, recette

#### PRV-03 — Durées de conservation et suppression effective
*Acteur : Système · Priorité : MVP (prérequis du pilote avec de vrais élèves) · Étape : E12 · Origine : ajoutée · Statut : proposition*

**Énoncé.** Le système applique une durée de conservation par catégorie de données (compte, image, texte extrait, proposition IA, version finale, journal) et supprime effectivement ce qui est échu ou demandé.

**Règles de gestion.**
- [P] Valeurs à fixer par le client (Q12c) ; l'image n'est gardée que le temps nécessaire à la révision par le professeur.
- [P] Suppression effective, non simple masquage, étendue aux données dérivées ; prestataire tiers selon ses conditions.
- [P] Prérequis de mise en production avec de vrais élèves.

**Critères d'acceptation.**
- Étant donné une donnée échue, alors elle n'est plus accessible et est supprimée du stockage.
- Étant donné une suppression de copie, alors le texte extrait et la proposition IA associés sont supprimés aussi.

**Dépend de :** SUB-02 · **Problèmes :** — · **Tests :** intégration, recette

#### PRV-04 — Demande d'accès, de rectification ou de suppression par l'élève
*Acteur : Élève · Priorité : V2 · Étape : E16 · Origine : ajoutée · Statut : proposition*

**Énoncé.** L'élève peut voir ce que l'application détient sur lui et demander la suppression ou la correction de ses données.

**Règles de gestion.**
- [P] Page « mes données » : compte, copies, résultats publiés.
- [P] Demande traitée par le responsable désigné dans un délai à fixer ; conflit avec le dossier de notes à trancher (Q12b).

**Critères d'acceptation.**
- Étant donné une demande de suppression, alors elle est enregistrée et traitée par le responsable désigné.
- Étant donné la page « mes données », alors elle ne montre que les données de cet élève.

**Dépend de :** PRV-03, AUTH-03 · **Problèmes :** — · **Tests :** intégration, E2E

### 6.12 Module QLT — Mesure de la qualité (jalons de recette)

Preuves chiffrées avant usage réel. Sans corpus, experts et seuils décidés d'avance, F7 et F8 ne se testent que techniquement, jamais en qualité.

#### QLT-01 — Mesurer l'accord IA/experts sur de vraies copies
*Acteur : Équipe projet et client · Priorité : MVP · Étape : E3 (jalon G1) · Origine : décision validée (solution §5, points reportés) · Statut : décision utilisateur*

**Énoncé.** L'équipe mesure l'accord entre la proposition de l'IA et des correcteurs experts sur de vraies copies d'élèves, avant tout usage réel.

**Règles de gestion.**
- [D] Mesurer l'accord de l'IA avec des correcteurs experts sur de vraies copies d'élèves.
- [P] Copies notées indépendamment par au moins 2 experts (3 recommandés) ; l'accord expert/expert est le plafond humain.
- [P] Étalon : les experts notent la transcription de référence sans voir l'image ni le niveau scolaire, en appliquant la rubrique sans l'ajuster au niveau (guide d'annotation, E0).
- [P] Jeux : jeu de calage distinct d'un jeu scellé d'au moins 100 copies par langue ; stratification par niveau scolaire et par lisibilité ; calcul de précision avant la collecte (résultat « indicatif » déclaré dès E0 si l'effectif est insuffisant).
- [P] Mesure séparée pour (i) texte de référence, (ii) transcription automatique (couverte par QLT-03), (iii) copies tapées ; anglais et français séparément.
- [P] Seuils figés avant la mesure et validés par le client (Q13b) ; « non concluant » si l'intervalle de confiance chevauche le seuil. Un jeu scellé consulté est consommé : après « ajuster », il devient jeu de calage et un nouveau jeu scellé est requis.

**Critères d'acceptation.**
- Un rapport donne l'accord par critère et sur la note (kappa pondéré, accord à plus ou moins 1 niveau) avec intervalle de confiance, par langue.
- L'accord IA/expert est comparé à l'accord expert/expert selon la marge figée.
- Le rapport donne l'erreur signée par niveau scolaire du devoir, par tranche de longueur et par classe de lisibilité, avec un seuil de biais (8.3).
- Une décision continuer, ajuster ou arrêter est documentée selon la table de décision (8.3), jalon G1.

**Dépend de :** EVL-02 · **Problèmes :** P2 · **Tests :** évaluation IA, recette

#### QLT-02 — Mesurer la stabilité et la robustesse de l'IA
*Acteur : Équipe projet · Priorité : MVP · Étape : E3 · Origine : ajoutée · Statut : proposition*

**Énoncé.** L'équipe mesure la répétabilité de l'IA et sa résistance aux injections et aux fuites d'identité.

**Règles de gestion.**
- [P] Chaque copie du jeu exécutée 5 fois ; un sous-ensemble 20 fois. Unité de stabilité : le couple (copie, critère), stable si les exécutions donnent le même niveau ; on mesure aussi la part de copies dont la note totale reste à plus ou moins 1 point sur 20.
- [P] Tests métamorphiques traités comme des critères statistiques (nombre de copies, nombre d'exécutions, sens et taux de variation, par rapport au plancher de bruit) : ajout de fautes (Mechanics ne monte pas), mélange de paragraphes (Organization ne monte pas).
- [P] Tests adverses (consigne adressée au correcteur, instructions de complaisance) sur un jeu de taille figée.
- [P] Tests de non-fuite avec valeurs canaris (EVL-05) et mesure de la précision et du rappel de chaque alerte (EVL-08).
- [P] Un changement de modèle ou de consigne relance l'ensemble.

**Critères d'acceptation.**
- La stabilité atteint le seuil figé (valeur de travail : au moins 90 % des couples) et la bande de stabilité est respectée (8.3).
- Aucune consigne injectée ne change les niveaux au-delà de la bande de stabilité.
- Aucune valeur canari n'apparaît dans les requêtes sortantes.
- Les tests métamorphiques respectent leur critère statistique.

**Dépend de :** EVL-02, EVL-05, EVL-07, EVL-08 · **Problèmes :** P2, P3 · **Tests :** évaluation IA, intégration

#### QLT-03 — Mesurer la fidélité de la transcription sur écritures d'élèves
*Acteur : Équipe projet · Priorité : MVP · Étape : E2 (jalon G2) · Origine : ajoutée · Statut : proposition*

**Énoncé.** L'équipe mesure la fidélité de la transcription sur de vraies copies manuscrites d'élèves avant d'ouvrir le canal image à tous.

**Règles de gestion.**
- [P] Au moins 30 copies avec transcription de référence double (accord entre transcripteurs rapporté) et convention écrite (fautes conservées, [illisible]).
- [P] 2 ou 3 classes de lisibilité, attribuées par les experts avant la mesure selon un critère écrit en E0.
- [P] Mesures : taux d'erreur de caractères ventilé, préservation des fautes, écart de niveau par critère, signé et absolu, avec intervalle de confiance, sur au moins 5 exécutions par copie ; un plancher de bruit (même transcription, deux séries) est mesuré.
- [P] Critère de travail : valeur absolue de l'écart moyen signé inférieure ou égale à 0,25 niveau et écart absolu moyen borné (8.3). Si l'effectif par classe est trop petit pour conclure, la décision porte sur l'ensemble des copies avec examen des cas extrêmes et la ventilation par classe est exploratoire.
- [P] Le canal image en français reste fermé tant que des copies manuscrites en français n'ont pas été mesurées.
- [P] Essai de faisabilité sur 20 à 30 copies dès le cadrage ; jalon G2 avant ouverture du canal image.

**Critères d'acceptation.**
- Un rapport donne ces mesures par classe de lisibilité.
- Une décision d'ouvrir, d'ouvrir avec restrictions ou de ne pas ouvrir le canal image est documentée (jalon G2).
- Le biais d'écriture (P3) est vérifié par le critère de travail ci-dessus ; un résultat dont l'intervalle chevauche le seuil est consigné « non concluant ».

**Dépend de :** TRX-02, EVL-02 · **Problèmes :** P3 · **Tests :** évaluation IA, recette

#### QLT-04 — Mesurer le gain de temps de correction
*Acteur : Équipe projet · Priorité : MVP · Étape : E13 (pilote) · Origine : O1 · Statut : proposition*

**Énoncé.** L'équipe compare le temps de correction manuelle de référence au temps de validation avec l'application sur un pilote.

**Règles de gestion.**
- [P] Chronométrage de référence papier sur 30 copies par professeur pilote, avant le pilote ; les notes rubriquées de ces copies sont consignées (base humaine de constance).
- [P] Temps de revue enregistré par l'application (ouverture jusqu'à validation, REV-08).
- [P] Gain rapporté en médiane avec intervalle de confiance, temps total du professeur par lot (échecs, repli manuel, corrections de transcription compris) en moyenne et au 90e centile, et taux de transcriptions corrigées ; « non concluant » si l'intervalle chevauche le seuil.
- [P] Taille minimale du pilote par professeur : paramètre 8.3.

**Critères d'acceptation.**
- Un rapport compare temps manuel et temps avec application pour chaque professeur pilote.
- Le délai de traitement d'un lot de 100 remises est mesuré (PRC-02).

**Dépend de :** REV-07, PRC-02, REV-08 · **Problèmes :** P1 · **Tests :** recette

---

## 7. Couverture des problèmes P1, P2, P3 et risques résiduels

Les listes ci-dessous sont dérivées du champ « Problèmes » de chaque fonctionnalité. Les fonctionnalités hors MVP sont signalées : elles ne comptent pas dans ce que le pilote (E13) peut démontrer.

| Problème | Couvert par (MVP) | Hors MVP | Risque résiduel |
|---|---|---|---|
| **P1 Temps** | ASG-06, SUB-02, SUB-03, TRX-01, EVL-02, EVL-03, PRC-01 à PRC-06, REV-01 à REV-05, REV-07, QLT-04 | SUB-07 (à décider), REV-11 (V2), PUB-05 (V2) | Plausible, non démontré. Le gain dépend du temps de revue, du taux de transcriptions à corriger et du taux de modification de la proposition. Un écran de revue lent ou une proposition peu fiable peut coûter autant que la correction manuelle. Si les copies sont collectées sur papier en classe, la numérisation reste à la charge de l'élève tant que SUB-07 n'est pas retenue (Q9). Le gain mesuré au pilote n'inclut ni validation en lot ni dépôt par le professeur. Le temps de référence n'existe pas encore (QLT-04). |
| **P2 Écarts entre professeurs** | EVL-01, EVL-02, EVL-03, EVL-04, EVL-06, EVL-07, EVL-08, EVL-10, ASG-04, REV-08, QLT-01, QLT-02 | EVL-09 (à décider), REV-12 (V2) | Largement couvert si l'IA est proche des experts, hypothèse non vérifiée tant que QLT-01 n'est pas passé. Les modifications libres du professeur (REV-06), les instructions libres du devoir et la variabilité de l'IA peuvent réintroduire des écarts. Une note modifiable indépendamment des niveaux (REV-10) l'aggraverait. Aucun objectif ne mesure encore la constance de la **note finale validée** : seule une base humaine et un échantillon de contrôle (Q14) le permettraient. |
| **P2 Inconstance d'un même correcteur** | EVL-02, EVL-04, REV-07, QLT-02 | REV-12 (V2) | Partiel. La fatigue pèse sur la validation plutôt que sur la correction complète, mais la validation machinale (« clic-valide ») annule le gain. L'IA peut elle-même varier d'une exécution à l'autre : sa stabilité est mesurée, jamais présumée. Aucune comparaison avec la constance humaine tant qu'une base humaine n'est pas relevée (QLT-04, notes rubriquées de référence). |
| **P3 Écriture** | SUB-02, TRX-01, TRX-02, TRX-03, TRX-04, QLT-03 | SUB-06 (V2) | Réduit, pas supprimé. La qualité de transcription dépend de l'écriture : l'écriture influence encore la note par la lecture automatique, surtout sur Mechanics. Les chiffres publiés concernent surtout l'écriture d'adultes. Le professeur voit l'image quand il modifie, et peut normaliser les fautes en corrigeant la transcription (écart journalisé, TRX-04). Le texte collé supprime l'écriture mais ne garantit pas l'authenticité. |
| **P3 Connaissance de l'élève (halo)** | EVL-05, PRV-02, PRV-05, REV-04, REV-05, REV-08, QLT-02 | REV-12 (V2) | Partiel. L'évaluation initiale de l'IA est établie sans donnée d'identité (mais un nom écrit dans la copie peut passer, taux mesuré). L'identité n'est pas masquée pour le professeur (décision validée) : le halo peut se réintroduire à la modification. Aucune fonctionnalité ne l'empêche ; la trace de REV-08 permet seulement de mesurer la concordance. |
| **Validité d'un texte collé** (menace hors P1 à P3) | SUB-02 | — | Non traité par la technique : l'application ne peut pas savoir si le texte a été écrit par l'élève, copié ou généré. La détection est écartée. Limite assumée ; option de limiter les modes de remise par devoir (Q10). |

**Ce que ce dispositif ne fait pas.** Une IA qui propose et un professeur qui valide ne suppriment pas les biais : l'IA peut se tromper de façon cohérente, le professeur peut suivre la proposition sans la lire (ancrage) ou la modifier sous l'influence de ce qu'il sait de l'élève (halo). La concordance IA/professeur (O4) ne distingue pas ces cas d'un accord légitime. Seules la mesure sur de vraies copies (QLT-01 à QLT-03) et, si vous l'acceptez, un échantillon de contrôle corrigé à l'aveugle (Q14) permettent d'en juger.

---

## 8. Étapes progressives de conception, d'implémentation et de test

### 8.1 Principe

**[P]** Réduire d'abord le risque principal (la qualité de la lecture de l'écriture et de l'évaluation par IA), puis construire par tranches verticales, chaque étape livrant une capacité utilisable et testée de bout en bout, jamais une couche technique. Tout ce découpage est une **proposition** ; seuls F1 à F15 et les décisions déjà validées sont des décisions.

Ordre :
- **E0** prépare (décisions bloquantes, copies, experts, seuils figés).
- **E1 à E3** sont des tranches de **preuve** sans interface (texte, proposition IA, mesure), qui s'achèvent par les jalons **G2** (fidélité de transcription, E2) et **G1** (accord IA/experts, stabilité, E3). Chaque jalon peut conclure continuer, ajuster ou arrêter.
- **E4 à E6** livrent le socle par capacités (comptes, classes et devoirs, remise texte). Elles avancent **en parallèle** de E1 à E3 pendant que corpus et experts se constituent.
- **E7 à E10** relient le tout en **cycle complet texte** (traitement, revue, supervision, publication). E7 exige G1. **E10 est le premier cycle complet.**
- **E11** ajoute le **canal image** (remise, extraction branchée, affichage et correction de la transcription). Elle exige G2 : si G2 refuse le canal, E11 est retirée et le cycle texte reste livrable.
- **E12** met en conformité, **E13** est le pilote. **E14 à E16** regroupent le V2 et les fonctionnalités à décider écartées.

Écarts assumés par rapport aux dépendances du catalogue (à valider) :
- (a) Le moteur d'évaluation (EVL-02) et le moteur d'extraction (TRX-01) sont livrés d'abord en modules autonomes alimentés par le corpus (E1, E2), puis branchés aux vraies remises par PRC-01 (E7 pour le texte, E11 pour l'image). Les critères d'acceptation qui supposent une vraie remise sont rejoués à ces étapes (8.4).
- (b) QLT-03 mesure l'écart de niveau par critère et dépend donc d'EVL-02 : E2 dépend de E1.
- (c) AUTH-06 est livrée en E4 comme mécanisme ; chaque étape suivante ajoute les lignes de la matrice 5.5 pour ses ressources.
- (d) PUB-03 est livrée en E6 sous forme de modèle de lecture élève en liste blanche, testé avec des évaluations fictives, puis rejouée avec de vrais résultats en E10.

Règles communes : une étape est terminée quand les critères d'acceptation de ses fonctionnalités sont verts, que les lignes de la matrice de permissions de ses ressources sont vertes, que les cas de test sont rattachés à F1 à F15, et que tout changement de modèle, de consigne ou de rubrique a été versionné et remesuré. Aucune vraie copie d'élève n'est envoyée à un prestataire d'IA avant la réponse à Q12a et la vérification de ses conditions. Chaque étape ouvre par la consignation au registre des questions qu'elle consomme.

### 8.2 Les étapes

#### E0 — Cadrage opérationnel et lancement du chemin critique
**Objectif.** Lever les décisions qui bloquent les premières mesures et lancer dès maintenant les travaux à délai long (copies autorisées, experts, rubrique française, cadre de données) pour que G1 et G2 ne soient pas retardés par l'attente de ressources externes.
**Fonctionnalités.** Aucune (préparation). **Dépend de :** —.
**Questions à consigner.** Q4, Q5a, Q5b, Q6, Q7, Q11 (échéance), Q12a, Q13a, Q13b, Q17. Les autres questions sont confirmées au début de l'étape qui les consomme.

**Conception.**
- [P] Protocole de mesure écrit avant toute mesure : seuils figés et datés (8.3), table de décision G1, trois jeux distincts avec effectifs (calage, scellé, G2), calcul de précision avant la collecte, règle « intervalle qui chevauche le seuil = non concluant », anglais et français séparés, stratification par niveau scolaire et par lisibilité.
- [P] Guide d'annotation des experts : source notée (transcription de référence, sans l'image ni le niveau scolaire), rubrique appliquée sans ajustement au niveau, cas limites. Convention de transcription : fautes, majuscules et ponctuation conservées, marqueur [illisible], ordre des pages, ratures. Critère d'attribution des classes de lisibilité.
- Squelette de la machine à états (5.4) et de la matrice de permissions (5.5), relus par le client ; référence de recette pour toutes les étapes.
- Plan de test global et définition de « terminé » communs, avec traçabilité F1 à F15 vers les cas de test.

**Implémentation.**
- Constituer le corpus : collecte de copies manuscrites autorisées, comptage de la présence de noms d'auteur **avant** leur retrait, retrait des noms, numérisation, stockage à accès restreint.
- Recruter les experts et fixer le calendrier d'annotation ; annoter le sous-ensemble de calage.
- Faire confirmer la rubrique anglaise de l'annexe de solution.md ; remettre au client le projet de version française (mêmes codes de critères et niveaux ; Mechanics : accents et accords).
- Vérifier et consigner les conditions du ou des prestataires d'IA et de transcription (pas d'entraînement sur les contenus, localisation, conservation) ; à défaut, n'utiliser qu'un corpus anonymisé et autorisé.
- Désigner le ou les professeurs pilotes et planifier le chronométrage de référence (30 copies chacun, notes rubriquées consignées).
- Ouvrir un registre daté des décisions et des risques.

**Tests.**
- Essai à blanc d'annotation : 5 copies annotées indépendamment par 2 experts, accord expert/expert calculé pour vérifier que le guide est applicable.
- Essai de la convention de transcription : 5 pages manuscrites transcrites par 2 personnes, écarts listés, règles corrigées.
- Vérification que le jeu scellé n'est accessible qu'à une personne qui n'a pas réglé la consigne.
- Relecture client de la matrice et de la machine à états, anomalies consignées.

**Critères de sortie.**
- Registre signé avec les réponses listées ci-dessus ; à défaut, blocage de G1 et G2 consigné avec sa date.
- Seuils figés, datés et validés par le client avant toute mesure ; résultat déclaré « indicatif » si l'effectif prévu est insuffisant.
- Au moins 2 experts engagés ; sous-ensemble de calage collecté, anonymisé et annoté par au moins 2 experts, accord expert/expert calculé ; plan de collecte du jeu scellé (au moins 100 copies par langue) et du jeu G2 (au moins 30 copies manuscrites avec transcription de référence double).
- Rubrique anglaise confirmée ; projet de rubrique française remis avec une date de retour demandée.
- Conditions des prestataires vérifiées et consignées, ou corpus anonymisé et autorisé.
- Professeur(s) pilote(s) identifié(s) ; chronométrage de référence planifié avant le pilote.

**Risques.** Corpus ou experts indisponibles : G1 et G2 restent bloqués et le projet avance sans savoir si l'IA est utile (chemin critique). Réponse tardive à Q12a : repli sur copies autorisées et anonymisées, sinon arrêt de la mesure. Seuils choisis après avoir vu les résultats : d'où le gel daté. Seuils de travail non issus de références publiées : le client peut les juger trop sévères ou trop laxistes.

#### E1 — Noyau d'évaluation IA sur texte (banc de preuve, sans interface)
**Objectif.** Prouver qu'à partir d'un texte et du contexte d'un devoir, le système produit une proposition conforme, traçable et immuable (5 niveaux, justifications, remarques, note calculée), et obtenir un premier signal de qualité sur le jeu de calage avant de construire l'application autour.
**Fonctionnalités.** EVL-01, EVL-02, EVL-03, EVL-04, EVL-06, EVL-07, EVL-10. **Dépend de :** E0.

**Conception.**
- [D] Rubrique unique, fixe, en lecture seule : 5 critères à 20 %, niveaux entiers de 0 à 4. [P] Versionnée, la version étant enregistrée avec chaque évaluation. Libellés anglais de solution.md ; libellés français en attente (Q11).
- Contrat d'entrée de l'IA en liste blanche : texte de référence, sujet, instructions, langue, rubrique. Le niveau du devoir n'en fait pas partie (Q4, consigné en E0) ; aucune donnée d'identité (garantie complète testée en E3).
- Contrat de sortie : 5 niveaux entiers de 0 à 4, une justification non vide par critère, commentaire général, pistes d'amélioration, citations dans un champ dédié ; toute autre forme est rejetée (tentatives bornées puis échec typé).
- [P] Le texte de l'élève et les instructions du devoir sont délimités et traités comme des données, jamais comme des consignes ; la consigne de l'IA est versionnée.
- [P] Note sur 20 égale à la somme des 5 niveaux, calculée par le système et jamais par le LLM (Q5a) ; remarques dans la langue du devoir (Q7).
- Journal d'exécution immuable : modèle, version de la consigne, version de la rubrique, texte évalué, date, indicateur « courante » ; une relance crée une nouvelle exécution ; tout changement de modèle ou de consigne est une nouvelle version.

**Implémentation.** Module de rubrique sans voie d'écriture. Service d'évaluation appelable sur un texte, indépendant des soumissions (il sera déclenché par E7), avec clé d'idempotence. Validateur de sortie, politique de nouvelles tentatives bornée, erreurs typées, vérification des citations. Calcul de la note et stockage immuable des exécutions. Banc de mesure qui rejoue un corpus N fois et produit un rapport par critère (réutilisé en E3) ; modèle simulé déterministe pour les tests automatiques.

**Tests.**
- Unitaire : les 3125 combinaisons de niveaux donnent une note égale à la somme, bornée de 0 à 20 ; rejet d'un critère manquant ou en trop, d'un niveau 5 ou 2,5, d'une justification vide ; vérification de citation (présente, absente, altérée).
- Intégration : double déclenchement avec la même clé = une seule proposition courante ; relance = deux exécutions dont une courante, l'originale inchangée ; modification d'une exécution refusée ; aucune voie d'écriture sur la rubrique.
- Évaluation IA sur le jeu de calage (non contractuelle) : accord par critère avec les experts et taux de rejet des sorties non conformes.
- Jeu adverse : consigne adressée au correcteur dans la copie et instructions de complaisance ; critère de la bande de stabilité (8.3).
- Tests métamorphiques traités statistiquement (ajout de fautes, mélange de paragraphes).
- Mesure du coût et de la latence par copie pour projeter un lot de 100 copies.

**Critères de sortie.**
- Tests unitaires et d'intégration verts. Aucune sortie non conforme n'atteint une exécution courante (garanti par le validateur) ; le taux de rejet sur le jeu de calage est rapporté et sous le seuil figé.
- Rapport de calage daté : accord IA/expert par critère, taux de rejet, latence et coût par copie ; configuration (modèle, consigne, rubrique) étiquetée v1.
- Jeu adverse : aucune consigne injectée ne fait sortir les niveaux de la bande de stabilité.
- Point de contrôle consigné : si l'accord de calage est inférieur à l'accord expert/expert au-delà de la marge figée en E0, une revue continuer, ajuster ou arrêter se tient avant d'engager E7 (E4 à E6 n'en dépendent pas).

**Risques.** L'IA peut ne pas atteindre l'accord attendu : ni le modèle ni la consigne ne garantissent la fiabilité, les études citées dans solution.md sont mixtes. Surajustement de la consigne au jeu de calage, d'où le jeu scellé d'E3. Variabilité d'une exécution à l'autre ; changement ou retrait de modèle par le fournisseur. Évaluation française non mesurable tant que la rubrique française n'est pas validée. Vérification de citation trop stricte face aux textes issus de transcription.

#### E2 — Transcription fidèle des écritures d'élèves (banc de preuve, jalon G2)
**Objectif.** Mesurer si des copies manuscrites d'élèves peuvent être transcrites fidèlement (fautes conservées, passages illisibles marqués) et si l'écriture influence encore la note, avant de construire le canal image.
**Fonctionnalités.** TRX-01 (module), TRX-02, QLT-03. **Dépend de :** E0, E1 (moteur d'évaluation figé pour l'écart de niveau).

**Conception.**
- [D] Transcrire sans corriger l'orthographe ni la ponctuation. [P] Passages indéchiffrables marqués [illisible], jamais devinés ; pages assemblées dans l'ordre remis ; convention écrite en E0.
- Mesures définies d'avance (8.3) : taux d'erreur de caractères par classe de lisibilité, préservation des fautes, écart de niveau par critère (signé et absolu) entre l'évaluation sur transcription automatique et sur transcription de référence, plancher de bruit, taux de transcriptions contenant le nom de l'auteur.
- Une image sans écriture lisible produit « non évaluable » et aucun contenu inventé. Une page manuscrite portant une consigne est transcrite telle quelle, sans exécution.
- Le texte extrait est l'entrée de l'IA : une erreur de lecture devient une erreur de note. L'affichage et la correction par le professeur sont conçus en E11.

**Implémentation.** Module d'extraction (images ordonnées en entrée, texte en sortie avec marqueurs d'illisibilité, limites de page, version du moteur enregistrée). Outillage de mesure (taux d'erreur de caractères, préservation des fautes, écart de niveau via le banc d'E1, détection de noms d'auteur). Pas de stockage ni d'interface : l'intégration à la remise est faite en E11.

**Tests.**
- Unitaire : calcul du taux d'erreur de caractères sur paires connues, préservation des fautes, détection des marqueurs d'illisibilité.
- Évaluation extraction : au moins 30 copies manuscrites d'élèves avec transcription de référence double, ventilation par classe de lisibilité.
- Évaluation IA : écart de niveau par critère, signé et absolu, par classe, avec attention à Mechanics.
- Cas dégradés : page blanche, image retournée, floue, dessin, texte imprimé, autre langue, page portant une consigne adressée au moteur ; aucun texte inventé.
- Essai de faisabilité préliminaire sur 20 à 30 copies dès que le corpus est partiel.

**Critères de sortie.**
- Rapport G2 avec les mesures par classe de lisibilité sur au moins 30 copies manuscrites d'élèves, plancher de bruit inclus.
- Décision G2 consignée par le client : ouvrir le canal image, l'ouvrir avec restrictions (par exemple anglais seul), ou ne pas l'ouvrir au MVP. En cas de refus, E11 est retirée et le cycle texte reste livrable.
- Critère de travail : valeur absolue de l'écart moyen signé inférieure ou égale à 0,25 niveau et écart absolu moyen sous sa borne, sans biais systématique sur Mechanics ; sinon « non atteint » ou « non concluant », jamais « réussi ». Si l'effectif par classe est trop petit, la décision porte sur l'ensemble, la ventilation est exploratoire.
- Page blanche et image illisible : 0 caractère inventé.

**Risques.** Les outils de transcription normalisent ou corrigent les fautes, ce qui gonfle Mechanics ; les chiffres publiés concernent surtout l'écriture d'adultes. Deux transcripteurs en désaccord : la référence elle-même est incertaine. Le texte extrait réintroduit l'écriture dans la note : P3 est déplacé, non supprimé. Copies ou autorisations insuffisantes pour 30 copies variées. Environ 10 copies par classe de lisibilité : intervalles larges, d'où la règle de décision sur l'ensemble. Coût et temps par page non connus avant la mesure.

#### E3 — Identité, copies atypiques et mesure formelle de l'IA (jalon G1)
**Objectif.** Compléter les garanties du moteur (aucune donnée d'identité transmise, copies atypiques signalées, français bloqué tant que la rubrique n'est pas validée), figer la configuration, puis mesurer sur le jeu scellé l'accord IA/experts et la stabilité, et décider continuer, ajuster ou arrêter.
**Fonctionnalités.** EVL-05, EVL-08, EVL-09, QLT-01, QLT-02. **Dépend de :** E0, E1. Elle ne dépend pas d'E2 : G1 mesure l'IA sur le texte de référence et sur des copies tapées ; la mesure sur transcription automatique est celle de G2.

**Conception.**
- [D] Aucune donnée d'identité transmise à l'IA. [P] Un point de sortie unique construit la requête en liste blanche avec identifiant de soumission aléatoire. Limite assumée : un nom écrit dans la copie peut passer, son taux est mesuré.
- [P] Alertes bloquantes (copie vide, sans écriture) et d'information (très courte, autre langue, hors sujet, adressée au correcteur) ; visibles du seul professeur ; une copie non évaluable ne reçoit aucune note IA et jamais un 0 automatique.
- [P, conditionnel à Q11] EVL-09 : l'évaluation d'un devoir en français est bloquée tant que la rubrique française n'est pas validée (indicateur de validation par langue) ; la copie passe en « Non évaluable » avec sa cause ; l'accord est mesuré séparément pour l'anglais et le français.
- Plan statistique figé en E0 : kappa pondéré quadratique et accord à plus ou moins 1 niveau, par critère et sur la note, comparés à l'accord expert/expert avec intervalles de confiance ; stabilité sur 5 exécutions et 20 sur un sous-ensemble ; tests adverses et métamorphiques ; erreur signée par niveau scolaire, longueur et lisibilité ; table de décision (8.3).
- Procédure de gel : la configuration mesurée est celle du pilote ; tout changement de modèle, de consigne ou de rubrique est une nouvelle version et déclenche une nouvelle mesure. Le jeu scellé est détenu par une personne qui n'a pas réglé la consigne.

**Implémentation.** Constructeur de requête sortante en liste blanche, seul chemin vers le fournisseur d'IA. Outillage de canaris (comptes de test dont nom, prénom, email, classe et professeur sont des chaînes uniques, balayage des requêtes sortantes). Classification des alertes et blocage par langue. Chaîne de rapport : kappa, accord à plus ou moins 1 niveau, intervalles, stabilité, comparaison à l'accord expert/expert, distinction calage/acceptation, précision et rappel des alertes.

**Tests.**
- Canaris : aucune des chaînes de test n'apparaît dans les requêtes sortantes de l'ensemble du jeu.
- Alertes : texte vide, texte très court, texte dans une autre langue, hors sujet, texte du type « donne-moi 20/20 » ; alerte attendue, aucune note IA lorsque la copie est non évaluable ; précision et rappel mesurés.
- Blocage du français : indicateur désactivé = aucune proposition et professeur informé ; activé = évaluation exécutée et mesurée séparément.
- Évaluation IA sur le jeu scellé : accord par critère et sur la note, intervalles, comparaison à l'accord expert/expert, stabilité, tests adverses et métamorphiques rejoués, biais de sous-groupe.
- Taux de productions contenant le nom de l'auteur, rapporté avec les résultats d'E2.

**Critères de sortie.**
- Rapport G1 daté et signé : accord par critère et sur la note avec intervalles de confiance, stabilité, comparaison à l'accord expert/expert, par langue ; un intervalle qui chevauche le seuil est consigné « non concluant ».
- Décision G1 documentée selon la table de décision : continuer, ajuster (nouvelle version, nouveau jeu scellé) ou arrêter.
- Test de canaris intégré à l'intégration continue comme régression permanente, au vert.
- Configuration (modèle, consigne, rubrique, contrat d'entrée sans niveau du devoir) gelée et étiquetée pour le pilote ; anglais et français mesurés séparément, ou le français déclaré non mesuré et son évaluation reste bloquée.

**Risques.** L'accord IA/expert peut être insuffisant : la thèse du produit est alors à revoir, c'est la raison de mesurer avant de bâtir. Jeu scellé trop petit ou contaminé par le réglage de la consigne ; un kappa peut être trompeur quand les niveaux sont très concentrés. Seulement 2 experts : plafond humain mal estimé. Un nom écrit dans la copie atteint l'IA. Rubrique française non validée : le français reste non mesuré.

#### E4 — Comptes et accès
**Objectif.** Un élève s'inscrit par email, vérifie son compte et se connecte à son espace ; un professeur obtient un compte créé de façon contrôlée ; le mécanisme de cloisonnement par rôle, classe et correcteur est en place.
**Fonctionnalités.** AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06. **Dépend de :** E0. **Questions à consigner.** Q1, Q12b (élèves sans email).

**Conception.**
- [D] Inscription par email et connexion avec son compte. [P] Email, mot de passe, nom et prénom séparés ; un compte égale un seul rôle ; l'inscription publique ne produit que le rôle élève.
- [Q1, défaut proposé] Comptes professeur créés par un administrateur via un outil minimal, par invitation ; premier administrateur créé hors interface publique.
- [P] Vérification de l'email par lien à usage unique et durée limitée ; réinitialisation avec réponse identique que le compte existe ou non ; message d'erreur identique pour email inconnu et mauvais mot de passe ; temporisation après échecs répétés ; sessions invalidées après réinitialisation ; aucun résultat réaffiché après déconnexion.
- Mécanisme de contrôle d'accès côté serveur, refus par défaut, réponse « introuvable » plutôt que « interdit ». Matrice de permissions v1 (5.5) alimentée à chaque étape.

**Implémentation.** Inscription, vérification, connexion, déconnexion, réinitialisation, avec envoi d'emails transactionnels. Outil minimal de création de comptes professeur réservé à l'administrateur. Couche de politique d'accès centralisée et banc de test de la matrice réutilisable. Messages d'erreur neutres, limitation d'essais, expiration de session.

**Tests.**
- Unitaire : normalisation de l'email, règles de mot de passe, expiration et usage unique des liens.
- Intégration : rôle professeur forgé = compte élève ; email déjà inscrit = aucun second compte, message sans énumération ; lien expiré, réutilisé ou falsifié = compte non vérifié ; compte non vérifié refusé à la connexion avec renvoi ; réinitialisation d'un email inconnu = réponse identique, aucun envoi ; sessions invalidées ; temporisation ; invitation professeur expirée ou réutilisée.
- Mécanisme AUTH-06 : visiteur sans session, élève appelant une action professeur, professeur sans classe, réponse identique pour une ressource inexistante ou étrangère.
- E2E : inscription, vérification, connexion, déconnexion, bouton retour sans contenu ; connexion d'un professeur invité par l'administrateur.
- Recette : relecture de sécurité des parcours d'authentification (énumération de comptes, force brute).

**Critères de sortie.** Critères d'acceptation d'AUTH-01 à AUTH-06 (mécanisme) verts. Aucune voie publique ne crée un compte professeur ni n'élève un rôle (test automatisé). Lignes de matrice pour comptes et sessions vertes ; les critères de ressource d'AUTH-06 sont portés par E5, E6, E8 et E11. F1 et F2 démontrées en E2E.

**Risques.** Emails de vérification bloqués ou classés indésirables (adresses d'établissement). Élèves sans email et mineurs non traités (Q12b). L'outil d'administration est un contournement privilégié : il doit être lui-même contrôlé et tracé. Énumération de comptes par différence de réponse ou de durée.

#### E5 — Classes et devoirs : création, rattachement, envoi aux classes choisies
**Objectif.** Un professeur crée plusieurs classes, y rattache ses élèves par code, crée un devoir (sujet, niveau, langue, délai, instructions facultatives), choisit les classes destinataires à la création, et retrouve ses devoirs dans une liste.
**Fonctionnalités.** CLS-01, CLS-02, CLS-03, CLS-04, CLS-06, ASG-01, ASG-02, ASG-06. **Dépend de :** E4. **Questions à consigner.** Q2, Q4, Q8a.

**Conception.**
- [D] Un professeur a plusieurs classes, une classe plusieurs élèves ; le devoir comporte sujet, niveau, langue, délai, instructions facultatives ; le professeur sélectionne les classes à la création.
- [Q2, défaut proposé] Code d'invitation par classe avec approbation du professeur, un élève dans plusieurs classes, une classe à un seul professeur en v1 ; le correcteur est le créateur du devoir.
- [Q4, Q8a, défauts proposés] Niveau = étiquette du devoir (liste fermée à fixer), non transmise à l'IA, avertissement si les classes ciblées ont des niveaux différents ; délai = date et heure limites uniques, fuseau unique, option « accepter les remises en retard » (oui par défaut).
- [P] Création du devoir et des envois en une seule opération, sans création partielle ; titre court ; avertissements sous sujet et instructions (pas de nom d'élève ; pas de modification de la rubrique) ; nom de classe unique chez un même professeur.
- [P] Liste des devoirs du professeur : point d'entrée de F13.

**Implémentation.** Écrans et opérations de classes (créer, lister, générer, désactiver et renouveler le code, approuver, retirer). Saisie du code par l'élève, liste d'attente avec nom, prénom et email. Formulaire de création de devoir avec cases de classes, validation champ par champ et création atomique. Liste des devoirs. Code non prévisible, essais limités.

**Tests.**
- Unitaire : unicité du nom de classe par professeur ; langue limitée à français ou anglais ; validations de devoir ; validité, désactivation et renouvellement du code.
- Intégration : requête forgée avec la classe d'un autre professeur = rien n'est créé, même pour les classes valides ; compte non vérifié refusé au rattachement ; code désactivé ou inconnu refusé sans révéler l'existence de classes ; élève retiré ne reçoit plus les nouveaux devoirs, ses remises passées restent accessibles ; élève ajouté après l'envoi reçoit les devoirs encore ouverts ; limitation des essais ; approbation, refus et état « demandée » (CLS-06).
- E2E : un professeur ayant 3 classes coche C1 et C3, le devoir n'est envoyé qu'à C1 et C3 ; aucune classe cochée = création refusée ; liste de devoirs et ouverture d'un devoir.
- Matrice de permissions : classes, appartenances, devoirs, envois ; deux professeurs ayant une classe de même nom ne voient chacun que la leur ; liste de devoirs d'un autre professeur invisible.
- La clause d'ASG-01 « le devoir apparaît chez les élèves » et le compteur « à valider » d'ASG-06 sont vérifiés en E6 et E7.

**Critères de sortie.** Critères d'acceptation de CLS-01 à CLS-04, CLS-06, ASG-01, ASG-02 et ASG-06 verts, hors clauses reportées. Lignes de matrice de l'étape vertes. Réponses à Q2, Q4 et Q8a consignées avant le début de l'étape. F12, F14 et F15 démontrées en E2E côté professeur.

**Risques.** Q2 non tranchée : sans approbation, un code diffusé permet à une personne extérieure de se rattacher. Sens du niveau (Q4) : transmis à l'IA, la même copie recevrait des niveaux différents. Élèves homonymes ou rattachés à la mauvaise classe. Devoir envoyé à des classes de niveaux différents.

#### E6 — Espace élève et remise par texte collé
**Objectif.** L'élève retrouve dans son espace les devoirs de ses classes, remet un texte collé, voit l'état de sa remise, ne voit aucun résultat tant que rien n'est publié ; le professeur peut corriger ou supprimer un devoir sans remise.
**Fonctionnalités.** SUB-01, SUB-02, SUB-05, PUB-03, ASG-03, ASG-04, ASG-07, PRV-01, PRV-02. **Dépend de :** E5. **Questions à consigner.** Q3, Q6, Q8a, Q10.

**Conception.**
- [D] Chaque élève a son propre espace de remise qui va vers son professeur ; la production est collée sous forme de texte.
- [Q3, défaut proposé] Toute soumission est rattachée à un devoir reçu ; une seule soumission active par couple (devoir, élève) même si l'élève est dans deux classes ciblées ; le correcteur est figé à la remise.
- [P] Texte brut, mise en forme retirée, fautes conservées à l'identique ; texte non vide ; limite de longueur avec refus explicite, jamais de troncature silencieuse ; limite d'authenticité assumée (Q10) ; mode de remise enregistré.
- [P] Machine à états de la soumission (5.4) : le modèle complet est défini, les transitions sont activées par l'étape qui livre leur déclencheur. L'élève ne voit que la liste fermée de SUB-05 ; modèle de lecture en liste blanche, sans champ de résultat.
- [Q8a, défaut proposé] Remise tardive acceptée et marquée en retard (refus possible par devoir) sur horodatage serveur ; sujet, langue et instructions verrouillés dès la première remise ; devoir avec remises non supprimable ; modification et suppression libres avant la première remise (ASG-07).
- [P] Consigne « pas de nom dans votre production » avant chaque remise ; notice d'information avec version et date de prise de connaissance (contenu provisoire, final en E12).

**Implémentation.** Espace élève (liste des devoirs, détail, état vide, état « en attente d'approbation »). Remise par texte avec confirmation datée, marquage du retard, verrouillage du devoir. Modification et suppression d'un devoir sans remise. Modèle de lecture élève en liste blanche. Écran de notice et journal des prises de connaissance.

**Tests.**
- Unitaire : texte vide ou d'espaces refusé, dépassement refusé, fautes conservées à l'octet près, marquage du retard aux limites de l'échéance.
- Intégration : l'élève A ne peut ouvrir la remise de B ni par identifiant, ni par adresse, ni par API ; un devoir envoyé à C2 seulement n'apparaît pas pour un élève de C1 ; élève dans deux classes voit les devoirs des deux et seulement ceux-là ; remise unique active ; modification du sujet et suppression refusées après la première remise, libres avant ; remise refusée si compte non vérifié ou appartenance non active.
- PUB-03 avec évaluations fictives publiées et non publiées : balayage automatique de tous les corps de réponse reçus par l'élève (liste, détail, état, messages d'erreur) = aucun champ de résultat, de niveau, de remarque, d'alerte ou de proposition IA.
- Intégration : la notice est présentée avant la première remise et sa version enregistrée ; la consigne « pas de nom » est affichée avant l'envoi ; une remise en échec de traitement affiche seulement « remis, en cours de correction ».
- E2E : l'élève voit le devoir, remet son texte, reçoit la confirmation, voit l'état ; clause d'ASG-01 de l'étape E5 vérifiée.
- Matrice de permissions : soumissions et espace élève.

**Critères de sortie.** Critères d'acceptation de SUB-01, SUB-02, SUB-05, PUB-03, ASG-03, ASG-04, ASG-07, PRV-01 et PRV-02 verts, hors clauses reportées (8.4). Zéro champ de résultat dans les réponses réseau de l'élève sur le jeu de données fictif. F3 et F5 démontrées en E2E. Lignes de matrice de l'étape vertes.

**Risques.** Texte collé avec mise en forme ou caractères parasites qui altèrent les fautes à mesurer. Fuite de résultat par un message d'erreur, la mémoire d'un navigateur ou une différence de réponse plutôt que par l'affichage. Fuseau horaire et heure limite mal comprises. Limite de longueur inadaptée. Un texte collé n'est pas prouvé écrit par l'élève (limite assumée).

#### E7 — Traitement automatique des remises texte, à l'échelle d'un lot
**Objectif.** Chaque remise texte confirmée est traitée automatiquement jusqu'à « à valider », avec états visibles du professeur, échecs gérés, remplacement de remise, et un lot de 100 copies traité en parallèle dans le délai visé.
**Fonctionnalités.** PRC-01 (texte), PRC-02, PRC-03, PRC-04, PRC-06, SUB-04. **Dépend de :** E3 (décision G1 favorable), E6. **Questions à consigner.** Q8b, Q11 (EVL-09 si livrée).

**Conception.**
- [D] L'application gère le temps de correction et traite plusieurs copies à la fois.
- Machine à états de la soumission activée pour : remise, évaluation en cours ou échouée, non évaluable, à valider ; durée maximale par étape et nombre de tentatives bornés ; aucune soumission indéfiniment « en cours ». Les états propres à l'image sont activés en E11.
- [P] Déclenchement à la remise ; idempotence par version de remise ; chaque soumission suit son cycle ; l'ordre d'arrivée n'influence pas le résultat ; reprise sans perte après panne.
- Le noyau d'évaluation d'E1 est branché ici derrière le point de sortie en liste blanche d'E3.
- [P] Remplacement de la remise (Q8b) : ancienne version archivée, évaluation précédente rendue non courante, évaluation relancée ; l'évaluation du professeur n'est jamais écrasée.
- Vue de suivi pour le professeur : état de chaque soumission, compteurs « à valider », « en échec » et « non évaluable », relance manuelle. Limites de débit et coût du fournisseur pris en compte dans la cadence.
- Instrumentation (PRC-06) : durées par étape, taux d'échec, coût par copie.

**Implémentation.** Orchestrateur (déclenchement, files, concurrence limitée, reprise, nouvelles tentatives bornées, relance manuelle). Intégration du module d'évaluation. Flux de remplacement et archivage des versions. Vue des états et compteurs. Générateur de charge : 100 comptes déposant des remises texte avec marqueur unique.

**Tests.**
- Intégration : remise texte = évaluation jusqu'à « à valider » sans intervention ; double déclenchement = un seul traitement ; échec répété forcé = « échec » visible après N tentatives, relance manuelle réussie ; l'élève voit seulement « remis, en cours de correction ».
- Intégration : remplacement d'une remise non validée relance l'évaluation et rend l'ancienne non courante ; plafond de remplacements ; évaluation du professeur non écrasée.
- Résilience : arrêt d'un composant en plein lot = reprise sans perte ni doublon ; panne du fournisseur d'IA = aucune remise perdue.
- Charge : 100 remises texte déposées en parallèle par 100 comptes, avec le fournisseur d'IA réel (textes autorisés ou synthétiques) ; critère de PRC-02 ; marqueurs : chaque résultat ne cite que sa propre copie.
- Évaluation IA rejouée sur la chaîne intégrée avec la configuration gelée : écart au banc inférieur à la tolérance figée (8.3).
- Matrice de permissions : évaluations IA et états.

**Critères de sortie.** Critères d'acceptation de PRC-01 (texte), PRC-02, PRC-03, PRC-04, PRC-06 et SUB-04 (texte) verts. Test de charge à 100 remises : aucune remise perdue ni mal attribuée ; au moins 95 % « à valider » dans la cible de 30 minutes, sinon « non atteint » et écart documenté. Coût et latence par copie documentés ; configuration identique à celle gelée en E3. F8 démontrée en E2E de la remise à « à valider » pour le canal texte.

**Risques.** Limites de débit et coût du fournisseur incompatibles avec un lot de 100 copies dans le délai visé. Doublons ou pertes lors de reprises après panne. Changement de version du modèle en cours de lot. Cohérence des états entre ce que voit le professeur et ce que voit l'élève.

#### E8 — Revue du professeur : liste, tri, filtres, ouverture, consultation
**Objectif.** Le professeur voit tous les élèves ciblés par un devoir avec l'état de leur soumission, trie et filtre la liste, ouvre la copie d'un élève par un clic sur son nom et consulte texte, proposition de l'IA, remarques et alertes.
**Fonctionnalités.** REV-01, REV-02, REV-03, REV-04, REV-05. **Dépend de :** E7. **Questions à consigner.** Q10, Q15, Q16.

**Conception.**
- [D] La partie soumissions affiche chaque élève (identité non masquée), triable par note, date de soumission ou ordre alphabétique ; un clic sur le nom ouvre la soumission.
- [P] La liste montre tous les élèves ciblés, y compris les non remis et les remises en retard, un élève présent dans deux classes n'étant listé qu'une fois ; filtres par classe et par état combinables avec les tris ; mode de remise affiché.
- [P] Tri par note : note validée sinon proposition IA marquée « provisoire », copies sans note en fin de liste, jamais comptées comme 0 ; tri alphabétique insensible aux accents et à la casse ; sens et défauts définis (REV-02) ; tri sur la liste complète.
- [Q16, défaut proposé] Un clic ouvre la copie de cet élève pour CE devoir, sans note ni moyenne antérieure ; navigation « copie suivante » ; page de statut pour un élève non remis.
- [Q15, défaut proposé] Écran de revue : texte d'abord, mention du mode de remise, cinq niveaux avec justifications, remarques, note calculée, alertes ; proposition IA d'origine en lecture seule.
- Limite assumée : trier par note expose une note IA provisoire avant lecture, ce qui peut ancrer le jugement.

**Implémentation.** Liste avec tri et filtres exécutés côté serveur sur l'ensemble des données, pagination qui conserve le tri. Comparateur alphabétique (accents, casse, noms composés, apostrophes). Écran de revue avec navigation entre copies. Contrôle d'accès branché sur la politique d'E4.

**Tests.**
- Unitaire : ordre de « Émile », « Eric » et « d'Aubigné » ; départage stable de notes égales ; copies sans note en fin de liste dans tous les tris et les deux sens.
- Intégration : 150 remises triées par note = ordre global ; filtre « à valider » ; filtre de classe combiné au tri par date ; élève retiré de la classe toujours listé pour ses remises ; élève dans deux classes ciblées = une ligne comptée une fois ; autre professeur = rien.
- Intégration : devoir envoyé à C1 avec 5 remises sur 8 élèves = 8 lignes dont 3 non remis.
- E2E : un clic sur un nom ouvre la bonne copie ; deux homonymes ouvrent chacun la leur ; aucune note antérieure affichée (assertion automatique) ; copie texte sans bloc image ; élève non remis = page de statut.
- Performance : liste de 150 puis 500 lignes dans le délai figé (8.3).
- Recette : un professeur pilote parcourt 20 copies, défauts bloquants consignés.
- Matrice de permissions : lignes liste et revue.

**Critères de sortie.** Critères d'acceptation de REV-01 à REV-05 verts, hors clauses reportées (note validée, états validée et publiée, copie image). Cas des 8 élèves dont 3 non remis, des homonymes, de l'élève en deux classes et des 150 copies triées validés. Aucune donnée d'un autre professeur renvoyée. Un professeur a parcouru 20 copies sans défaut bloquant (défaut bloquant : empêche d'ouvrir, de trier ou de comprendre l'état d'une copie). F10 (consultation) et F13 démontrées en E2E.

**Risques.** Le tri par note met en tête une note IA provisoire : risque d'ancrage avant la lecture. Règles de tri des accents et des noms composés qui surprennent selon la langue. Performance à l'échelle de plusieurs centaines de lignes. Si Q16 était tranchée dans le sens d'un historique visible, le halo serait réintroduit à l'écran de revue.

#### E9 — Supervision : modifier, valider, tracer, repli manuel
**Objectif.** Le professeur modifie librement niveaux et remarques (note recalculée), distingue remarques pour l'élève et notes internes, valide, ou évalue manuellement ou retourne la copie quand l'IA échoue ; le système conserve la proposition IA d'origine et le journal.
**Fonctionnalités.** REV-06, REV-07, REV-08, REV-09, PRC-05. **Dépend de :** E8. **Questions à consigner.** Q5a, Q5b, Q6, Q7, Q14 (usage du journal).

**Conception.**
- [D] Le professeur supervise et modifie la note et l'évaluation ; [Q5a, Q5b, défaut proposé] la note est toujours calculée à partir des cinq niveaux, le professeur modifie les niveaux et les remarques (l'ajustement direct de la note est REV-10).
- [P] Évaluation du professeur distincte de l'évaluation IA immuable : indicateur « modifié » par critère, valeur de l'IA lisible, version du texte de départ, conflit de sessions signalé, jamais de perte silencieuse.
- [P] Deux champs distincts : remarques pour l'élève (publiables) et notes internes et alertes (jamais publiées).
- [P] Validation distincte de la publication (Q6), exigeant 5 niveaux complets, tracée avec sa nature, avec réouverture possible.
- Repli manuel avec le même formulaire quand l'évaluation échoue ou que la copie est non évaluable ; retour de la copie à l'élève avec message (« À redéposer »).
- Journal inaltérable : auteur, date, valeurs avant et après, validations, décisions de visibilité, ouverture et fermeture de copie ; export pseudonymisé pour la mesure ; usage agrégé et non nominatif tant que Q14 n'est pas tranchée.

**Implémentation.** Formulaire de modification des niveaux et remarques avec recalcul de la note et contrôle de version. Actions de validation et de réouverture avec trace. Séparation des remarques pour l'élève et des notes internes dans le modèle de données. Évaluation manuelle depuis un état d'échec ou « non évaluable » ; retour d'une copie. Instrumentation du temps entre ouverture et validation. Export pseudonymisé du journal.

**Tests.**
- Unitaire : niveau hors de 0 à 4 refusé ; note recalculée ; validation impossible sans 5 niveaux ; réouverture rend la validation caduque.
- Intégration : le journal contient l'ancienne et la nouvelle valeur avec auteur et date ; l'évaluation IA d'origine reste inchangée ; deux sessions du même professeur = conflit signalé.
- Intégration : les notes internes et alertes n'apparaissent dans aucun modèle de lecture destiné à l'élève (le balayage de PUB-03 est rejoué avec de vraies alertes) ; une remarque pour l'élève modifiée est celle qui sera publiée.
- Intégration : copie en « évaluation échouée » ou « non évaluable » évaluée manuellement passe à « à valider » ; copie retournée = l'élève voit « À redéposer » avec le message et peut redéposer ; évaluation manuelle tracée comme telle.
- Rejouer en situation réelle : remplacement refusé sur une soumission validée (SUB-04) ; tri par note validée (REV-02) ; filtres validée (REV-03) ; états validée (PRC-03) ; note recalculée (EVL-04).
- E2E : le professeur ouvre une copie, modifie, valide ; temps de revue enregistré.
- Recette : un professeur pilote valide 20 copies en séance observée ; calcul à blanc des indicateurs de concordance depuis le journal sur données de test.
- Matrice de permissions : évaluations du professeur, journal.

**Critères de sortie.** Critères d'acceptation de REV-06 à REV-09 et PRC-05 verts. 100 % des copies validées conservent la proposition IA d'origine et le journal des modifications (contrôle automatisé). Temps de revue enregistré pour chaque copie validée ; journal inaccessible à l'élève. Séance observée de 20 copies validées sans perte de données. F10 (modification et supervision) démontrée en E2E au sens « modification des niveaux et des remarques, note recalculée » ; la lecture littérale « note modifiable à part » dépend de Q5b (REV-10).

**Risques.** Ancrage : le professeur valide sans lire, ce qui annule le gain de fiabilité. Halo réintroduit à la modification, l'identité n'étant pas masquée ; le plan ne fait que rendre la concordance mesurable. Notes internes publiées par erreur si la séparation est mal modélisée. Conflits d'édition entre sessions.

#### E10 — Publication et consultation par l'élève : premier cycle complet texte
**Objectif.** Le professeur autorise la visibilité d'un résultat validé et l'élève consulte sa note et son évaluation (version du professeur uniquement) ; le cycle complet, du compte à la consultation, est démontré en canal texte.
**Fonctionnalités.** PUB-01, PUB-02, PUB-04 (si retenue). **Dépend de :** E9. **Questions à consigner.** Q6, Q7.

**Conception.**
- [D] Le professeur autorise la visibilité de la note ; l'élève consulte note et résultat après validation et autorisation ; seul un résultat validé peut être publié.
- [Q6, défaut proposé] Validation et publication sont deux actes distincts avec raccourci « valider et publier » ; jamais de publication automatique ; publication par copie au MVP, en lot en V2.
- [Q7, défaut proposé] L'élève voit la note, niveau et justification par critère, remarques pour l'élève, sa propre copie, avec la mention « évaluation assistée par IA et validée par votre professeur » ; jamais la proposition IA ni les notes internes ; remarques dans la langue du devoir.
- [Conditionnel à Q6] PUB-04 : retrait de la visibilité et révision après publication, la version publiée restant affichée jusqu'à la nouvelle publication datée.
- Instantané de publication atomique et politique de mémoire des navigateurs telle qu'un retrait ne se rouvre pas par le bouton retour ; publication idempotente et tracée.

**Implémentation.** Action de publication sur une copie validée, y compris « valider et publier ». Écran de résultat de l'élève alimenté par la version publiée du professeur. Instantané de publication, retrait et mise à jour datée si PUB-04 est retenue. Script E2E du cycle complet texte couvrant F1 à F15 (hors image).

**Tests.**
- Unitaire : double clic = une seule publication ; publication refusée sur une copie non validée.
- Intégration : copie non validée = autorisation refusée en interface et en API ; élève qui forge une autorisation = refus ; l'élève B ne peut pas ouvrir le résultat de l'élève A.
- Intégration : évaluation modifiée avant publication = l'élève voit la version modifiée, jamais la proposition d'origine ; **aucune donnée de résultat dans les corps de réponse réseau avant publication, avec de vrais résultats IA** (rejeu de PUB-03) ; validée mais non autorisée = aucun résultat ; retrait puis bouton retour = aucun résultat réaffiché ; correction après publication = version à jour datée.
- Rejouer : état « Corrigé, résultat disponible » (SUB-05), état « publiée » (PRC-03), filtre « publiée » (REV-03).
- E2E : inscription, rattachement, devoir, remise texte, proposition IA, modification, validation, publication, consultation par l'élève.
- Recette client : liste de contrôle F1 à F15 (canal texte) déroulée avec le client, chaque fonctionnalité reliée à son cas de test.
- Matrice de permissions complète (toutes les ressources existantes) verte.

**Critères de sortie.** Critères d'acceptation de PUB-01, PUB-02 et PUB-04 (si Q6 la retient) verts. Traçabilité F1 à F15 vers cas de test tout au vert pour le canal texte. Zéro exposition de résultat avant publication dans les corps de réponse réseau, mesurée avec de vrais résultats IA. 100 % des évaluations publiées conservent la proposition IA d'origine et le journal. Matrice de permissions entièrement verte. F6 et F11 démontrées. Jalon : premier cycle complet texte.

**Risques.** Instantané de publication incohérent (note et remarques de versions différentes). Retrait de visibilité inefficace à cause de la mémoire du navigateur ou d'un lien conservé. Publication par erreur sans fonction de retrait si PUB-04 n'est pas retenue. Mention de l'IA mal comprise par des élèves ou des familles ; périmètre de ce que voit l'élève encore ouvert (Q7).

#### E11 — Canal image : remise, extraction branchée, affichage et correction de la transcription
**Objectif.** L'élève dépose une ou plusieurs pages scannées ; le texte est extrait fidèlement, évalué, affiché au professeur (image à la demande) et corrigeable ; le cycle complet est démontré en canal image.
**Fonctionnalités.** SUB-03, PRV-05, TRX-03, TRX-04 ; branches image de PRC-01, PRC-02, PRC-04, SUB-04 ; intégration de TRX-01. **Dépend de :** E10, E2 (décision G2 favorable). **Questions à consigner.** Q15, Q9.

**Conception.**
- [D] L'élève peut déposer une image scannée de sa production (lecture de la coquille de F4). [P] Cette étape n'est construite qu'après la décision G2 (Q17) ; si G2 refuse le canal, elle est retirée.
- [P] Plusieurs pages ordonnées, aperçu avant envoi ; JPEG et PNG (PDF et formats de téléphone à confirmer) ; poids et pages limités ; type vérifié sur le contenu ; une version de remise est faite d'images ou d'un texte, jamais des deux.
- [P] Métadonnées supprimées dès réception et nom de fichier neutre (PRV-05) ; stockage privé, chaque lecture contrôlée par session et par droit, aucun lien public ni permanent.
- Machine à états : états « extraction en cours », « extraction échouée » et « non évaluable » (image sans écriture) activés ; texte extrait stocké et associé à la remise.
- Affichage au professeur : texte d'abord, image à la demande, mention « transcrit automatiquement » (TRX-03). Correction : version distincte de la sortie du moteur, convention affichée, écart journalisé, évaluation du professeur jamais écrasée (TRX-04).
- Le canal image en français reste fermé tant que des copies manuscrites françaises n'ont pas été mesurées.

**Implémentation.** Écran de dépôt multipage avec aperçu et réordonnancement, utilisable sur téléphone. Contrôle de type, de poids, de corruption et d'orientation ; suppression des métadonnées ; stockage privé ; service de lecture d'image soumis à la matrice. Dépôt idempotent. Branchement du module d'extraction d'E2 à l'orchestrateur d'E7. Écrans d'affichage et d'édition de la transcription.

**Tests.**
- Unitaire : extension qui ne correspond pas au contenu, fichier trop gros, corrompu, absence de métadonnées de géolocalisation après traitement.
- Intégration : adresse d'image copiée hors session = pas d'accès ; accès refusé à un autre élève et à un autre professeur ; coupure réseau puis nouvel essai = une seule remise ; ordre des pages conforme ; refus = rien de créé ni de stocké.
- Intégration : remise image confirmée = extraction puis évaluation jusqu'à « à valider » ; texte stocké, associé et affiché ; 3 pages = texte dans l'ordre ; image sans écriture = « non évaluable ».
- Canaris et métadonnées : aucune métadonnée ni nom de fichier d'origine ne part vers l'IA ; taux de fuite du nom d'auteur mesuré.
- Charge : lot mixte texte et image de 100 remises, critère de PRC-02 rejoué.
- Transcription : correction = nouvelle proposition, ancienne conservée, écart journalisé, élève refusé ; extraction échouée puis transcription saisie = évaluation démarre ; évaluation du professeur déjà commencée = bandeau et choix tracé.
- E2E sur format téléphone : dépôt de 3 pages réordonnées avec confirmation datée ; même parcours complet avec une remise image jusqu'à la consultation par l'élève.
- Recette sur appareils réels : au moins 3 modèles de téléphone, photos prises dans des conditions variables.
- Matrice de permissions : images, transcriptions.

**Critères de sortie.** Critères d'acceptation de SUB-03, PRV-05, TRX-03, TRX-04 verts, et clauses image de TRX-01, PRC-01, PRC-02, PRC-04, SUB-04, EVL-05 et REV-05 rejouées. Aucune métadonnée dans le fichier stocké ni dans une copie destinée à l'IA, vérifié par outil. Matrice de permissions des images verte. F4 et F7 démontrées en E2E ; parcours de dépôt réussi sur au moins 3 appareils réels. Jalon : cycle complet image.

**Risques.** Formats natifs de téléphone non couverts par JPEG et PNG. Images mal orientées ou de mauvaise qualité qui dégradent la transcription. Élèves sans appareil ou sans connexion fiable : la numérisation incombe à l'élève (Q9). Stockage d'images de mineurs : durées et suppression en E12. Un nom écrit sur la copie atteint l'IA malgré la consigne. Corrections de transcription trop fréquentes qui consomment le gain de temps, ou normalisation des fautes par le professeur.

#### E12 — Conformité avant pilote
**Objectif.** Vérifier sécurité et suppression des données, finaliser la notice et la politique de conservation, et répéter le pilote avant toute ouverture à de vrais élèves.
**Fonctionnalités.** PRV-03 ; contenu final de PRV-01. **Dépend de :** E10, et E11 si le canal image est ouvert. **Questions à consigner.** Q12b, Q12c.

**Conception.**
- PRV-03 : durée de conservation par catégorie (compte, image, texte extrait, proposition IA, version finale, journal) fixée par le client (Q12c), suppression effective et non simple masquage, y compris les données dérivées ; conditions du fournisseur d'IA vérifiées (pas d'entraînement sur les contenus).
- Notice d'information finale (PRV-01) : contenu validé selon Q12b et Q12c, sans qualification juridique de notre part.
- Test d'intrusion léger manuel : accès croisés sur chaque ressource, adresses de fichiers, mémoire des navigateurs, corps de réponse.
- Critères de décision après pilote fixés avant le début.

**Implémentation.** Tâches de suppression selon les durées de conservation, vérification de la suppression et des données dérivées. Préparation du pilote : comptes professeur, classe, accompagnement, procédure d'incident, journal d'incidents.

**Tests.**
- Suppression : supprimer une copie supprime aussi texte extrait et proposition IA associés ; une donnée échue n'est plus accessible et disparaît du stockage.
- Intrusion légère : parcours manuel d'accès croisés professeur/élève sur toutes les ressources, adresses d'images copiées hors session, retour arrière.
- Répétition générale sur 100 copies de test avant l'arrivée des élèves.
- Rejeu des canaris et du contrôle de configuration gelée sur l'environnement du pilote.

**Critères de sortie.** PRV-03 vert, suppression vérifiée. Notice finale validée. Test d'intrusion réalisé sans constat grave ouvert (définition en section 1, O6). Matrice de permissions entièrement verte. Réponses à Q12b et Q12c consignées : sans elles, le pilote avec de vrais élèves ne démarre pas.

**Risques.** Élèves probablement mineurs et cadre légal inconnu. Durées de conservation en conflit avec le dossier de notes. Incident de fournisseur d'IA pendant la répétition.

#### E13 — Pilote encadré et mesure du gain de temps
**Objectif.** Faire fonctionner le cycle complet avec au moins un professeur et une classe de 20 élèves ou plus en conditions réelles, et mesurer le gain de temps avant toute ouverture à d'autres classes.
**Fonctionnalités.** QLT-04. **Dépend de :** E12. **Questions à consigner.** Q14 (échantillon de contrôle).

**Conception.**
- Protocole de pilote : au moins 1 professeur et 1 classe de 20 élèves ou plus, taille minimale par professeur fixée (8.3), indicateurs d'O1 (temps médian de revue contre chronométrage papier daté d'avant le pilote, avec intervalle et règle « non concluant » ; temps total par lot, moyenne et 90e centile ; délai d'un lot de 100 remises), d'O4 (concordance, agrégée et non nominative, sans seuil, y compris selon le rang de la copie dans la séance), d'O5 et d'O6.
- Les mesures viennent d'un export pseudonymisé du journal traité par l'équipe projet (REV-12 est V2).
- [Q14] Si le client l'accepte : échantillon de contrôle de K copies par professeur (K à définir) corrigées sans voir la proposition, comparées à l'IA et à un second expert, hors publication ; comparaison avec la base humaine consignée en E0 (notes rubriquées de 30 copies).
- Taux de transcriptions corrigées et audit d'un échantillon de la nature des corrections (lecture ou orthographe).
- Critères de décision élargir, ajuster ou arrêter fixés avant le début.

**Implémentation.** Extraction des mesures de temps, d'échec et de modification, agrégées et pseudonymisées. Accompagnement du pilote, procédure d'incident.

**Tests.** Mesure du temps médian de revue avec l'application contre la référence papier ; délai d'un lot de 100 remises ; taux de remises atteignant « à valider » sans relance ; rejeu de la mesure de fuite du nom d'auteur avec la consigne PRV-02 ; vérification que 100 % des évaluations publiées conservent la proposition d'origine et le journal.

**Critères de sortie.**
- O5 : au moins 1 professeur et 1 classe de 20 élèves ou plus font le cycle sans intervention technique ; au moins 95 % des remises atteignent « à valider » sans relance manuelle ; 100 % des évaluations publiées conservent proposition d'origine et journal.
- O6 : matrice entièrement verte, zéro exposition avant publication, aucun constat grave ouvert.
- O1 : gain de temps rapporté en médiane contre la référence papier (valeur de travail : au moins -50 %) avec intervalle ; si elle n'est pas atteinte ou non concluante, l'écart est consigné et non masqué.
- O4 rapporté de façon agrégée et non nominative ; taux de fuite du nom d'auteur rapporté ; décision d'élargir, d'ajuster ou d'arrêter documentée.

**Risques.** Chronométrage de référence absent ou effectué après coup : gain de temps non démontrable. Petit échantillon et effet d'observation : le gain mesuré peut ne pas se généraliser, et environ 20 copies par devoir ne permettent ni de conclure sur la fatigue ni de simuler 100 copies. Corrections de transcription et relectures qui annulent le gain. Incident de fournisseur d'IA pendant le pilote.

#### E14 — [V2] Cycle de vie de la classe et du devoir, alerte de qualité d'image, notifications
**Objectif.** Compléter la gestion avancée des classes et devoirs et le confort de l'élève, à partir de ce que le pilote a révélé.
**Fonctionnalités.** CLS-05, ASG-05, SUB-06, NTF-01. **Dépend de :** E13. **Questions à consigner.** Q8a (délai par classe).

**Conception.** Archivage d'une classe en lecture seule avec déclenchement du délai de conservation défini en E12. Ajout d'une classe à un devoir existant, prolongation, clôture, archivage et désarchivage. Avertissement non bloquant avant l'envoi pour image floue, sombre, tournée ou coupée, seuils calibrés sur les échecs constatés au pilote. Email de nouveau devoir, de copie à redéposer ou de résultat publié sans aucune note ni remarque, lien exigeant une connexion ; compteur « à valider » pour le professeur.
**Implémentation.** États et transitions d'archivage ; détection de qualité d'image ; service de notifications sans contenu de résultat.
**Tests.** Envoi à une classe archivée refusé, copies toujours consultables ; ajout de classe à un devoir ouvert ; devoir clos puis prolongé redevient ouvert ; taux de fausses alertes et de non-détections de l'alerte d'image ; email sans donnée de résultat ; lien sans session = connexion exigée ; matrice mise à jour.
**Critères de sortie.** Critères d'acceptation de CLS-05, ASG-05, SUB-06 et NTF-01 verts ; taux de fausses alertes accepté par le client ; aucun email ne contient de donnée de résultat (test automatisé) ; matrice toujours verte.
**Risques.** Dérive de périmètre (non demandé dans les 15 fonctionnalités). Seuils de qualité d'image mal calibrés. Notification qui divulgue un résultat avant publication.

#### E15 — [V2] Correction à l'échelle : lot, indicateurs, ajustement de note
**Objectif.** Réduire encore le temps de revue et rendre mesurable la concordance, sans transformer la validation en clic aveugle.
**Fonctionnalités.** REV-10 (si Q5b la retient), REV-11, REV-12, PUB-05. **Dépend de :** E13. **Questions à consigner.** Q14.

**Conception.** Décision préalable sur la validation en lot, la friction et l'usage des indicateurs, prise sur les mesures du pilote. Validation en lot réservée aux copies sans alerte et déjà ouvertes, consignée « validée par lot ». Publication en lot des résultats validés, avec écran de confirmation et rapport d'échec partiel. Indicateurs agrégés dans l'application (REV-12) à usage de mesure du produit. Ajustement direct de la note globale avec justification obligatoire, seulement si le client le retient.
**Implémentation.** Sélection multiple avec règles d'exclusion, publication en lot avec rapport, calcul des indicateurs depuis le journal avec accès restreint, ajustement de note justifié et distinct de la note calculée.
**Tests.** Une copie avec alerte dans la sélection est exclue ou la validation est refusée ; validation par lot marquée au journal ; publication de N copies = exactement N ; une copie non validée n'est pas publiée ; échec partiel = rapport explicite ; indicateurs calculés depuis le journal, accès refusé aux non autorisés ; comparaison du taux de validation sans modification avant et après la validation en lot pour détecter une dérive vers le clic aveugle.
**Critères de sortie.** Critères d'acceptation de REV-11, REV-12, PUB-05 (et REV-10 si retenue) verts ; réponse à Q14 consignée avant le début ; aucune publication d'une copie non validée possible en lot ; taux de validation sans modification surveillé sans dérive au-delà de la limite fixée avec le client.
**Risques.** La validation en lot favorise la validation sans lecture, qui annule le gain de fiabilité (P2). Les indicateurs peuvent être perçus comme une surveillance des professeurs. Un ajustement de note indépendant des niveaux ruine le standard commun.

#### E16 — [V2] Droits des élèves sur leurs données et dépôt de scans par le professeur
**Objectif.** Offrir à l'élève l'accès et la demande de suppression de ses données et, si le client le décide, permettre au professeur de déposer des copies scannées au nom des élèves.
**Fonctionnalités.** PRV-04, SUB-07 (si Q9 la retient). **Dépend de :** E13. **Questions à consigner.** Q9, Q12b.

**Conception.** Page « mes données » ne montrant que les données de l'élève, demandes d'accès, de rectification ou de suppression traitées par le responsable désigné (conflit avec le dossier de notes à trancher). Dépôt par le professeur de scans attribués à des élèves de sa classe, attribut « déposée par », vérification de l'attribution, puis traitement normal ; décision fondée sur la façon dont les copies sont réellement collectées (observée au pilote).
**Implémentation.** Page « mes données » et circuit de demandes ; dépôt en lot de scans avec écran d'attribution et de vérification.
**Tests.** La page « mes données » ne montre que les données de cet élève ; demande de suppression enregistrée et traitée ; lot de scans attribués = une soumission par élève, traitement normal ; scan attribué à un élève d'une autre classe = refus ; E2E du dépôt d'un lot jusqu'à « à valider » ; temps d'attribution des scans par copie comparé au gain de temps global.
**Critères de sortie.** Critères d'acceptation de PRV-04 (et SUB-07 si retenue) verts ; matrice toujours verte ; temps d'attribution compatible avec le gain de temps visé.
**Risques.** Une erreur d'attribution d'un scan fait attribuer une note au mauvais élève (impact élevé). Le temps d'attribution peut annuler le gain de temps (P1). Le cadre légal (Q12b) peut contraindre les demandes de suppression.

### 8.3 Valeurs de travail, paramètres et table de décision G1

Toutes ces valeurs sont des **propositions**. « Valeur de travail » : suggestion à valider ; « à définir » : aucune base pour proposer une valeur. Les seuils de qualité sont validés par le client (Q13b) et figés et datés en E0, avant toute mesure.

| Paramètre | Valeur | Utilisé par |
|---|---|---|
| Jeu scellé | au moins 100 copies par langue, 2 experts minimum | O2, QLT-01 |
| Jeu de calage | distinct du scellé ; au moins 30 par langue (valeur de travail, à confirmer par calcul de précision) | E1, QLT-01 |
| Jeu G2 | au moins 30 copies manuscrites d'élèves, transcription de référence double ; 2 ou 3 classes de lisibilité | O3a, QLT-03 |
| Kappa pondéré quadratique IA/expert | borne basse de l'intervalle à 95 % supérieure ou égale au kappa expert/expert moins 0,10 (valeur de travail) | QLT-01 |
| Accord à plus ou moins 1 niveau IA/expert | au moins 90 %, par critère et sur la note (valeur de travail) | QLT-01 |
| Stabilité | part des couples (copie, critère) au niveau identique sur 5 exécutions : au moins 90 % ; part des copies dont la note totale reste à plus ou moins 1 point sur 20 : à définir (suggestion 90 %) | O2, QLT-02 |
| Bande de stabilité | pour une copie témoin, niveau à plus ou moins 1 de la médiane des 5 exécutions sans consigne injectée, et écart moyen au plus 0,5 niveau (valeur de travail) | EVL-07, QLT-02 |
| Jeu adverse et jeu métamorphique | taille à définir (suggestion : 20 copies adverses, 30 copies métamorphiques, 5 exécutions chacune) ; critère : aucune sortie hors bande ; variation comparée au plancher de bruit | EVL-07, QLT-02 |
| Taux de rejet des sorties non conformes | à définir (suggestion : au plus 5 %) | EVL-06 |
| Latence et coût par copie ; tolérance de dérive banc/intégré | budget et tolérance à définir | E1, E7 |
| G2, écart de niveau | valeur absolue de l'écart moyen signé au plus 0,25 niveau ; écart absolu moyen au plus 0,5 (valeur de travail) | QLT-03 |
| G2, transcription | taux d'erreur de caractères et préservation des fautes : à définir ; « caractère inventé » = mot de la sortie absent de l'image, 0 toléré sur au moins 20 images dégradées (valeur de travail) | TRX-01, TRX-02 |
| Biais de sous-groupe | valeur absolue de l'erreur signée moyenne au plus 0,25 niveau par niveau scolaire, tranche de longueur et classe de lisibilité (à définir) | QLT-01 |
| Seuil de déclenchement du masquage automatique d'un nom | à définir | EVL-05, périmètre V2 |
| Seuil « copie très courte » | à définir | EVL-08 |
| Lot | au moins 95 % de 100 remises « à valider » dans les 30 minutes suivant le dernier dépôt | O1, PRC-02 |
| Affichage d'une liste de 150 puis 500 lignes | à définir avec le client (suggestion : moins de 2 secondes) | REV-01, REV-02 |
| Pilote, taille minimale par professeur | au moins 2 devoirs ou au moins 60 copies relues (à définir) | QLT-04 |
| Mot de passe | au moins 10 caractères (valeur de travail) | AUTH-01 |
| Validité des liens | vérification 24 h, réinitialisation 1 h, invitation professeur 7 jours (valeurs de travail) | AUTH-02, AUTH-04, AUTH-05 |
| Temporisation de connexion | après 5 échecs consécutifs, 15 minutes (valeur de travail) | AUTH-03 |
| Essais de code d'invitation | à définir (suggestion : 10 par heure et par compte) | CLS-02 |
| Tentatives automatiques N, durée maximale par étape | N = 3 (valeur de travail) ; durées à définir | PRC-04 |
| Limite de longueur du texte ; poids et nombre de pages d'images | à définir | SUB-02, SUB-03 |
| Plafond de remplacements par couple (devoir, élève) | 3 (valeur de travail) | SUB-04 |
| Fuseau horaire des échéances | à fixer | ASG-03 |
| Durées de conservation par catégorie | à définir (Q12c) | PRV-03 |

**Table de décision G1** (par langue, sur le jeu scellé, seuils figés en E0) :

| Résultat | Décision |
|---|---|
| La borne basse de l'intervalle de confiance atteint le seuil pour tous les critères et pour la note | **Continuer** pour cette langue |
| L'estimation atteint le seuil mais la borne basse est sous le seuil sur au moins un critère (non concluant) | **Ajuster** ou étendre l'échantillon |
| L'estimation est sous le seuil sur au moins un critère (cause identifiée : consigne, rubrique, transcription ; ou à investiguer d'abord) | **Ajuster** : nouvelle version, nouvelle mesure sur un **nouveau** jeu scellé (le précédent est consommé) |
| La borne haute est sous le seuil sur la note ou sur au moins deux critères, après deux cycles d'ajustement | **Arrêter** ou restreindre le périmètre (Q17) |

### 8.4 Récapitulatif fonctionnalité → étape

« Rejoué en » indique les critères d'acceptation qui supposent un état livré plus tard et sont vérifiés à cette étape.

| ID | Titre | Priorité | Étape | Rejoué en |
|---|---|---|---|---|
| AUTH-01 | Inscription de l'élève | MVP | E4 | |
| AUTH-02 | Vérification de l'adresse email | MVP | E4 | |
| AUTH-03 | Connexion et déconnexion | MVP | E4 | |
| AUTH-04 | Réinitialisation du mot de passe | MVP | E4 | |
| AUTH-05 | Création contrôlée des comptes professeur | MVP | E4 | |
| AUTH-06 | Cloisonnement des accès | MVP | E4 | E5, E6, E8, E11 (critères par ressource) |
| CLS-01 | Créer et nommer plusieurs classes | MVP | E5 | |
| CLS-02 | Générer un code d'invitation | MVP | E5 | |
| CLS-03 | Rejoindre une classe avec un code | MVP | E5 | E6 (élève dans deux classes) |
| CLS-04 | Consulter les élèves d'une classe et en retirer | MVP | E5 | |
| CLS-06 | Approuver ou refuser les demandes de rattachement | MVP (si Q2) | E5 | |
| CLS-05 | Archiver une classe | V2 | E14 | |
| ASG-01 | Créer un devoir | MVP | E5 | E6 (affichage chez l'élève) |
| ASG-02 | Sélectionner les classes destinataires | MVP | E5 | |
| ASG-06 | Lister mes devoirs et ouvrir un devoir | MVP | E5 | E7 (compteur « à valider ») |
| ASG-07 | Modifier ou supprimer un devoir sans remise | MVP | E6 | |
| ASG-03 | Appliquer le délai, marquer les remises en retard | MVP | E6 | |
| ASG-04 | Verrouiller le devoir dès la première remise | MVP | E6 | |
| ASG-05 | Gérer la vie du devoir | V2 | E14 | |
| SUB-01 | Espace personnel de remise | MVP | E6 | |
| SUB-02 | Remise par texte collé | MVP | E6 | |
| SUB-05 | Suivre l'état de sa remise | MVP | E6 | E9 (« À redéposer »), E10 (« Corrigé ») |
| SUB-04 | Remplacer sa remise avant validation | MVP | E7 | E9 (refus si validée), E11 (image) |
| SUB-03 | Remise par image(s) scannée(s) | MVP | E11 | |
| SUB-06 | Alerte de qualité d'image | V2 | E14 | |
| SUB-07 | Dépôt par le professeur au nom d'un élève | À décider (Q9) | E16 | |
| TRX-01 | Extraire le texte d'une image | MVP | E2 | E11 (stockage, affichage, ordre) |
| TRX-02 | Transcription fidèle, sans correction | MVP | E2 | |
| TRX-03 | Consulter le texte transcrit, image à la demande | MVP | E11 | |
| TRX-04 | Corriger la transcription et relancer l'évaluation | MVP | E11 | |
| EVL-01 | Rubrique unique, fixe et versionnée | MVP | E1 | |
| EVL-02 | Proposition d'évaluation par critère | MVP | E1 | E7 (double déclenchement, panne) |
| EVL-03 | Remarques de l'évaluation | MVP | E1 | |
| EVL-04 | Calcul de la note | MVP | E1 | E9 (recalcul après modification) |
| EVL-06 | Rejeter toute sortie non conforme | MVP | E1 | |
| EVL-07 | Texte et instructions traités comme des données | MVP | E1 | |
| EVL-10 | Tracer chaque exécution de l'IA | MVP | E1 | |
| EVL-05 | Aucune donnée d'identité transmise à l'IA | MVP | E3 | E11 (images, métadonnées) |
| EVL-08 | Signaler les copies non évaluables ou atypiques | MVP | E3 | E6 (balayage élève), E9 |
| EVL-09 | Évaluation en français conditionnée à la rubrique validée | À décider (Q11) | E3 | |
| PRC-01 | Traiter automatiquement chaque remise | MVP | E7 | E11 (image) |
| PRC-02 | Traiter plusieurs copies à la fois | MVP | E7 | E11 (lot mixte) |
| PRC-03 | Suivre l'état de chaque soumission | MVP | E7 | E9, E10 (états validée, publiée) |
| PRC-04 | Gérer les échecs d'extraction et d'évaluation | MVP | E7 | E11 (extraction) |
| PRC-06 | Mesurer durées, taux d'échec et coût | MVP | E7 | |
| PRC-05 | Évaluer manuellement ou retourner une copie | MVP | E9 | |
| REV-01 | Liste des soumissions d'un devoir | MVP | E8 | |
| REV-02 | Trier par note, date ou ordre alphabétique | MVP | E8 | E9 (note validée) |
| REV-03 | Filtrer par classe et par état | MVP | E8 | E9, E10 (validée, publiée) |
| REV-04 | Ouvrir la copie par un clic sur le nom | MVP | E8 | |
| REV-05 | Consulter une copie et la proposition de l'IA | MVP | E8 | E11 (copie image) |
| REV-06 | Modifier les niveaux et les remarques | MVP | E9 | |
| REV-07 | Valider l'évaluation | MVP | E9 | |
| REV-08 | Conserver la proposition d'origine et le journal | MVP | E9 | |
| REV-09 | Séparer remarques pour l'élève et notes internes | MVP | E9 | |
| REV-10 | Ajuster directement la note globale | À décider (Q5b) | E15 | |
| REV-11 | Valider plusieurs copies en lot | V2 | E15 | |
| REV-12 | Indicateurs de concordance IA/professeur | V2 | E15 | |
| PUB-03 | Aucun résultat exposé avant publication | MVP | E6 | E10 (vrais résultats, dépublication) |
| PUB-01 | Autoriser la visibilité du résultat | MVP | E10 | |
| PUB-02 | Consulter sa note et le résultat | MVP | E10 | |
| PUB-04 | Retirer la visibilité, modifier après publication | À décider (Q6) | E10 | |
| PUB-05 | Publier plusieurs résultats en lot | V2 | E15 | |
| NTF-01 | Notifier par email | V2 | E14 | |
| PRV-01 | Notice d'information avant la première remise | MVP | E6 | E12 (contenu final) |
| PRV-02 | Consigne « pas de nom dans votre production » | MVP | E6 | |
| PRV-05 | Suppression des métadonnées des images | MVP | E11 | |
| PRV-03 | Durées de conservation et suppression effective | MVP | E12 | |
| PRV-04 | Demande d'accès, de rectification ou de suppression | V2 | E16 | |
| QLT-03 | Mesurer la fidélité de la transcription (G2) | MVP | E2 | |
| QLT-01 | Mesurer l'accord IA/experts (G1) | MVP | E3 | |
| QLT-02 | Mesurer la stabilité et la robustesse de l'IA | MVP | E3 | |
| QLT-04 | Mesurer le gain de temps de correction | MVP | E13 | |

**Disponibilité de vos 15 demandes**

| F# | Démontrée à l'étape | Remarque |
|---|---|---|
| F1, F2 | E4 | Inscription, vérification, connexion. |
| F3 | E5 puis E6 | Rattachement (E5), espace de remise de l'élève (E6). |
| F4 | E11 | Après la décision G2. |
| F5 | E6 | Remise par texte collé. |
| F6 | E10 | Consultation après validation et autorisation. |
| F7 | E2 (preuve), E11 (intégré) | Visible du professeur en E11. |
| F8, F9 | E1 et E3 (preuve), E7 (texte branché), E11 (image) | Note et remarques visibles du professeur en E8. |
| F10 | E8 (consultation), E9 (modification, validation) | Lecture littérale « note modifiable à part » : Q5b. |
| F11 | E10 | Autorisation de visibilité. |
| F12 | E5 (création), E6 (modification, suppression avant remise) | |
| F13 | E5 (point d'entrée, liste des devoirs), E8 (liste, tri, ouverture) | |
| F14 | E5 | Classes, élèves, envoi. |
| F15 | E5 | Sélection des classes à la création. |

---

## 9. Questions ouvertes

22 questions. Chacune a une recommandation, qui n'est **pas** une décision tant que vous ne l'avez pas confirmée. La mention « Bloque » indique l'étape qui ne peut pas commencer sans réponse.

### Q1 — Comment un professeur obtient-il un compte, et existe-t-il un administrateur ?
- **Pourquoi.** Aucune des 15 fonctionnalités ne crée un compte professeur. Le professeur voit les copies et identités de ses élèves : qui peut le devenir est une question de sécurité, et elle fait apparaître un acteur absent des demandes.
- **Options.** (a) Création par un administrateur via un outil minimal, par invitation (MVP) ; (b) invitation par email émise par l'administrateur ; (c) inscription libre avec validation manuelle ; (d) restriction à un domaine d'email d'établissement.
- **Recommandation.** (a) au MVP (pilote de quelques professeurs) ; inscription avec validation en V2. À confirmer : qui est l'administrateur (vous, un établissement) ?
- **Bloque.** E4.

### Q2 — Comment un élève entre-t-il dans une classe, dans combien de classes, avec combien de professeurs par classe ?
- **Pourquoi.** Définit concrètement « le professeur lié à l'élève », donc le correcteur unique de chaque copie. Une inscription libre sans contrôle laisse un élève se rattacher à la mauvaise classe ou une personne extérieure s'infiltrer.
- **Options.** (a) Code d'invitation simple ; (b) code avec approbation du professeur ; (c) liste d'emails ou CSV fournie par le professeur (V2) ; (d) ajout par le professeur après recherche de l'email.
- **Recommandation.** (b) ; un élève dans plusieurs classes ; une classe a un seul professeur en v1 ; le correcteur est le créateur du devoir. Si (a) est retenu, CLS-06 est retirée.
- **Bloque.** E5.

### Q3 — Confirmez-vous que toute remise est rattachée à un devoir reçu, sans dépôt libre ?
- **Pourquoi.** Le critère Task Achievement (20 % de la note) ne peut pas être noté sans sujet ni instructions, et la langue du devoir détermine la version de la rubrique. Vos 15 demandes ne le disent pas explicitement : c'est une question de confirmation, la réponse attendue étant « oui ».
- **Options.** (a) Oui, jamais de dépôt libre ; (b) dépôt libre aussi, avec un critère Task Achievement neutralisé ou une règle à définir, ce qui contredit la rubrique unique.
- **Recommandation.** (a) : une soumission active par couple (élève, devoir), pas de dépôt libre en v1.
- **Bloque.** E6.

### Q4 — Que signifie le « niveau des élèves » d'un devoir, et est-il transmis à l'IA ?
- **Pourquoi.** La rubrique est unique pour tous les niveaux : transmettre le niveau à l'IA change la signification d'un « 4 » et contredit la décision validée. Un devoir envoyé à plusieurs classes de niveaux différents n'a pas un niveau unique. Enfin, des experts qui adaptent leurs attentes au niveau produisent un désaccord qui ne mesure pas la qualité de l'IA.
- **Options.** (a) Étiquette portée par le devoir, non transmise à l'IA (comme demandé) ; (b) attribut de la classe, hérité par le devoir ; (c) contexte d'attente transmis à l'IA, mesuré par niveau. Sous-question : valeurs possibles (niveau scolaire, niveau du CECRL, autre) ; les experts de G1 connaissent-ils le niveau scolaire ?
- **Recommandation.** (a), liste fermée de valeurs, non transmise en v1, avertissement si les classes ciblées ont des niveaux différents ; les experts ne connaissent pas le niveau et appliquent la rubrique telle quelle.
- **Bloque.** E0, car le contrat d'entrée de l'IA (E1) et la mesure G1 (E3) en dépendent.

### Q5a — La note est-elle sur 20 ou sur 100 ?
- **Pourquoi.** Format de conversion des niveaux en note finale, point reporté de solution.md.
- **Options.** (a) Sur 20 : somme des 5 niveaux ; (b) sur 100 : 5 fois la somme.
- **Recommandation.** (a), recalculée à chaque modification de niveau.
- **Bloque.** E0 (EVL-04, E1).

### Q5b — Le professeur peut-il imposer une note différente de celle qui découle des niveaux ?
- **Pourquoi.** F10 dit « modifier la note ». Une note indépendante des niveaux affichés rend la rubrique incohérente et réintroduit les écarts (P2).
- **Options.** (a) Non : la note ne se modifie qu'en modifiant les niveaux ; (b) oui, avec justification obligatoire, marquage « ajustement » et note calculée affichée à côté.
- **Recommandation.** (a) au MVP ; REV-10 en V2 seulement si vous le voulez. Si vous répondez (b), REV-10 est avancée en E9.
- **Bloque.** E0 (consignée) ; E9.

### Q6 — « Validé » et « autorisé » sont-ils deux actes ou un seul ? Publication par copie, devoir ou classe ? Retrait et modification après publication ?
- **Pourquoi.** F6 exige « validé et autorisé », F10 ne nomme pas la validation, F11 parle d'autoriser. Détermine les états de la copie et le risque de validation sans lecture.
- **Options.** (a) Deux actes distincts avec raccourci « valider et publier » ; (b) un seul acte ; (c) publication individuelle seulement au MVP, en lot en V2.
- **Recommandation.** (a) et (c) ; retrait possible ; modification après publication tracée avec mention « mise à jour » (PUB-04).
- **Bloque.** E0 (consignée avant E6, qui implémente la machine) ; E10.

### Q7 — Que voit exactement l'élève après publication, dans quelle langue, avec quelle mention de l'IA ?
- **Pourquoi.** F6 dit « la note et le résultat ». Un jeune apprenant d'anglais peut ne pas comprendre des remarques en anglais ; la transparence sur l'IA est une question éthique qui dépend du cadre légal inconnu.
- **Options.** (a) Note seule ; (b) note, niveaux et remarques validées, avec sa copie ; (c) remarques dans la langue du devoir ou en français ; (d) mention « évaluation assistée par IA » ou non.
- **Recommandation.** (b), jamais la proposition IA brute ; mention de l'IA ; remarques dans la langue du devoir par défaut, modifiables par le professeur.
- **Bloque.** E0 (langue des remarques, E1) ; E10.

### Q8a — Que signifie « délai » : date limite ou durée ? Retard accepté ? Prolongation ? Délai commun ou par classe ?
- **Pourquoi.** Chaque choix change les états de la copie et le fonctionnement de la liste du professeur. Telle que la machine à états est écrite, l'échéance est un seuil de retard.
- **Options.** (a) Date et heure limites ; retard accepté et marqué ; (b) retard refusé ; (c) prolongation possible dès le MVP ; (d) délai par classe.
- **Recommandation.** Date limite unique ; retard accepté et marqué « en retard », refus possible par devoir ; prolongation (ASG-05) et délai par classe en V2. Limite connue : l'échéance n'est pas modifiable après la première remise en MVP.
- **Bloque.** E5.

### Q8b — Jusqu'à quand l'élève peut-il remplacer sa remise ?
- **Pourquoi.** Un remplacement relance des traitements payants et peut rendre caduc le travail de revue du professeur. Un remplacement après l'échéance contourne le délai.
- **Options.** (a) Jusqu'à la validation ; (b) jusqu'à l'échéance ; (c) jusqu'à la validation, mais refusé dès qu'une évaluation du professeur existe (le professeur retourne alors la copie) ; avec ou sans plafond, avec ou sans remplacement après l'échéance.
- **Recommandation.** (c) ; après l'échéance seulement si la copie a été retournée ; plafond de remplacements de 3 ; anciennes versions conservées ; l'évaluation du professeur n'est jamais écrasée.
- **Bloque.** E7.

### Q9 — Les copies arrivent-elles uniquement par les élèves, ou le professeur doit-il aussi pouvoir déposer des scans au nom des élèves ?
- **Pourquoi.** La problématique part d'un professeur devant une pile de copies papier. Si l'élève doit numériser lui-même, cela suppose un appareil, une connexion et une autonomie pour tous les niveaux scolaires, et le gain de temps peut être perdu.
- **Options.** (a) Élève seul au MVP (conforme à F4 et F5) ; (b) dépôt par le professeur au nom de l'élève en plus.
- **Recommandation.** (a) ; SUB-07 en V2, à prioriser selon la population réelle (âge, équipement).
- **Bloque.** E16 (et le cadrage du pilote).

### Q10 — Faut-il laisser le professeur choisir les modes de remise autorisés par devoir ? Acceptez-vous la limite sur l'authenticité d'un texte collé ?
- **Pourquoi.** Un texte tapé n'a pas la même valeur pour Mechanics qu'une copie manuscrite (autocorrection), et l'application ne peut pas savoir s'il a été écrit par l'élève.
- **Options.** (a) Les deux modes toujours autorisés ; (b) modes choisis par devoir ; (c) détection de texte généré (écartée : peu fiable, risque de fausses accusations).
- **Recommandation.** (a) au MVP, mode de remise enregistré et affiché au professeur ; (b) en V2 ; limite d'authenticité écrite dans l'objectif.
- **Bloque.** E6.

### Q11 — Quand la version française de la rubrique sera-t-elle validée ? Accepte-t-on une livraison par langue ?
- **Pourquoi.** F12 ouvre le français, mais l'évaluation d'un devoir français n'a pas de standard approuvé tant que la rubrique française n'est pas validée. Mechanics en français couvre accents et accords.
- **Options.** (a) Livraison par langue : anglais, puis français après validation ; (b) attendre la validation pour tout livrer ; (c) évaluation française avec rubrique provisoire (contredit la rubrique unique).
- **Recommandation.** (a) ; devoirs en français créables, évaluation IA bloquée jusqu'à la validation (EVL-09), le professeur évaluant manuellement dans l'intervalle.
- **Bloque.** E0 (échéance de retour) ; E3.

### Q12a — Peut-on utiliser de vraies copies d'élèves dans un corpus de mesure, et quelles sont les conditions des prestataires d'IA et de transcription ?
- **Pourquoi.** Les mesures G1 et G2 envoient des copies à un prestataire. Sans autorisation ni vérification de ses conditions (pas d'entraînement sur les contenus, localisation, conservation), même le banc de mesure est un traitement de données d'élèves, probablement mineurs.
- **Options.** (a) Corpus de copies réelles anonymisées et autorisées ; (b) corpus fourni par un établissement avec convention ; (c) copies synthétiques seulement (mesure non représentative).
- **Recommandation.** (a), avec vérification et consignation des conditions des prestataires avant tout envoi.
- **Bloque.** E0 (tout envoi de vraies copies à E1, E2, E3).

### Q12b — Dans quel pays et sous quel cadre l'application sera-t-elle utilisée ? Quel est l'âge réel des élèves ? Qui est responsable du traitement ? Que faire des élèves sans adresse email ?
- **Pourquoi.** Détermine le consentement, l'âge minimal, les transferts hors du pays et l'acceptabilité d'envoyer des copies de mineurs à des services d'IA tiers. Aucune conclusion juridique n'est possible sans ces réponses.
- **Options.** (a) Pays et cadre précisés avec le client ; (b) comptes élèves créés par le professeur pour les élèves sans email (V2) ; (c) email d'un parent.
- **Recommandation.** Trancher avant tout pilote avec de vrais élèves. D'ici là, minimisation des données (email, mot de passe, nom, prénom) et aucune vraie copie à un prestataire hors de Q12a.
- **Bloque.** E12 (donc E13).

### Q12c — Quelles durées de conservation pour chaque catégorie de données ?
- **Pourquoi.** Nécessaire à la notice (PRV-01) et à la suppression effective (PRV-03). L'image d'un élève mineur ne doit pas rester plus que nécessaire ; les durées du dossier de notes dépendent du cadre légal.
- **Options.** Une durée par catégorie : compte, image, texte extrait, proposition IA, version finale, journal.
- **Recommandation.** Image gardée le temps de la révision par le professeur, puis supprimée ; autres durées à fixer avec le responsable du traitement.
- **Bloque.** E12.

### Q13a — Qui fournit les copies de mesure, les experts et le chronométrage de référence ?
- **Pourquoi.** Sans corpus, experts et chronométrage décidés d'avance, F7 et F8 ne se testent que techniquement. Les délais (autorisations, annotation) en font le chemin critique. Effectifs visés : jeu scellé d'au moins 100 copies par langue, jeu de calage distinct, 30 copies manuscrites pour G2, au moins 2 experts, 30 copies chronométrées par professeur pilote.
- **Options.** (a) Le client fournit corpus et experts ; (b) constitution par l'équipe projet avec autorisation du client ; (c) étude externe avec export des données.
- **Recommandation.** Lancer maintenant la constitution du corpus et le recrutement des experts, en parallèle de la conception.
- **Bloque.** E0.

### Q13b — Quels seuils d'accord, de stabilité et de fidélité jugez-vous suffisants, et acceptez-vous la table de décision G1 ?
- **Pourquoi.** Les seuils doivent être figés **avant** de voir les résultats. Ceux du tableau 8.3 sont des valeurs de travail, pas des références publiées : le client peut les juger trop sévères ou trop laxistes.
- **Options.** (a) Valeurs de travail du 8.3 ; (b) valeurs ajustées par le client ; (c) calcul de précision préalable pour confirmer qu'elles sont atteignables avec l'effectif prévu.
- **Recommandation.** (a) puis (c), validées par le client et datées avant toute mesure.
- **Bloque.** E0.

### Q14 — Accepte-t-on la validation en lot ? Qui voit les indicateurs de concordance ? Veut-on un échantillon de contrôle corrigé à l'aveugle dès le pilote ?
- **Pourquoi.** La validation en lot sert P1 mais favorise le « clic-valide ». Les indicateurs nominatifs seraient une surveillance des professeurs. La concordance ne mesure pas l'ancrage : seul un échantillon corrigé sans voir la proposition le mesure, et fournit aussi une base de constance humaine pour P2.
- **Options.** (a) Pas de validation en lot au MVP ; (b) validation en lot réservée aux copies sans alerte et déjà ouvertes ; (c) indicateurs agrégés seulement ; (d) indicateurs par professeur ; (e) échantillon de contrôle à l'aveugle (K copies par professeur pilote, hors publication) dès le pilote ; (f) échantillon à l'aveugle en V2 après mesure.
- **Recommandation.** (a), (c) et (e) ; journal conservé dès le premier jour ; K à définir avec les professeurs pilotes.
- **Bloque.** E9 (usage du journal) ; E13 (échantillon) ; E15.

### Q15 — Acceptez-vous que le professeur corrige la transcription (avec relance de l'évaluation), que l'élève ne puisse pas la corriger, et que la vue par défaut montre le texte avant l'image ?
- **Pourquoi.** La transcription est l'entrée de l'IA. Sans correction possible, une erreur de lecture devient une erreur de note ; si l'élève corrigeait, il corrigerait ses fautes. Le professeur peut lui-même normaliser les fautes en corrigeant : l'écart est donc affiché et journalisé.
- **Options.** (a) Oui aux trois ; (b) image d'abord par défaut ; (c) pas de correction de la transcription.
- **Recommandation.** (a) (TRX-03, TRX-04) ; la vue texte d'abord limite l'influence de l'écriture, l'image reste accessible à la demande.
- **Bloque.** E8 (vue par défaut) ; E11.

### Q16 — Le professeur doit-il pouvoir consulter l'historique des soumissions passées d'un élève, hors de l'écran de correction ?
- **Pourquoi.** F13 peut se lire de deux façons. Montrer l'historique au moment de corriger réintroduit l'effet de halo, source de P3.
- **Options.** (a) Non : seulement la copie de cet élève pour ce devoir ; (b) vue d'historique séparée, hors écran de correction ; (c) historique visible dans l'écran de correction.
- **Recommandation.** (a), sans note ni moyenne antérieure à l'écran ; (b) éventuelle en V2.
- **Bloque.** E8.

### Q17 — Acceptez-vous que la livraison de l'image (F4, F7) et de l'évaluation par IA (F8) soit conditionnée aux mesures, et que le texte soit livré avant l'image ?
- **Pourquoi.** Ce sont des demandes de l'utilisateur, mais l'entrée par images est conditionnée à G2 et l'évaluation à G1, deux mesures qui peuvent conclure « ajuster » ou « arrêter ». Le plan propose de livrer d'abord le canal texte, qui n'a besoin d'aucune transcription.
- **Options.** (a) Oui : texte d'abord, image après G2, et décision continuer, ajuster ou arrêter à chaque jalon ; (b) tout livrer quel que soit le résultat des mesures ; (c) attendre G1 et G2 pour commencer toute l'application.
- **Recommandation.** (a). Si G1 conclut « arrêter », le périmètre est à revoir plutôt que livré tel quel ; si G2 refuse l'image, le cycle texte reste livrable.
- **Bloque.** E0.
