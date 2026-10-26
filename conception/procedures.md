# Procédures sans écran (NFR-EXP-03)

> Opérations faites hors de l'application. NFR-EXP-03 en demande six écrites ; en démonstration, trois sont rejouées ([besoins-non-fonctionnels.md](besoins-non-fonctionnels.md) §2.8) : créer le premier administrateur, activer le français, activer l'envoi réel à l'IA. **[P]**, écrit en E5.2 et E5.3 (2026-10-16). Les quatre autres procédures restent à écrire. « Activer l'envoi réel à l'IA » : réécrite pour Anthropic en E5.15 (2026-10-19). « Livrer une version en production » et « Renouveler la clé d'IA de production » : écrites en E9.5 (2026-10-26).

## Activer le français (EVL-01 R4, Q6)

**Quand.** Après la validation écrite, par le client, du texte français de la rubrique. Sans cette validation, on ne publie rien : un devoir en français reste « IA indisponible » (Q6 [D]).

**Exécutant [P], à consigner (T5).** Le développeur, car la rubrique est dans le code. NFR-EXP-03 prévoit l'administrateur, hors application, en V1.

**Effet.**
- La version française devient la rubrique en vigueur pour les devoirs en français.
- L'écran Rubric l'affiche (un onglet par langue) et l'avis « French version not validated yet » disparaît, sans modification de l'écran.
- Les nouvelles évaluations de devoirs en français reçoivent une proposition.
- Les copies déjà en « IA indisponible » ne sont pas relancées d'office : la relance est proposée au professeur (PRC-02, E6.3).

**Étapes.**
1. Conserver la validation du client (date, document ou message). La consigner en [D] dans `fonctionnalites.md` (Q6, EVL-01 R4) et dans `src/server/evaluation/AGENTS.md`.
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
5. `AI_PROVIDER` n'est jamais défini dans l'environnement Preview de Vercel : la preview reste sur le simulateur. Dans l'environnement Production, il vaut toujours `anthropic` [D, 2026-10-26] (« Livrer une version en production », ci-dessous).

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

## Activer l'IA sur la preview (démonstration, E6.5)

**Remplacée pour les démonstrations [D, 2026-10-26].** Les démonstrations se font sur la production (E9.5, « Livrer une version en production ») ; la preview reste toujours sur le simulateur. Texte gardé pour l'historique et le rejeu d'E6.5.

**Quand.** Pendant une démonstration seulement : la preview est publique [D], toute personne inscrite comme élève y déclencherait des envois. Entre deux démonstrations, la preview reste sur le simulateur et aucune clé n'existe.

**Exécutant.** L'utilisateur, dans la Console d'Anthropic et dans Vercel (projet, Settings → Environment Variables, environnement **Preview** seulement). Aucun outil ne lit `.env.local` ni les valeurs posées dans Vercel.

**Variables d'IA (posées pour la démonstration, retirées après).**

| Variable | Valeur | Remarque |
|---|---|---|
| `AI_PROVIDER` | `anthropic` | Absente → simulateur. |
| `GRADING_ANTHROPIC_API_KEY` | clé d'un **compte de service**, propre à la preview | Distincte de la clé du dev ; jamais `ANTHROPIC_API_KEY`. |

Conditions de la clé :
- compte de service créé pour la preview et **ajouté à l'espace `grading_system`** ; clé créée dans cet espace, **limitée à lui** ;
- une clé de l'espace Default échapperait à la limite de dépense de l'espace (10 $ par mois) ;
- une clé non limitée à un espace exige l'en-tête `anthropic-workspace-id`, que l'adaptateur ne transmet pas (4 en-têtes seulement) : 400, `configuration` ;
- expiration la plus courte que la Console propose, notée à la création.

Aucune variable `ANTHROPIC_*` ni `NODE_DEBUG` dans Vercel : l'adaptateur refuserait de démarrer.

