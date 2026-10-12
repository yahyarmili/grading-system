# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## État du dépôt

Aucun code pour l'instant : le dépôt ne contient que des documents de conception en français, dans `conception/`. Il n'y a ni build, ni lint, ni tests, ni commande à lancer, et ce n'est pas un dépôt git. La technologie est choisie (étape 7, `conception/stack-technologique.md`) : TypeScript, Next.js, Tailwind CSS, GSAP, PostgreSQL avec Drizzle, Vercel, Neon, Mistral. L'implémentation se fait en suivant `conception/prompts-implementation.md` (étape 8), prompt par prompt, lancés par l'utilisateur.

Produit visé : une application web de notation (grading) de productions écrites en anglais et en français, où une IA propose une évaluation selon une rubrique unique et fixe, que le professeur valide ou modifie.

## Démarche par étapes

Le projet suit 8 étapes, traitées une par une avec l'utilisateur : 1 problématique, 2 solution, 3 objectif et périmètre, 4 fonctionnalités, 5 besoins non fonctionnels, 6 acteurs (administrateur, professeur, élève), 7 stack technologique, 8 prompts progressifs d'implémentation. Chaque étape produit un fichier dans `conception/`. Le statut (validé ou brouillon) est dans l'en-tête de chaque fichier.

| Fichier | Contenu |
|---|---|
| `problematique.md` | Étape 1, validée. Problèmes P1 temps, P2 fiabilité, P3 validité, avec les faits de recherche sourcés. |
| `solution.md` | Étape 2, validée. Principes de la solution ; la rubrique de référence est en annexe. |
| `fonctionnalites.md` | Étapes 3 et 4, brouillon : décisions D1 à D10, 32 fonctionnalités (ids `AUTH-01`, `REV-03`...), états, plan en étapes E1 à E11, questions Q1 à Q10. |
| `besoins-non-fonctionnels.md` | Étape 5, validée (4 questions encore ouvertes) : 22 exigences `NFR-DON-01`, `NFR-SEC-01`..., questions `QNF-n`. Document de référence, volontairement court. Cadre démonstration depuis le 2026-10-12 : le statut de chaque exigence en démonstration est en §2.8. |
| `acteurs.md` | Étape 6, validée : les trois acteurs (administrateur, professeur, élève), droits, parcours, fonctionnalités par acteur, décisions `A1` à `A3`. |
| `stack-technologique.md` | Étape 7, validée : pile à 0 MAD (Next.js, PostgreSQL et Drizzle, Vercel, Neon, Mistral, images dans la base), limites vérifiées (4,5 Mo par requête, 1 Go de base, quotas Mistral inconnus), règles d'architecture, sous-choix non tranchés. |
| `prompts-implementation.md` | Étape 8, brouillon (structure validée le 2026-10-12) : prompts transverses T1 à T5, phases 0 à 2, E1 et E2 détaillées, E3 à E11 en squelette à rédiger à l'approche de chaque étape. |
| `annexe-analyse-detaillee.md` | Ancien brouillon fonctionnel (73 fonctionnalités), **non validé et dépassé** par `fonctionnalites.md`. Pas une spécification. |
| `annexe-nfr-detaille.md` | Mêmes 22 exigences avec trace, valeurs de travail et vérification. Antérieure aux réponses sur le pays, l'âge et le LLM ; ses chiffres « de travail » ne sont **pas** des décisions. |

Les étapes suivantes ajoutent un fichier chacune dans `conception/`. Ne confonds pas les étapes 1 à 8 du projet avec les étapes de construction E1 à E11 de `fonctionnalites.md`. Les annexes sont des réserves de matière : le document de référence d'une étape est celui qui n'est pas une annexe.

## Où en est-on (état au 2026-10-12)

