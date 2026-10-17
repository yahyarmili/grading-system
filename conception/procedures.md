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

**Quand.** Seulement sur des données fictives (DON-02) : la démonstration n'envoie jamais un vrai texte d'élève. Par défaut, partout, c'est le simulateur qui répond, et rien ne quitte la machine.

**Effet.** Les évaluations partent chez OpenRouter, vers le modèle `xingchen-agi/xing4.0-29b-a4b:free` [D, 2026-10-17], épinglé dans `decisions.ts` avec le routage (`require_parameters`, `zdr`). OpenRouter les relaie au fournisseur du modèle, Phala au 2026-10-17, le seul endpoint ZDR listé. Chaque requête qui part laisse d'abord une ligne `ai_request_sent` au journal de sécurité, sans contenu ; si cette ligne ne peut pas être écrite, rien ne part. Limites : 20 requêtes par minute, 50 par jour UTC, tentatives comprises (`stack-technologique.md` §3).

**Conditions (vérifiées au premier usage de l'IA dans le processus, et à chaque lancement de `ai:trial` ; sinon refus, jamais de repli silencieux).**
- `AI_PROVIDER=openrouter` exactement ; toute autre valeur non vide, `mistral` comprise, est refusée.
- `OPENROUTER_API_KEY` non vide. L'adaptateur reçoit la clé, il ne la lit jamais lui-même dans l'environnement.
- `NODE_DEBUG` non défini, quelle que soit sa valeur : il fait écrire à Node les requêtes envoyées.
- Les tests et l'E2E restent sur le simulateur, quoi que dise `.env.local`.

**Étapes.**
1. Vérifier que le modèle a encore un endpoint ZDR et pas de date de retrait : [`/endpoints`](https://openrouter.ai/api/v1/models/xingchen-agi/xing4.0-29b-a4b:free/endpoints) (`expiration_date`, fournisseurs) et [`/endpoints/zdr`](https://openrouter.ai/api/v1/endpoints/zdr). Sinon : nouvelle décision de modèle, et nouvelle version de la notice élève.
2. Vérifier dans les réglages de confidentialité du compte OpenRouter que la journalisation des prompts et l'usage des entrées par OpenRouter restent désactivés.
3. Essai, en local : `docker compose exec -e AI_PROVIDER=openrouter web npm run ai:trial`. Attendu : une réponse JSON conforme au schéma, le modèle et le fournisseur qui ont répondu (ou « (not said) »), l'usage. En cas d'échec, seuls s'affichent le type d'erreur et le code d'OpenRouter (`error_type`, `provider_code`), jamais le message.
4. Contrôler le journal : une ligne `ai_request_sent` par requête partie, sans acteur ni contenu.
5. Pour la démonstration : ajouter `AI_PROVIDER=openrouter` (et `OPENROUTER_API_KEY`) dans l'environnement visé, dev (`.env.local`, puis `docker compose up -d`) ou Vercel **Preview** (par l'utilisateur).

**Retour arrière.** Retirer `AI_PROVIDER` (ou le mettre à `simulator`) : le simulateur répond de nouveau. Selon la liste d'OpenRouter, sans garantie vérifiable, rien n'est conservé chez Phala ; OpenRouter garde les métadonnées des requêtes, et peut-être quelques prompts échantillonnés, anonymes (fiche DON-02).

**Rejeu.** Étapes 3 et 4 le 2026-10-17, en local : réponse JSON conforme au schéma de l'essai, modèle `xingchen-agi/xing4.0-29b-a4b:free` et fournisseur `Phala` donnés par la réponse, 129 tokens, 11,4 s. Étapes 1 et 2 vérifiées par l'utilisateur. Le rejeu partiel du 2026-10-16 avec Mistral (quota à 0) est dans l'historique git.