**Variables de Workflows : aucune à ajouter.** Sur Vercel, le SDK `workflow` (5.2.2) choisit seul la Vercel World et lit les variables système (`VERCEL`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_OIDC_TOKEN`, `VERCEL_URL`…), relevées dans `node_modules/@workflow/` le 2026-10-20.
- À vérifier une fois : Settings → Environment Variables, « Automatically expose System Environment Variables » coché (déjà le cas en E6.1, où la preview a traité une remise).
- Ne **jamais** poser `WORKFLOW_TARGET_WORLD`, `WORKFLOW_LOCAL_BASE_URL` ni `WORKFLOW_LOCAL_DATA_DIR` dans Vercel : ils forceraient la Local World, propre au poste et à l'E2E.
- `CRON_SECRET` : inutile sur la preview, où le cron de Vercel ne tourne pas (production seulement) ; sans lui, la route du balayage répond 401.

**Étapes.**
1. Console : vérifier la limite de l'espace et sa dépense du mois, le crédit et sa fin de cycle (contrôles de « Activer l'envoi réel à l'IA »). La garde de l'application compte aussi les exécutions `anthropic` de la base dev (plafond de 5 $ par mois [P]) : la preview et le dev partagent cette base, donc ce plafond.
2. Créer le compte de service, l'ajouter à l'espace, créer sa clé dans l'espace.
3. Vercel (Preview) : poser `AI_PROVIDER` et `GRADING_ANTHROPIC_API_KEY`, puis **redéployer** la preview (une variable modifiée ne vaut qu'au déploiement suivant).
4. Vérification, sur un texte fictif : un compte élève de démonstration remet un texte ; l'élève voit « Submitted, being marked » ; dans la base dev, la remise passe à `to_review` avec une exécution `provider = 'anthropic'`, `model_answered = 'claude-haiku-5-5'`, `outcome = 'proposed'`, et une ligne `ai_request_sent` dont le sujet est la remise. La Console montre la requête dans l'espace.

**Retour arrière (après chaque démonstration).**
1. Vercel : supprimer `AI_PROVIDER` et `GRADING_ANTHROPIC_API_KEY` de Preview, puis redéployer : le simulateur reprend.
2. Console : **révoquer** la clé du compte de service. Une requête restante répond 401 (`configuration`, sans relance ; trois remises en échec ouvrent le disjoncteur).
3. Les remises déjà traitées, leurs exécutions et les lignes `ai_request_sent` restent (immuables).

**Rejeu.** 2026-10-20 (E6.5), preview au commit `2ccd93d`, base dev migrée avant le push :
- variables posées par l'utilisateur en Preview seulement (`GRADING_ANTHROPIC_API_KEY` en « Sensitive »), relevées par capture de la page Vercel, valeurs non lues ;
- devoir fictif « My town » (B1, anglais) et texte fictif proposé (114 mots, sans nom), remis par l'utilisateur avec son compte élève de démonstration ; l'élève voit « Submitted, being marked » ;
- base dev : version reçue à 20:18:45 UTC, `ai_request_sent` (sujet = la remise) à 20:18:47, exécution enregistrée à 20:18:59, soit 14 s de la remise à `to_review` ; une exécution `anthropic`, `outcome = 'proposed'`, `model_requested` et `model_answered` = `claude-haiku-5-5`, 1 tentative, 12,6 s d'appel, 3 189 tokens en entrée et 1 689 en sortie (coût estimé 0,0013 $ avec la majoration de 1,1) ; proposition courante ;
- une seule requête et une seule exécution dans l'heure : aucun doublon ;
- Console, page Logs (relevée par l'utilisateur) : une requête « OK », `claude-haiku-5-5`, palier Standard, 3 189 / 1 689 tokens, identiques aux nôtres ; latence 9,81 s contre 12,6 s mesurées par l'adaptateur (même écart d'environ 3 s qu'en E5.15, cause non vérifiée) ;
- retour arrière : les deux variables d'IA retirées de Preview par l'utilisateur le 2026-10-20 (capture de la page Vercel).

## Livrer une version en production (E9.5, spec 0012)

**Quand.** À la fin d'une étape dont le cycle est fermé, à la demande de l'utilisateur. `main` est la production [D, 2026-10-26] : elle ne bouge que par avance rapide depuis `preview`, jamais par un commit fait sur elle.

**Exécutant.** L'agent lance les commandes ; l'utilisateur demande le push, contrôle Vercel et choisit les mots de passe. Personne ne lit `.env.local` ni les valeurs posées dans Vercel : l'adresse de la base de production passe par `npm run prod`, jamais par l'écran.

| Branche | Environnement Vercel | Base | IA | Bandeau de démonstration |
|---|---|---|---|---|
| `preview` (travail) | Preview | projet Neon dev | simulateur | non |
| `main` (production) | Production | projet Neon de production | `anthropic`, toujours | oui |
| poste, Docker | aucun | dev (et la base de test pour les tests) | simulateur, sauf `--provider anthropic` | non |

**Barrière, toute requise.**
1. Le cycle de l'étape est fermé : `/check verify`, `/test`, `/check review`, `/document`.
2. `npm test` et la suite E2E sont verts (demander avant de les lancer : la base de test est partagée).
3. La preview poussée a été vue en ligne : un parcours rapide.
4. Le SQL des nouvelles migrations est relu : aucun `DROP`, `RENAME` ni `SET NOT NULL` dans la même livraison que le code qui cesse d'utiliser la colonne (élargir, puis contracter à la livraison suivante). La version précédente doit tourner sur le nouveau schéma : c'est ce qui rend le retour arrière sûr.

**Étapes.**
1. `git merge-base --is-ancestor main preview` doit réussir ; sinon, s'arrêter et demander.
2. Migrer dev, puis la production :
   `docker compose exec -T web npm run db:migrate`
   `docker compose exec -T web npm run prod -- db:migrate`
3. `git checkout main`, puis `git merge --ff-only preview`, puis `git checkout preview`. Un refus veut dire que `main` a bougé seule : s'arrêter et demander, ne jamais forcer.
4. Pousser `main` et `preview`, seulement à la demande de l'utilisateur.
5. Contrôler la production :
   - Vercel, Deployments : le déploiement de `main` est « Ready » en Production ;
   - le bandeau « Demo, fictitious data only. Do not submit real student work. » s'affiche, déconnecté puis connecté ;
   - un parcours fonctionne ;
   - si l'étape a touché la chaîne d'IA : une remise de texte fictif, puis d'image fictive (`scripts/fixtures/ai/`), arrive à « To review » ; lire le résultat avec `docker compose exec -T web npm run prod -- ai:status` (une exécution `anthropic`, `proposed`, sans doublon), et l'usage avec `npm run prod -- ai:report`.

**Mise en place, une seule fois (faite le 2026-10-26, tâches 6 et 7).**
- Projet Neon de production, à part : région `us-east-2`, même version de Postgres que le dev. Ses quotas sont les siens (§3 de `stack-technologique.md`).
- Vercel, environnement **Production** seulement : `DATABASE_URL` (chaîne groupée), `BETTER_AUTH_SECRET` et `CRON_SECRET` (nouveaux, tirés avec `openssl rand -base64 32`), `BETTER_AUTH_URL` (`https://grading-system-omega-amber.vercel.app`, l'adresse stable, jamais celle d'un déploiement), `SMTP_USER` et `SMTP_PASSWORD` (le Gmail de la preview), `AI_PROVIDER` (`anthropic`), `GRADING_ANTHROPIC_API_KEY`. Les secrets en type Secret, les autres en Config. Jamais `ANTHROPIC_*`, `NODE_DEBUG`, `WORKFLOW_TARGET_WORLD`, `WORKFLOW_LOCAL_*`, `EMAIL_TRANSPORT` ni `MAIL_CAPTURE_DIR`.
- Clé d'IA : voir « Renouveler la clé d'IA de production ».
- Vercel : « Automatically expose System Environment Variables » coché ; Settings, Environments, Production : Branch Tracking sur `main`, « Auto-assign Custom Production Domains » activé.
- `.env.local` : `PRODUCTION_DATABASE_URL` (chaîne **directe**) et `PRODUCTION_APP_URL`, puis `docker compose up -d`.
- Base migrée (`npm run prod -- db:migrate`), puis premier administrateur : `docker compose exec -T web npm run prod -- admin:create --email … --first-name … --last-name …`. Le lien part par email. Tant que `main` n'a aucun déploiement, il répond `404 DEPLOYMENT_NOT_FOUND` : après le premier déploiement, l'administrateur choisit son mot de passe par « Forgot password ». Un second `admin:create` est refusé.

**Retour arrière, dans les limites de Hobby.**
- Vercel, Instant Rollback : revient au déploiement de production précédent seulement, pas deux en arrière. Pendant ce temps, un push sur `main` construit, mais ne passe en ligne qu'une fois un déploiement promu de nouveau.
- Pas de raccourci pour une correction urgente : `preview` peut porter du travail inachevé, et un `cherry-pick` sur `main` casse l'avance rapide. La correction attend la barrière, ou la production reste en arrière jusque là.
- Au pire : retirer `AI_PROVIDER` de Production et redéployer (le simulateur reprend), ou révoquer la clé (les remises passent « AI unavailable », l'évaluation manuelle reste possible).

**Rejeu.** Pas encore : la première livraison est la tâche 9 de la spec 0012.

## Renouveler la clé d'IA de production (E9.5, spec 0012)

**Quand.** Avant l'expiration de la clé, et à chaque cycle de crédit. Anthropic écrit au créateur 7 jours avant l'expiration d'une clé d'au moins 14 jours. Une clé expirée répond 401 (`configuration`, sans relance ; trois remises en échec ouvrent le disjoncteur).

**Exécutant.** L'utilisateur, dans la Console d'Anthropic et dans Vercel.

**Conditions de la clé.**
- liée au compte de service de production (Linked account), distinct de celui de la preview ; ce compte est membre de l'espace `grading_system` ;
- créée **dans** l'espace `grading_system`, limitée à lui : une clé hors de l'espace échapperait à sa limite de 10 $ par mois, et une clé non limitée exigerait l'en-tête `anthropic-workspace-id`, que l'adaptateur ne transmet pas (400) ;
- expiration : 30 jours, ou une durée qui finit avec le cycle de crédit ; jamais « Never ». Elle ne se change pas après la création.

**Étapes.**
1. Console : contrôles de « Activer l'envoi réel à l'IA » (crédit et fin du cycle, limite de l'espace et dépense du mois).
2. Console, API keys, Create key : nom, Linked account, espace `grading_system`, expiration. Copier la clé directement dans Vercel ; la noter nulle part ailleurs.
3. Vercel, Production : remplacer la valeur de `GRADING_ANTHROPIC_API_KEY` (type Secret), puis redéployer le dernier déploiement de production (Deployments, Redeploy) : une variable ne vaut qu'au déploiement suivant. `main` ne bouge pas.
4. Contrôler : une remise de texte fictif arrive à « To review » ; `npm run prod -- ai:status` montre l'exécution `anthropic`, `proposed`.
5. Console : supprimer l'ancienne clé (Delete).
6. Consigner ci-dessous la date et la nouvelle expiration.

**Rejeu.** Clé créée le 2026-10-26 (tâche 6), expiration à relever par l'utilisateur.
