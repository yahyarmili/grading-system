# Besoins non fonctionnels

> Étape 5 de la démarche d'ingénierie. Statut : **validé** par l'utilisateur, mis à jour avec ses réponses aux questions QNF-1 à QNF-6. Quatre questions restent ouvertes (QNF-1, QNF-4, QNF-5, QNF-7, section 6). **Cadre démonstration depuis le 2026-10-12** (section 1) : pas de vrais élèves, acteurs de simulation ; le statut en démonstration de chaque exigence est en 2.8.
> Fait suite à [problematique.md](problematique.md), [solution.md](solution.md) et [fonctionnalites.md](fonctionnalites.md). Le détail de chaque exigence (trace, valeurs de travail, vérification) est dans [annexe-nfr-detaille.md](annexe-nfr-detaille.md), sous le même identifiant. Cette annexe date d'avant vos réponses : elle suppose encore un pays inconnu, des élèves probablement mineurs et une équipe technique distincte.

**En bref.** 22 exigences en 7 catégories. Vos réponses (Maroc, élèves de 18 ans, administrateur-exploitant en V1, LLM gratuit, application web responsive) sont intégrées. 4 questions restent ouvertes. Aucune technologie n'est choisie (étape 7). Presque toutes les valeurs chiffrées sont « à définir » : aucune n'est décidée.

**Critère de nécessité.** Une exigence n'est retenue que si elle découle d'une fonctionnalité, d'une décision ou d'un risque déjà identifiés, et si son absence changerait la conception ou les tests. Priorités : *obligatoire* (MVP ou usage de données réelles), *important*. « · E6 » = étape de construction de `fonctionnalites.md` où l'exigence se vérifie.

---

## 1. Décisions et hypothèses

