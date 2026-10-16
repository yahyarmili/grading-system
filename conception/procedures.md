# Procédures sans écran (NFR-EXP-03)

> Opérations faites hors de l'application. NFR-EXP-03 en demande six écrites ; en démonstration, trois sont rejouées ([besoins-non-fonctionnels.md](besoins-non-fonctionnels.md) §2.8) : créer le premier administrateur, activer le français, activer l'envoi réel à l'IA. **[P]**, écrit en E5.2 et E5.3 (2026-10-16). Les quatre autres procédures restent à écrire.

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

## Activer l'envoi réel à l'IA (NFR-DON-02, NFR-DON-05)

> **À réécrire.** Depuis le 2026-10-16 [D], le prestataire est OpenRouter, avec un modèle gratuit à choisir (`stack-technologique.md` §3). Le texte ci-dessous décrit l'adaptateur Mistral, encore présent dans le code, qui n'a jamais obtenu de réponse de Mistral. Il sera réécrit avec l'adaptateur OpenRouter (prompt E5.4b) : variables, réglages de confidentialité du compte, limites du modèle, conservation chez le fournisseur.

**Quand.** Seulement sur des données fictives (DON-02) : la démonstration n'envoie jamais un vrai texte d'élève. Par défaut, partout, c'est le simulateur qui répond, et rien ne quitte la machine.

**Effet.** Les évaluations partent chez Mistral (`mistral-medium-3-5`, épinglé dans `decisions.ts`). Chaque requête qui part laisse d'abord une ligne `ai_request_sent` au journal de sécurité, sans contenu ; si cette ligne ne peut pas être écrite, rien ne part.

**Conditions (vérifiées au premier usage de l'IA dans le processus, et à chaque lancement de `ai:trial` ; sinon refus, jamais de repli silencieux).**
- `AI_PROVIDER=mistral` exactement ; toute autre valeur non vide est refusée.
- `MISTRAL_API_KEY` non vide.
- Aucune de ces variables définies, quelle que soit leur valeur : `MISTRAL_DEBUG`, `MISTRAL_SDK_TELEMETRY`, `MISTRAL_OTLP_TRACES_ENDPOINT`, `MISTRAL_SDK_DEBUG_TRACING`. Elles font écrire au SDK la clé, les requêtes ou les réponses (console, export de traces). `MISTRAL_DEBUG=false` l'active aussi.
- Les tests et l'E2E restent sur le simulateur, quoi que dise `.env.local`.

**Étapes.**
1. Vérifier dans la console Mistral que le refus d'entraînement est toujours actif et que Labs reste désactivé (`stack-technologique.md` §3 au commit `a7aaf44`), et relever la limite du modèle `mistral-medium-3-5`.
2. Essai, en local : `docker compose exec -e AI_PROVIDER=mistral web npm run ai:trial`. Attendu : une réponse JSON, le modèle qui a répondu et l'usage. En cas d'échec, seul le type d'erreur s'affiche (et le code d'erreur de Mistral), jamais le message.
3. Contrôler le journal : une ligne `ai_request_sent` par requête partie, sans acteur ni contenu.
4. Pour la démonstration : ajouter `AI_PROVIDER=mistral` (et `MISTRAL_API_KEY`) dans l'environnement visé, dev (`.env.local`, puis `docker compose up -d`) ou Vercel **Preview** (par l'utilisateur).

**Retour arrière.** Retirer `AI_PROVIDER` (ou le mettre à `simulator`) : le simulateur répond de nouveau. Les données déjà envoyées restent chez Mistral 30 jours (offre gratuite, fiche DON-02).

**Rejeu.** Partiel, le 2026-10-16 (E5.3), en local : 3 requêtes parties, 3 lignes au journal, mais Mistral a répondu `rate_limited` (code 1300) à chacune, sans `Retry-After`. Cause trouvée le 2026-10-16 : quota de 0 requête par minute, car l'offre Free de Mistral n'active pas les clés d'API. Mistral est abandonné. Le rejeu est à refaire avec OpenRouter.
