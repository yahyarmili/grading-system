# Prompts progressifs d'implémentation

> Étape 8 de la démarche d'ingénierie. Statut : **brouillon**. Structure validée par l'utilisateur le 2026-10-12 ; contenu des prompts à valider à l'usage.
> S'appuie sur [fonctionnalites.md](fonctionnalites.md) (plan E1 à E11, identifiants AUTH-01…), [besoins-non-fonctionnels.md](besoins-non-fonctionnels.md), [acteurs.md](acteurs.md) et [stack-technologique.md](stack-technologique.md). Méthode reprise du guide « Complete Claude Code Course Flow » (PDF fourni par l'utilisateur).

**En bref.** Une suite de prompts à copier dans Claude Code, un par sous-fonctionnalité, chacun suivi de ce que vous vérifiez avant de passer au suivant. Les phases 0 à 2, E1 et E2 sont rédigées en entier ; E3 à E11 sont en squelette et seront rédigées à l'approche de chaque étape, à partir de la conception à jour.

---

## 1. Décisions de cadrage [D, 2026-10-12]

| Sujet | Décision |
|---|---|
| Découpage | Une étape = un `/plan`, puis une sous-fonctionnalité par prompt (logique serveur, écran, tests), puis une vérification contre le plan. |
| Rédaction | Détail pour les deux prochaines étapes ; squelette au-delà, réécrit quand la conception évolue. |
| Langue | Prompts en français ; **contenu de l'application en anglais** (interface, emails, messages) ; code en anglais. |
| Design | Référence visuelle : [refine app-crm-minimal](https://github.com/refinedev/refine/tree/master/examples/app-crm-minimal) ([démo](https://example.minimal-crm.refine.dev)). Elle utilise Ant Design ; on en reprend les principes en Tailwind, sans Ant Design ni refine. |
| Maquettes | Deux écrans clés en données fictives avant la base : liste des remises et écran de copie. |
| Sous-choix techniques | Better Auth (avec son skill officiel), Zod, Vitest et Playwright, Nodemailer (Gmail SMTP), SDK TypeScript officiel de Mistral. Chacun reste confirmé dans le `/plan` de son étape. |
| Emplacement | L'application est créée à la racine du dossier `grading_system`, à côté de `conception/`, qui reste lisible par Claude. |

## 2. Mode d'emploi

1. Un prompt à la fois. Ne passez au suivant qu'après avoir coché « Vous validez ».
2. Après chaque validation : `git diff`, puis un commit. En cas d'échec, `git restore` revient à l'état validé.
3. Les prompts marqués **Plan** se lancent après `/plan` : on relit le plan, on le simplifie s'il en fait trop (T2), puis on lance l'implémentation.
4. Une valeur non décidée (durée d'un lien, N essais, format de la note…) est codée comme **valeur provisoire** dans un fichier de configuration unique, marquée comme telle. Elle ne devient pas une décision.
5. Quand un choix change en cours de route, utilisez T5 : la conception, ce document et CLAUDE.md sont mis à jour avant de continuer.
6. Vous créez vous-même les comptes et les secrets (Neon, Gmail, Mistral, Vercel). Claude lit les variables par `process.env`, jamais le fichier `.env.local`.

## 3. Prompts transverses (réutilisés à chaque étape)

**T1 — Vérifier contre le plan**
```
Compare l'implémentation de cette étape au plan approuvé et aux critères d'acceptation cités (conception/fonctionnalites.md).
Indique : ce qui est conforme, ce qui diffère, ce qui manque, les problèmes reproductibles.
N'élargis pas le périmètre. Corrige seulement ce qui est nécessaire pour compléter le plan, puis relance les tests.
```

**T2 — Simplifier un plan trop ambitieux**
```
Ce plan est plus complexe que ce dont l'application a besoin maintenant.
Retire <éléments>. Garde uniquement ce qu'exigent les fonctionnalités de cette étape.
```

**T3 — Corriger seulement le confirmé**
```
Corrige uniquement les problèmes confirmés de la revue. Ne refonds pas la fonctionnalité et n'élargis pas son périmètre.
Relance les vérifications concernées et résume exactement ce qui a changé.
```

**T4 — Vérifier un problème signalé**
```
Confie ce problème signalé à un sous-agent neuf : <problème>.
Il vérifie s'il est reproductible avant toute modification et renvoie : reproductible ou non, étapes exactes, fichiers concernés, cause probable.
Ne corrige rien pour l'instant.
```

**T5 — Synchroniser après un changement de décision**
```
Nous changeons la décision suivante : <décision>.
Mets à jour, en restant bref : la section concernée de conception/ (marquée [D] avec la date), les prompts encore à venir de conception/prompts-implementation.md, et CLAUDE.md si la règle est durable.
Liste le code déjà écrit qui contredit la nouvelle décision, sans le modifier.
```

---

## Phase 0 — Fondations

#### 0.1 — Créer l'application
```
Crée une application Next.js (App Router) en TypeScript avec Tailwind CSS à la racine de ce dossier, et installe GSAP.
Le dossier contient déjà CLAUDE.md et conception/ : ne les modifie pas et ne les écrase pas.
Initialise un dépôt git avec un .gitignore adapté (.env*, dossiers de build) et fais un premier commit.
Garde l'application minimale : pas d'authentification, pas de base de données, pas d'IA, aucune fonctionnalité métier.
Vérifie que l'application démarre.
```
**Vous validez :** la page d'accueil par défaut s'affiche ; `conception/` et CLAUDE.md sont intacts ; `git log` montre un commit.

#### 0.2 — Explorer
```
Explore ce projet et explique l'architecture actuelle, les technologies, les dossiers importants et la façon dont les éléments s'articulent.
Lis aussi conception/stack-technologique.md §4 (règles d'architecture) et dis comment la structure actuelle pourra les accueillir. Ne modifie rien.
```
**Vous validez :** l'explication correspond à ce que vous voyez.

#### 0.3 — CLAUDE.md pour la phase de code
```
Réécris CLAUDE.md pour la phase d'implémentation.
Garde ce que Claude doit retenir d'une session à l'autre : le produit en trois phrases, où trouver la conception (conception/), le suivi par conception/prompts-implementation.md, les règles d'architecture de stack-technologique.md §4, les invariants de fonctionnalites.md §5.3, la règle des valeurs provisoires, le contenu de l'application en anglais, et les règles de travail sur la conception ([D]/[P]/[Q], sources, compacité).
Retire l'historique des étapes de conception et tout ce qui se lit facilement dans le dépôt. Pas de consignes génériques (« code propre »…).
```
**Vous validez :** CLAUDE.md est court (moins de 1 000 mots), sans perte des règles qui comptent.

---

## Phase 1 — Design system et maquettes

#### 1.1 — Étudier la référence et poser le design system
```
Étudie l'application de référence refine app-crm-minimal (démo : https://example.minimal-crm.refine.dev, code : https://github.com/refinedev/refine/tree/master/examples/app-crm-minimal) comme référence visuelle.
Analyse : typographie, espacements, grille, barre latérale et en-tête, tableaux, cartes, formulaires, tags d'état, boutons, bordures, couleurs, comportement responsive. Ne copie ni textes, ni assets, ni marque.
Implémente ces principes dans notre projet avec Tailwind, sans Ant Design ni refine : jetons de couleur (avec mode sombre si peu coûteux), typographie, espacements, conteneurs, boutons, liens, champs, bordures, ombres.
Avant d'installer une bibliothèque de primitives accessibles (par exemple shadcn/ui sur Radix), propose-le avec avantages et inconvénients et attends mon accord.
Contraintes : contenu en anglais ; aucune information portée par la seule couleur ; focus clavier visible ; GSAP réservé aux micro-interactions et désactivé si prefers-reduced-motion.
Explique brièvement les règles posées et les fichiers modifiés.
```
**Vous validez :** les règles annoncées existent dans le code ; vous avez tranché sur la bibliothèque de primitives.

#### 1.2 — Squelette de l'application par rôle
```
Construis le squelette de navigation pour les trois rôles, avec des pages vides et des données fictives :
- Teacher : barre latérale (Classes, Assignments), usage principal sur ordinateur.
- Student : My assignments, My classes, conçu d'abord pour téléphone en portrait.
- Admin : un seul écran, Teachers.
Ajoute un sélecteur de rôle visible uniquement en développement pour naviguer entre les espaces ; il sera supprimé en E1.
Vérifie le rendu sur téléphone et sur ordinateur.
```
**Vous validez :** les trois espaces s'affichent ; l'espace élève est utilisable sur téléphone.

#### 1.3 — Composants et page vitrine
```
Crée les composants réutilisables dont l'application aura besoin et une page /dev/design (accessible seulement en développement) qui les montre tous :
table triable avec filtres, tag d'état avec icône et texte (états de la remise de conception/fonctionnalites.md §5.5), carte, formulaire avec message par champ, boîte de dialogue de confirmation, alerte (information, avertissement, erreur), état vide, état de chargement, pagination.
Réutilise le design system de 1.1. Vérifie la page sur téléphone et sur ordinateur.
```
**Vous validez :** chaque composant de la vitrine est lisible, utilisable au clavier, cohérent avec la référence.

#### 1.4 — Maquette : liste des remises d'un devoir
```
Construis la maquette de la liste des remises d'un devoir (espace Teacher), en données fictives en anglais.
Suis REV-01 (conception/fonctionnalites.md) : une ligne par élève avec nom, prénom, classe(s), état, « late », mode (text ou image), note ; tri par note, date ou ordre alphabétique sur toute la liste ; copies sans note en fin dans les deux sens ; filtres par classe et par état ; compteurs (to review, failed, not gradable) ; élève « removed from class ».
Inclus des noms comme « Émile », « Eric », « d'Aubigné », et des notes « provisional ». Format de note provisoire : sur 20 (Q1 ouverte).
Pas de base de données. Réutilise les composants existants.
```
**Vous validez :** tri et filtres fonctionnent sur les données fictives ; la page reste lisible avec 40 élèves.

#### 1.5 — Maquette : écran de copie
```
Construis la maquette de l'écran de copie ouvert par un clic sur le nom d'un élève dans la liste.
Suis REV-02 et REV-03 : identité (nom, prénom, email, classes), texte de la copie, proposition de l'IA en lecture seule (5 critères de la rubrique de conception/solution.md, niveau 0 à 4 et justification, commentaire général, pistes, note proposée, alertes), et à côté le formulaire du professeur (niveau 0-4 par critère, remarque par critère, commentaire, pistes, note).
Comportements à simuler côté client : note recalculée tant qu'elle n'est pas fixée, écart signalé une fois fixée, remarque marquée « to re-read » quand son niveau change.
Aucun historique de résultats de l'élève. Données fictives en anglais, pas de base de données.
```
**Vous validez :** sur ordinateur, on lit la copie et on corrige sans faire défiler sans cesse ; les comportements de note marchent.

#### 1.6 — Affiner
```
Relis les écrans réalisés et améliore ce qui paraît générique, incohérent ou trop « modèle ».
Garde le design system. Concentre-toi sur la hiérarchie, la typographie, les espacements, la densité des tableaux et le responsive. Ne refais pas les parties non concernées.
```
**Vous validez :** vous êtes satisfait du rendu ; sinon, répétez 1.6 avec vos remarques précises.

#### 1.7 — Créer le skill /build-ui
Créez `.claude/skills/build-ui/SKILL.md` :
```
---
description: Build or update application UI (teacher, student or admin) using the existing design system, components and responsive conventions. Use when creating or significantly changing pages, screens or components.
---

Build or update the following UI:

$ARGUMENTS

Follow this process:

1. Inspect the current implementation, related components and the referenced feature IDs in conception/fonctionnalites.md.
2. Search for reusable components before creating new ones.
3. Reuse the existing design system and patterns.
4. Keep the change focused on the requested feature.
5. All user-facing text is in English. Decision-dependent texts (notices, AI mention, "no name" instruction) live in the single texts module.
6. Teacher screens target desktop; student screens target a phone in portrait.
7. Never convey information by color alone; keyboard actions with visible focus.
8. Include empty, loading and error states.
9. Respect the access matrix: never fetch or render data the current role may not see.
10. Run and visually verify the screen at phone and desktop widths, then run the project checks.
11. Fix reproducible issues without expanding scope. Summarize what changed.
```
**Vous validez :** `/build-ui` apparaît dans Claude Code. Il sert ensuite à chaque écran.

---

## Phase 2 — Base de données

#### 2.1 — Préparer Neon (action de votre part)
Créez un projet Neon gratuit avec deux branches : `dev` et `test`. Ajoutez `DATABASE_URL` (dev) et `DATABASE_URL_TEST` (test) dans `.env.local`. Puis :
```
La base PostgreSQL est prête. DATABASE_URL et DATABASE_URL_TEST sont disponibles dans .env.local.
Utilise process.env là où c'est nécessaire, sans lire le fichier d'environnement.
```

#### 2.2 — Planifier le socle de données · Plan
```
Inspecte le projet et planifie la mise en place de PostgreSQL avec Drizzle ORM.
Pour cette première version, seulement le socle : connexion, migrations, organisation du schéma, couche d'accès aux données unique (règle 1 de conception/stack-technologique.md §4), et une base de test réinitialisée pour les tests d'intégration.
Pas encore de tables métier : elles arrivent avec E1 (comptes) puis à chaque étape.
Montre : organisation des fichiers, conventions de nommage, stratégie de migrations, comment la couche d'accès appliquera la matrice d'accès, comment les tests utiliseront la base de test, comment on vérifiera.
```

#### 2.3 — Implémenter et consigner
```
Implémente le plan approuvé : Drizzle, connexion, migrations, couche d'accès, Vitest pour les tests unitaires et d'intégration sur la base de test.
Ajoute un test d'intégration minimal qui prouve la connexion et la remise à zéro de la base de test.
Puis ajoute à CLAUDE.md les conventions de base de données du plan, en restant bref.
```
**Vous validez :** `npm test` passe ; une migration vide s'applique ; CLAUDE.md contient les conventions.

---

## E1 — Fondations : comptes, rôles, accès (AUTH-01 à AUTH-05)

Préalable : installez le skill Better Auth (`npx skills add better-auth/skills`). Créez un mot de passe d'application Gmail (validation en deux étapes requise) et ajoutez `SMTP_USER` et `SMTP_PASSWORD` dans `.env.local` seulement quand vous voudrez recevoir de vrais emails.

#### E1.0 — Planifier l'authentification · Plan
```
Inspecte l'application et planifie l'authentification avec Better Auth, en utilisant le skill Better Auth installé.
Lis conception/fonctionnalites.md (AUTH-01 à AUTH-05, matrice 5.4, invariants 5.3) et conception/acteurs.md.
Il faut :
- inscription publique qui ne produit que des élèves (email, mot de passe, first name, last name), confirmation de l'email par lien à usage unique ;
- connexion, déconnexion, session persistante qui expire ; messages identiques quel que soit le motif ; temporisation après N échecs ;
- mot de passe oublié et renvoi du lien de confirmation, réponses identiques ;
- comptes Teacher créés par l'administrateur par invitation (lien pour choisir le mot de passe), réémission et annulation ;
- un seul rôle par compte, aucune élévation de rôle par requête ;
- premier compte Admin créé par un script local, hors interface publique (recommandation provisoire de Q2) ;
- envoi d'email par une interface unique, avec un transport de capture pour le développement et les tests, et Nodemailer + Gmail SMTP quand les variables SMTP existent ;
- Zod pour valider toutes les entrées côté serveur.
Durées des liens, des sessions, N et D : valeurs provisoires dans un fichier de configuration unique.
Pas de connexion sociale, pas de second facteur, pas de suspension de compte.
Montre : tables, configuration, gestion des sessions côté serveur, protection des routes par rôle, interface email, et comment on vérifiera les parcours connecté, non connecté et non autorisé.
```

#### E1.1 — Schéma des comptes et configuration
```
Implémente seulement le schéma et la configuration du plan approuvé : tables d'authentification Better Auth sur Drizzle, rôle unique, migrations, interface email avec transport de capture, fichier de valeurs provisoires.
Pas encore d'écrans. Vérifie les migrations sur dev et test.
```
**Vous validez :** les tables existent ; un email de test arrive dans le transport de capture.

#### E1.2 — Inscription et confirmation de l'élève (AUTH-01)
```
/build-ui Implémente l'inscription de l'élève et la confirmation de l'email (AUTH-01), logique serveur et écrans Sign up, Check your email, Email confirmed.
Respecte R1 à R3 et couvre CA1 à CA4 par des tests d'intégration (email existant avec casse ou espaces différents, rôle forcé dans la requête, lien expiré, utilisé ou falsifié).
```
**Vous validez :** vous vous inscrivez, recevez le lien (capture), confirmez ; un second compte avec la même adresse est impossible sans message révélateur.

#### E1.3 — Connexion, déconnexion, session (AUTH-02)
```
/build-ui Implémente la connexion, la déconnexion et la session (AUTH-02) : écran Sign in, redirection vers l'espace du rôle, déconnexion, expiration.
Supprime le sélecteur de rôle de développement créé en 1.2.
Couvre CA1 à CA4 par des tests, dont le bouton retour après déconnexion et la temporisation après N échecs (valeur provisoire).
```
**Vous validez :** connexion et déconnexion ; après déconnexion, le bouton retour n'affiche rien de protégé ; un compte non confirmé n'obtient pas de session.

#### E1.4 — Récupération d'accès (AUTH-05)
```
/build-ui Implémente le mot de passe oublié et le renvoi du lien de confirmation (AUTH-05).
Réponses identiques que l'email ait un compte ou non ; anciennes sessions fermées après réinitialisation ; ancien lien de confirmation invalidé au renvoi ; demandes limitées. Couvre CA1 à CA3.
```
**Vous validez :** les deux parcours aboutissent ; un email inconnu donne le même message.

#### E1.5 — Comptes professeur par l'administrateur (AUTH-03)
```
Implémente la création des comptes Teacher (AUTH-03) et le script local de création du premier Admin.
Écran Admin unique (via /build-ui) : créer une invitation (first name, last name, email), la réémettre, l'annuler ; liste des invitations et de leur état. Chaque action consigne auteur et date.
Écran Teacher « Set your password » depuis le lien d'invitation.
Vérifie le rôle Admin côté serveur pour chaque action ; ne te contente pas de masquer des liens. Couvre CA1 à CA4.
```
**Vous validez :** vous créez l'admin par le script, invitez un professeur, il choisit son mot de passe et arrive dans l'espace Teacher ; un élève ne peut pas créer de professeur.

#### E1.6 — Cloisonnement et test de la matrice (AUTH-04)
```
Implémente le contrôle d'accès en un point unique dans la couche d'accès aux données (AUTH-04, matrice 5.4 de conception/fonctionnalites.md).
Déclare la matrice sous forme de données (ressource × rôle × propriétaire ou non) et écris un test exécutable qui :
- vérifie chaque cellule « — » par un test négatif ;
- échoue si une ressource ou une action serveur existe sans entrée dans la matrice.
Éprouve-le avec une ressource fictive de test seulement. Ressource inexistante et ressource d'autrui donnent la même réponse.
Installe Playwright et écris les parcours E2E d'E1 : inscription, confirmation, connexion de l'élève ; invitation, mot de passe et connexion d'un professeur ; lien expiré puis renvoi.
```
**Vous validez :** `npm test` et les E2E passent ; ajouter une ressource sans l'inscrire dans la matrice fait échouer le test.

#### E1.7 — Vérifier contre le plan
Lancez **T1**, puis relisez `git diff`.

#### E1.8 — Premier déploiement [P]
```
Prépare un déploiement de prévisualisation sur Vercel (plan Hobby) relié à la branche Neon dev.
Liste les variables d'environnement que je dois saisir dans Vercel, sans lire .env.local.
Vérifie après déploiement : inscription, confirmation par email réel (Gmail SMTP), connexion. Note le démarrage à froid de Neon.
```
**Vous validez :** le parcours E1 fonctionne en ligne. Puis **T5** pour consigner les valeurs provisoires et les réponses de Q2 et Q9.

---

## E2 — Classes et invitation (CLS-01 à CLS-04)

#### E2.0 — Planifier · Plan
```
Inspecte l'application et planifie les classes et l'invitation (CLS-01 à CLS-04, conception/fonctionnalites.md §8.2 E2).
Il faut : Classe et Appartenance (active ou removed) ; nom unique par professeur ; lien et code non devinables, désactivables et renouvelables, essais de saisie limités ; rattachement immédiat et idempotent ; un lien ouvert sans session qui survit à la connexion, à l'inscription et à la confirmation ; retrait avec refus neutre à la nouvelle tentative ; réadmission par le professeur.
Validité du lien et du code : valeur provisoire (Q7 ouverte).
Montre : tables, routes, actions serveur, extension de la matrice, format du code, conservation de l'intention d'invitation, et la vérification.
```

#### E2.1 — Créer et lister ses classes (CLS-01)
```
/build-ui Implémente la création et la liste des classes du professeur (CLS-01) : schéma, migration, actions serveur, écran Classes avec état vide. Étends la matrice. Couvre CA1 à CA3.
```
**Vous validez :** deux classes créées ; même nom refusé ; un second professeur ne voit pas vos classes.

#### E2.2 — Lien et code d'invitation (CLS-02)
```
/build-ui Implémente le lien et le code d'invitation de chaque classe (CLS-02) : affichage avec copie en un clic, désactivation, renouvellement, essais limités. Couvre CA1 à CA4.
```
**Vous validez :** le code renouvelé remplace l'ancien ; les élèves déjà rattachés restent.

#### E2.3 — Rejoindre une classe (CLS-03)
```
/build-ui Implémente le rattachement de l'élève par lien ou par code (CLS-03) : écran Join a class, parcours depuis un lien sans session (connexion ou inscription, confirmation, puis rattachement), refus pour un compte non confirmé, aucun doublon, refus neutre pour un élève retiré. Écran My classes. Couvre CA1 à CA4.
```
**Vous validez :** sur téléphone, un nouvel élève ouvre le lien, s'inscrit, confirme et se retrouve dans la classe.

#### E2.4 — Élèves, retrait, réadmission (CLS-04)
```
/build-ui Implémente la liste des élèves d'une classe (first name, last name, email), le retrait et la réadmission depuis la liste des élèves retirés (CLS-04). Couvre CA1 et CA4 ; CA2 et CA3 sont rejoués en E3, E4 et E7.
```
**Vous validez :** un élève retiré ne peut plus rejoindre avec le même code ; réadmis, il réapparaît.

#### E2.5 — Vérifier et démontrer
```
Écris le parcours E2E d'E2 : le professeur partage le code, l'élève s'inscrit via le lien, confirme, apparaît dans la liste, est retiré puis refusé.
Démontre ensuite le scénario des critères de sortie : deux professeurs, une élève rattachée aux deux, chacun ne voit que sa classe. Vérifie que la matrice étendue passe.
```
Puis **T1**, et **T5** pour Q7.

---

## E3 à E11 — Squelette

À rédiger en détail à l'approche de chaque étape, à partir de la conception à jour. Chaque étape commence par un **Plan** et se termine par **T1**, puis T5 si une décision a changé.

| Étape | Prompts prévus | Outils du guide introduits |
|---|---|---|
| **E3** Devoirs, espace élève | E3.0 plan · E3.1 schéma Devoir et Envoi, création avec avertissements (ASG-01) · E3.2 liste (ASG-02) · E3.3 modification, suppression, verrouillage (ASG-03) · E3.4 espace élève, déduplication, état vide (SUB-01) · E3.5 matrice, rejeu CLS-04 CA2, E2E | — |
| **E4** Remise de texte | E4.0 plan : machine d'états complète (§5.5), Remise et Version · E4.1 table centrale des transitions et tests unitaires · E4.2 remise de texte atomique et idempotente (SUB-02) · E4.3 retard et fuseau (SUB-04) · E4.4 remplacement et archivage (SUB-05) · E4.5 rejeu ASG-03 CA2, E2E | Plan sur la décision la plus coûteuse : la machine d'états |
| **E5** Rubrique et IA | E5.0 enquête par sous-agents (SDK Mistral et modèles, machine d'états, outillage de tests) · E5.1 plan · E5.2 rubrique versionnée et conversion en note (Q1 provisoire) · E5.3 interface Mistral et simulateur à pannes · E5.4 requête à liste blanche et test d'étanchéité (EVL-02) · E5.5 contrat de sortie, tentatives bornées, proposition immuable (EVL-03) · E5.6 alertes, non évaluable, garde de la rubrique française (EVL-04, Q6) · E5.7 commande interne de déclenchement, jeu adverse · E5.8 création de l'agent `feature-reviewer` et revue en contexte neuf · T3 | Sous-agents, agent relecteur. Préalable : quotas et refus d'entraînement relevés dans la console Mistral (QNF-5) |
| **E6** Traitement par lots | E6.0 plan Vercel Workflows · E6.1 déclenchement à la remise et au remplacement · E6.2 parallélisme borné, nouvelles tentatives, reprise (PRC-01) · E6.3 échecs et relance (PRC-02) · E6.4 tests de pannes, lot à marqueurs uniques · E6.5 mesure des événements par copie, revue | Revue en contexte neuf : mélange entre copies |
| **E7** Revue par le professeur | E7.0 plan · E7.1 liste réelle à partir de la maquette 1.4 (REV-01) · E7.2 écran de copie à partir de la maquette 1.5 (REV-02) · E7.3 évaluation du professeur, recalcul, note fixée (REV-03) · E7.4 journal atomique et conflits (REV-04) · E7.5 relance depuis la liste, rejeux · revue | — |
| **E8** Validation, publication | E8.0 plan · E8.1 valider, publier, retirer, raccourci (REV-05, PUB-01) · E8.2 évaluation manuelle (REV-06) · E8.3 vue de l'élève à liste blanche (PUB-02) · E8.4 balayage « rien avant publication » · E8.5 rejeux de la table 8.3 · E8.6 cycle complet en texte (E2E) · revue de la fuite | Revue en contexte neuf : fuite de résultats |
| **E9** Canal image | E9.0 enquête par sous-agents (OCR ou modèle multimodal, limites de 4,5 Mo et de 1 Go) · E9.1 plan · E9.2 dépôt multipage, réduction dans le navigateur, type, métadonnées (SUB-03) · E9.3 table des images et route unique contrôlée · E9.4 moteur de lecture et contrat de fidélité (TRX-01) · E9.5 branchement aux états de traitement · E9.6 transcription et image dans l'écran de copie · E9.7 rejeux image · revue | Sous-agents, revue |
| **E10** Durcissement et mesure | A : matrice complète automatisée, balayage, étanchéité, pannes, sessions et liens, accessibilité (USA-03), export de sauvegarde ; revue externe facultative (CodeRabbit s'il reste gratuit pour ce dépôt, sinon `/code-review`) ; tri des constats ; T3. B : scripts de mesure depuis le journal, selon le protocole validé par le client | Revue indépendante |
| **E11** Démonstration | Déploiement final, jeu de données fictif en anglais, scénarios scriptés, préchauffage de Neon, notice « demo, fictitious data », répétition | — |
| **Fin** | Revue de toute l'application ; vérification des parcours admin, teacher, student ; synchronisation finale de CLAUDE.md | — |

## 4. Points ouverts qui touchent ces prompts

- Q1 (note sur 20), Q2 (premier administrateur), Q3, Q4, Q6, Q9 : valeurs provisoires dans les prompts, à trancher avant l'étape concernée (voir fonctionnalites.md §9).
- Q7 tranchée [D, 2026-10-14] : lien et code de classe valables 1 heure après la création du lien (CLS-02 R4). Code aligné (`src/config/decisions.ts`).
- Q5 : langue des remarques de l'IA. L'interface est en anglais, mais pour une copie en français la question reste ouverte.
- Bibliothèque de primitives d'interface : tranchée par vous en 1.1.
