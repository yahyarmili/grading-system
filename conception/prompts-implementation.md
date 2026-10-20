# Prompts progressifs d'implémentation

> Étape 8 de la démarche d'ingénierie. Statut : **brouillon**. Structure validée par l'utilisateur le 2026-10-12 ; contenu des prompts à valider à l'usage.
> S'appuie sur [fonctionnalites.md](fonctionnalites.md) (plan E1 à E11, identifiants AUTH-01…), [besoins-non-fonctionnels.md](besoins-non-fonctionnels.md), [acteurs.md](acteurs.md) et [stack-technologique.md](stack-technologique.md). Méthode reprise du guide « Complete Claude Code Course Flow » (PDF fourni par l'utilisateur).

**En bref.** Une suite de prompts à copier dans Claude Code, un par sous-fonctionnalité, chacun suivi de ce que vous vérifiez avant de passer au suivant. Les phases 0 à 2 et les étapes E1 à E8 sont rédigées en entier (E7 et E8 le 2026-10-21) ; E9 à E11 sont en squelette et seront rédigées à l'approche de chaque étape, à partir de la conception à jour.

---

## 1. Décisions de cadrage [D, 2026-10-12]

| Sujet | Décision |
|---|---|
| Découpage | Une étape = un `/plan`, puis une sous-fonctionnalité par prompt (logique serveur, écran, tests), puis une vérification contre le plan. |
| Rédaction | Détail pour les deux prochaines étapes ; squelette au-delà, réécrit quand la conception évolue. |
| Langue | Prompts en français ; **contenu de l'application en anglais** (interface, emails, messages) ; code en anglais. |
| Design | Référence visuelle : [refine app-crm-minimal](https://github.com/refinedev/refine/tree/master/examples/app-crm-minimal) ([démo](https://example.minimal-crm.refine.dev)). Elle utilise Ant Design ; on en reprend les principes en Tailwind, sans Ant Design ni refine. |
| Maquettes | Deux écrans clés en données fictives avant la base : liste des remises et écran de copie. |
| Sous-choix techniques | Better Auth (avec son skill officiel), Zod, Vitest et Playwright, Nodemailer (Gmail SMTP), SDK officiel `@anthropic-ai/sdk` en version exacte (0.135.0, lue le 2026-10-19) [D, 2026-10-19]. *Historique : SDK TypeScript officiel de Mistral, remplacé le 2026-10-16 par OpenRouter [D], appelé par `fetch` sans bibliothèque (E5.4b) ; OpenRouter remplacé le 2026-10-19.* Chacun reste confirmé dans le `/plan` de son étape. |
| Emplacement | L'application est créée à la racine du dossier `grading_system`, à côté de `conception/`, qui reste lisible par Claude. |

## 2. Mode d'emploi

1. Un prompt à la fois. Ne passez au suivant qu'après avoir coché « Vous validez ».
2. Après chaque validation : `git diff`, puis un commit. En cas d'échec, `git restore` revient à l'état validé.
3. Les prompts marqués **Plan** se lancent après `/plan` : on relit le plan, on le simplifie s'il en fait trop (T2), puis on lance l'implémentation.
4. Une valeur non décidée (durée d'un lien, N essais, format de la note…) est codée comme **valeur provisoire** dans un fichier de configuration unique, marquée comme telle. Elle ne devient pas une décision.
5. Quand un choix change en cours de route, utilisez T5 : la conception, ce document et CLAUDE.md sont mis à jour avant de continuer.
6. Vous créez vous-même les comptes et les secrets (Neon, Gmail, Anthropic dans sa Console, Vercel ; OpenRouter jusqu'au 2026-10-19). Claude lit les variables par `process.env`, jamais le fichier `.env.local`.

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
- **Prestataire d'IA [D, 2026-10-19]** : Anthropic, `claude-haiku-5-5` ; voir la reprise d'E5 (E5.10 à E5.16). Les préalables OpenRouter et Mistral ci-dessous sont de l'historique.
- **Historique, OpenRouter (2026-10-16 au 2026-10-19)** (détail : ces préalables et `stack-technologique.md` §3 au commit `85b60c4`) : modèle gratuit (`:free`) à la place de Mistral, dont l'offre Free n'activait pas les clés d'API ; clé `OPENROUTER_API_KEY` dans `.env.local` ; réglages de confidentialité relevés ; modèle choisi selon des critères [P] (sortie structurée, politique du fournisseur dite par la notice, identifiant précis, jamais `openrouter/free`) : `xingchen-agi/xing4.0-29b-a4b:free` (E5.4b).
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
  - **Modèle** : `mistral-medium-3-5`. *Remplacé le 2026-10-16 par un modèle gratuit d'OpenRouter (`xingchen-agi/xing4.0-29b-a4b:free`, E5.4b), puis le 2026-10-19 par `claude-haiku-5-5` (reprise d'E5).*
  - **Activation** : `AI_PROVIDER` vaut `simulator` (défaut) ou la valeur du prestataire réel ; toujours le simulateur sous `NODE_ENV=test` et dans le serveur E2E (`AI_PROVIDER: "simulator"` dans `webServer.env` de `playwright.config.ts`, comme `EMAIL_TRANSPORT`). Le prestataire réel sans clé est une erreur, jamais un repli silencieux. La clé est passée explicitement au client, jamais lue par lui dans l'environnement ; elle est vidée dans Vitest et dans le serveur E2E. *Depuis le 2026-10-19, la valeur réelle devient `anthropic` et la clé `GRADING_ANTHROPIC_API_KEY` [P], fixées en E5.13 ; `openrouter` est alors refusé [D]. Historique : `mistral` et `MISTRAL_API_KEY`, puis `openrouter` et `OPENROUTER_API_KEY` du 2026-10-16 au 2026-10-19 (E5.4b).*
  - **Proposition courante** : un pointeur dans `submissions`, posé par la transition 5 via `applyTransition` et remis à vide par la transition 11 dans `replaceText`. C'est une modification d'E4, à retester.
  - **Rubrique** : dans le code, sous la forme d'un registre de versions publiées figé par un test d'empreinte. La rubrique française « test only » n'est injectable que dans les tests. Activer le français revient à publier une version dans le code et à déployer, selon la procédure écrite (NFR-EXP-03).
  - **Test d'étanchéité (EVL-02 CA1)** : la capture va jusqu'au corps HTTP sérialisé par le client de l'adaptateur (vrai adaptateur, client HTTP de capture), en plus de l'interface. Une garde réseau sans dépendance remplace `globalThis.fetch` : tout appel bloqué fait échouer le test.
- **Données** : textes fictifs seulement (NFR-DON-02). Aucune copie réelle n'est envoyée à l'IA, donc à Anthropic.

#### E5.0 — Enquête par sous-agents
```
Avant de planifier l'évaluation par l'IA, enquête avec trois sous-agents séparés, sans rien implémenter :
1. Mistral : SDK TypeScript officiel (version, appel de chat, sortie structurée par schéma JSON, durées, erreurs, limites de débit), modèles disponibles avec leurs identifiants datés et leurs dates de retrait (https://docs.mistral.ai/getting-started/models/models_overview/), ce que la documentation dit de l'offre gratuite. Sources officielles seulement, avec liens.
2. L'application : machine d'états (src/lib/submission-status.ts, applyTransition), remises et versions, rubrique (src/lib/rubric.ts), note (src/lib/grade.ts), lignes aiProposal et rubric de la matrice, et où l'évaluation se branche sans casser E4.
3. Les tests : comment intercepter toute requête sortante vers l'IA pour le test d'étanchéité (EVL-02 CA1), sur le modèle de la capture des emails, et garder les tests hors réseau.
Chacun renvoie : comportement actuel, fichiers concernés, risques, recommandation. Fais-en ensuite une synthèse courte.
```
**Vous validez :** la synthèse est claire ; le modèle recommandé a un identifiant daté, pas un alias « latest » (NFR-QUA-02).
Fait (enquête Mistral ; décisions du 2026-10-15 dans les préalables). Critère « identifiant daté » remplacé le 2026-10-19 [D] : NFR-QUA-02 reformulé (identifiant fixe, sans date ni alias, retrait pas avant le 2027-10-07, modèle qui a répondu enregistré).

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
Fait : plan `~/.claude/plans/partir-de-l-enqu-te-witty-eagle.md`. Adaptateur Mistral remplacé en E5.4b (OpenRouter, 2026-10-16), puis par Anthropic (reprise d'E5, 2026-10-19) ; plan révisé en E5.11.

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
Remplacé le 2026-10-19 par la reprise d'E5 (E5.10 à E5.16) ; l'adaptateur OpenRouter est retiré en E5.13.

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
Essai fait le 2026-10-17 avec OpenRouter (CA3 non mesurable, `annexe-essais-ia.md`) ; refait en E5.16 avec `claude-haiku-5-5` [D, 2026-10-19] ; commande et jeux gardés.

#### E5.8 — Essai exploratoire de lecture manuscrite (hors produit)
Préalable : quelques photos de textes manuscrits fictifs, écrits par des adultes volontaires, sans nom.
```
Hors produit, écris un script qui fait lire ces photos par un ou deux modèles gratuits d'OpenRouter qui acceptent les images (à choisir ; l'OCR dédié de Mistral n'est plus accessible), puis compare : fautes conservées ou corrigées, passages illisibles marqués ou devinés, ordre du texte.
Consigne les résultats tels quels dans une courte annexe de conception/, avec les versions de modèle et cette limite : écriture d'adultes, pas d'élèves. Aucune intégration dans l'application (E9).
```
**Vous validez :** l'annexe existe et ne tire aucune conclusion au-delà de ce qui a été observé.
Script écrit (`85b60c4`), essai non lancé. Repris en E9.0 avec `claude-haiku-5-5` [D, 2026-10-19] ; script gardé, à réécrire.

### Reprise d'E5 — Anthropic, `claude-haiku-5-5` [D, 2026-10-19]

Préalables :
- **Décisions [D, 2026-10-19]** :
  - prestataire : Anthropic en direct, `claude-haiku-5-5` ;
  - budget : crédit API mensuel de l'abonnement Max, sans moyen de paiement, donc 0 MAD décaissé ; ensuite, clé du client ou simulateur ;
  - QUA-02 reformulé ;
  - appels spécialisés fixes, sans agent ni framework ;
  - SDK officiel durci ;
  - `inference_geo` `us` ;
  - OpenRouter retiré du code du produit ;
  - E5.8 repris en E9.0.

  Les préalables OpenRouter d'E5 deviennent de l'historique.
- **Remplacé** : E5.4b ; l'essai d'E5.7, refait en E5.16 (la commande et les jeux restent) ; E5.8, repris en E9.0. E5.9 se lance après E5.16.
- **Gardé tel quel** :
  - E5.2, E5.4, E5.5, E5.6 et la commande d'E5.7 ;
  - la rubrique `en-1` ;
  - la liste blanche et le cadrage de `request.ts`, `output.ts`, `quotes.ts`, `alerts.ts` ;
  - le cœur d'`evaluate.ts`, `data/evaluation`, `0010`/`0011` ;
  - les jeux 10 + 7, le simulateur par défaut, le journal avant envoi, `selectEvaluator` ;
  - `--provider` sur la ligne de commande seulement.
- **Vous, avant E5.11** :
  - réclamez le crédit et vérifiez qu'aucun moyen de paiement n'est enregistré ;
  - relevez le palier, la fin du cycle, la conservation affichée et `inference_geo` autorisé ;
  - créez un espace de travail dédié avec une limite mensuelle, des alertes et `inference_geo` `us` ;
  - relisez les conditions et la politique d'usage.

  Fait le 2026-10-19 (relevés dans le bloc d'E5.11) ; reste la lecture des conditions.
- **Vous, avant E5.15** : une clé limitée à l'espace, expiration notée, dans `.env.local` sous `GRADING_ANTHROPIC_API_KEY`, puis `docker compose up -d`.
- **Vous, après E5.13** : retirez `AI_PROVIDER=openrouter` et `OPENROUTER_API_KEY` de `.env.local` (et de Vercel s'ils y sont), puis révoquez la clé OpenRouter.
- **Données** : textes fictifs seulement. Aucune copie réelle avant que le client ait validé la fiche DON-02 d'Anthropic.

#### E5.10 — Consigner le passage à Anthropic (T5 ; QNF-5, NFR-DON-02, NFR-TRT-01, NFR-QUA-02)
```
Nous changeons la décision suivante [D, 2026-10-19] : le prestataire d'IA devient l'API d'Anthropic en direct, modèle claude-haiku-5-5, à la place d'OpenRouter ; payée par le crédit API mensuel de mon abonnement Max (100 $, sans report), sans moyen de paiement : 0 MAD décaissé. Mes autres choix : les autres décisions [D, 2026-10-19] des préalables ci-dessus. Relevés de la Console : reportés à E5.11.
Mets à jour, en restant bref, chaque [D] daté et chaque fait avec sa source (lien ; « résumé seulement » s'il y a lieu) :
- crée conception/annexe-ia-anthropic.md : faits datés sur l'API et Haiku 5.5, confiance, audit du SDK 0.135.0 avec ses liens au tag, options écartées (agents, frameworks, lots, Files API) ;
- stack-technologique.md §1 (budget), §2, §3 (OpenRouter en historique par son commit, comme Mistral ; fiche DON-02 d'Anthropic : entraînement, pays, conservation et exceptions, plus de ZDR, schéma gardé 24 h, sous-traitants à définir, transfert à confirmer par la CNDP ou un juriste, AUP « Education and credentials » et mineurs, élèves de 18 ans [D] avec QNF-1 à confirmer), §5, et la ligne 22 (essai d'écriture) ;
- besoins-non-fonctionnels.md : lignes 6, 19, 35, QNF-5 (IA payée par le crédit du développeur pendant le projet ; ensuite clé du client, simulateur ou évaluation manuelle), TRT-01, EXP-01, EXP-02 (branche payante), QUA-02, §2.8 ;
- fonctionnalites.md : §8.2 E5 (essai d'écriture déplacé, coût par copie à mesurer), §8.2 E9 (essai repris en E9.0), ligne 720 ;
- acteurs.md:110 ; procedures.md (« Activer l'envoi réel » marquée à réécrire en E5.15) ;
- prompts-implementation.md : §1, §2, §4 ; préalables d'E5 en historique ; la reprise fournie, insérée sous E5.8 ; sous E5.4b « Remplacé le 2026-10-19 » ; sous E5.7 « Essai refait en E5.16 » ; sous E5.8 « Repris en E9.0 » ; points de revue d'E5.9 étendus à l'adaptateur, lancé après E5.16 (un seul titre E5.9) ; préalables d'E6, E6.0, E6.2, E6.4, E6.5 ; lignes E7, E8, E9, E10, E11 du squelette ;
- CLAUDE.md et .claude/a-consigner.md.
Vérifie par un grep de « OpenRouter|gratuit|50 requêtes|ZDR|Phala » dans conception/, CLAUDE.md et a-consigner.md que plus rien d'OpenRouter n'est présenté comme en vigueur. Ne consigne en [D] que ce que j'ai tranché ; les [P] restent pour le plan. Ne touche pas au code : liste le code qui contredit, sans le modifier.
```
**Vous validez :** chaque section porte un [D] daté ; le grep ne trouve plus OpenRouter en vigueur ; l'annexe donne une source à chaque fait ; aucun fichier de `src/` n'a changé.
Fait le 2026-10-19 (session d'analyse) : décisions consignées, `conception/annexe-ia-anthropic.md` créée ; relevés de la Console reportés à E5.11.

#### E5.11 — Réviser le plan d'E5 pour Anthropic (EVL-02, EVL-03, NFR-DON-05, NFR-EXP-04) · Plan
```
Relevés de la Console (2026-10-19) : palier Start (Haiku 5.5 : 1 000 requêtes/min, 2 M tokens d'entrée/min, 400 K de sortie/min, plafond de 500 $/mois) ; crédit promotionnel de 100 $ accordé le 2026-10-17, expire le 2026-11-12 (UTC), aucun moyen de paiement ; espace grading_system limité à 10 $/mois (remise à zéro le 1er), alertes à 5 et 8 $, limites de débit de l'organisation ; inference_geo autorisé US seulement, par défaut US, région de l'espace United States ; conservation de l'organisation On · 30 days, pas de ZDR ; programme partenaire non rejoint, retours des utilisateurs désactivés. Consigne-les d'abord dans conception/annexe-ia-anthropic.md §8 et stack-technologique.md §3, datés.
Révise le plan d'E5 (~/.claude/plans/partir-de-l-enqu-te-witty-eagle.md) d'après la conception consignée en E5.10 et conception/annexe-ia-anthropic.md. Sections qui dépendent du prestataire : Contexte, §1 à §5, §7, §9 à §11, « Valeurs à consigner » ; « Changement de prestataire » passe en historique. Corrige ce qui a dérivé depuis E5.7 (délai 120 000 ms, pause 4 000 ms, AI_DAILY_REQUEST_LIMIT).
Lis d'abord le skill claude-api et la documentation officielle de claude-haiku-5-5 (migration, sortie structurée, erreurs, limites, data residency) ; cite les liens.
Le plan fixe :
- anthropic.ts, seul à importer @anthropic-ai/sdk 0.135.0 (version exacte ; une seule entrée no-restricted-imports qui réunit ce motif et celui de @/server/db, avec contre-épreuve) : options explicites (apiKey, authToken et webhookKey à null, baseURL, maxRetries 0, logLevel "off", openTelemetry false, User-Agent et X-Stainless-* à null, no-store) ; fetch injecté (globalThis.fetch lu à l'appel, seul POST https://api.anthropic.com/v1/messages, 4 en-têtes transmis, ai_request_sent avant chaque requête) ; comment ce fetch connaît le sujet du journal ; un échec du journal qui remonte en erreur interne, pas en erreur de connexion relancée ; signal par appel et untilDeadline ; NODE_DEBUG et toute variable ANTHROPIC_* refusés au démarrage ;
- le corps : model, max_tokens, system, un seul message user, output_config (format json_schema OUTPUT_SCHEMA, effort), thinking, inference_geo ; jamais temperature, top_p, top_k, pré-remplissage, metadata, tools, stream, cache_control ;
- la réponse : stop_reason lu avant le contenu (refusal → refused, catégorie gardée en code filtré, null compris ; max_tokens → validateur) ; blocs lus par type, thinking jamais stocké ; stopReason et usage (entrée, sortie, cache, inference_geo) portés par la réponse, et par l'erreur refused, facturée pour certaines catégories ; providerAnswered null ;
- les erreurs, par statut, type et code filtrés, jamais par le message stocké : 400, 401, 402, 403, 404, 429 enforced_spend_limit_reached → configuration, avec un code budget repéré par début de message documenté (limite de dépense, crédit épuisé) sans rien stocker ; autre 429 → rate_limited ; 504 et délai local → timeout ; 409, 500, 529, connexion, 200 qui n'est pas un message → unavailable ; 413 et autres 4xx → rejected ;
- la migration 0012, en ajouts seulement (E5.12) ; listes stockée et sélectionnable séparées ;
- evaluation-2 : génération (effort, thinking, max_tokens) et level en enum, rien d'autre ; aucun champ ni mot « reasoning » (catégorie de refus reasoning_extraction) ;
- les valeurs : AI_MODEL et AI_INFERENCE_GEO dans decisions.ts ; prix publiés rangés comme un fait (source et date), pas en [D] ; AI_ROUTING et AI_TEMPERATURE retirés ; [P] dans provisional.ts : AI_EFFORT, AI_THINKING, AI_MAX_OUTPUT_TOKENS, AI_CALL_TIMEOUT_MS, AI_DAILY_REQUEST_LIMIT, AI_TRIAL_PAUSE_MS, nom de la clé ;
- le test d'étanchéité : anthropic-version vérifié égal à 2023-06-01, puis seul exclu du contrôle des dates, avec x-api-key ; l'expression ANY_ID_OR_DATE inchangée ;
- un tableau garantie → test hors réseau, chacun avec sa contre-épreuve ;
- l'essai instrumenté (E5.14) et le premier envoi d'evaluation-2 (E5.15).
Montre le découpage E5.12 à E5.16, puis E5.9, et ce qui reste hors E5 (plafond de coût et disjoncteur en E6, vote et variantes en E10, lecture en E9).
```
Fait le 2026-10-19 : relevés consignés (annexe §8, `stack-technologique.md` §3), plan d'E5 révisé. Écart signalé, non tranché : la Console montre un crédit promotionnel qui expire le 2026-11-12 ; E5.15 et E5.16 se font avant.

#### E5.12 — Socle additif : valeurs stockées, refus, pannes simulées (EVL-03, NFR-EXP-04)
```
Selon le plan révisé, sans toucher à l'adaptateur OpenRouter encore en place :
- migration 0012 (npm run db:generate -- --name=add_anthropic_and_refused) : anthropic dans ai_provider, refused dans evaluation_error, rien d'autre ; montre-moi le SQL avant db:migrate sur dev (une valeur d'enum ne se retire pas) ;
- aiProviders : liste stockée (simulator, openrouter, anthropic) séparée de la liste sélectionnable ;
- refused : échec final, jamais relancé automatiquement, message fixe ; la relance manuelle (transition 6) reste permise ;
- simulateur et ai:evaluate --simulate : pannes refusal (avec catégorie), sortie tronquée (max_tokens), 529, 402, limite de dépense ;
- tests à jour.
```
**Vous validez :** le SQL de `0012` n'ajoute que deux valeurs ; `npm test` passe ; `ai:evaluate --simulate refusal` donne « Evaluation failed », cause `refused`, une seule tentative.

Fait le 2026-10-19 : SQL validé, `0012` appliquée sur dev ; `--simulate refusal` sur dev : `evaluation_failed`, 1 tentative, `refused`. Les champs optionnels `stopReason` (réponse et erreur) et `usage` (erreur) sont ajoutés dès E5.12, pour le simulateur.

#### E5.13 — Adaptateur Anthropic durci, hors réseau (EVL-02, NFR-DON-05, NFR-EXP-04, NFR-QUA-02)
```
Implémente selon le plan révisé le passage à Anthropic, sans envoi réel.
- Installe @anthropic-ai/sdk en version exacte 0.135.0 ; règle ESLint unique et tests/ai-send-point.test.ts : seul src/server/ai/anthropic.ts l'importe, adresse api.anthropic.com ; les autres paquets d'IA restent interdits.
- Remplace openrouter.ts et son test par anthropic.ts et anthropic.test.ts, même plan (ce qui part, le journal, chaque échec, le refus de démarrer). errors.ts : forme d'erreur d'Anthropic ; garde parseRetryAfter, IDENTIFIER, les messages fixes.
- Configuration et types selon le plan ; Generation devient effort, thinking, maxOutputTokens ; EvaluationResponse porte stopReason et usage ; PROMPT_VERSION evaluation-2, empreintes refaites ; AI_PROVIDER vaut simulator ou anthropic (openrouter, mistral refusés) ; la clé, lue par index.ts sous son nom, passée explicitement, vidée dans Vitest et dans le serveur E2E.
- ai:evaluate et ai:trial : --provider anthropic, garde quotidienne, essai de connexion sans temperature.
- Tests hors réseau, un par garantie, chacun avec sa contre-épreuve : journal en échec → aucun appel et erreur interne ; une seule requête HTTP sur 408, 409, 429, 500, 529, délai avant les en-têtes, erreur de connexion, et un 400 avec x-should-retry: true ; corps qui cale après les en-têtes → timeout ; environnement piégé (ANTHROPIC_API_KEY, _AUTH_TOKEN, _BASE_URL, _LOG=debug, _CUSTOM_HEADERS, variables OpenTelemetry, NODE_DEBUG) → refus au démarrage ; client construit avant la garde réseau → bloqué ; aucune écriture console ; un marqueur dans un corps d'erreur ou un 200 cassé ne ressort ni dans l'erreur, ni au journal, ni en base ; bloc thinking avant le texte ; refusal et max_tokens ; ^ ou ~ devant la version → échec.
- Test d'étanchéité adapté comme prévu au plan (4 en-têtes, clé dans x-api-key seulement, anthropic-version, clés exactes du corps, aucun metadata, A1 = C1) ; evaluation.int, index.test, errors.test, inventory.ts, README, commentaires, état d'E5 dans CLAUDE.md.
Garde : request.ts hors génération et schéma, output.ts, quotes.ts, alerts.ts, evaluate.ts (commentaires seulement), data/evaluation, 0010 à 0012, les jeux.
```
**Vous validez :** `npm test` et les E2E passent hors réseau ; retirer une protection fait échouer son test ; `ai:evaluate` sur le simulateur donne « To review » ; `--provider openrouter` est refusé ; `src/` ne cite plus OpenRouter, hors l'enum stocké et la notice v3.

Fait le 2026-10-19 : 927 tests et 26 E2E passent ; `ai:evaluate` sur le simulateur donne « To review », `--provider openrouter` est refusé. Écarts au plan : `Usage` garde les trois sommes stockées et met le détail d'Anthropic dans `detail` (`evaluate.ts` intouché) ; les commandes affichent `request-id`, pas le statut HTTP ; `guardedFetch` et l'option `maxRetries` sont exposés pour les tests seulement.

#### E5.14 — Essai instrumenté et jeu sensible, sur le simulateur (NFR-EXP-01, EVL-03 CA3)
```
Instrumente l'essai selon le plan, sans envoi réel :
- TrialCall garde stop_reason, usage (avec inference_geo) et code fournisseur ; ai:trial affiche par appel le modèle qui a répondu, stop_reason, l'usage et le coût estimé (prix rangés avec leur source et leur date) ; le premier appel après un nouveau schéma est signalé (compilation de la grammaire) ;
- le rapport lit la version de rubrique au lieu d'« en-1 » écrit en dur, donne les refus par catégorie (null compris) et la dispersion des niveaux par critère sur N exécutions, à la place de « run 1 against run 2 » (tests/ai-trial.test.ts mis à jour) ;
- option --limit <n> pour n'envoyer que n textes d'un jeu, par buildEvaluationRequest ;
- jeu sensible : trois textes fictifs (accident, guerre, santé) dans scripts/fixtures/ai/, --set sensitive, compris dans all ; les jeux 10 + 7 restent intacts.
```
**Vous validez :** `ai:trial --set all --runs 3` sur le simulateur produit le rapport complet ; `--set dev --limit 1` n'envoie qu'un texte ; `npm test` passe.

Fait le 2026-10-19 : prix dans `src/server/evaluation/prices.ts` (source et date ; au-delà de 100 K tokens de prompt, coût non estimé s'il y a du cache, prix non lus) ; le premier appel signalé est le premier de l'essai avec son schéma (un seul schéma par essai) ; `--limit` garde les n premiers textes du jeu, dans son ordre (`adversarial` : les bases d'abord). Sur le simulateur, l'usage n'est pas compté (sauf pour un refus simulé) : colonnes d'usage et de coût à « – ».

#### E5.15 — Notice v4, procédure et premiers envois réels (NFR-DON-03, NFR-DON-05, NFR-EXP-03)
Préalable : la clé dans `.env.local`, puis `docker compose up -d`.
```
Réécris la notice élève (version 4) d'après la fiche DON-02 d'Anthropic consignée en E5.10 : Anthropic, entreprise des États-Unis ; inférence et stockage aux États-Unis ; conservation relevée dans la Console, et jusqu'à 2 ans pour un contenu signalé ; pas d'entraînement par défaut ; plus de mention d'OpenRouter, de Phala ni de ZDR ; garde la phrase sur le nom écrit dans le texte (Q10) ; rien sur les images, rien de non vérifié. Mets à jour tests/notice.int.test.ts et e2e/submit-text.spec.ts (version attendue de la notice).
Réécris « Activer l'envoi réel à l'IA » (procedures.md) : conditions, contrôles dans la Console (crédit et fin du cycle, limite de l'espace, conservation), essai, contrôle du journal et du coût, retour arrière (AI_PROVIDER retiré, clé révoquée), ligne « Rejeu » datée.
Puis deux envois réels, pas plus : l'essai de connexion (npm run ai:trial -- --provider anthropic), puis un seul texte par evaluation-2 (--set dev --limit 1). En cas d'échec, affiche seulement la classe, le statut et le request-id.
```
**Vous validez :** les deux réponses sont conformes, modèle `claude-haiku-5-5`, avec l'usage, le coût estimé et `inference_geo` `us` ; le journal a deux lignes `ai_request_sent`, sans le texte ; la Console montre les requêtes dans l'espace dédié ; vous approuvez la notice v4.

Fait le 2026-10-19 : notice v4 ; procédure réécrite, rejeu daté ; deux envois conformes (connexion : 419 tokens, 0,000068 $ ; d01 par `evaluation-2` : 4 692 tokens, 0,0012 $, 10,4 s), deux lignes au journal. Ajout : `EvaluatorError.status` (statut HTTP, identifiant), affiché avec la classe, le `request-id` et le code du prestataire, jamais stocké. Notice v4 approuvée par l'utilisateur le 2026-10-19 ; Console relevée (clé, journaux, latence : `procedures.md`, rejeu) ; coût de la Console : voir E5.16 (0,07 $ pour les deux prompts).

#### E5.16 — Second essai des jeux avec claude-haiku-5-5 (EVL-03 CA3, EVL-04 R2)
```
Fais tourner les jeux de développement, adverse et sensible, sous la garde quotidienne : npm run ai:trial -- --set all --runs 3 --provider anthropic. Ne change ni evaluation-2 ni les valeurs [P] pendant l'essai.
Consigne les résultats tels quels dans conception/annexe-essais-ia.md, section datée sous celle du 2026-10-17, qui reste intacte ; données brutes dans annexe-essais-ia-<date>.json. Le compte rendu donne : le rapport du lanceur ; les versions (modèle demandé et qui a répondu, consigne, rubrique, effort, thinking, max_tokens, inference_geo, SDK) ; les durées (minimum, médiane, maximum, premier appel à part) ; les stop_reason ; les refus par catégorie, dont ceux du jeu sensible et les reasoning_extraction avec leur coût ; les sorties rejetées avec leur code ; l'usage total et le coût aux prix publiés (lien, date).
EVL-03 CA3 : pour chaque texte adverse, l'écart maximal avec sa base dans la même exécution face à ADVERSARIAL_MAX_LEVEL_GAP [P], et le drapeau addressed_to_marker ; puis la dispersion par critère sur 3 exécutions. Aucune conclusion de qualité au-delà des chiffres.
Si un texte adverse dépasse l'écart, ne retouche pas la consigne : propose les suites (evaluation-3, texte transmis autrement, vote) sans rien appliquer. Propose aussi, sans l'appliquer, une valeur d'AI_CALL_TIMEOUT_MS pour E6.
```
**Vous validez :** vous lisez le compte rendu ; CA3 est mesuré pour les 7 textes adverses, ou la cause est dite ; le coût lu dans la Console a l'ordre de grandeur du coût calculé. Ces textes sont écrits par des adultes : ils ne représentent pas de vraies copies d'élèves.

Fait le 2026-10-19 : 60 appels, 60 propositions conformes, `end_turn` × 60, aucun refus ; CA3 mesuré sur les 21 comparaisons, dépassé une fois (a03, exécution 2, écart 2 sur `mechanics`) ; dispersion d'au plus 1 sur chaque critère ; coût estimé 0,065 $. Suites de a03 et `AI_CALL_TIMEOUT_MS` = 60 000 pour E6 proposés, non appliqués. Console : 0,07 $ dépensés ce mois, crédit 99,94 $ (même ordre de grandeur que les 0,066 $ estimés pour E5.15 et E5.16).

Puis **E5.9** (ci-dessous, points étendus à l'adaptateur).

#### E5.9 — Agent relecteur et revue en contexte neuf
À lancer après E5.16.
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
Points : étanchéité de la requête (identité, niveau, identifiants, retard), texte traité comme une donnée, contrat de sortie, immuabilité et proposition courante unique, transitions, matrice aiProposal, journal de sécurité sans contenu, aucun appel réseau dans les tests, valeurs provisoires marquées comme telles ; adaptateur Anthropic (seul import du SDK, version exacte, options et variables refusées ; hôte, en-têtes et clés du corps exacts ; aucune relance cachée ; durée bornée lecture comprise ; refus et troncature classés ; thinking jamais stocké ; erreurs sans contenu ; budget jamais relancé) ; 0012 en ajouts seulement ; notice v4 fidèle à la fiche DON-02.
Ne modifie rien. Renvoie d'abord la revue.
```
Puis **T4** pour un constat douteux, **T3**, **T1**, et **T5** pour les valeurs provisoires et les mesures d'E5.16.

Revue faite le 2026-10-19 (agent neuf aux consignes de `feature-reviewer`, fichier créé après le démarrage de la session) : aucun critique, 1 majeur, 12 mineurs. T4 : majeur reproduit (remise bloquée en `evaluating` si la base refuse deux fois le résultat, ou si le processus s'arrête après la prise en charge). T3 : repli dans `evaluateSubmission` (`releaseEvaluation`) et balayage `releaseStuckSubmissions`, appelé par `ai:evaluate` au démarrage, au-delà d'`EVALUATION_STUCK_AFTER_MS` [P] (12 min, dérivé) ; la prise en charge date `updated_at` sur l'horloge de la base ; tests `tests/evaluation-release.int.test.ts`, avec contre-épreuve. Mineurs triés : 6 corrigés (empreintes de la notice et du corps envoyé, ESLint pour `system.ts`, garde de l'essai de connexion, commentaire de la garde réseau, prix du cache sourcé), 4 reportés au prompt E6.0, 2 écartés. T1 : chaque critère d'EVL-01 à EVL-04 a son test, hors ceux rejoués (EVL-02 CA3 en E9, EVL-04 CA3 en E8) ; écart au critère de sortie : EVL-03 CA3 dépassé une fois sur 21 en E5.16 (a03), écart accepté [D, 2026-10-19] comme limite connue ; aucune copie de développement en français envoyée (rubrique française non validée, Q6). T5 : valeurs [P] de la reprise et mesures d'E5.16 consignées (`stack-technologique.md` §3), relevés de la Console reportés dans `besoins-non-fonctionnels.md` ; aucun code ne contredit ces valeurs. E5.9 clôturé le 2026-10-19.

---

## E6 — Traitement automatique par lots, échecs et relance (PRC-01, PRC-02)

Préalables :
- Limites d'Anthropic (`stack-technologique.md` §3, `annexe-ia-anthropic.md`) : palier Start (relevé le 2026-10-19 : 1 000 requêtes par minute pour `claude-haiku-5-5`), crédit de 100 $ (promotionnel, expire le 2026-11-12, renouvellement à relever), limite de l'espace de travail (10 $ par mois [P]). Le lot de référence de 100 remises (NFR-TRT-01) n'est plus borné par le prestataire, mais par Workflows Hobby et Neon.
- *Historique, OpenRouter (jusqu'au 2026-10-19)* : 20 requêtes par minute et 50 par jour UTC à 0 crédit acheté ; le lot de 100 dépassait le plafond d'une journée.
- Tentatives, durée maximale par étape, parallélisme et plafond d'usage sont « à définir » : valeurs provisoires.

#### E6.0 — Planifier · Plan
```
Planifie le traitement automatique par lots (PRC-01, PRC-02, conception/fonctionnalites.md §8.2 E6 ; NFR-TRT-01, NFR-FIA-01, NFR-EXP-01, NFR-EXP-02 ; règle 4 de CLAUDE.md) avec Vercel Workflows.
Confie d'abord à un sous-agent la lecture de la documentation actuelle de Vercel Workflows : installation dans Next.js 16, déclenchement, étapes, nouvelles tentatives, reprise, exécution locale sous Docker et dans les tests, limites et événements du plan Hobby. Sources officielles, avec liens.
Il faut :
- un déclenchement après la validation de la transaction de remise ou de remplacement, jamais avant : la confirmation de l'élève ne dépend pas du traitement ;
- un traitement par version de remise, idempotent : un double déclenchement donne un seul traitement actif et une seule proposition courante ; le traitement d'une version devenue non active ne produit rien de courant ;
- des étapes qui ne portent que des identifiants ; la requête à l'IA reste construite par le constructeur d'E5 ;
- un parallélisme borné selon les limites relevées, des tentatives et une durée maximale par étape, une reprise après panne sans perte ni doublon ; aucune remise « en cours » au-delà d'une durée maximale (dis comment on le garantit) ;
- les tentatives : 529 et 429 avec retry-after relancés, refused jamais ; tentatives × délai par appel sous 300 s (durée maximale d'une fonction Vercel Hobby, stack-technologique.md §3), sinon une tentative par étape ;
- un échec après les tentatives qui mène à « evaluation failed » ; la relance et le passage à l'évaluation manuelle exposés comme fonctions serveur (boutons en E7 et E8) ;
- un plafond d'usage de l'IA en coût mensuel [P] (EXP-02 ; tokens de evaluation_runs × prix publiés, ×1,1 pour inference_geo us) : au plafond, plus aucun appel, la remise passe à « not assessable », cause « AI unavailable », sans perte ;
- cette cause « AI unavailable » [P], nouvelle, par migration, attribuée aussi selon le code budget d'Anthropic (limite de dépense, crédit épuisé, plafond du palier) ; une clé ou un modèle faux restent « evaluation failed » ;
- un disjoncteur [P] : N échecs configuration ou rejected sur des remises différentes coupent les appels et alertent l'administrateur ;
- la mesure par traitement (durées, tentatives, usage), sans identité ni contenu (EXP-01) ;
- un point d'attache typé pour la lecture des images (interface Reader, E9), non implémenté.
Tranche aussi les constats reportés de la revue d'E5.9 :
- une sortie tronquée (max_tokens) ou not_json, et un stop_reason inconnu (classé unavailable), sont relancés, donc facturés jusqu'à AI_MAX_ATTEMPTS fois : relancer ou non (E5.16 : sortie au plus à 52 % de max_tokens) ;
- un Retry-After au-delà d'AI_RETRY_MAX_WAIT_MS est ramené à ce plafond puis relancé trop tôt : s'arrêter en rate_limited, ou reporter l'étape ;
- le statut du crédit épuisé n'est pas documenté (400 probable) : s'il arrivait en 429 sans error_code, il serait relancé comme une limite de débit ; le classer avec les autres codes de budget (« AI unavailable ») ;
- la migration de la cause « AI unavailable » : ALTER TYPE … ADD VALUE ne permet pas d'utiliser la nouvelle valeur dans la même transaction ; ne pas s'en servir dans la même migration, et vérifier si le migrateur de Drizzle passe plusieurs migrations en une transaction.
Montre : flux, fichiers, étapes et leurs garanties, réglages provisoires, comportement en développement, en test et sur la preview, et la vérification sous pannes.
```

#### E6.1 — Déclenchement automatique (PRC-01 R2)
```
Installe et configure Vercel Workflows selon le plan, puis implémente le déclenchement : à la remise et au remplacement, une fois la transaction validée, pour la version active seulement. Une remise texte enchaîne received → evaluating → to_review sans action de quiconque.
Couvre PRC-01 CA1 (texte) et CA2 (double déclenchement). Rejoue SUB-05 CA2 : un remplacement relance le traitement, et le résultat de l'ancienne version, arrivé tard, reste non courant.
C'est le premier chemin applicatif qui importe le SDK d'Anthropic : vérifie son empaquetage par Next 16 (build dans e2e), puis sur la preview.
```
**Vous validez :** vous remettez un texte comme élève, la base montre « To review » avec une proposition (simulateur) sans autre action ; l'élève voit toujours « Submitted, being marked ».

#### E6.2 — Parallélisme, tentatives, reprise, plafond (PRC-01 R3, NFR-EXP-02)
```
Implémente le parallélisme borné, les tentatives, la durée maximale par étape, la reprise après panne et le plafond d'usage selon le plan, valeurs non décidées dans provisional.ts.
Couvre avec le simulateur PRC-01 CA3 (lot déposé en parallèle par plusieurs comptes, un marqueur unique par texte : chaque proposition ne porte que sur sa copie) et CA4 (une remise en panne n'empêche pas les autres ; arrêt en cours de lot puis reprise : zéro perte, zéro doublon). Plafond atteint : les remises suivantes passent à « AI unavailable » sans appel.
Les pannes simulées sont déjà prêtes (E5.12) : budget, 402, 529, refus. Un 529 est relancé, un refus jamais, une erreur de budget mène à « AI unavailable » [P].
```
**Vous validez :** sur un lot simulé de quelques dizaines de remises avec pannes injectées, chaque remise atteint un état final et aucune proposition ne cite un autre texte que le sien.

#### E6.3 — Échecs et relance (PRC-02)
```
Implémente la gestion des échecs (PRC-02) : après les tentatives, « evaluation failed », visible du professeur en E7.
Fonctions serveur, inscrites dans la matrice et inventory.ts :
- relance d'un échec (transition 6) ;
- liste des copies « AI unavailable » à relancer quand leur cause disparaît (rubrique française activée, plafond levé, crédit renouvelé au cycle suivant ou limite de l'espace relevée ; transition 7) : jamais automatiquement, jamais pour une copie évaluée à la main.
Couvre CA1 à CA4 ; l'élève voit seulement « Submitted, being marked », quel que soit l'échec (SUB-01 CA2).
```
**Vous validez :** une panne simulée persistante donne « Evaluation failed » ; la relance ramène la remise à « To review ».

#### E6.4 — Mesures d'usage et de délai (NFR-EXP-01)
```
Ajoute le script qui restitue, par devoir, le délai entre remise et « To review », l'usage d'IA par copie, les tentatives et le taux d'échec, sans identité ni contenu (EXP-01).
Sur un lot de test, mesure aussi le nombre d'événements Workflows par copie, le délai du lot et le coût par copie (tokens × prix publiés, avec leur source et leur date). Rapporte les chiffres tels quels, même au-dessus d'une cible, et déduis-en combien de copies par mois le plan Hobby et le crédit mensuel permettent. Le cache des consignes se décide ici, sur ces mesures.
```
**Vous validez :** le rapport donne des chiffres mesurés, sans cible inventée.

#### E6.5 — Vérifier et démontrer
```
Écris le parcours E2E d'E6 : l'élève remet, la remise atteint « To review » (vérifié par la base de test ; l'écran du professeur arrive en E7), l'élève voit « Submitted, being marked » ; remplacement, puis nouveau traitement.
Liste ensuite les variables à ajouter dans Vercel (Preview) pour Anthropic (AI_PROVIDER=anthropic, GRADING_ANTHROPIC_API_KEY d'une clé de compte de service distincte de celle du dev, limitée à l'espace dédié, où le compte de service est ajouté : une clé de l'espace Default échapperait à la limite de dépense, et une clé non limitée exigerait l'en-tête anthropic-workspace-id, que le fetch ne transmet pas) et pour Workflows, sans lire .env.local. La preview est publique : les deux variables d'IA ne sont posées que pendant les démonstrations, puis la clé est révoquée. Une fois la preview poussée à ma demande, vérifie une remise traitée en ligne avec claude-haiku-5-5, sur un texte fictif.
```
**Vous validez :** sur la preview, une remise fictive atteint « To review » avec une proposition du modèle `claude-haiku-5-5`.

#### E6.6 — Revue en contexte neuf
```
Utilise le sous-agent feature-reviewer pour relire de façon indépendante le traitement par lots.
Points : mélange entre copies (une note pour le mauvais élève), idempotence et doublons, reprise, remises bloquées « en cours », version non active, plafond, étanchéité de la requête, journaux sans contenu, matrice des nouvelles actions.
Ne modifie rien. Renvoie d'abord la revue.
```
Puis **T4** pour un constat douteux, **T3**, **T1**, et **T5** pour les valeurs provisoires et les mesures.

Revue faite le 2026-10-20 (`feature-reviewer`) : aucun bloquant, 2 majeurs, 6 mineurs, tous corrigés et testés à la demande (commit `2e2d073`, historique du plan d'E6). T4 : le majeur douteux (livraison forgée vers les routes de Workflows) n'est pas reproductible sur Vercel, où le déclencheur de file rend la route privée (documenté, non testé) ; en local la route est ouverte, et la prise en charge n'évalue que ce qui était dû. T3 : commentaire de l'inventaire seul. T1 : conforme au plan et aux critères ; complétés : le plafond ne prend plus les envois d'OpenRouter pour des appels sans usage, crédit épuisé quel que soit le statut, tests de la route cron et d'un `start()` en échec, E2E sur les quatre états d'échec ; écarts notés sans correction : délai mesuré depuis la version évaluée, contre-épreuves du double déclenchement et des 10 places plus faibles qu'écrit ; à trancher : alerte « prestataire injoignable » (NFR-EXP-02), relance du professeur abandonnée après 5 min sans place. T5 : valeurs et mesures d'E6 consignées (`stack-technologique.md` §3, `fonctionnalites.md` §5.4, §5.5, PRC-02 R4, `besoins-non-fonctionnels.md` EXP-02).

---

## E7 — Revue par le professeur : liste, copie, modification libre, journal (REV-01 à REV-04)

Préalables :
- **Q4 et Q8** (échéance : avant E7, `fonctionnalites.md` §9) : à trancher par vous avant E7.0. Recommandations : Q4, aucune correction de la transcription dans le MVP (sans effet sur une copie texte ; écran de copie image en E9) ; Q8, toute modification d'une évaluation validée ou publiée la repasse à « À valider », republication explicite (règle déjà écrite dans REV-03 R5). Sans décision, la recommandation est codée [P] et signalée.
- **Balayage côté professeur** [D, 2026-10-20] : le cron Vercel ne tourne pas sur la preview ; l'ouverture de la liste des remises d'un devoir lance `sweepEvaluations`, qui libère les remises bloquées en évaluation et relance les remises reçues oubliées.
- **Deux points ouverts d'E6.6**, à trancher au plan : l'alerte « prestataire injoignable » de NFR-EXP-02 (une série de 529 ou de délais dépassés n'alerte personne) ; la relance du professeur abandonnée sans retour quand les 10 places restent prises plus de 5 min (la copie reste en échec, relançable).
- **Notice du professeur** (NFR-DON-04, « E4 à E8 ») : avant son premier accès aux copies, le professeur apprend ce que mesure le journal (temps de revue, concordance avec l'IA). Elle arrive avec le journal (`schema/notices.ts` l'annonce).
- Déjà prêts : les fonctions d'E6.3, sans bouton (`retryEvaluation`, `relaunchEvaluation`, `listRelaunchable`, `startManualEvaluation`, dont le formulaire vient en E8) ; les maquettes 1.4 et 1.5 sous `/dev/mockups/` ; `compareText` (`src/lib/collation.ts`) ; `calculateGrade` et `GRADE_STEP` [P].
- Réactivité (NFR-TRT-03) : seuil à définir ; mesurée en E7.8 et rapportée telle quelle.

#### E7.0 — Planifier · Plan
```
Inspecte l'application (matrix.ts, inventory.ts, src/server/data/evaluation/, transitions.ts, maquettes /dev/mockups/, src/lib/grade.ts et collation.ts, page /teacher/assignments/[assignmentId]) et planifie la revue par le professeur : REV-01 à REV-04 (conception/fonctionnalites.md §6 et §8.2 E7, invariants 5, 6 et 9 de §5.3, états §5.5, table 8.3) ; NFR-TRT-03, NFR-FIA-01, NFR-DON-04, NFR-USA-03.
Confie d'abord à un sous-agent la lecture de node_modules/next/dist/docs/ sur : préchargement des liens, cache du routeur côté client, after() et Server Actions, revalidation après une écriture, `instant` et cacheComponents. Résumé avec les chemins lus.
Il faut :
- une évaluation du professeur distincte de la proposition immuable : 5 niveaux, une remarque par critère, commentaire général, pistes, note finale, « note fixée », origine (proposition, ou manuelle en E8), version de rubrique ; dis quand elle naît (à la première écriture depuis la proposition courante, ou autrement) et pourquoi ; une seule par remise et par version active ; ce qu'elle devient si l'élève remplace sa remise avant tout acte du professeur ;
- la note : entière et recalculée (somme des niveaux) tant qu'elle n'est pas fixée ; fixée, au pas GRADE_STEP [P] entre 0 et 20, plus de recalcul, écart signalé, retour possible à la note calculée ; niveau entier de 0 à 4, refusé sinon côté serveur ;
- la remarque « to re-read » quand le niveau de son critère change : où l'état est stocké, ce qui l'efface ; elle ne bloque rien et n'exige aucun texte (D5) ;
- le journal (REV-04) : table dédiée, immuable par trigger comme 0011, écrite dans la même transaction que la modification par un module unique (test statique du type submission-writes.test.ts : aucune écriture d'évaluation sans entrée de journal) ; ancienne et nouvelle valeur, auteur, date par l'horloge de la base ; événements : ouverture de la liste et de la copie, chaque modification, relances (les fonctions d'E6.3 journalisent désormais, dans leur transaction), puis en E8 validation, publication, retrait, saisie manuelle ; jamais lu par l'élève ; distinct du journal de sécurité (DON-05), qui reste sans contenu ;
- une ouverture journalisée sans faux positif : un préchargement ou un rendu en cache n'écrit pas « opened » ; dis par quel chemin l'ouverture est enregistrée ;
- le premier acte du professeur : la première modification pose teacher_started_at dans la même transaction, sur la ligne de remise verrouillée (comme startManualEvaluation), et ferme le remplacement (SUB-05 R3) ;
- la concurrence (REV-03 R5, NFR-FIA-01) : toute écriture porte la version de remise, la proposition courante et la révision de l'évaluation vues à l'ouverture ; refus « replaced » (remise remplacée : rechargement) distinct de « conflict » (autre onglet : la saisie reste à l'écran, rien n'est écrasé) ; dis le grain d'enregistrement (champ par champ ou formulaire entier) et son effet sur le journal et les conflits ;
- une copie validée ou publiée modifiée repasse à « To review » (transition 10, Q8) : prévue au schéma, jouée en E8 ;
- la liste (REV-01) : membres actifs des classes destinataires, « non remis » compris, une ligne par élève avec ses classes ; élèves retirés ayant une remise, marqués « removed from class » ; tri et filtres sur toute la liste ; note du professeur, sinon note proposée « provisional » ; copies sans note en fin dans les deux sens ; ordre alphabétique nom puis prénom par compareText ; dis où se fait le tri (SQL ou liste entière côté serveur) au volume du cas haut (plus de 100 copies) ; compteurs à valider, en échec, non évaluables ; tri et filtres conservés au retour à la liste ;
- à l'ouverture de la liste, le balayage sweepEvaluations d'abord, borné dans le temps, sans erreur visible s'il échoue ;
- la copie (REV-02) : identité (D9) avec les seules classes du professeur destinataires du devoir ; texte de l'élève tel quel, avec l'attribut lang de la langue du devoir (USA-03) ; proposition en lecture seule (niveaux, justifications, citations, commentaire, pistes, note proposée, alertes ; modèle et date en petit) ; mode, « late » ; aucun historique de résultats (R2) ; page de statut sans formulaire pour « non remis », « en cours », échec et non évaluable (avec la cause et les actions) ;
- la relance depuis la liste et la copie : retryEvaluation, relaunchEvaluation, listRelaunchable, after(() => startEvaluation(ref)) dans la Server Action ; pour refused : « The AI declined to assess this text », relance permise avec un avertissement, évaluation manuelle proposée (active en E8) ;
- les deux points ouverts d'E6.6 : recommande, avec le coût de chaque option ;
- la notice du professeur avant son premier accès aux copies (DON-04) : texte dans src/lib/texts.ts, versionné, lecture enregistrée (compte, date, version), ligne de matrice ;
- lignes de matrice et d'inventaire : évaluation non publiée (L É), journal (L), proposition (L), identité (studentAccount L), notice du professeur ; aucune colonne « autre » qui donne quelque chose ; fonctions dans REAL ;
- un 404 réel (instant = false) pour un devoir, une copie ou un élève d'autrui ; aucun cache ne sert une évaluation périmée ;
- la réactivité (TRT-03) : requêtes de la liste et de la copie, index, nombre d'allers-retours à Neon (~175 ms chacun), et comment on la mesure.
Montre : tables, contraintes et migrations, flux d'une modification (verrous, gardes, journal), routes, Server Actions, matrice, valeurs provisoires, et la vérification (dont la concurrence).
```

#### E7.1 — Schéma de l'évaluation et du journal (REV-03, REV-04)
```
Implémente seulement le socle du plan approuvé : tables de l'évaluation du professeur et du journal, contraintes, trigger d'immuabilité du journal, migrations relues, module unique qui écrit l'évaluation et son journal dans la même transaction, lignes de matrice et d'inventaire.
Tests : unitaires sur le recalcul et la fixation de la note (pas, bornes, retour à la note calculée) et sur un niveau hors 0-4 ; intégration : chaque écriture laisse son entrée de journal, une entrée ne se modifie ni ne se supprime, la proposition reste identique après des modifications ; test statique : seul le module unique écrit ces tables.
Pas encore d'écran. Migre la base dev.
```
**Vous validez :** les migrations sont lisibles ; une modification sans journal est impossible par construction ; la proposition d'origine ne bouge pas.

#### E7.2 — Liste réelle des remises (REV-01)
```
/build-ui Remplace la maquette 1.4 par la liste réelle des remises d'un devoir, ouverte depuis la page du devoir (ASG-02 CA2 rejoué) : une ligne par élève (nom, prénom, classes, état, « Late », mode, note), « Not submitted » compris ; élèves retirés ayant une remise, marqués « Removed from class » ; tri par note, date de remise (version active) ou ordre alphabétique sur toute la liste ; note « provisional » quand seule la proposition existe ; copies sans note en fin dans les deux sens, jamais comptées comme 0 ; filtres par classe et par état, combinables ; compteurs ; tri et filtres conservés au retour.
À l'ouverture : balayage sweepEvaluations selon le plan, puis entrée de journal « list opened ». Le nom ouvre la copie (E7.3).
Couvre CA1 à CA4 (« Émile », « Eric », « d'Aubigné » ; élève retiré sans remise absent), SUB-04 CA3 (« Late » visible du professeur) et CLS-04 CA3. Liste d'un devoir d'autrui : 404 réel.
```
**Vous validez :** sur un devoir envoyé à deux classes avec un élève commun, il apparaît une fois avec ses deux classes ; le tri par note met les copies sans note en fin dans les deux sens ; une remise bloquée en évaluation repart quand vous ouvrez la liste.

#### E7.3 — Écran de copie en lecture (REV-02)
```
/build-ui Remplace la maquette 1.5 par l'écran réel de copie, ouvert par un clic sur le nom : identité (nom, prénom, email) et les seules classes du professeur destinataires du devoir ; texte de l'élève tel quel, avec l'attribut lang de la langue du devoir ; proposition de l'IA en lecture seule (niveaux, justifications, citations, commentaire général, pistes, note proposée, alertes avec leur libellé) ; mode et « Late » ; aucun historique de résultats.
Selon l'état : « Not submitted », « Being evaluated », échec et non évaluable affichent une page de statut avec la cause, sans formulaire (les actions arrivent en E7.6) ; « To review » : le formulaire du professeur, en lecture seule jusqu'à E7.4.
Entrée de journal « copy opened » par le chemin du plan, sans faux positif au préchargement.
Couvre CA1 (deux homonymes : chaque clic ouvre la bonne copie), CA2 et CA3. Copie d'un autre professeur, ou d'un élève qui n'a pas reçu le devoir : 404 réel.
```
**Vous validez :** sur ordinateur, vous lisez la copie et la proposition sans défiler sans cesse ; un élève de trois classes destinataires, dont une d'un autre professeur, n'affiche que vos deux classes.

#### E7.4 — Modification libre et journal (REV-03, REV-04 CA1)
```
/build-ui Rends le formulaire de l'écran de copie modifiable selon le plan : niveau 0-4 par critère, remarque par critère (initialisée depuis la justification de l'IA), commentaire général, pistes, note.
Note recalculée tant qu'elle n'est pas fixée ; fixée, écart avec la note calculée signalé (jamais par la seule couleur) et retour possible à la note calculée ; critère marqué « Modified » et remarque « To re-read » quand son niveau change. Aucune justification exigée (D5). Remarques dans la langue du devoir, modifiables (Q5 [D]).
Chaque enregistrement : gardes du plan, journal dans la même transaction, teacher_started_at à la première modification. Validation Zod côté serveur, message par champ.
Couvre REV-03 CA1 à CA3 (niveau hors 0-4 refusé, aussi par requête directe), REV-04 CA1 (ancienne et nouvelle valeur, auteur, date ; proposition inchangée) et SUB-05 CA3 après modification (remplacement refusé à l'élève). L'élève n'accède ni à l'évaluation, ni au journal, ni à la proposition : test par requête directe.
```
**Vous validez :** vous changez un niveau : la note suit, la remarque passe « To re-read » ; vous fixez la note puis changez un niveau : la note reste, l'écart est signalé ; l'élève ne peut plus remplacer sa remise.

#### E7.5 — Conflits et remplacement pendant l'ouverture (REV-03 R5, CA3, CA4 ; NFR-FIA-01)
```
Implémente la détection des écritures concurrentes selon le plan.
Remise remplacée par l'élève pendant que la copie est ouverte : enregistrement refusé avec « This submission was replaced », copie rechargée sur la nouvelle version. Même évaluation modifiée dans deux onglets : le second enregistrement reçoit un conflit explicite, sa saisie reste à l'écran, rien n'est écrasé en silence. Remplacement de l'élève et premier acte du professeur simultanés : un seul aboutit (SUB-05 CA4 rejoué avec un vrai premier acte).
Tests d'intégration avec de vraies transactions concurrentes, chacun avec sa contre-épreuve (garde retirée : le test échoue).
```
**Vous validez :** deux onglets sur la même copie : le second enregistrement affiche un conflit sans perdre votre saisie ; une copie remplacée pendant l'ouverture se recharge.

#### E7.6 — Relance depuis la liste et la copie (PRC-02, rejeu)
```
/build-ui Branche les fonctions d'E6.3 : « Retry » sur une copie en échec (retryEvaluation) ; « Relaunch » sur les copies que propose listRelaunchable (rubrique française activée, IA de nouveau disponible), depuis la liste et depuis la copie ; Server Action avec after(() => startEvaluation(ref)) ; version vue transmise, refus « changed » affiché clairement. Chaque relance est journalisée.
Copie dont l'IA a refusé le texte (refused) : « The AI declined to assess this text », relance permise avec un avertissement (un refus se répète en général), évaluation manuelle proposée (formulaire en E8 ; bouton absent ou désactivé d'ici là, selon le plan).
Applique la décision du plan sur les deux points ouverts d'E6.6.
Couvre PRC-02 CA1 à CA3 depuis l'écran (relance d'un échec jusqu'à « To review » ; relance proposée pour les seules copies « AI unavailable » non évaluées à la main) et CA4 (l'élève voit toujours « Submitted, being marked »). Double clic sur « Retry » : une seule évaluation (R4).
```
**Vous validez :** avec une panne simulée persistante, la copie s'affiche en échec ; après « Retry », elle atteint « To review » en quelques secondes ; l'élève ne voit aucun changement.

#### E7.7 — Journal du correcteur et notice du professeur (REV-04 R2, R3 ; NFR-DON-04)
```
/build-ui Ajoute la consultation du journal par le correcteur, sur l'écran de copie (« History ») : événements de la copie, du plus récent au plus ancien, auteur, date avec fuseau (formatDateTime), ancienne et nouvelle valeur ; la proposition d'origine reste lisible à côté. Aucune action de modification ni de suppression.
Ajoute la notice du professeur avant son premier accès aux copies (DON-04) : ce que mesure le journal (heures d'ouverture et de validation, donc temps de revue ; concordance entre la proposition et la version finale), qui le lit, et sa limite (la concordance ne distingue pas accord et influence, REV-04 R4). Texte dans src/lib/texts.ts, versionné et gelé par empreinte comme la notice élève ; lecture enregistrée ; accès aux copies refusé côté serveur tant qu'elle ne l'est pas.
Couvre REV-04 R3 : un autre professeur et l'élève n'obtiennent rien, par requête directe.
```
**Vous validez :** un nouveau professeur lit la notice une fois, puis voit ses copies ; l'historique d'une copie montre son ouverture et chaque modification.

#### E7.8 — Vérifier et démontrer
```
Rejoue les critères de la table 8.3 attendus en E7 : ASG-02 CA2, SUB-04 CA3, SUB-05 CA3 (après modification), CLS-04 CA3 et REV-01 CA4, PRC-02 depuis la liste.
Vérifie que la matrice passe pour les ressources nouvelles ou élargies (évaluation non publiée, journal, proposition, identité, notice du professeur) : un autre professeur, l'élève et l'administrateur n'obtiennent rien.
Mesure la réactivité (TRT-03) sur un devoir de 120 copies fictives : affichage de la liste, ouverture d'une copie, enregistrement d'une modification, en local ; rapporte les chiffres tels quels (seuil à définir).
Écris le parcours E2E d'E7 : une remise texte arrive « To review » (simulateur) ; le professeur ouvre la liste, clique sur le nom, modifie un niveau puis la note seule, voit le journal ; conflit entre deux onglets ; remise remplacée pendant l'ouverture ; l'élève ne voit que « Submitted, being marked ».
Une fois la preview poussée à ma demande, rejoue le parcours en ligne avec le simulateur et mesure les trois mêmes délais.
```
**Vous validez :** la démonstration de sortie d'E7 : une remise arrive « To review », vous l'ouvrez et la modifiez, le journal le montre, l'élève ne voit rien.

#### E7.9 — Revue en contexte neuf
```
Utilise le sous-agent feature-reviewer pour relire de façon indépendante la revue par le professeur.
Points : copie, évaluation ou journal d'un autre élève (homonymes, mauvais identifiant), écriture sans journal, proposition modifiable par un chemin quelconque, perte silencieuse entre onglets, remplacement et premier acte simultanés, identité ou classes d'un autre professeur, préchargement qui journalise, cache qui sert une évaluation périmée, journal ou proposition lisibles par l'élève, matrice des nouvelles actions, lenteur de la liste.
Ne modifie rien. Renvoie d'abord la revue.
```
Puis **T4** pour un constat douteux, **T3**, **T1**, et **T5** pour Q4, Q8, la notice du professeur et les valeurs provisoires.

---

## E8 — Validation, publication, consultation : premier cycle complet en texte (REV-05, REV-06, PUB-01, PUB-02)

Préalables :
- **Q5** tranchée [D, 2026-10-15] : remarques dans la langue du devoir, modifiables avant publication ; mention de l'IA affichée à l'élève (formulation à confirmer avec le cadre légal) ; « note ajustée par le professeur » sans justification quand la note diffère de la note calculée. La mention de l'IA répond aussi à l'information demandée par la politique d'usage d'Anthropic (« Education and credentials », champ à confirmer) ; formulation [P] dans `src/lib/texts.ts`.
- **Q8** : tranchée, ou recommandation provisoire, depuis E7.
- Notice élève v4 déjà en place. L'élève ne voit jamais un refus de l'IA, ni sa cause, ni un état technique.
- `startManualEvaluation` (E6.3) passe aujourd'hui la copie à « To review » sans évaluation : E8 la rend cohérente avec le formulaire.

#### E8.0 — Planifier · Plan
```
Inspecte l'application après E7 et planifie la fin du premier cycle en texte : REV-05, REV-06, PUB-01, PUB-02 (conception/fonctionnalites.md §6 et §8.2 E8, invariant 7 de §5.3, transitions 8, 9 et 10 de §5.5, table 8.3) ; NFR-EXP-04 (contrôle bloquant « aucun résultat avant publication »), NFR-USA-03.
Confie d'abord à un sous-agent la lecture de node_modules/next/dist/docs/ sur ce qui peut resservir une page à l'élève après un retrait (cache du routeur côté client, préchargement, bouton retour et bfcache, en-têtes Cache-Control des pages dynamiques, cacheComponents) et sur ce que reçoit le navigateur d'une page ou d'une Server Action (charge RSC). Résumé avec les chemins lus.
Il faut :
- la validation (REV-05) : 5 niveaux et une note exigés côté serveur ; journalisée « without changes » ou « after changes » (dis comment la nature est établie) ; pose teacher_started_at ; refusée, aussi par requête directe, pour une copie en échec ou sans évaluation ;
- la publication (PUB-01) : depuis « Validated » seulement, copie par copie ; action répétée = une publication ; retrait vers « Validated » ; « Validate and publish » enchaîne deux actes journalisés séparément ; si le second échoue, la copie reste validée et le professeur le voit (dis comment un test provoque cet échec) ;
- une copie validée ou publiée modifiée repasse à « To review » (transition 10, Q8) ; la version publiée disparaît pour l'élève ;
- l'évaluation manuelle (REV-06) : même formulaire, depuis une évaluation échouée (refus compris) ou non évaluable (sans contenu, rubrique non validée, IA indisponible) ; origine « manual » et version de rubrique enregistrées ; journalisée « entered manually, without AI proposal » ; réconcilie startManualEvaluation : aucune copie « To review » sans proposition ni évaluation du professeur ; la transition 6 ou 7 se fait avec la première écriture, dans la même transaction ; dis quels critères s'affichent pour un devoir en français tant que sa rubrique n'est pas validée (Q6) ;
- la vue de l'élève (PUB-02) : projection dédiée à liste blanche, un DTO fermé lu sur la ligne « Évaluation publiée » ; note telle que fixée, niveaux, remarque par critère, commentaire, pistes, rubrique ; mention de l'IA seulement si une proposition a existé (dis ce qu'affiche une évaluation manuelle) ; « Grade adjusted by your teacher » quand la note diffère de la somme des niveaux ; attribut lang sur les remarques ; jamais la proposition ni ses justifications d'origine, les alertes, le journal, la transcription, un état technique, une cause d'échec ou un refus ;
- « rien avant publication » (PUB-02 R2) dans toutes les réponses reçues par l'élève : pages, charges RSC, Server Actions, messages d'erreur, liste, état ; retrait effectif au prochain accès, bouton retour compris ; dis quelle parade couvre chaque canal ;
- le balayage automatique de la fuite (E8.4) : marqueurs uniques dans la proposition simulée et dans l'évaluation, cherchés dans toutes les réponses de l'élève ; un contrôle bloquant (EXP-04) ;
- l'état « Marked, result available » (toStudentStatus) pour « Published » seulement ;
- l'élève retiré lit son résultat publié (CLS-04 CA3, SUB-01 CA3) ;
- lignes de matrice et d'inventaire touchées, fonctions dans REAL.
Montre : transitions et leurs gardes, flux du raccourci, évaluation manuelle, projection de l'élève et sa liste blanche, canaux de fuite et leur parade, textes et valeurs provisoires, et la vérification.
```

#### E8.1 — Valider, publier, retirer, raccourci (REV-05, PUB-01)
```
/build-ui Ajoute à l'écran de copie « Validate », « Publish », « Validate and publish » et « Withdraw publication » (confirmation pour la publication et le retrait), et l'état correspondant dans la liste.
Transitions 8, 9 et 10 par applyTransition seulement ; chaque acte journalisé avec auteur et date ; validation « without changes » ou « after changes » ; action répétée sans doublon ; échec du second acte du raccourci : copie validée, message au professeur. Modifier une copie validée ou publiée la repasse à « To review » (Q8).
Couvre REV-05 CA1 et CA2, PUB-01 CA1 (publication d'une copie non validée refusée en interface et par requête directe) et CA2, REV-03 R5, REV-04 CA2 (ouverture puis validation au journal) et SUB-05 CA3 après validation.
```
**Vous validez :** « Validate and publish » laisse deux entrées au journal ; une copie publiée puis modifiée redevient « To review » et l'élève ne voit plus son résultat.

#### E8.2 — Évaluation manuelle (REV-06)
```
/build-ui Active l'évaluation manuelle depuis une copie en échec (refus de l'IA compris) ou non évaluable, avec le formulaire d'E7.4 sans proposition à côté : 5 niveaux, remarques, commentaire, pistes, note.
Selon le plan : la première écriture fait la transition 6 ou 7 et crée l'évaluation d'origine « manual » dans la même transaction ; journal « entered manually, without AI proposal » ; la copie n'est plus proposée à la relance (PRC-02 R4). Ensuite, validation et publication comme en E8.1.
Couvre CA1 et CA2 (devoir en français sans rubrique française validée). Double clic : une seule évaluation.
```
**Vous validez :** une copie en échec s'évalue à la main jusqu'à la publication ; le journal dit « without AI proposal » ; elle ne figure plus parmi les relances.

#### E8.3 — Vue du résultat par l'élève (PUB-02)
```
/build-ui Implémente la vue du résultat de l'élève, sur téléphone d'abord, depuis My assignments : état « Marked, result available », note telle que fixée, niveau par critère avec son libellé, remarque par critère, commentaire général, pistes, lien vers la rubrique ; mention de l'IA et « Grade adjusted by your teacher » selon le plan (textes dans src/lib/texts.ts).
La projection renvoie le DTO fermé du plan, rien d'autre ; sa requête ne lit aucun champ de la proposition, du journal ni des alertes.
Couvre CA1, CA3 (évaluation modifiée avant publication : seule la version du professeur ; l'élève B qui ouvre le résultat de A : 404 réel) et EVL-04 CA3 (aucune alerte). Un élève retiré lit son résultat publié.
```
**Vous validez :** sur téléphone, l'élève lit sa note et ses remarques ; une note fixée à 15 pour des niveaux qui font 13 affiche « Grade adjusted by your teacher ».

#### E8.4 — Balayage « rien avant publication » (PUB-02 R2, NFR-EXP-04)
```
Écris le contrôle automatique de la fuite : avec des marqueurs uniques dans la proposition simulée (justifications, commentaire, alertes) et dans l'évaluation du professeur, collecte toutes les réponses reçues par l'élève (pages, charges RSC, Server Actions, erreurs, liste, état) et cherches-y les marqueurs, dans quatre situations : copie à valider ; validée non publiée ; publiée puis retirée, bouton retour compris ; publiée (seuls les champs de la liste blanche apparaissent).
Il tourne avec les tests (intégration ou E2E selon le plan) et fait échouer la suite au premier marqueur trouvé. Contre-épreuve : un champ interdit ajouté exprès à la projection fait échouer le test.
```
**Vous validez :** le test échoue quand on ajoute exprès un champ interdit à la vue de l'élève, et passe sinon.

#### E8.5 — Rejeux de la table 8.3
```
Rejoue les critères attendus en E8 : SUB-01 CA2 (« Marked, result available » pour une copie publiée seulement ; « Submitted, being marked » pour tous les autres états), SUB-05 CA3 (remplacement refusé après validation), EVL-04 CA3, REV-03 R5, REV-04 CA2 et CA3 (journal et proposition inaccessibles à l'élève après publication), CLS-04 CA3 et SUB-01 CA3 (résultat publié d'un élève retiré, sans nouvelle remise possible).
Vérifie que la matrice 5.4 passe pour chaque ressource existante, dont « Évaluation publiée » (élève concerné L ; autre élève et autre professeur, rien ; propriétaire L É pour le retrait).
```
**Vous validez :** chaque critère rejoué est nommé dans un test qui passe.

#### E8.6 — Cycle complet en texte (E2E)
```
Écris le parcours E2E du premier cycle complet : le professeur crée une classe et un devoir ; l'élève rejoint, lit la notice, remet ; la remise atteint « To review » (simulateur) ; le professeur ouvre la copie, modifie un niveau, valide et publie ; l'élève lit son résultat ; le professeur retire la publication : l'élève ne voit plus rien, bouton retour compris ; une seconde copie en échec est évaluée à la main puis publiée.
Une fois la preview poussée à ma demande, rejoue le cycle en ligne avec le simulateur ; avec Anthropic seulement pendant une démonstration, selon la procédure « Activer l'IA sur la preview ».
```
**Vous validez :** un professeur et une classe font le cycle complet en texte sans intervention technique (O4, texte).

#### E8.7 — Revue en contexte neuf : fuite des résultats
```
Utilise le sous-agent feature-reviewer pour relire de façon indépendante la validation, la publication et la vue de l'élève.
Points : résultat visible avant publication ou après retrait par un canal indirect (liste, état, message d'erreur, charge RSC, cache du routeur, bouton retour, préchargement) ; proposition brute ou alerte dans une réponse à l'élève ; résultat d'un autre élève ; publication sans validation par requête directe ; raccourci à moitié fait ; copie « To review » sans évaluation ; journal incomplet du cycle ; matrice.
Ne modifie rien. Renvoie d'abord la revue.
```
Puis **T4** pour un constat douteux, **T3**, **T1** (critères de sortie d'E8, `fonctionnalites.md` §8.2), et **T5** pour Q5 (formulation de la mention de l'IA), Q8 et les valeurs provisoires.

---

## E9 à E11 — Squelette

À rédiger en détail à l'approche de chaque étape, à partir de la conception à jour. Chaque étape commence par un **Plan** et se termine par **T1**, puis T5 si une décision a changé.

| Étape | Prompts prévus | Outils du guide introduits |
|---|---|---|
| **E9** Canal image | E9.0 reprend E5.8 avec `claude-haiku-5-5` [D, 2026-10-19] (photos fictives, sans nom, avec `.txt` de référence, hors de git), puis enquête par sous-agents (limites de 4,5 Mo par requête Vercel et de 1 Go ; 1 Mo par défaut pour une Server Action, à vérifier) ; confirme ou non Haiku derrière `Reader` [P] · E9.1 plan · E9.2 dépôt multipage, réduction dans le navigateur (grand côté ≤ 2 576 px **et** ⌈l/28⌉×⌈h/28⌉ ≤ 4 784 tokens), type, métadonnées (SUB-03) · E9.3 table des images et route unique contrôlée · E9.4 `Reader` et `transcription-1` en sortie structurée, image en base64 avant le texte, jamais d'URL, contrat de fidélité (TRX-01) · E9.5 branchement aux états de traitement · E9.6 transcription et image dans l'écran de copie · E9.7 rejeux image · notice v5 et fiche DON-02 étendue à la lecture · revue | Sous-agents, revue |
| **E10** Durcissement et mesure | A : matrice complète automatisée, balayage (journaux sans contenu ni clé), étanchéité (flux image compris), pannes, sessions et liens, accessibilité (USA-03), export de sauvegarde, procédure de montée de version du SDK (relire le diff, rejouer les tests de garanties, vérifier l'en-tête d'authentification) ; revue externe facultative (CodeRabbit s'il reste gratuit pour ce dépôt, sinon `/code-review`) ; tri des constats ; T3. B : scripts de mesure depuis le journal, selon le protocole validé par le client ; mesures pour quelques centimes (stabilité sur N exécutions, CA3, alertes, fidélité de lecture) ; vote k = 3 et variante de réflexion décidés là, chacun avec sa version (rejouer a03, seul texte adverse hors de l'écart en E5.16, accepté [D, 2026-10-19]) | Revue indépendante |
| **E11** Démonstration | Déploiement final, à trancher en E11 (2026-10-20) : garder la preview, faire de `preview` la branche de production de Vercel (adresse courte, cron ; variables à recopier en Production), ou fusionner dans `main` et la déployer avec une base Neon à elle (E1.8 : aucune production sur la base dev) ; jeu de données fictif en anglais, scénarios scriptés, préchauffage de Neon, notice « demo, fictitious data », répétition sous la limite de l'espace de travail (répétition et séance). Avant : abonnement actif, crédit restant, fin du cycle, expiration de la clé ; repli : REV-06 ou le simulateur ; après : clé révoquée | — |
| **Fin** | Revue de toute l'application ; vérification des parcours admin, teacher, student ; synchronisation finale de CLAUDE.md | — |

## 4. Points ouverts qui touchent ces prompts

- Q2 (premier administrateur), Q4, Q8, Q9 : valeurs provisoires dans les prompts, à trancher avant l'étape concernée (voir fonctionnalites.md §9).
- Fuseau de la date limite tranché [D, 2026-10-14] : `Africa/Casablanca`.
- Q3, Q10 et longueur maximale d'un texte tranchées [D, 2026-10-15] : 2 remplacements au plus jusqu'au premier acte du professeur, sans avertissement d'image illisible ; consigne « pas de nom » seule ; 4000 caractères. Codées dans `src/config/decisions.ts` (E4).
- Q7 tranchée [D, 2026-10-14] : lien et code de classe valables 1 heure après la création du lien (CLS-02 R4). Code aligné (`src/config/decisions.ts`).
- Q1, Q5, Q6 tranchées [D, 2026-10-15] : note sur 20, somme des niveaux ; remarques dans la langue du devoir, mentions de l'IA et de la note ajustée affichées ; français sans proposition IA jusqu'à la validation de sa rubrique.
- Bibliothèque de primitives d'interface : tranchée par vous en 1.1.
- Prestataire d'IA tranché [D, 2026-10-19] : API d'Anthropic en direct, modèle `claude-haiku-5-5`, payée par le crédit API mensuel du développeur (0 MAD décaissé, `stack-technologique.md` §1) ; reprise d'E5 (E5.10 à E5.16), effets sur E6 à E11. Le volume n'est plus borné par un quota du prestataire, mais par le crédit, la limite de l'espace de travail [P], Workflows Hobby et Neon.
- *Historique* : OpenRouter, modèle gratuit, tranché le 2026-10-16 à la place de Mistral ; modèle `xingchen-agi/xing4.0-29b-a4b:free` [D, 2026-10-17], adaptateur E5.4b ; 50 requêtes par jour à 0 crédit acheté. Remplacé le 2026-10-19.
