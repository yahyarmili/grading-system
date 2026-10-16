# Procédures sans écran (NFR-EXP-03)

> Opérations faites hors de l'application. NFR-EXP-03 en demande six écrites ; en démonstration, trois sont rejouées ([besoins-non-fonctionnels.md](besoins-non-fonctionnels.md) §2.8) : créer le premier administrateur, activer le français, activer l'envoi réel à Mistral. **[P]**, écrit en E5.2 (2026-10-16). Les cinq autres procédures restent à écrire.

## Activer le français (EVL-01 R4, Q6)

**Quand.** Après la validation écrite, par le client, du texte français de la rubrique. Sans cette validation, on ne publie rien : un devoir en français reste « IA indisponible » (Q6 [D]).

**Exécutant [P], à consigner (T5).** Le développeur, car la rubrique est dans le code. NFR-EXP-03 prévoit l'administrateur, hors application, en V1.

**Effet.**
- La version française devient la rubrique en vigueur pour les devoirs en français.
- L'écran Rubric l'affiche (un onglet par langue) et l'avis « French version not validated yet » disparaît, sans modification de l'écran.
- Les nouvelles évaluations de devoirs en français reçoivent une proposition.
- Les copies déjà en « IA indisponible » ne sont pas relancées d'office : la relance est proposée au professeur (PRC-02, E6.3).

**Étapes.**
1. Conserver la validation du client (date, document ou message). La consigner en [D] dans `fonctionnalites.md` (Q6, EVL-01 R4) et dans `CLAUDE.md`.
2. Dans `src/lib/rubric.ts`, ajouter `fr-1` **à la fin** de `RUBRIC_VERSIONS`, sans toucher à `en-1` :
   - `id: "fr-1"`, `language: "fr"`, `publishedOn` : date de publication ;
   - les mêmes critères, dans le même ordre, avec les mêmes identifiants, le poids 20 et les niveaux 0 à 4 (R1) ;
   - les noms, qualificatifs et descripteurs copiés du texte validé, sans retouche.
3. Mettre à jour les tests qui disent « pas de français publié » :
   - `tests/rubric-versions.test.ts` : `publishedRubric("fr")` donne `fr-1` ;
   - `e2e/rubric.spec.ts` : onglets English et French présents, avis absent.
4. Lancer `docker compose exec web npm test`. `tests/rubric-versions.test.ts` échoue et affiche l'empreinte de `fr-1`. Relire le texte face au document validé, puis reporter l'empreinte dans `PUBLISHED`. Relancer : tout passe.
5. Lancer `docker compose run --rm e2e npx playwright test e2e/rubric.spec.ts` (jamais en même temps que `npm test`). Vérifier aussi `/teacher/rubric` et `/student/rubric` à l'œil.
6. Commiter sur `preview`, puis pousser à la demande de l'utilisateur : la preview se met à jour.
7. Contrôler (à partir d'E5.5) : sur un devoir fictif en français, une remise évaluée reçoit une proposition, et son exécution porte la version `fr-1`.

**Retour arrière.** Une version publiée ne se retire pas : les évaluations faites avec elle la citent. Une erreur de texte se corrige en publiant `fr-2` par la même procédure.

**Rejeu.** Pas encore rejoué. À faire avant la démonstration, sur une branche locale jetable, jamais poussée :
- y suivre les étapes 2 à 5 avec un texte français marqué « test only » ;
- vérifier l'écran, et à partir d'E5.6 une proposition en français ;
- supprimer la branche, puis consigner la date du rejeu ici.

## Activer l'envoi réel à Mistral

À écrire en E5.3, avec `AI_PROVIDER` et l'adaptateur.