**Vos décisions [D]**
- **Pays : Maroc. Âge des élèves : 18 ans.** À confirmer : la problématique parle de « tous niveaux scolaires », donc tous les élèves visés ont-ils 18 ans ou plus (QNF-1) ?
- **Exploitation : l'administrateur exploite l'application en V1** (restaurations, suppressions, alertes, journal de sécurité) ; une équipe technique distincte est reportée à plus tard.
- **Échelle : démonstration avec acteurs de simulation** (remplace le pilote d'un professeur, 2026-10-12) ; on ne dimensionne rien au-delà. Seul chiffre connu : plus de 100 copies à corriger en une journée, utilisé comme « lot de référence de 100 remises » (ordre de grandeur de test, pas un volume décidé), en copies fictives.
- **L'élève ne revoit pas l'image de sa copie** : il voit seulement le résultat publié.
- **IA : un LLM gratuit en V1.** Lequel : QNF-5.
- **Plateforme : application web responsive en V1.** Élèves surtout sur téléphone, professeurs sur ordinateur.
- Trois acteurs : administrateur, professeur, élève. D10 : la mesure de qualité est un test après construction, jamais un jalon bloquant.
- **Projet académique** (2026-10-12) : c'est le projet d'un collègue de l'utilisateur, qui joue le rôle du « client ». L'utilisateur est le seul développeur.
- **Budget strictement 0 MAD** : aucun service payant, aucun domaine acheté.
- **Démonstration, pas de vrais élèves** : des acteurs de simulation saisissent des données fictives pour démontrer la solution. Les exigences d'un usage réel restent écrites ; celles qui ne sont pas exécutées en démonstration sont listées en 2.8.

**Hypothèses** : interface en anglais [D, 2026-10-12] ; démonstration à effectif réduit avec repli manuel (évaluation sans IA).

**Cadre légal marocain** (à confirmer par la CNDP ou un juriste ; ce n'est pas un avis juridique). La loi 09-08 et la CNDP imposent en principe une **déclaration préalable** de tout traitement automatisé de données personnelles, une **autorisation préalable pour les transferts vers l'étranger** (un prestataire d'IA hors du Maroc en est un), et l'**information des personnes concernées** (responsable, finalité, destinataires, droits d'accès et de rectification). Les numéros d'articles cités par les sources divergent : consulter le texte officiel. Sources : [CMS](https://cms.law/fr/mar/legal-updates/flash-info-maroc-etat-des-lieux-de-la-protection-des-donnees-a-caractere-personnel-au-maroc-loi-n-09-08), [guide Upsilon](https://upsilon-consulting.com/declarations-autorisations-cndp-guide-pratique/), [CNDP](https://www.cndp.ma/rgpd/).

---

## 2. Les exigences

### 2.1 Protection des données et conformité
Les copies de 18 ans quittent l'application vers un prestataire d'IA tiers, gratuit en V1. En démonstration, seules des données fictives la quittent.

| ID | Exigence | Valeur | Priorité |
|---|---|---|---|
| NFR-DON-01 | **Inventaire, conservation, suppression.** Un registre donne, par catégorie de donnée, sa finalité, qui y accède, les tiers et pays destinataires, la durée. Supprimer une copie ou un compte supprime aussi versions, transcription, propositions, journal et sauvegardes échues. L'élève ne revoit jamais l'image de sa copie : elle peut être supprimée dès la fin de la revue. | Durées et délais : à définir (QNF-4) | Obligatoire · avant tout usage réel |
| NFR-DON-02 | **Prestataire d'IA et de lecture.** Aucune copie réelle n'est envoyée à un prestataire avant qu'une fiche écrite (usage des contenus pour entraîner des modèles, pays, conservation, sous-traitants) soit validée par le client. D'ici là, données synthétiques. Une offre gratuite peut autoriser l'usage des contenus pour améliorer ses modèles (cas documenté pour l'offre gratuite de l'[API Gemini](https://ai.google.dev/gemini-api/docs/pricing)) : la fiche doit trancher. Hors du Maroc, le transfert exige l'autorisation de la CNDP. | 1 fiche par prestataire ; 0 envoi réel sans activation tracée | Obligatoire · avant tout envoi réel |
| NFR-DON-03 | **Conformité marocaine paramétrable.** Information ou consentement, mention de l'IA, notices, durées et coordonnées du responsable sont des paramètres modifiables sans toucher aux règles métier, fixés par une fiche de décision validée. Avant l'usage réel : déclaration à la CNDP et, si le prestataire est hors du Maroc, demande d'autorisation de transfert. Élèves de 18 ans : aucun consentement parental supposé. | Fiche complète et déclaration déposée avant tout usage réel | Obligatoire · avant tout usage réel |
| NFR-DON-04 | **Notices exactes.** Le professeur est informé, avant son premier accès, de ce que mesure le journal (temps de revue, concordance avec l'IA). L'élève lit, avant sa première remise, le responsable du traitement, la finalité, ce qui est envoyé à une IA tierce, ce que voit le professeur, ses droits d'accès et de rectification. Aucune notice ne promet que son nom n'est pas transmis (Q10). | 100 % des utilisateurs, avant le premier usage | Obligatoire · E4 à E8 |
| NFR-DON-05 | **Journal de sécurité et journaux propres.** Un journal distinct du journal pédagogique enregistre connexions, refus d'accès, lectures d'images, envois à un prestataire, accès de l'administrateur aux données de production, suppressions. Aucun secret, identité ou contenu de copie dans les journaux techniques. | 0 valeur sensible dans les journaux | Obligatoire · E1 |

### 2.2 Sécurité des accès
Inscription ouverte et rattachement sans approbation (D2) : la sécurité repose sur le contrôle d'accès, la limitation des essais et des liens non devinables.

| ID | Exigence | Valeur | Priorité |
|---|---|---|---|
| NFR-SEC-01 | **Contrôle d'accès.** La matrice d'accès (fonctionnalites.md 5.4) est appliquée côté serveur, en un point unique, quel que soit le canal. Une ressource d'autrui ne se distingue pas d'une ressource inexistante. Dans l'application, l'administrateur ne lit aucune copie (en exploitation, il garde un accès technique : QNF-7). Les images n'ont pas de lien public. Aucun texte saisi ni sortie de l'IA n'est interprété comme code. | 100 % des interdits de la matrice testés, rejoués à chaque modification | Obligatoire · E1 |
| NFR-SEC-02 | **Mots de passe, essais, sessions.** Mots de passe faibles refusés et jamais stockés en clair. Échecs répétés ralentis (connexion, code de classe, demande de lien, inscription). Sessions expirantes, invalidées à la déconnexion, sans perte silencieuse de saisie. | Longueur minimale, essais, durées : à définir | Obligatoire · E1 |
| NFR-SEC-03 | **Liens et codes.** Liens de confirmation, de réinitialisation et d'invitation, lien et code de classe : non devinables, expirants, stockés sous forme d'empreinte ; les trois premiers à usage unique. Renouveler ou désactiver le lien de classe agit immédiatement. Sans approbation, ce sont les seules défenses d'une classe. | Durées de vie : à définir (Q7 pour la classe) | Obligatoire · E1, E2 |

### 2.3 Traitement et performance

| ID | Exigence | Valeur | Priorité |
|---|---|---|---|
| NFR-TRT-01 | **Traitement par lots borné.** Plusieurs copies sont traitées en même temps, sans action humaine ; chaque remise atteint un état final visible du professeur. Les appels au prestataire ont une durée et des tentatives bornées, et une remise lente n'en bloque pas d'autres. En panne totale ou quota épuisé, évaluation manuelle, validation et publication restent possibles. | Lot de référence : 100 remises ; le quota de l'offre gratuite peut être inférieur : à vérifier avant E6 ; délai cible : à définir, rapporté tel quel (D10) | Obligatoire · E6 |
| NFR-TRT-02 | **Limites de remise et fidélité du texte.** Formats, poids, nombre de pages et longueurs sont définis, annoncés avant l'envoi et appliqués par le serveur ; une remise hors limites est refusée avec un message, sans rien stocker. Le texte est conservé sans altération (accents, apostrophes, retours à la ligne), correction automatique désactivée quand la plateforme le permet. | Valeurs : à définir selon le prestataire et les téléphones | Obligatoire · E4, E9 |
| NFR-TRT-03 | **Réactivité de la revue.** Au volume du cas haut, la liste des remises, l'ouverture d'une copie et l'enregistrement d'une modification ne deviennent pas la partie lente de la correction. | Seuil : à définir | Important · E7 |

### 2.4 Fiabilité et reprise
Pas de haute disponibilité : on garantit qu'une remise confirmée n'est jamais perdue et que les données se restaurent.

| ID | Exigence | Valeur | Priorité |
|---|---|---|---|
| NFR-FIA-01 | **Intégrité des remises et concurrence.** Une remise confirmée n'est jamais perdue, dupliquée ni attribuée à un autre élève, même en cas de panne ; sa confirmation ne dépend pas du traitement. Un pic avant la date limite ne refuse aucun dépôt valide. Si plusieurs actions portent à la fois sur une copie (deux onglets, remplacement pendant la revue), une seule aboutit. | 0 perte, 0 doublon, 0 attribution erronée | Obligatoire · E4 à E7 |
| NFR-FIA-02 | **Disponibilité, sauvegarde, restauration.** Disponibilité pendant une plage d'usage définie, pas en continu. Sauvegarde automatique de toutes les données ; restauration testée avant le premier usage réel. Après une restauration, les remises postérieures sont identifiées et les professeurs informés. | Plage d'usage, perte maximale (RPO), délai de restauration (RTO) : à définir | Obligatoire · avant tout usage réel |

### 2.5 Qualité de l'IA (mesure après construction)

| ID | Exigence | Valeur | Priorité |
|---|---|---|---|
| NFR-QUA-01 | **Protocole de mesure.** Jamais bloquante (D10). Un protocole écrit, validé par le client, est fixé avant toute mesure (corpus, experts, indicateurs, seuils, définition du temps). En démonstration, le corpus est fait de copies simulées (aucune copie réelle d'élève) et le chronométrage papier d'un vrai professeur n'a pas lieu : O1 est rapporté sans comparaison. Avant un usage réel, le temps de correction papier est chronométré avant la mise en service d'un professeur. Toute copie réelle sortie pour la mesure exige autorisation, retrait de l'identité, accès nominatif et suppression. La qualité d'un modèle gratuit se mesure comme celle de tout autre. | Corpus, experts, seuils : à définir | Important · E10 B |
| NFR-QUA-02 | **Versions tracées.** Rubrique, consigne de l'IA, modèle et moteur de lecture ont un identifiant de version enregistré avec chaque proposition et transcription. Une version publiée n'est jamais modifiée ni mise à jour implicitement par un prestataire. Une nouvelle rubrique ne modifie ni les propositions d'origine ni les évaluations publiées. | 100 % des propositions avec configuration complète | Obligatoire · E5 |

### 2.6 Usage, accessibilité et langue

| ID | Exigence | Valeur | Priorité |
|---|---|---|---|
| NFR-USA-01 | **Application web responsive.** Pas d'application native. Les écrans de l'élève s'utilisent sur téléphone en portrait, ceux du professeur sur ordinateur. Une photo sans retouche est acceptée et affichée à l'endroit. En cas de coupure : message clair, contenu conservé, état exact à la réouverture, une seule remise. Une liste de navigateurs pris en charge est déclarée. | Navigateurs et appareils d'essai : à définir | Obligatoire · dès E1 |
| NFR-USA-02 | **Langue, textes décisionnels, fuseau.** Interface en anglais [D, 2026-10-12, remplace « en français »]. Les textes qui dépendent d'une décision ouverte (mention de l'IA, consigne « pas de nom », notices) sont modifiables en un seul endroit. La date limite s'affiche avec un fuseau explicite, identique pour l'élève et le professeur : c'est lui qui décide « en retard » (D8). | Fuseau : à définir (probablement celui du Maroc) | Obligatoire · E1, E3, E4 |
| NFR-USA-03 | **Accessibilité minimale.** Trois contrôles : aucune information portée par la seule couleur ; actions au clavier avec focus visible ; langue déclarée pour les blocs dans une autre langue que l'interface (copies en français). | Niveau éventuellement imposé par la loi : à confirmer (QNF-1) | Important · E10 A |

### 2.7 Exploitation et test

| ID | Exigence | Valeur | Priorité |
|---|---|---|---|
| NFR-EXP-01 | **Mesure du délai et de l'usage d'IA.** Chaque traitement enregistre durées, tentatives et usage (volume consommé, coût estimé si l'offre devient payante), sans identité ni contenu. Un script restitue par devoir le délai, l'usage par copie et le taux d'échec. | Cibles : à définir, rapportées telles quelles | Obligatoire · E6 |
| NFR-EXP-02 | **Plafond d'usage et alertes.** L'usage de l'IA est borné par réglage : quota et limite de débit de l'offre gratuite, ou plafond de coût si elle devient payante. Au plafond, plus aucun appel : les remises passent à « IA indisponible » sans être perdues et le professeur évalue à la main. L'administrateur est alerté (échec en série, prestataire injoignable, sauvegarde, emails non délivrés). | Quotas et seuils : à mesurer (QNF-5) | Important · avant tout usage réel |
| NFR-EXP-03 | **Opérations sans écran.** Six opérations sont écrites et rejouées une fois avant tout usage réel (en démonstration, trois seulement : voir 2.8) : créer le premier administrateur, activer le français, désactiver d'urgence un professeur, activer l'envoi réel à un prestataire, supprimer un compte ou une copie, restaurer avec rejeu. En V1, elles sont faites par l'administrateur, hors application. | 6 procédures rejouées | Obligatoire · avant tout usage réel |
| NFR-EXP-04 | **Prestataires remplaçables, simulation, contrôles bloquants.** Lecture de l'écriture et évaluation passent chacune par une interface unique : remplacer un prestataire (utile si l'offre gratuite change) ne touche pas aux règles métier. Un prestataire simulé avec pannes injectables et un jeu de données fictif servent aux tests. Quatre contrôles automatiques bloquent toute livraison vers des données réelles : matrice d'accès, requête vers l'IA sans identité, aucun résultat avant publication, journaux propres. | 0 module métier modifié au remplacement | Obligatoire · E1, E5, E6 |

### 2.8 Statut en démonstration
Depuis le 2026-10-12, le projet est livré en démonstration avec des acteurs de simulation. Chaque exigence ci-dessus a l'un de ces statuts. Les valeurs « à définir » restent à définir.

| Statut | Exigences |
|---|---|
| **Exécutées** (testées dans la démonstration) | SEC-01, SEC-02, SEC-03, DON-04, DON-05, TRT-01, TRT-02, TRT-03, FIA-01, QUA-02, USA-01, USA-02, USA-03, EXP-01, EXP-04 |
| **Partielles** | DON-02 : aucune donnée réelle envoyée, fiche Mistral rédigée. EXP-02 : plafond d'usage exécuté, alertes à l'administrateur documentées. QUA-01 : protocole écrit, mesure sur copies simulées. EXP-03 : six procédures écrites, trois rejouées (premier administrateur, activer le français, activer l'envoi réel à Mistral). |
| **Documentées seulement** | DON-01 (registre rédigé, durées non fixées), DON-03, FIA-02 |
| **Hors démonstration** (conditions d'un usage réel) | QNF-1 (responsable du traitement, CNDP), QNF-4 (durées de conservation), QNF-7 (second facteur de l'administrateur) |

**Limite assumée.** Des copies simulées par des adultes ne représentent pas de vraies écritures d'élèves : les mesures de qualité (QUA-01) ne se transposent pas à un usage réel.

---

## 3. Les trois acteurs et ce que les exigences leur imposent
Prépare l'étape 6 sans la remplacer.

| | Administrateur | Professeur | Élève |
|---|---|---|---|
| **Accès** | Dans l'application : crée, réémet, annule une invitation de professeur ; aucune copie ni journal pédagogique (SEC-01). Hors application, en V1 : exploite l'application et peut techniquement tout lire (risque assumé, QNF-7). | Ses classes, devoirs, copies, évaluations et le journal de ses copies. | Son espace : ses devoirs, sa remise, son résultat publié (note, niveaux, remarques). Jamais l'image de sa copie après correction. |
| **Contraintes** | Compte à protéger plus fortement (QNF-7) ; ses accès aux données sont journalisés (DON-05) ; essais et sessions limités (SEC-02). | Notice avant le premier accès (DON-04) ; revue de plus de 100 copies par jour sans lenteur (TRT-03). | Téléphone (USA-01) ; notice avant la première remise (DON-04) ; code de classe tolérant (SEC-03). |

Hors des trois acteurs : le visiteur non connecté (inscription, connexion). L'exploitation est assurée par l'administrateur en V1.

---

## 4. Exclu volontairement

- Certifications, audit externe. Authentification à deux facteurs pour les professeurs et les élèves. **Risque résiduel à accepter par le client** : un mot de passe de professeur volé donne accès aux identités et copies de ses classes. Pour le compte administrateur, voir QNF-7.
- Haute disponibilité multi-zones, astreinte 24 h sur 24 : démonstration à effectif réduit, repli manuel (REV-06).
- Plusieurs langues d'interface, tableaux de bord et supervision en temps réel, outils d'audience tiers.
- Analyse d'impact, délégué à la protection des données : exigence non établie pour le Maroc ; à confirmer avec la CNDP ou un juriste (DON-03).
- Page « mes données » en libre-service, masquage automatique d'un nom écrit dans la copie : V2.
- CAPTCHA, quotas de rattachement : D2 écarte l'approbation ; à reconsidérer avant tout usage réel.
- Reproductibilité exacte des sorties de l'IA : non garantie par un prestataire externe, non nécessaire (proposition immuable, professeur garde-fou).
- Choix techniques (hébergement, supervision, chiffrement applicatif) : étape 7.

**À reporter à l'étape 4** : écran de notice et paramètres de conformité (DON-03, DON-04) ; relance proposée au professeur après un plafond d'usage de l'IA (EXP-02) ; conservation du tri et des filtres au retour à la liste ; **l'élève ne revoit pas l'image de sa copie** : à vérifier dans SUB-01 (lecture de sa remise), PUB-02 et CLS-04 (lecture seule d'un élève retiré).

---

## 5. Couverture de la liste « Renvoyé à l'étape 5 » (fonctionnalites.md, 3.4)

| Sujet renvoyé | Exigences |
|---|---|
| Confidentialité, accès, journalisation | DON-01, SEC-01, DON-05 |
| Cadre légal, prestataires, copies réelles | DON-02, DON-03, DON-04 |
| Information des professeurs sur le journal | DON-04, QUA-01 |
| Conservation et suppression | DON-01, FIA-02, EXP-03 |
| Mots de passe, sessions, liens, images sans lien public | SEC-01, SEC-02, SEC-03 |
| Performance, volumétrie, disponibilité, sauvegarde, usage d'IA | TRT-01 à TRT-03, FIA-02, EXP-01, EXP-02 |
| Méthode de mesure de la qualité | QUA-01, QUA-02, EXP-01 |
| Accessibilité, langue, appareils | USA-01 à USA-03 |

---

## 6. Questions

### Décidées par vous

| Question | Votre décision |
|---|---|
| QNF-1 (pays, âge) | Maroc ; 18 ans. Reste une confirmation et le responsable du traitement (ci-dessous). |
| QNF-2 (exploitation) | L'administrateur exploite l'application en V1. Conséquence : QNF-7. |
| QNF-3 (échelle) | Recommandation acceptée : pilote d'un professeur et de ses classes, rien au-delà. Remplacée le 2026-10-12 par une démonstration avec acteurs de simulation. |
| QNF-4 (image) | L'élève ne revoit pas l'image de sa copie, il voit seulement le résultat. Les durées restent à définir. |
| QNF-5 (budget d'IA) | LLM gratuit en V1. Reste : lequel, et ses conditions (ci-dessous). |
| QNF-6 (appareils) | Application web responsive en V1. |

### Encore ouvertes
Chaque recommandation est provisoire et ne vaut pas décision.

- **QNF-1. Responsable du traitement, CNDP et âge.** Qui est le responsable du traitement (vous, un établissement) et qui dépose la déclaration à la CNDP et, si besoin, la demande de transfert ? Tous les élèves visés ont-ils 18 ans ou plus ? *Recommandation : désigner le responsable avant E1 ; faire confirmer la déclaration et l'autorisation de transfert par la CNDP ou un juriste avant tout usage réel ; si des élèves ont moins de 18 ans, revoir consentement et inscription.* **Reportée à l'usage réel** : sans objet en démonstration (acteurs adultes, données fictives).
- **QNF-4. Durées de conservation.** Images (supprimables dès la fin de la revue), textes, propositions de l'IA, évaluations, journaux, sauvegardes. *Recommandation : moins une donnée est utile, moins elle est conservée ; à fixer avec le client avant tout usage réel, après QNF-1.* **Reportée à l'usage réel.**
- **QNF-5. Quel LLM gratuit ?** Quelles sont ses conditions sur l'usage des contenus, sa prise en charge des images, ses quotas et limites de débit, son pays d'hébergement ? *Recommandation : vérifier ces points sur un candidat à l'étape 7 ; tant qu'ils ne sont pas vérifiés, ni copies réelles ni données d'élèves (données synthétiques ou volontaires adultes). Une offre gratuite peut utiliser les contenus pour améliorer ses modèles et avoir des quotas bas, ce qui pèse sur un lot de 100 copies.* **Mistral retenu [D] en mode gratuit (2026-10-12), avec des données fictives.** Reste à relever dans la console Mistral : les quotas du compte et la bascule « Anonymous improvement data » (refus d'entraînement), dont l'effet sur l'accès gratuit n'est pas confirmé.
- **QNF-7. Second facteur pour le compte administrateur ?** L'administrateur-exploitant peut tout lire hors application : un seul mot de passe volé exposerait toutes les copies. *Recommandation : oui, pour ce seul compte (proposition) ; sans cela, risque résiduel accepté par écrit.* **Reportée à l'usage réel.**
