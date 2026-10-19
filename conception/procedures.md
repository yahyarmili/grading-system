# Procédures sans écran (NFR-EXP-03)

> Opérations faites hors de l'application. NFR-EXP-03 en demande six écrites ; en démonstration, trois sont rejouées ([besoins-non-fonctionnels.md](besoins-non-fonctionnels.md) §2.8) : créer le premier administrateur, activer le français, activer l'envoi réel à l'IA. **[P]**, écrit en E5.2 et E5.3 (2026-10-16). Les quatre autres procédures restent à écrire. « Activer l'envoi réel à l'IA » : réécrite pour Anthropic en E5.15 (2026-10-19).

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

**Quand.** Pour un essai de l'IA sur données fictives (E5.15, E5.16), puis pour la démonstration. Jamais sur une copie réelle : la fiche DON-02 d'Anthropic (`stack-technologique.md` §3) n'est pas validée par le client.

**Exécutant [P].** Le développeur : il crée la clé dans la Console et la met dans `.env.local`, qu'aucun outil ne lit à sa place.

**Effet.** Avec `--provider anthropic`, les commandes `ai:trial` et `ai:evaluate` envoient la requête d'évaluation (`evaluation-2`) à `https://api.anthropic.com/v1/messages`, modèle `claude-haiku-5-5`, `inference_geo: "us"`. Chaque requête HTTP écrit d'abord une ligne `ai_request_sent` au journal de sécurité, sans contenu ; si cette ligne ne s'écrit pas, rien ne part. Sans `--provider anthropic`, le simulateur répond et rien ne quitte la machine. L'application (pages, Server Actions) ne lance aucune évaluation avant E6.

**Conditions.**
1. La notice élève en vigueur décrit Anthropic (version 4 depuis E5.15).
2. Données fictives seulement : jeux de `scripts/fixtures/ai/`, comptes et devoirs de démonstration.
3. Clé créée dans l'espace `grading_system`, pas dans Default : une clé non limitée à un espace exige un en-tête `anthropic-workspace-id`, que l'adaptateur ne transmet pas (400). Noter son expiration, choisie à la création et non modifiable.
4. La clé est dans `.env.local` sous `GRADING_ANTHROPIC_API_KEY`, jamais `ANTHROPIC_API_KEY` (Claude Code la prendrait à la place de l'abonnement) ; aucune variable `ANTHROPIC_*` ni `NODE_DEBUG` dans l'environnement, sinon l'adaptateur refuse de démarrer. Puis `docker compose up -d`.
5. `AI_PROVIDER` n'est pas défini dans Vercel : la preview reste sur le simulateur.

**Contrôles dans la Console, avant l'essai.**
- **Crédit et fin du cycle** : solde restant, date d'expiration (crédit promotionnel relevé le 2026-10-19 : 100 $, expire le 2026-11-12 UTC) ; après cette date, relever le renouvellement.
- **Limite de l'espace** `grading_system` : 10 $ par mois, alertes à 5 et 8 $ ; dépense du mois en cours.
- **Conservation** de l'organisation : « On · 30 days », pas de ZDR ; programme partenaire non rejoint, retours désactivés. Si l'un change : ne rien envoyer, mettre à jour la fiche DON-02 et la notice (nouvelle version).
- **Région** : `inference_geo` autorisé `us`, région de l'espace United States.

**Étapes.**
1. Essai de connexion, une requête :
   `docker compose exec web npm run ai:trial -- --provider anthropic`
   Attendu : modèle `claude-haiku-5-5`, `stop_reason` `end_turn`, `inference_geo` `us`, l'usage, le coût estimé, « The answer is valid JSON. ». En cas d'échec, la commande affiche la classe (`kind`), le code du prestataire et le `request-id`, jamais un message ni un corps.
2. Un texte par la requête d'évaluation, une requête :
   `docker compose exec web npm run ai:trial -- --set dev --limit 1 --runs 1 --provider anthropic`
   Attendu : « Conform proposals | 1 », mêmes contrôles ; rapport dans `trial-results/` (non commité).
3. **Journal** : une ligne `ai_request_sent` par requête, du jour, sans texte (type, sujet nul pour un essai, date). Le compteur de la garde quotidienne (200 par jour UTC [P]) le lit.
4. **Coût** : dans la Console, les requêtes apparaissent dans l'espace `grading_system` ; le coût affiché a l'ordre de grandeur du coût estimé (prix lus le 2026-10-19, `src/server/evaluation/prices.ts`).
5. Consigner la date du rejeu ci-dessous ; un essai plus long (E5.16) suit sa propre consigne.

**Retour arrière.**
- Ne plus passer `--provider anthropic` : le simulateur reprend aussitôt. Si `AI_PROVIDER=anthropic` a été défini (E6), le retirer de `.env.local` ou de Vercel, puis `docker compose up -d` ou redéployer.
- Révoquer la clé dans la Console (page des clés de l'espace) et la retirer de `.env.local` : toute requête restante répond 401 (`configuration`, sans relance).
- Les lignes `ai_request_sent` et les résultats déjà stockés restent (journal et propositions immuables).

**Rejeu.** 2026-10-19 (E5.15), étapes 1 à 4, sur dev :
- conditions 3 à 5 vérifiées par noms seulement (clé présente dans `web`, aucune variable `ANTHROPIC_*`, `NODE_DEBUG` ni `AI_PROVIDER`) ; Console, relevée par l'utilisateur le 2026-10-19 : une seule clé, limitée à l'espace `grading_system`, liée à son compte (pas un compte de service), créée le 2026-10-19, expire le 2026-11-18 (après la fin du crédit, le 2026-11-12) ;
- étape 1 : `claude-haiku-5-5`, `end_turn`, `inference_geo` `us`, 370 tokens en entrée et 49 en sortie, coût estimé 0,000068 $, 4,3 s, JSON valide ;
- étape 2 (d01) : proposition conforme, `end_turn`, `us`, 3 143 en entrée et 1 549 en sortie (réflexion comprise), coût estimé 0,0012 $, 10,4 s (premier usage du schéma) ;
- étape 3 : deux lignes `ai_request_sent` (sujet nul, aucun contenu), compteur du jour passé de 0 à 2 ;
- étape 4, Console (relevée par l'utilisateur le 2026-10-19, vers 20 h 37 UTC) : page Logs, exactement deux requêtes « OK », `claude-haiku-5-5`, palier Standard, tokens identiques aux nôtres (370 / 49 et 3 143 / 1 549) ; latence 0,99 s et 7,17 s, contre 4,3 s et 10,4 s mesurées par la commande (écart d'environ 3,2 s par appel, cause non vérifiée) ; page Usage filtrée sur l'espace et colonne Cost de la clé encore vides (0 et « — ») une quinzaine de minutes après : coût relevé ensuite avec celui d'E5.16 : 0,07 $ pour les deux (`annexe-essais-ia.md`, 2026-10-19).

**Historique, OpenRouter (jusqu'au 2026-10-19).** Envoi des évaluations à OpenRouter (modèle `xingchen-agi/xing4.0-29b-a4b:free`, relayé à Phala, endpoint ZDR), avec `OPENROUTER_API_KEY` et une garde à 50 requêtes par jour UTC ; rejoué en partie le 2026-10-17. Adaptateur retiré en E5.13. Texte complet : ce fichier au commit `85b60c4`.
