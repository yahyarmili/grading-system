# Prompts progressifs d'implémentation

> Étape 8 de la démarche d'ingénierie. Statut : **brouillon**. Structure validée par l'utilisateur le 2026-10-12 ; contenu des prompts à valider à l'usage.
> S'appuie sur [fonctionnalites.md](fonctionnalites.md) (plan E1 à E11, identifiants AUTH-01…), [besoins-non-fonctionnels.md](besoins-non-fonctionnels.md), [acteurs.md](acteurs.md) et [stack-technologique.md](stack-technologique.md). Méthode reprise du guide « Complete Claude Code Course Flow » (PDF fourni par l'utilisateur).

**En bref.** Une suite de prompts à copier dans Claude Code, un par sous-fonctionnalité, chacun suivi de ce que vous vérifiez avant de passer au suivant. Les phases 0 à 2 et les étapes E1 à E6 sont rédigées en entier ; E7 à E11 sont en squelette et seront rédigées à l'approche de chaque étape, à partir de la conception à jour.

---

## 1. Décisions de cadrage [D, 2026-10-12]

| Sujet | Décision |
|---|---|
| Découpage | Une étape = un `/plan`, puis une sous-fonctionnalité par prompt (logique serveur, écran, tests), puis une vérification contre le plan. |
| Rédaction | Détail pour les deux prochaines étapes ; squelette au-delà, réécrit quand la conception évolue. |
| Langue | Prompts en français ; **contenu de l'application en anglais** (interface, emails, messages) ; code en anglais. |
| Design | Référence visuelle : [refine app-crm-minimal](https://github.com/refinedev/refine/tree/master/examples/app-crm-minimal) ([démo](https://example.minimal-crm.refine.dev)). Elle utilise Ant Design ; on en reprend les principes en Tailwind, sans Ant Design ni refine. |
| Maquettes | Deux écrans clés en données fictives avant la base : liste des remises et écran de copie. |
| Sous-choix techniques | Better Auth (avec son skill officiel), Zod, Vitest et Playwright, Nodemailer (Gmail SMTP), SDK TypeScript officiel de Mistral (Mistral et son SDK remplacés le 2026-10-16 par OpenRouter [D] ; client à choisir au plan d'E5.4b). Chacun reste confirmé dans le `/plan` de son étape. |
| Emplacement | L'application est créée à la racine du dossier `grading_system`, à côté de `conception/`, qui reste lisible par Claude. |

## 2. Mode d'emploi

1. Un prompt à la fois. Ne passez au suivant qu'après avoir coché « Vous validez ».
2. Après chaque validation : `git diff`, puis un commit. En cas d'échec, `git restore` revient à l'état validé.
3. Les prompts marqués **Plan** se lancent après `/plan` : on relit le plan, on le simplifie s'il en fait trop (T2), puis on lance l'implémentation.
4. Une valeur non décidée (durée d'un lien, N essais, format de la note…) est codée comme **valeur provisoire** dans un fichier de configuration unique, marquée comme telle. Elle ne devient pas une décision.
5. Quand un choix change en cours de route, utilisez T5 : la conception, ce document et CLAUDE.md sont mis à jour avant de continuer.
6. Vous créez vous-même les comptes et les secrets (Neon, Gmail, OpenRouter, Vercel). Claude lit les variables par `process.env`, jamais le fichier `.env.local`.

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

## E3 — Devoirs et espace élève (ASG-01 à ASG-03, SUB-01)

Fuseau de la date limite : `Africa/Casablanca` [D, 2026-10-14] (NFR-USA-02). La valeur va dans `src/config/decisions.ts`.

#### E3.0 — Planifier · Plan
```
Inspecte l'application (matrice src/server/access/matrix.ts, inventory.ts, couche src/server/data/, maquettes de /teacher/assignments) et planifie les devoirs et l'espace élève : ASG-01 à ASG-03 et SUB-01 (conception/fonctionnalites.md §6 et §8.2 E3, états du devoir en §5.5).
Il faut :
- Devoir (title, subject, level A1 à C1, language en ou fr, deadline, instructions facultatives, créateur) et Envoi (devoir × classe) ; création en une seule transaction, au moins une classe parmi les siennes, aucune création partielle ;
- un fuseau unique pour saisir et afficher la date limite, affiché explicitement, lu depuis `src/config/decisions.ts` (`Africa/Casablanca`, [D]) ; remplacer les formats de date en UTC des écrans concernés ;
- verrouillage : le plan dit comment le devoir saura qu'il a reçu une remise en E4 (colonne posée dans la transaction de la première remise, ou autre), et comment une modification et une première remise simultanées sont arbitrées (une seule l'emporte) ;
- propriété indirecte côté élève : un élève lit un devoir par ses appartenances actives, ou parce qu'il a une remise (cas d'un élève retiré, prévu dès maintenant pour E4) ; dis comment ownedBy le gère ;
- l'état d'une remise vu par l'élève : quelle ligne de la matrice le couvre, sachant que l'élève n'a pas de lecture sur « Submission » ; projection à liste fermée (toStudentStatus) ;
- les maquettes 1.4 et 1.5 sont conservées pour E7 sous /dev/mockups/, hors des routes réelles ;
- aucun cache ne sert une version périmée d'un devoir modifié (cacheComponents).
Le niveau n'est jamais transmis à l'IA (D4) : le schéma le garde comme simple étiquette.
Montre : tables et contraintes, migration, routes, Server Actions, lignes de matrice et d'inventaire, gestion du fuseau, et la vérification.
```

#### E3.1 — Créer un devoir (ASG-01)
```
/build-ui Implémente la création d'un devoir (ASG-01) : schéma, migration, actions serveur, formulaire Teacher « New assignment ».
Champs de R1 et R2, choix d'au moins une classe parmi celles du professeur (R3), avertissement près de Subject et Instructions : pas de nom d'élève, ni de niveau, ni de classe, car ces champs iront à l'IA (R4). Date limite saisie et affichée dans le fuseau unique, avec son nom.
Validation Zod côté serveur, message par champ. Inscris la ressource dans matrix.ts et inventory.ts, et ajoute les fonctions réelles à REAL.
Couvre CA1 à CA3 par des tests d'intégration, dont une classe d'un autre professeur glissée dans la requête : refus, aucun devoir créé.
```
**Vous validez :** un devoir envoyé à deux classes sur trois ; un champ manquant donne un message par champ et rien n'est créé ; la date limite affichée porte son fuseau.

#### E3.2 — Lister et ouvrir ses devoirs (ASG-02)
```
/build-ui Remplace les données fictives de la liste Assignments par les vrais devoirs du professeur (ASG-02) : title, language, level, deadline, classes, nombre de remises et de copies à valider (0 jusqu'en E4 et E7), date limite la plus récente d'abord.
La page d'un devoir montre ses détails réels et ses actions ; la liste des remises arrive en E7 (ASG-02 CA2 rejoué en E7). Déplace les maquettes 1.4 et 1.5 sous /dev/mockups/ (accessibles seulement en développement).
Page d'un devoir d'autrui ou inexistant : 404 réel, contrôle au niveau de la page (voir CLAUDE.md). Couvre CA1.
```
**Vous validez :** vos devoirs seulement, dans le bon ordre ; l'adresse d'un devoir d'un autre professeur donne 404 ; les maquettes restent visibles sous /dev/mockups/.

#### E3.3 — Modifier, supprimer, verrouiller (ASG-03)
```
/build-ui Implémente la modification et la suppression d'un devoir (ASG-03) selon le mécanisme de verrouillage du plan.
Sans remise : tous les champs modifiables sauf les classes ; suppression avec confirmation ; la modification est visible tout de suite par les élèves. Avec remise (mécanisme prêt, déclenché en E4) : seuls title et level restent modifiables, suppression refusée, avec un message clair ; les champs verrouillés sont affichés comme tels.
La garde est dans la requête d'écriture, pas seulement dans l'écran. Couvre CA1 et CA3 ; teste CA2 en posant le verrou directement dans le test (rejoué sur de vraies remises en E4).
```
**Vous validez :** un sujet modifié est vu par un élève sans rechargement forcé du cache ; un autre professeur ne peut ni modifier ni supprimer.

#### E3.4 — Espace de l'élève (SUB-01)
```
/build-ui Remplace les données fictives de My assignments par les devoirs reçus de l'élève (SUB-01), sur téléphone d'abord.
Par devoir : title, subject, instructions (aucun bloc vide si absentes), language, deadline avec fuseau, état de la liste fermée (« To submit », mention « Deadline passed » le cas échéant). Un devoir envoyé à deux classes de l'élève n'apparaît qu'une fois. Élève sans classe : état vide explicite qui renvoie vers Join a class.
Aucun champ hors de la liste fermée ne sort du serveur : la projection renvoie un DTO minimal, sans état interne.
Couvre CA1 et CA3 (état vide) ; CA2 est rejoué en E6 et E8.
```
**Vous validez :** sur téléphone, un élève de C1 et C3 voit le devoir une seule fois ; un devoir de C2 seule est absent.

#### E3.5 — Vérifier et démontrer
```
Rejoue CLS-04 CA2 : un élève retiré ne reçoit pas un devoir créé après son retrait ; réadmis, il reçoit les suivants.
Vérifie que la matrice étendue passe (assignment, envoi, vue élève) et qu'un second professeur n'accède à rien.
Écris le parcours E2E d'E3 : le professeur crée un devoir pour C1 et C3, l'élève des deux classes le voit une fois ; un élève sans classe voit l'état vide.
```
Puis **T1**, et **T5** pour les nouvelles valeurs provisoires.

---

## E4 — Remise de texte, retard, remplacement (SUB-02, SUB-04, SUB-05)

Préalables tranchés [D, 2026-10-15], valeurs dans `src/config/decisions.ts` : **Q3** remplacement jusqu'à la première modification ou validation, 2 remplacements au plus, aucun avertissement d'image illisible ; **Q10** consigne « pas de nom » seule ; **longueur maximale d'un texte** 4000 caractères (NFR-TRT-02).

#### E4.0 — Planifier la remise et la machine d'états · Plan
```
Inspecte l'application et planifie la remise de texte (SUB-02, SUB-04, SUB-05, conception/fonctionnalites.md §6 et §8.2 E4) avec la machine d'états complète de la remise (§5.5). C'est la décision la plus coûteuse à changer ensuite : E5 à E9 s'y brancheront.
Il faut :
- Remise (une seule active par couple élève-devoir, contrainte en base) et Version (texte OU pages-images, jamais les deux ; le modèle accueille déjà les images, sans migration de fond en E9) ;
- tous les états de §5.5 déclarés maintenant (src/lib/submission-status.ts) et une table centrale des transitions : toute transition hors table est refusée ; seules 1 et 11 sont atteignables en E4 ;
- création atomique et idempotente (double clic, nouvel essai après coupure : une seule remise) ;
- horodatage par l'horloge de la base, retard calculé en SQL, strictement après la date limite, sur la date de première remise (voir « Deux horloges » dans CLAUDE.md) ;
- verrouillage du devoir posé dans la transaction de la première remise (mécanisme d'E3) ;
- remplacement : versions archivées ; un indicateur « le professeur a commencé » (modifié ou validé), alimenté en E7 et E8, arbitré de façon atomique avec le remplacement (le premier arrivé l'emporte) ; 2 remplacements au plus (Q3 [D]), compte sûr sous concurrence ;
- texte de 4000 caractères au plus [D] : unité de comptage à fixer dans le plan (caractères affichés ou unités UTF-16), identique dans le navigateur et le serveur ;
- contrôles : compte confirmé, membre actif d'une classe destinataire, devoir lié ; élève retiré : remise refusée, devoir déjà remis gardé en lecture seule ;
- l'élève ne relit jamais son texte (A3) : aucune lecture de la Version côté élève ;
- module unique des textes décisionnels (consigne « no name », notice) s'il n'existe pas encore.
Pas d'évaluation, pas de traitement par lots (E5, E6) : la remise reste « Received ».
Montre : tables et contraintes, table des transitions, flux de remise et de remplacement, lignes de matrice et d'inventaire, et la vérification (dont la concurrence).
```

#### E4.1 — Schéma et table des transitions
```
Implémente seulement le schéma et la machine d'états du plan approuvé : tables Remise et Version, contraintes, migration relue, table centrale des transitions avec une fonction unique qui applique une transition ou la refuse.
Tests unitaires : chaque transition de §5.5 acceptée, toute autre refusée, « Published » seulement depuis « Validated ».
Pas encore d'écran. Inscris les tables dans inventory.ts.
```
**Vous validez :** les tests de transitions passent ; la migration crée une seule remise active possible par couple.

#### E4.2 — Remettre un texte (SUB-02)
```
/build-ui Implémente la remise d'un texte collé (SUB-02) : écran de remise depuis My assignments, sur téléphone d'abord.
Consigne « Do not write your name in your text » affichée avant l'envoi (Q10 [D] : consigne seule, ni alerte ni masquage), depuis le module des textes ; zone de texte sans correction automatique (autocorrect, spellcheck, autocapitalize désactivés, NFR-TRT-02) ; limite de 4000 caractères [D] annoncée avant l'envoi et appliquée par le serveur, jamais de troncature.
Confirmation datée après l'envoi, puis état « Submitted, being marked ». Le devoir se verrouille à la première remise.
Tests : texte conservé à l'identique (fautes, accents, apostrophes typographiques, retours à la ligne, Unicode non normalisé), texte vide ou fait d'espaces refusé, 4000 caractères acceptés et 4001 refusés, double envoi = une remise, élève non membre ou retiré refusé. Inscris les fonctions réelles dans REAL. Couvre CA1 à CA3.
```
**Vous validez :** sur téléphone, vous collez un texte plein de fautes et le recevez tel quel en base ; un double clic ne crée qu'une remise ; le devoir devient non supprimable.

#### E4.3 — Notice avant la première remise (NFR-DON-04)
```
/build-ui Ajoute la notice que l'élève lit avant sa première remise (NFR-DON-04) : responsable du traitement, finalité, ce qui est envoyé à une IA tierce, ce que voit le professeur, droits d'accès et de rectification. Aucune promesse que son nom n'est pas transmis (Q10).
Texte dans le module des textes ; les éléments non décidés (responsable du traitement : QNF-1) s'affichent comme « to be defined », et la notice dit « demonstration, fictitious data ».
La lecture est enregistrée (compte, date, version du texte) ; la première remise est refusée côté serveur tant qu'elle ne l'est pas.
```
**Vous validez :** un nouvel élève voit la notice une fois, puis remet ; une requête directe sans notice lue est refusée.

#### E4.4 — Retard et fuseau (SUB-04)
```
Implémente le marquage « late » (SUB-04) selon le plan : calculé en SQL sur la date de première remise, strictement après la date limite, sans effet sur ce qui ira à l'IA.
Affiche « Late » à l'élève à côté de « Submitted, being marked » ; le professeur le verra dans sa liste en E7 (SUB-04 CA3 rejoué).
Tests de frontière : une seconde avant, exactement à la date limite, une seconde après ; date limite pendant un changement d'heure d'`Africa/Casablanca` (passage à GMT+0 pendant le ramadan). Couvre CA1 ; CA2 est testé avec E4.5.
```
**Vous validez :** une remise après la date limite est marquée « Late », une remise à l'heure exacte ne l'est pas.

#### E4.5 — Remplacer sa remise (SUB-05)
```
/build-ui Implémente le remplacement de la remise (SUB-05) : action « Replace my submission » tant que le professeur n'a ni modifié ni validé, nouvelle version active, ancienne archivée et horodatée, 2 remplacements au plus (Q3 [D]) : le nombre restant est affiché, le troisième est refusé avec un message explicite.
Le retard reste celui de la première remise (SUB-04 CA2).
La garde « le professeur a commencé » est dans la requête d'écriture ; en attendant E7 et E8, pose-la directement dans les tests.
Couvre CA1 (dont le troisième remplacement refusé, et deux remplacements simultanés qui ne dépassent pas le plafond), CA3 et CA4 (remplacement et premier acte simultanés : un seul aboutit, l'autre reçoit un refus explicite). CA2 est rejoué en E6.
```
**Vous validez :** vous remplacez un texte, l'ancien est archivé ; une remise faite à l'heure puis remplacée après la date limite n'est pas marquée « Late ».

#### E4.6 — Vérifier et démontrer
```
Rejoue sur de vraies remises : ASG-03 CA2 (devoir verrouillé, suppression refusée), CLS-04 CA3 (la remise d'un élève retiré est conservée) et SUB-01 CA3 (le devoir reste visible en lecture seule pour lui, sans nouvelle remise possible).
Vérifie que la matrice passe pour « Submission » : l'élève écrit la sienne sans jamais la relire, un autre élève et un autre professeur n'obtiennent rien, et aucune réponse envoyée à l'élève ne contient son texte ni un état interne.
Écris le parcours E2E d'E4 : remise avant la date limite, remise après, remplacement, double clic.
```
Puis **T1**, et **T5** pour les nouvelles valeurs provisoires.

---

## E5 — Rubrique et proposition d'évaluation par l'IA (EVL-01 à EVL-04)

Préalables :
- **Prestataire d'IA [D, 2026-10-16]** : OpenRouter, avec un modèle gratuit (`:free`), à la place de Mistral, dont l'offre Free n'active pas les clés d'API (`stack-technologique.md` §3). Les préalables Mistral ci-dessous (clé, limites, refus d'entraînement, modèle) sont de l'historique. **Vous**, avant E5.4b :
  - créez une clé OpenRouter, ajoutez-la dans `.env.local` (`OPENROUTER_API_KEY`, fixé en E5.4b), puis `docker compose up -d` ;
  - relevez dans les réglages de confidentialité du compte ce qui est permis pour les modèles gratuits (entraînement, publication des prompts) ;
  - choisissez le modèle. Critères [P] : sortie structurée par schéma JSON annoncée ; politique d'entraînement et de conservation de son fournisseur, que la notice élève dira telle quelle ; pas de date de retrait proche ; un identifiant précis, jamais le routeur `openrouter/free` (NFR-QUA-02) : l'identifiant exact du modèle `:free`, avec sa version quand il en porte une. Sinon, l'écart est assumé par écrit, comme pour Mistral, et le modèle qui a répondu est enregistré avec chaque résultat.
- **Historique, Mistral** (détail : `stack-technologique.md` §3 au commit `a7aaf44`) :
  - créez une clé API Mistral (offre gratuite) et ajoutez `MISTRAL_API_KEY` dans `.env.local`, puis `docker compose up -d` ;
  - limites de débit relevées le 2026-10-15 ;
  - refus d'entraînement fait le 2026-10-15 (QNF-5) ;
  - avant E6, relevez dans la console la ligne de `mistral-medium-3-5` (sans objet depuis le 2026-10-16) ;
- **Tranchées [D, 2026-10-15]** (`fonctionnalites.md` §9) :
  - **Q1** : note sur 20, somme des 5 niveaux ; le pas de saisie d'une note libre reste provisoire ;
  - **Q5** : remarques dans la langue du devoir, modifiables avant publication ; mention de l'IA et mention « note ajustée » affichées à l'élève (E8) ;
  - **Q6** : devoirs en français créables, aucune proposition IA jusqu'à la validation de la rubrique française par le client ; « IA indisponible » et correction à la main d'ici là.
- **Tranchés après l'enquête E5.0 [D, 2026-10-15]** (le modèle par vous ; les quatre autres points délégués à Claude) :
  - **Modèle** : `mistral-medium-3-5`. *Remplacé le 2026-10-16 : modèle gratuit d'OpenRouter, à choisir (ci-dessus, et E5.4b).*
  - **Activation** : `AI_PROVIDER` vaut `simulator` (défaut) ou la valeur du prestataire réel ; toujours le simulateur sous `NODE_ENV=test` et dans le serveur E2E (`AI_PROVIDER: "simulator"` dans `webServer.env` de `playwright.config.ts`, comme `EMAIL_TRANSPORT`). Le prestataire réel sans clé est une erreur, jamais un repli silencieux. La clé est passée explicitement au client, jamais lue par lui dans l'environnement ; elle est vidée dans Vitest et dans le serveur E2E. *Depuis le 2026-10-16, la valeur `mistral` et `MISTRAL_API_KEY` deviennent `openrouter` et `OPENROUTER_API_KEY` [P], fixés en E5.4b.*
  - **Proposition courante** : un pointeur dans `submissions`, posé par la transition 5 via `applyTransition` et remis à vide par la transition 11 dans `replaceText`. C'est une modification d'E4, à retester.
  - **Rubrique** : dans le code, sous la forme d'un registre de versions publiées figé par un test d'empreinte. La rubrique française « test only » n'est injectable que dans les tests. Activer le français revient à publier une version dans le code et à déployer, selon la procédure écrite (NFR-EXP-03).
  - **Test d'étanchéité (EVL-02 CA1)** : la capture va jusqu'au corps HTTP sérialisé par le client de l'adaptateur (vrai adaptateur, client HTTP de capture), en plus de l'interface. Une garde réseau sans dépendance remplace `globalThis.fetch` : tout appel bloqué fait échouer le test.
- **Données** : textes fictifs seulement (NFR-DON-02). Aucune copie réelle n'est envoyée à l'IA, ni à OpenRouter ni au fournisseur du modèle.

#### E5.0 — Enquête par sous-agents
```
Avant de planifier l'évaluation par l'IA, enquête avec trois sous-agents séparés, sans rien implémenter :
1. Mistral : SDK TypeScript officiel (version, appel de chat, sortie structurée par schéma JSON, durées, erreurs, limites de débit), modèles disponibles avec leurs identifiants datés et leurs dates de retrait (https://docs.mistral.ai/getting-started/models/models_overview/), ce que la documentation dit de l'offre gratuite. Sources officielles seulement, avec liens.
2. L'application : machine d'états (src/lib/submission-status.ts, applyTransition), remises et versions, rubrique (src/lib/rubric.ts), note (src/lib/grade.ts), lignes aiProposal et rubric de la matrice, et où l'évaluation se branche sans casser E4.
3. Les tests : comment intercepter toute requête sortante vers l'IA pour le test d'étanchéité (EVL-02 CA1), sur le modèle de la capture des emails, et garder les tests hors réseau.
Chacun renvoie : comportement actuel, fichiers concernés, risques, recommandation. Fais-en ensuite une synthèse courte.
```
**Vous validez :** la synthèse est claire ; le modèle recommandé a un identifiant daté, pas un alias « latest » (NFR-QUA-02).

#### E5.1 — Planifier · Plan
```
À partir de l'enquête, planifie la rubrique et la proposition d'évaluation (EVL-01 à EVL-04, conception/fonctionnalites.md §6 et §8.2 E5 ; NFR-QUA-02, NFR-EXP-04, NFR-DON-02, NFR-DON-05).
Il faut :
- une rubrique versionnée en lecture seule (version anglaise publiée ; pas de version française avant sa validation par le client, Q6 [D]), dont la version est enregistrée avec chaque proposition ; le français s'active par la publication d'une nouvelle version, sans écran, selon une procédure écrite (NFR-EXP-03) ;
- une note calculée par le système, sur 20, somme des 5 niveaux (Q1 [D]), jamais par l'IA ; GRADE_SCALE et la règle passent de provisional.ts à decisions.ts ;
- une interface unique d'évaluation, deux implémentations : Mistral (SDK officiel, `mistral-medium-3-5` épinglé) et un simulateur à pannes injectables (erreur, délai dépassé, sortie non conforme, citation introuvable). Le simulateur est le défaut ; Mistral seulement si `AI_PROVIDER=mistral` ; chaque envoi réel est inscrit au journal de sécurité, sans contenu (DON-05) ;
- une requête construite en un point unique depuis une liste blanche : texte de la version évaluée, sujet, instructions, langue, rubrique. Ni identité, ni niveau, ni identifiant, ni retard (EVL-02, SUB-04 R3). Texte et instructions encadrés comme des données, jamais comme des consignes ;
- un contrat de sortie strict (5 niveaux entiers de 0 à 4, 5 justifications non vides avec citations, commentaire général, pistes ; remarques dans la langue du devoir, Q5 [D]), validé côté serveur ; tentatives bornées ; tolérance de correspondance des citations ;
- une proposition immuable liée à la version de remise évaluée, une seule courante par remise, avec modèle, version de consigne, version de rubrique, durée, tentatives et usage ;
- des alertes bloquantes (aucun contenu évaluable ; devoir en français sans rubrique française validée) qui mènent à « not assessable » avec sa cause, et des alertes d'information (copie très courte, autre langue, hors sujet, texte adressé au correcteur), jamais vues de l'élève ;
- les transitions 2 et 5 seulement, déclenchées par une commande interne ; l'enchaînement automatique est pour E6.
Déjà tranchés (préalables d'E5) : le modèle, AI_PROVIDER, le pointeur de proposition courante, la rubrique dans le code, la capture jusqu'au corps HTTP.
Valeurs non décidées (tentatives, tolérance des citations, seuil de copie courte, écart maximal du jeu adverse) : provisional.ts.
Montre : tables et contraintes (dont l'immuabilité), interface et simulateur, constructeur de requête, validateur, lignes de matrice et d'inventaire, commande interne, et la vérification.
```

#### E5.2 — Rubrique versionnée et note (EVL-01)
```
/build-ui Implémente la rubrique versionnée et la conversion en note selon le plan (EVL-01 ; Q1 [D] : sur 20, somme des 5 niveaux, valeurs déplacées dans decisions.ts, mentions « Q1 open » retirées du code) : version anglaise publiée, lecture seule pour tous, aucune action d'écriture exposée ; note proposée calculée par le système. Écran Rubric en lecture seule pour le professeur et l'élève.
Couvre CA1 (aucune écriture, par l'interface ou par requête directe), CA2 (5 critères à 20 %, niveaux entiers de 0 à 4) et CA3 (toutes les combinaisons de niveaux, bornes comprises).
```
**Vous validez :** le professeur et l'élève lisent la rubrique, sans rien pouvoir modifier.

#### E5.3 — Interface d'évaluation, simulateur, adaptateur Mistral
```
Implémente l'interface unique d'évaluation, le simulateur à pannes injectables et l'adaptateur Mistral selon le plan, sans les brancher aux remises.
Le simulateur est le défaut partout ; aucun test ne touche le réseau. L'adaptateur épingle `mistral-medium-3-5`, borne la durée de chaque appel et inscrit chaque envoi réel au journal de sécurité, sans contenu ni identité.
Ajoute un essai manuel (script) qui envoie un texte fictif à Mistral et affiche la réponse, pour vérifier la clé, le format et l'accès au modèle.
```
**Vous validez :** les tests passent hors réseau ; l'essai manuel obtient une réponse ; le journal de sécurité montre l'envoi, sans le texte.
Fait le 2026-10-16, mais l'essai n'a jamais obtenu de réponse de Mistral (quota à 0). L'adaptateur est remplacé en E5.4b.

#### E5.4 — Requête à liste blanche et test d'étanchéité (EVL-02)
```
Implémente le constructeur de requête unique depuis une liste blanche de champs (EVL-02).
Écris le test d'étanchéité : comptes, classes et professeur avec des valeurs repérables, toutes les requêtes sortantes interceptées ; aucune de ces valeurs n'y figure, hors texte rédigé par l'élève (CA1). Deux devoirs identiques de niveaux A1 et C1, dont un remis en retard : requêtes identiques (CA2, SUB-04 CA3).
Ce test tourne à chaque npm test (NFR-EXP-04).
```
**Vous validez :** le test passe ; ajouter un champ interdit à la requête le fait échouer.

#### E5.4b — Adaptateur OpenRouter (changement de prestataire [D, 2026-10-16]) · Plan
Préalable : la clé, les réglages de confidentialité et le modèle (préalables d'E5).
```
Remplace l'adaptateur Mistral par un adaptateur OpenRouter derrière la même interface Evaluator. Révise d'abord le plan d'E5, en court : §2 (enum ai_provider, fournisseur qui a répondu), §3, §9 à §11, « Valeurs à consigner ».
Le modèle gratuit que j'ai choisi, <identifiant>, est épinglé dans decisions.ts ; jamais openrouter/free. Le client (fetch ou bibliothèque compatible OpenAI) est choisi dans le plan.
Exige la sortie structurée (provider.require_parameters). Si le modèle a un endpoint ZDR, exige provider.zdr ; sinon provider.data_collection: "deny", dont l'effet sur la conservation n'est pas vérifié, et la notice dit la conservation affichée du fournisseur (aucun filtre par durée n'existe). N'envoie aucun en-tête d'attribution (HTTP-Referer, X-OpenRouter-Title, X-Title, X-OpenRouter-Categories) ni champ user [P] ; conséquence assumée : l'identité vue par le fournisseur est celle du compte.
Garde les garanties d'E5.3 : durée bornée ; journal ai_request_sent avant chaque envoi, rien ne part s'il échoue ; aucune journalisation, télémétrie ni trace du client, ses variables de débogage refusées au démarrage ; aucune clé lue implicitement dans l'environnement ; erreurs classées sans contenu, y compris 402, 403, 408, 502, 503 et une erreur dans une réponse 200 (https://openrouter.ai/docs/api_reference/errors-and-debugging). Enregistre le modèle qui a répondu ; le fournisseur aussi si l'API le donne (à vérifier).
Retire le SDK Mistral et la valeur mistral (AI_PROVIDER, aiProviders, union provider de types.ts) avant toute migration d'E5.5. Mets à jour ai:trial, errors.ts (code d'erreur au format OpenRouter, toujours filtré en identifiant), le test de sélection, le test du point d'envoi, le test d'étanchéité, les configurations de test, les commentaires qui citent Mistral, le README et la procédure « Activer l'envoi réel à l'IA ».
Réécris la notice élève selon la politique du fournisseur retenu (version 3), sans rien promettre de non vérifié.
```
**Vous validez :** les tests passent hors réseau ; `ai:trial` avec `AI_PROVIDER=openrouter` obtient une réponse conforme au schéma ; le journal montre l'envoi, sans le texte ; vous approuvez le texte de la notice v3.
Fait le 2026-10-17 : modèle `xingchen-agi/xing4.0-29b-a4b:free` épinglé, client `fetch`, notice v3 ; tests hors réseau passés. Validé par vous le 2026-10-17 : essai `ai:trial` réel (réponse conforme, fournisseur Phala donné par la réponse) et notice v3.

#### E5.5 — Contrat de sortie et proposition immuable (EVL-03)
```
Implémente le validateur du contrat de sortie, les tentatives bornées et le stockage de la proposition selon le plan (EVL-03) : schéma, migration relue, transitions received → evaluating → to_review ou evaluation_failed par applyTransition.
Une sortie non conforme n'est jamais stockée comme courante. La proposition ne se modifie jamais. Une relance crée une nouvelle exécution, l'ancienne reste intacte et non courante. Un résultat portant sur une version qui n'est plus active est conservé non courant et ne fait pas passer la remise à « To review ».
Inscris la ressource et ses fonctions (matrice aiProposal, REAL, inventory). Couvre CA1, CA2 et CA4 avec le simulateur.
```
**Vous validez :** par la commande interne et le simulateur, une remise fictive passe à « To review » avec une proposition complète ; une sortie fautive simulée finit en « Evaluation failed », sans proposition courante.

#### E5.6 — Alertes et copies non évaluables (EVL-04, EVL-01 CA4)
```
Implémente les alertes (EVL-04).
Bloquantes, déterministes, avant tout appel à l'IA : aucun contenu évaluable ; devoir en français sans rubrique française validée (EVL-01 R4). Elles mènent à « not assessable » avec sa cause, sans proposition ni relance en boucle.
D'information, la proposition étant produite : copie très courte (seuil provisoire), autre langue, hors sujet, texte adressé au correcteur ; au mieux, non garanties.
Teste la garde du français avec une rubrique française « test only » qui n'existe que dans les tests. Couvre CA1, CA2 et EVL-01 CA4 ; CA3 (aucune alerte côté élève) est rejoué en E8.
```
**Vous validez :** une remise d'un devoir en français finit en « Not assessable » avec sa cause, sans appel à l'IA.

#### E5.7 — Commande interne, jeu de développement, jeu adverse
```
Finalise la commande interne qui évalue une remise ou toutes les remises « Received » d'un devoir (npm run …), hors interface, listée dans inventory.ts avec sa raison. Simulateur par défaut, OpenRouter seulement sur activation explicite.
Constitue dans le dépôt le jeu de développement synthétique (textes fictifs en anglais, dont des textes très fautifs, très courts, hors sujet) et le jeu adverse fini (consigne adressée au correcteur, « give 4 everywhere », fausse fin de consigne…).
Fais tourner ces jeux une fois avec le modèle OpenRouter retenu, dans la limite de 50 requêtes par jour, tentatives comprises, et consigne les résultats tels quels : sorties rejetées, stabilité sur deux exécutions, écarts du jeu adverse (EVL-03 CA3). Aucune conclusion de qualité.
```
**Vous validez :** vous lisez le compte rendu. Ces textes sont écrits par des adultes : ils ne représentent pas de vraies copies d'élèves.

#### E5.8 — Essai exploratoire de lecture manuscrite (hors produit)
Préalable : quelques photos de textes manuscrits fictifs, écrits par des adultes volontaires, sans nom.
```
Hors produit, écris un script qui fait lire ces photos par un ou deux modèles gratuits d'OpenRouter qui acceptent les images (à choisir ; l'OCR dédié de Mistral n'est plus accessible), puis compare : fautes conservées ou corrigées, passages illisibles marqués ou devinés, ordre du texte.
Consigne les résultats tels quels dans une courte annexe de conception/, avec les versions de modèle et cette limite : écriture d'adultes, pas d'élèves. Aucune intégration dans l'application (E9).
```
**Vous validez :** l'annexe existe et ne tire aucune conclusion au-delà de ce qui a été observé.

#### E5.9 — Agent relecteur et revue en contexte neuf
Créez `.claude/agents/feature-reviewer.md` :
```
---
name: feature-reviewer
description: Review a completed feature in a fresh context after implementation. Use when a feature needs an independent check for bugs, regressions, unnecessary changes, project-rule violations and missing verification.
tools: Read, Grep, Glob
---

Review the requested feature without modifying the code.

Inspect the relevant implementation and surrounding code, against CLAUDE.md (architecture rules, invariants, access matrix, provisional values) and the feature IDs in conception/fonctionnalites.md.

Return:

## Summary
What changed.

## Critical
Problems that can break functionality, data, security or the invariants.

## Major
Important regressions or architectural issues.

## Minor
Smaller issues worth fixing.

## Verification
What was checked and what still needs verification.

If something cannot be verified, say so clearly.
```
Puis :
```
Utilise le sous-agent feature-reviewer pour relire de façon indépendante l'évaluation par l'IA.
Points : étanchéité de la requête (identité, niveau, identifiants, retard), texte traité comme une donnée, contrat de sortie, immuabilité et proposition courante unique, transitions, matrice aiProposal, journal de sécurité sans contenu, aucun appel réseau dans les tests, valeurs provisoires marquées comme telles.
Ne modifie rien. Renvoie d'abord la revue.
```
Puis **T4** pour un constat douteux, **T3**, **T1**, et **T5** pour les nouvelles valeurs provisoires.

---

## E6 — Traitement automatique par lots, échecs et relance (PRC-01, PRC-02)

Préalables :
- Limites des modèles gratuits d'OpenRouter (`stack-technologique.md` §3) : 20 requêtes par minute, et 50 par jour UTC à 0 crédit acheté (1 000 dès 10 crédits) ; le fournisseur peut limiter davantage. Elles bornent le parallélisme et le volume : le lot de référence de 100 remises dépasse le plafond d'une journée (NFR-TRT-01).
- Tentatives, durée maximale par étape, parallélisme et plafond d'usage sont « à définir » : valeurs provisoires.

#### E6.0 — Planifier · Plan
```
Planifie le traitement automatique par lots (PRC-01, PRC-02, conception/fonctionnalites.md §8.2 E6 ; NFR-TRT-01, NFR-FIA-01, NFR-EXP-01, NFR-EXP-02 ; règle 4 de CLAUDE.md) avec Vercel Workflows.
Confie d'abord à un sous-agent la lecture de la documentation actuelle de Vercel Workflows : installation dans Next.js 16, déclenchement, étapes, nouvelles tentatives, reprise, exécution locale sous Docker et dans les tests, limites et événements du plan Hobby. Sources officielles, avec liens.
Il faut :
- un déclenchement après la validation de la transaction de remise ou de remplacement, jamais avant : la confirmation de l'élève ne dépend pas du traitement ;
- un traitement par version de remise, idempotent : un double déclenchement donne un seul traitement actif et une seule proposition courante ; le traitement d'une version devenue non active ne produit rien de courant ;
- des étapes qui ne portent que des identifiants ; la requête à l'IA reste construite par le constructeur d'E5 ;
- un parallélisme borné selon les quotas relevés, des tentatives et une durée maximale par étape, une reprise après panne sans perte ni doublon ; aucune remise « en cours » au-delà d'une durée maximale (dis comment on le garantit) ;
- un échec après les tentatives qui mène à « evaluation failed » ; la relance et le passage à l'évaluation manuelle exposés comme fonctions serveur (boutons en E7 et E8) ;
- un plafond d'usage de l'IA par réglage (EXP-02) : au plafond, plus aucun appel, la remise passe à « not assessable », cause « AI unavailable », sans perte ;
- la mesure par traitement (durées, tentatives, usage), sans identité ni contenu (EXP-01) ;
- un point d'attache pour la transcription d'image (E9), non implémenté.
Montre : flux, fichiers, étapes et leurs garanties, réglages provisoires, comportement en développement, en test et sur la preview, et la vérification sous pannes.
```

#### E6.1 — Déclenchement automatique (PRC-01 R2)
```
Installe et configure Vercel Workflows selon le plan, puis implémente le déclenchement : à la remise et au remplacement, une fois la transaction validée, pour la version active seulement. Une remise texte enchaîne received → evaluating → to_review sans action de quiconque.
Couvre PRC-01 CA1 (texte) et CA2 (double déclenchement). Rejoue SUB-05 CA2 : un remplacement relance le traitement, et le résultat de l'ancienne version, arrivé tard, reste non courant.
```
**Vous validez :** vous remettez un texte comme élève, la base montre « To review » avec une proposition (simulateur) sans autre action ; l'élève voit toujours « Submitted, being marked ».

#### E6.2 — Parallélisme, tentatives, reprise, plafond (PRC-01 R3, NFR-EXP-02)
```
Implémente le parallélisme borné, les tentatives, la durée maximale par étape, la reprise après panne et le plafond d'usage selon le plan, valeurs non décidées dans provisional.ts.
Couvre avec le simulateur PRC-01 CA3 (lot déposé en parallèle par plusieurs comptes, un marqueur unique par texte : chaque proposition ne porte que sur sa copie) et CA4 (une remise en panne n'empêche pas les autres ; arrêt en cours de lot puis reprise : zéro perte, zéro doublon). Plafond atteint : les remises suivantes passent à « AI unavailable » sans appel.
```
**Vous validez :** sur un lot simulé de quelques dizaines de remises avec pannes injectées, chaque remise atteint un état final et aucune proposition ne cite un autre texte que le sien.

#### E6.3 — Échecs et relance (PRC-02)
```
Implémente la gestion des échecs (PRC-02) : après les tentatives, « evaluation failed », visible du professeur en E7.
Fonctions serveur, inscrites dans la matrice et inventory.ts :
- relance d'un échec (transition 6) ;
- liste des copies « AI unavailable » à relancer quand leur cause disparaît (rubrique française activée, plafond levé ; transition 7) : jamais automatiquement, jamais pour une copie évaluée à la main.
Couvre CA1 à CA4 ; l'élève voit seulement « Submitted, being marked », quel que soit l'échec (SUB-01 CA2).
```
**Vous validez :** une panne simulée persistante donne « Evaluation failed » ; la relance ramène la remise à « To review ».

#### E6.4 — Mesures d'usage et de délai (NFR-EXP-01)
```
Ajoute le script qui restitue, par devoir, le délai entre remise et « To review », l'usage d'IA par copie, les tentatives et le taux d'échec, sans identité ni contenu (EXP-01).
Sur un lot de test, mesure aussi le nombre d'événements Workflows par copie et le délai du lot. Rapporte les chiffres tels quels, même au-dessus d'une cible, et déduis-en combien de copies par mois le plan Hobby et le quota quotidien d'OpenRouter permettent.
```
**Vous validez :** le rapport donne des chiffres mesurés, sans cible inventée.

#### E6.5 — Vérifier et démontrer
```
Écris le parcours E2E d'E6 : l'élève remet, la remise atteint « To review » (vérifié par la base de test ; l'écran du professeur arrive en E7), l'élève voit « Submitted, being marked » ; remplacement, puis nouveau traitement.
Liste ensuite les variables à ajouter dans Vercel (Preview) pour OpenRouter et Workflows, sans lire .env.local. Une fois la preview poussée à ma demande, vérifie une remise traitée en ligne avec le modèle OpenRouter retenu, sur un texte fictif.
```
**Vous validez :** sur la preview, une remise fictive atteint « To review » avec une proposition du modèle OpenRouter retenu.

#### E6.6 — Revue en contexte neuf
```
Utilise le sous-agent feature-reviewer pour relire de façon indépendante le traitement par lots.
Points : mélange entre copies (une note pour le mauvais élève), idempotence et doublons, reprise, remises bloquées « en cours », version non active, plafond, étanchéité de la requête, journaux sans contenu, matrice des nouvelles actions.
Ne modifie rien. Renvoie d'abord la revue.
```
Puis **T4** pour un constat douteux, **T3**, **T1**, et **T5** pour les valeurs provisoires et les mesures.

---

## E7 à E11 — Squelette

À rédiger en détail à l'approche de chaque étape, à partir de la conception à jour. Chaque étape commence par un **Plan** et se termine par **T1**, puis T5 si une décision a changé.

| Étape | Prompts prévus | Outils du guide introduits |
|---|---|---|
| **E7** Revue par le professeur | E7.0 plan · E7.1 liste réelle à partir de la maquette 1.4 (REV-01) · E7.2 écran de copie à partir de la maquette 1.5 (REV-02) · E7.3 évaluation du professeur, recalcul, note fixée (REV-03) · E7.4 journal atomique et conflits (REV-04) · E7.5 relance depuis la liste, rejeux · revue | — |
| **E8** Validation, publication | E8.0 plan · E8.1 valider, publier, retirer, raccourci (REV-05, PUB-01) · E8.2 évaluation manuelle (REV-06) · E8.3 vue de l'élève à liste blanche (PUB-02) · E8.4 balayage « rien avant publication » · E8.5 rejeux de la table 8.3 · E8.6 cycle complet en texte (E2E) · revue de la fuite | Revue en contexte neuf : fuite de résultats |
| **E9** Canal image | E9.0 enquête par sous-agents (OCR ou modèle multimodal, limites de 4,5 Mo et de 1 Go) · E9.1 plan · E9.2 dépôt multipage, réduction dans le navigateur, type, métadonnées (SUB-03) · E9.3 table des images et route unique contrôlée · E9.4 moteur de lecture et contrat de fidélité (TRX-01) · E9.5 branchement aux états de traitement · E9.6 transcription et image dans l'écran de copie · E9.7 rejeux image · revue | Sous-agents, revue |
| **E10** Durcissement et mesure | A : matrice complète automatisée, balayage, étanchéité, pannes, sessions et liens, accessibilité (USA-03), export de sauvegarde ; revue externe facultative (CodeRabbit s'il reste gratuit pour ce dépôt, sinon `/code-review`) ; tri des constats ; T3. B : scripts de mesure depuis le journal, selon le protocole validé par le client | Revue indépendante |
| **E11** Démonstration | Déploiement final, jeu de données fictif en anglais, scénarios scriptés, préchauffage de Neon, notice « demo, fictitious data », répétition dans le quota de 50 requêtes par jour (répétition et séance) | — |
| **Fin** | Revue de toute l'application ; vérification des parcours admin, teacher, student ; synchronisation finale de CLAUDE.md | — |

## 4. Points ouverts qui touchent ces prompts

- Q2 (premier administrateur), Q4, Q8, Q9 : valeurs provisoires dans les prompts, à trancher avant l'étape concernée (voir fonctionnalites.md §9).
- Fuseau de la date limite tranché [D, 2026-10-14] : `Africa/Casablanca`.
- Q3, Q10 et longueur maximale d'un texte tranchées [D, 2026-10-15] : 2 remplacements au plus jusqu'au premier acte du professeur, sans avertissement d'image illisible ; consigne « pas de nom » seule ; 4000 caractères. Codées dans `src/config/decisions.ts` (E4).
- Q7 tranchée [D, 2026-10-14] : lien et code de classe valables 1 heure après la création du lien (CLS-02 R4). Code aligné (`src/config/decisions.ts`).
- Q1, Q5, Q6 tranchées [D, 2026-10-15] : note sur 20, somme des niveaux ; remarques dans la langue du devoir, mentions de l'IA et de la note ajustée affichées ; français sans proposition IA jusqu'à la validation de sa rubrique.
- Bibliothèque de primitives d'interface : tranchée par vous en 1.1.
- Prestataire d'IA tranché [D, 2026-10-16] : OpenRouter, modèle gratuit, à la place de Mistral. Modèle `xingchen-agi/xing4.0-29b-a4b:free` [D, 2026-10-17], adaptateur en place (E5.4b) ; 50 requêtes par jour à 0 crédit acheté (E5.7, E6, E9, E11).