- **Validées explicitement par l'utilisateur** : étapes 1, 2, 5, 6 et 7.
- **`fonctionnalites.md` (étapes 3 et 4)** : l'utilisateur est passé à la suite sans le valider explicitement. Ses questions Q1 à Q10 restent ouvertes et leurs recommandations sont des valeurs provisoires, notamment Q1 (note sur 20), Q3 (remplacement d'une remise), Q4 (correction de la transcription par le professeur), Q6 (rubrique française). À faire confirmer avant de s'appuyer dessus.
- **`acteurs.md` (étape 6)** : validée le 2026-10-12. Décisions : A1 deux comptes distincts si une personne est à la fois administrateur et professeur ; A2 un seul administrateur en V1 ; A3 l'élève ne relit pas son texte collé.
- **Étape 7 validée le 2026-10-12** (`stack-technologique.md`), images stockées dans PostgreSQL. Sous-choix tranchés le 2026-10-12 (voir étape 8).
- **Étape 8 en cours (2026-10-12)** : `prompts-implementation.md`, structure validée [D] : un `/plan` par étape, une sous-fonctionnalité par prompt, validation par l'utilisateur avant la suivante ; détail pour les deux prochaines étapes seulement. Décisions du 2026-10-12 : contenu de l'application en anglais (NFR-USA-02 mis à jour), prompts en français, code en anglais ; référence visuelle refine app-crm-minimal, reprise en Tailwind sans Ant Design ; maquettes de la liste des remises et de l'écran de copie avant la base ; sous-choix tranchés : Better Auth, Zod, Vitest et Playwright, Nodemailer, SDK Mistral officiel. Bibliothèque de primitives (shadcn/ui ou non) : à trancher au prompt 1.1. Le prompt 0.3 réécrit ce CLAUDE.md pour la phase de code.
- **Cadre de l'étape 7 [D, 2026-10-12]** : projet académique d'un collègue de l'utilisateur, qui joue le rôle du « client » ; l'utilisateur est le seul développeur. Budget strictement 0 MAD. Pas de vrais élèves : des acteurs de simulation saisissent des données pour démontrer la solution. Préférences : TypeScript, Next.js, GSAP, Tailwind CSS ; PostgreSQL avec Drizzle ORM ; Mistral comme LLM. Hébergement validé : Vercel Hobby + Neon + Vercel Workflows (la clause « non commercial » de Vercel est compatible avec un projet académique), email par Gmail SMTP en démonstration. **Requalification appliquée le 2026-10-12** (liste validée par l'utilisateur) : le pilote avec de vrais élèves devient une démonstration avec acteurs de simulation. E11 est réécrite dans `fonctionnalites.md` ; `besoins-non-fonctionnels.md` gagne la §2.8 (statuts en démonstration) et remplace « avant E11 » par « avant tout usage réel » pour DON-01, DON-03, FIA-02, EXP-02 et EXP-03. Répartition : 15 exigences exécutées, 4 partielles (DON-02, EXP-02, QUA-01, EXP-03), 3 documentées seulement (DON-01, DON-03, FIA-02) ; QNF-1, QNF-4 et QNF-7 sont reportées à l'usage réel. Des copies simulées par des adultes ne représentent pas de vraies écritures d'élèves : dis-le quand tu parles des mesures de qualité.
- **Questions de l'étape 5** : QNF-1 (responsable du traitement, démarches CNDP, âge), QNF-4 (durées de conservation) et QNF-7 (second facteur pour le compte administrateur) sont reportées à l'usage réel. QNF-5 : Mistral retenu [D] en mode gratuit ; il reste à relever dans la console Mistral les quotas du compte et la bascule « Anonymous improvement data » (refus d'entraînement), dont l'effet sur l'accès gratuit n'est pas confirmé. Action de l'utilisateur.
- **À reporter dans `fonctionnalites.md`** (non fait) : écran de notice et paramètres de conformité, relance proposée au professeur après un plafond d'usage de l'IA, conservation du tri et des filtres. Déjà fait le 2026-10-12 : SUB-01, matrice 5.4 (« Remise et images »), CLS-04 R3 et mentions « probablement mineurs ».

Décisions de contexte prises à l'étape 5 (détail dans `besoins-non-fonctionnels.md` §1) : pays Maroc, élèves de 18 ans, l'administrateur exploite l'application en V1, un LLM gratuit en V1, application web responsive, l'élève ne revoit pas l'image de sa copie. Le pilote d'un professeur de l'étape 5 est remplacé depuis le 2026-10-12 par une démonstration avec acteurs de simulation.

## Vue d'ensemble du produit

Trois acteurs : administrateur, professeur, élève. Parcours de bout en bout, réparti sur plusieurs documents :
l'administrateur crée les comptes professeur → le professeur crée une classe et invite par lien ou code (sans approbation) → crée un devoir → l'élève remet un texte collé ou des images scannées → transcription fidèle de l'écriture, sans correction de l'orthographe → l'IA propose niveaux (0 à 4 sur 5 critères) et remarques, sans recevoir l'identité de l'élève → le professeur relit, modifie librement, valide, puis publie → l'élève voit la note, les niveaux et les remarques validées, jamais la proposition brute de l'IA.

Les décisions qui structurent tout sont dans `fonctionnalites.md` §1 (D1 à D10) et dans `solution.md` ; ne les remets pas en cause sans demande de l'utilisateur.

## Règles de travail propres à ce projet

- **L'utilisateur s'exprime d'abord.** Pour une nouvelle étape, il énonce son besoin avec ses propres mots ; tu reformules, analyses, recherches les faits et discutes l'optimisation avec lui. Ne présente pas un brouillon complet avant qu'il se soit exprimé : il l'a explicitement corrigé. N'enregistre un document d'étape qu'à sa demande ou après sa validation.
- **Reste compact, et mesure en mots.** L'utilisateur veut le nécessaire. Deux livrables ont été jugés inexploitables et réécrits : un brouillon fonctionnel de 2 400 lignes, puis un document de besoins non fonctionnels de 9 300 mots dont les cellules de tableau dépassaient 2 000 caractères. Compter les lignes ne suffit pas : vérifie les mots et la taille en Ko, garde les cellules courtes et renvoie le détail à une annexe.
- **Distingue décision et proposition.** Les documents marquent **[D]** décision de l'utilisateur, **[P]** proposition de l'analyse, **[Q#]** question ouverte. Ne présente jamais une proposition comme une décision. Une valeur inconnue s'écrit « à définir » ; n'invente aucun chiffre.
- **Sources.** Les faits de recherche (fiabilité des correcteurs, IA, lecture de l'écriture, loi marocaine) sont cités avec un lien et leurs limites. Ne cite pas une étude que tu n'as pas pu vérifier, et signale quand seul un résumé ou un article de presse a été lu.
- **Cadre légal marocain** (loi 09-08, CNDP) : toujours « à confirmer par la CNDP ou un juriste », jamais présenté comme un avis juridique.
- **Honnêteté sur les limites.** Une IA qui propose et un professeur qui valide ne suppriment pas les biais (ancrage, effet de halo). Les documents le disent : garde cette retenue.
- Les documents sont rédigés en français ; réponds en français.
