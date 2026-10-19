# Annexe : API d'Anthropic et `claude-haiku-5-5` (reprise d'E5)

> **Annexe : matière, pas des décisions.** Décisions [D, 2026-10-19] et propositions [P] : [stack-technologique.md](stack-technologique.md) et reprise d'E5 dans [prompts-implementation.md](prompts-implementation.md). Dernier état OpenRouter : commit `85b60c4`.

- **Objet** : faits et sources de la reprise d'E5 avec l'API d'Anthropic en direct, lus le 2026-10-19.
- **Méthode** : 6 lecteurs, 3 conceptions concurrentes (économie, missions, risque), 3 juges, une synthèse, puis 3 vérificateurs adverses (faits, dépôt, méthode), dont les 47 constats sont intégrés. Aucun appel d'API de modèle, aucun `.env*` lu, rien d'exécuté.
- **Confiance**, après la source : **L** lu en entier ; **E** extraits ; **R** résumé seulement ; **S** supposé ou calculé par nous.

## 1. Le modèle `claude-haiku-5-5`

| Fait | Valeur | Source | Conf. |
|---|---|---|---|
| Identifiant | fixe, sans date ni alias ; sorti le 2026-10-07 ; retrait pas avant le 2027-10-07 (engagement minimal publié) ; 1M tokens d'entrée, 128K de sortie | [Haiku 5.5] | L |
| Prix | par MTok (prompt ≤ 100K) : entrée 0,10 $, sortie 0,50 $, lecture de cache 0,01 $ ; au-delà : 0,50 / 2,50 $. Tokenizer : +30 % de tokens par rapport à Haiku 4.5 | [Pricing], [Migration] | E, L |
| Vision | JPEG, PNG, GIF, WebP ; 10 Mo par image, 8 000 px, 32 Mo par requête ; ⌈l/28⌉ × ⌈h/28⌉ tokens, haute résolution jusqu'à 2 576 px et 4 784 tokens ; manuscrit non mentionné | [Vision] | L |
| Sortie structurée | GA, `output_config.format`, pas sur Bedrock ; `additionalProperties: false` obligatoire ; `integer` et `enum` (aussi de nombres) acceptés ; `minItems` seulement 0 ou 1 ; refusés : `minimum`/`maximum`, `minLength` ; au plus 24 paramètres optionnels ; schéma trop complexe : 400 ; grammaire gardée 24 h (premier appel plus lent) ; incompatible avec Citations et le pré-remplissage | [Structured outputs] | E (lu le 2026-10-19, fin de page non lue) |
| Sortie sous refus ou troncature | `max_tokens` : sortie coupée, hors schéma possible ; `refusal` : 200, tokens facturés, sortie hors schéma possible ; un champ de raisonnement pas à pas peut déclencher `reasoning_extraction` | [Structured outputs] | E |
| Réflexion, effort | réflexion adaptative par défaut, comptée dans `max_tokens` (`stop_reason: "max_tokens"` possible avant tout texte), blocs à lire par `type`, texte vide par défaut (`display: "omitted"`) ; effort de `low` à `max`, défaut `medium` ; `thinking` désactivé accepté jusqu'à `high` (400 à `xhigh` et `max`) | [Migration], [Errors] | L |
| Échantillonnage | `temperature` seulement 1, `top_p` seulement 0,99, jamais les deux ; `top_k` et le pré-remplissage : 400 | [Migration] | L |
| Refus | HTTP 200, `stop_reason: "refusal"` ; catégories `cyber`, `bio`, `frontier_llm`, `general_harms` pour Haiku 5.5, plus `reasoning_extraction` sur la page générale, et `null` ; aucun repli côté serveur ; la même requête est en général refusée à nouveau | [Prompting], [Refusals] | L/E |
| Coût d'un refus | facturé avant toute sortie pour `bio`, `frontier_llm`, `reasoning_extraction`. Celle-ci vise un champ de raisonnement ou de trace dans une sortie JSON ; une courte explication reste admise (notre schéma a `justification`) | [Refusals] | E |

## 2. Données, conditions, lieu

- **Conservation** : entrées et sorties supprimées sous 30 jours ([Conservation], R). La doc Platform dit autrement, à propos des fonctionnalités : contenu non conservé par défaut, sauf pour les « Covered Models » (30 jours) ([Data retention], E). Console, 2026-10-19 : « On · 30 days », pas de ZDR (§8).
- **Exceptions** : contenu signalé, jusqu'à 2 ans (scores de classification : 7 ans) ; obligation légale ; retours (pouce) : 5 ans ([Conservation], R ; [Data retention], E). Seul le schéma JSON, sans donnée d'élève, est gardé 24 h ([Data retention], E).
- **Entraînement** : aucun par défaut ([Entraînement], R) ; interdit sur le contenu du client par les [Commercial Terms] (R), sauf retours envoyés ou accord explicite.
- **ZDR** : seulement par accord commercial ; jamais pour les lots, la Files API ni Managed Agents ([Data retention], E). Le ZDR obtenu via OpenRouter (Phala) disparaît.
- **Conditions** : l'organisation de la Console relève des Commercial Terms, le crédit des [Credit Terms] ; donc l'API payée par le crédit, des conditions commerciales (S, déduction).
- **Lieu** : `inference_geo` vaut `"global"` (défaut) ou `"us"` (prix ×1,1), réglable par espace ; `usage.inference_geo` dit où l'inférence a eu lieu ; stockage au repos aux États-Unis seulement ([Data residency], L).
- **Pays** : le Maroc figure dans la liste publiée, « Effective November 12, 2026 » ; liste applicable avant cette date : non lue ([Pays], R).
- **Politique d'usage**, en vigueur le 2026-11-12 : « Education and credentials » est à haut risque ; revue par un humain qualifié avant décision, information que l'IA a servi ([AUP], E). Champ exact à confirmer.
- **Mineurs** (moins de 18 ans) : vérification d'âge, modération, signalement, mention de l'IA, pour qui laisse des mineurs utiliser directement un produit qui intègre l'API ([Mineurs], R). L'élève utilise le produit sans dialoguer avec le modèle : règle tenue pour applicable tant qu'un juriste ne l'a pas écartée. Élèves de 18 ans [D], QNF-1 ouvert.
- **Loi 09-08** : transfert vers les États-Unis et conservation, à confirmer par la CNDP ou un juriste. Sous-traitants d'Anthropic : à définir.

## 3. Crédit, paliers, limites, erreurs

- **Crédit Max 5x** : 100 $ par mois, perdu sans report à la fin de chaque cycle ; réclamé sur claude.ai (Settings > Billing > API credits), lié à une organisation, que seul le support peut changer ; partagé par toutes les clés et tous les espaces ; couvre l'API, pas Claude Code ; aucun moyen de paiement exigé ; la recharge automatique ne porte que sur un solde acheté ([API credits], L).
- **Épuisement** : requêtes arrêtées, rien de facturé ; message « Your credit balance is too low… » ([API credits], L) ; **code HTTP non documenté**, 400 selon des tiers ([#867], S).
- **Paliers** : Evaluation, Start, Build, Scale, Custom ; au moins Start pour une organisation liée à un abonnement ([API credits], L). Haiku 5.5 au palier Start : 1 000 requêtes, 2M tokens d'entrée et 400K de sortie par minute ([Rate limits], L).
- **Plafond du palier** : « $500 tier limit » est celui de Start, remis à zéro le 1er à 00:00 UTC ; atteint : 429 `rate_limit_error`, `error_code` `enforced_spend_limit_reached`, sans `retry-after` ([Rate limits], L).
- **Limite de l'utilisateur** : par organisation ou par espace, avec alertes, impossible sur l'espace Default ; atteinte : **400 documenté** (`invalid_request_error`), message qui commence par « You have reached your specified API usage limits » (ou « …workspace API usage limits ») ([Rate limits], [Workspaces], L).
- **Clés** : expiration choisie à la création, non modifiable (expirée : 401) ; compte de service conseillé pour un usage automatisé ; `x-api-key` hérité, encore pris en charge ; une clé non limitée à un espace exige l'en-tête `anthropic-workspace-id` (sinon 400) ; un compte de service a accès à l'espace Default et aux espaces où il est ajouté ([Authentication], E). Claude Code utilise une `ANTHROPIC_API_KEY` de l'environnement à la place de l'abonnement ([Claude Code env], E).
- **Erreurs** : 400, 401, 402 `billing_error`, 403, 404, 409 `conflict_error`, 413 (renvoyé par Cloudflare avant l'API), 429, 500, 504 `timeout_error`, 529 `overloaded_error` ; corps `{type:"error", error:{type, message}, request_id}`, en-tête `request-id` ; `retry-after` et `anthropic-ratelimit-*` ; plafond du palier : `error.details.error_code` = `enforced_spend_limit_reached` ; un SDK non-streaming refuse localement un `max_tokens` dont la durée prévue dépasse 10 min ([Errors], [Rate limits], L, relus le 2026-10-19).
- **`inference_geo`** : une valeur hors de `allowed_inference_geos` de l'espace « returns an error », statut non dit ; limites de débit partagées entre `us` et `global` ; ×1,1 sur toutes les catégories de tokens ([Data residency], L).

## 4. Lots, cache, comptage, API Models

- **Lots** : -50 % ; résultats gardés 29 jours, hors ZDR ; sortie structurée acceptée ([Batch], E).
- **Cache** : 512 tokens au moins ; 5 min ou 1 h ; lecture ×0,1 ; changer l'effort ou la réflexion l'invalide ([Prompt caching], R).
- **`count_tokens`** : gratuit, une estimation ([Token counting], L). **API Models** : `capabilities` de chaque modèle ([Models API], L).
- **Pas maintenant** : un essai complet coûte quelques centimes (§7) ; le cache rapporterait ~0,0001 $ par copie ; les lots gardent les données 29 jours ; l'`usage` des appels réels suffit à compter. Files API et Citations : stockage hors de notre contrôle (DON-01) ; Citations incompatible avec la sortie structurée.

## 5. Audit du SDK `@anthropic-ai/sdk` 0.135.0

Code lu au tag [`sdk-v0.135.0`][SDK] (chemins sous `src/` ; sans fichier nommé, lignes de [client.ts]), sans rien exécuter : E, sauf S. Publié le 2026-10-15, au lendemain de 0.134.0 : d'où la version exacte.

- **Variables** : `ANTHROPIC_BASE_URL`, `_API_KEY`, `_AUTH_TOKEN`, `_WEBHOOK_SIGNING_KEY`, `_LOG` ne sont lues que si l'option manque (L883-929), d'où `baseURL`, `apiKey`, `authToken: null`, `webhookKey: null`, `logLevel: "off"` ; sans `authToken: null`, `ANTHROPIC_AUTH_TOKEN` ajoute `Authorization: Bearer` à la clé (L1217, L1227). Les 4 `ANTHROPIC_OPEN_TELEMETRY*` (le mode `content` met les requêtes dans les traces) cèdent à `openTelemetry: false` (`internal/tracing.ts` L177-227). Profil et fédération (`ANTHROPIC_PROFILE`, `HOME`, `APPDATA`…) ne sont lus que sans clé (L975-990). **`ANTHROPIC_CUSTOM_HEADERS` est toujours lue** (L941-951), après l'authentification (L1926) : elle peut remplacer `X-Api-Key`, et aucune option ne l'évite.
- **Relances** : 2 par défaut (L931) ; sur `x-should-retry: true` (même un 4xx), 408, 409, 429, ≥ 500 (L1766-1782), erreur de connexion, délai avant les en-têtes ; `retry-after` honoré jusqu'à ~24,8 jours (L1797-1821).
- **Délai** : 600 000 ms par défaut (L2001), qui **s'arrête aux en-têtes** (L1672-1683) : la lecture du corps n'est bornée que par le `signal` (`internal/parse.ts` L51).
- **Journal** : `warn` sur `console` par défaut (L923) ; `debug` écrit les corps de requête et de réponse (L1724-1730, `internal/parse.ts` L66-72) ; `logLevel: "off"` rend le logger muet (`internal/utils/log.ts` L46-53) ; seule exception, un `console.warn` direct, hors logger, nomme un modèle déprécié (`resources/messages/messages.ts` L82-97).
- **En-têtes** (L1914-1930) : `Accept`, `User-Agent`, 8 `X-Stainless-*` (OS, architecture, version de Node…), `anthropic-version: 2023-06-01` (exigé), `X-Api-Key` (L1224), `content-type`, `traceparent` avec OpenTelemetry ; `defaultHeaders: {nom: null}` en retire un (`internal/headers.ts` L124-126).
- **`fetch` injecté** : appelé en `(url, init)` avec l'`init` définitif (L1676-1679), d'où `(url, init) => fetcher(new Request(url, init))`, que le test capture. Sans lui, le `fetch` global est figé à la construction (`internal/shims.ts` L11-14) et échappe à la garde réseau. `fetchOptions` est fusionné dans l'`init` (L1894-1895) : on y met `cache: "no-store"` [P] ; le journal s'y écrit avant chaque requête.
- **S** : une exception du `fetch` devient une `APIConnectionError` ; un échec du journal serait relancé comme `unavailable` (à remonter en erreur interne, test en E5.13). undici ajoute ses en-têtes sur le fil ; le test capture la `Request`.
- **Sortie structurée** : `messages.parse` lève une erreur sur un refus ou une troncature (`lib/parser.ts` L114-122), avec un message qui peut porter un extrait du texte (S) ; `zodOutputFormat` retire `enum`, `const` et les contraintes non prises en charge du schéma envoyé (`lib/transform-json-schema.ts` L114-123). D'où `messages.create` avec `OUTPUT_SCHEMA` tel quel ; `output.ts` reste seul validateur.
- **Erreurs** (`core/error.ts`) : une classe par statut, 402 en `APIError` générique (L110-160) ; champs `status`, `type`, `requestID` (L11-37) ; **le message contient le corps de l'erreur** (L40-58).
- **Paquet** : 14,6 Mo, 3 dépendances dont `@opentelemetry/api` ([npm SDK]) ; Node 20+ (`README.md` L37-47) ; absent des [server-external-packages] de Next 16.4, donc empaqueté, non vérifié avant E6.1.

**Construction durcie proposée [P]** :

```ts
new Anthropic({
  apiKey, authToken: null, webhookKey: null, baseURL: "https://api.anthropic.com",
  maxRetries: 0, timeout: callTimeoutMs, logLevel: "off", logger: SILENT, openTelemetry: false,
  fetch: guardedFetch, // globalThis.fetch lu à l'appel ; seul POST /v1/messages ; 4 en-têtes
                       // (x-api-key, anthropic-version, content-type, accept) ; journal avant envoi
  fetchOptions: { cache: "no-store" },
  defaultHeaders: { "User-Agent": null /* et les 8 X-Stainless-* */ },
});
// par appel : untilDeadline(client.messages.create(body, { signal, maxRetries: 0 }), deadline)
```

Jamais `profile`, `config`, `credentials`, `middleware`, ni `messages.parse`. Erreurs : ne garder que `status`, `type`, `requestID` filtrés et `retry-after`. **Refus au démarrage** : `ANTHROPIC_CUSTOM_HEADERS` (obligatoire), toute autre `ANTHROPIC_*` par cohérence, et `NODE_DEBUG`. À chaque montée de version : relire le diff, rejouer les tests de garanties, vérifier l'en-tête d'authentification (E10).

## 6. Agents et frameworks

| Option (registre npm, 2026-10-19) | Apport | Écartée parce que | Conf. |
|---|---|---|---|
| LangChain.js, LangGraph.js (`@langchain/anthropic` 1.5.12) | multi-prestataire, graphes, traces | traçage LangSmith par variables d'environnement ([LangSmith]) ; textes persistés avec un checkpointer ; SDK `^0.122.0`, en retard | E, R |
| Vercel AI SDK (`ai` 7.0.143) | interface commune | passerelle Vercel par défaut pour un identifiant en chaîne ([AI SDK fournisseur]) ; télémétrie active dès qu'une intégration est enregistrée, entrées et sorties comprises ([AI SDK télémétrie]) | E |
| Mastra (`@mastra/core` 1.78.0) | agents, mémoire, workflows | 144 paquets compromis le 2026-06-17 ([THN]) ; doublon de Workflows | R (résumé seulement) |
| Claude Agent SDK (0.3.303) | boucle d'agent | outils Bash, Write, WebFetch ([Agent SDK]) : outil du développeur | E |
| Claude Managed Agents (bêta) | boucle hébergée | état hors de notre base (PRC-01), hors ZDR ([Data retention]) | E |
| **Retenu** : SDK et code du projet, Vercel Workflows en E6 | types, `stop_reason`, `usage` | lectures et relances neutralisées (§5) ; Workflows enregistre entrées et sorties de chaque étape ([Workflows]) : identifiants seulement | E |

« Lit l'environnement, relance seul » vaut aussi pour le SDK : ce critère ne départage pas. Ce qui départage : un framework ajoute au-dessus du SDK une couche sans valeur ici ; son apport, le multi-prestataire, `Evaluator` le donne déjà ; ses traces contrediraient DON-05.

| Forme | Missions candidates |
|---|---|
| Appel | évaluation des 5 critères, 1 par copie (pas d'appel par critère ; vote k = 3 en E10, environ 3 fois le coût) ; transcription d'image, appel séparé (E9) ; drapeaux de l'appel : injection, langue, hors sujet |
| Code | citations (`quotes.ts`), alertes, note, gardes d'environnement et de dépense |
| Rien | second modèle ou boucle évaluateur-optimiseur (coût, EVL-03 R5) ; réécriture des remarques (invariant 7) ; assistant du professeur (texte libre hors liste blanche) |

**Référence** : [Building effective agents] (E) : commencer simple, avec les API ; workflows avant agents ; les frameworks peuvent masquer prompts et réponses. La grille « Should I build an agent? » vient d'un exposé connu par des résumés de tiers : ce n'est pas une source d'Anthropic.

## 7. Taille et coût par copie (S)

Consigne `evaluation-1` reconstruite et comptée localement (caractères / 4, +30 %) : système ~1 500 tokens (4 583 caractères, rubrique comprise) ; schéma ~600 à 760 (facturation non vérifiée) ; texte typique ~205, maximal ~3 300 ; sortie ~950 (2 894 caractères en moyenne sur 4 réponses du 2026-10-17), plus la réflexion si elle est active.

- Sans réflexion : **~0,0007 $** par copie (0,0008 $ avec ×1,1 pour `us`) ; avec réflexion (+1 000 à 3 000 tokens, supposé) : **0,0012 à 0,0022 $** ; pire cas (texte maximal, `max_tokens` 3 000, 3 tentatives) : ~0,007 $.
- 100 $ ≈ 40 000 à 130 000 copies ; l'essai d'E5.16 (~60 appels) ≈ 0,05 à 0,15 $.
- Valeurs réelles à mesurer en E5.16, par l'`usage` des réponses.

## 8. Relevés de la Console, non vérifié

- **Console**, relevée par l'utilisateur le 2026-10-19 :
  - palier Start ; `claude-haiku-5-5` : 1 000 requêtes, 2 M tokens d'entrée et 400 K de sortie par minute ; plafond du palier 500 $ par mois ;
  - **crédit promotionnel** de 100 $, accordé le 2026-10-17, qui expire le 2026-11-12 (UTC) ; aucun moyen de paiement. Écart avec le [D] « crédit mensuel, sans report » : non tranché ; renouvellement après le 2026-11-12 non observé, à relever alors ; E5.15 et E5.16 se font avant cette date ;
  - espace `grading_system` limité à 10 $ par mois (remise à zéro le 1er), alertes à 5 et 8 $, limites de débit de l'organisation ;
  - `inference_geo` autorisé : `us` seulement, défaut `us` ; région de l'espace : United States ;
  - conservation de l'organisation : « On · 30 days », pas de ZDR ;
  - programme partenaire non rejoint ; retours des utilisateurs désactivés.

  Reste à vérifier : conditions acceptées ; expiration de la clé : 2026-11-18, relevée le 2026-10-19 (clé limitée à `grading_system`, liée au compte du développeur).
- **Non vérifié** : code HTTP du crédit épuisé ; Commercial Terms et Supplemental Credit Terms appliqués à cet usage ; champ de « Education and credentials » et règles sur les mineurs, à confirmer par un juriste ; catégories de refus (4 ou 5, plus `null`) ; points S du §5 ; empaquetage par Next 16 ; latence ; piste d'un texte passé en `tool_result` contre l'injection (skill local, `model-migration.md` L2371) ; fidélité de la lecture manuscrite (E9.0).
- **Skill local `claude-api`** : il annonce des en-têtes `x-ratelimit-*` au lieu de `anthropic-ratelimit-*` (`shared/error-codes.md` L150-154).
- **Limites** : sans température, la stabilité se mesure, elle ne se règle pas ; des textes d'adultes ne représentent pas de vrais élèves ; un jeu adverse fini ne prouve rien ; l'IA plus la validation ne suppriment ni l'ancrage ni le halo ; recul de confidentialité par rapport à OpenRouter (§2) : le jeu adverse peut être signalé, donc gardé 2 ans.

## Liens

Définitions des liens cités plus haut (invisibles une fois le fichier rendu).

[Haiku 5.5]: https://platform.claude.com/docs/en/models/haiku-5-5/overview
[Migration]: https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide
[Prompting]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5
[Refusals]: https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback
[Pricing]: https://platform.claude.com/docs/en/about-claude/pricing
[Vision]: https://platform.claude.com/docs/en/build-with-claude/vision
[Structured outputs]: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
[Errors]: https://platform.claude.com/docs/en/api/errors
[Rate limits]: https://platform.claude.com/docs/en/api/rate-limits
[API credits]: https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers
[Workspaces]: https://platform.claude.com/docs/en/manage-claude/workspaces
[Authentication]: https://platform.claude.com/docs/en/manage-claude/authentication
[Data retention]: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
[Data residency]: https://platform.claude.com/docs/en/manage-claude/data-residency
[Batch]: https://platform.claude.com/docs/en/build-with-claude/batch-processing
[Prompt caching]: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
[Token counting]: https://platform.claude.com/docs/en/build-with-claude/token-counting
[Models API]: https://platform.claude.com/docs/en/api/models/list
[Conservation]: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
[Entraînement]: https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
[Commercial Terms]: https://www.anthropic.com/legal/commercial-terms
[Credit Terms]: https://www.anthropic.com/legal/credit-terms
[AUP]: https://www.anthropic.com/legal/aup
[Mineurs]: https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors
[Pays]: https://www.anthropic.com/supported-countries
[Claude Code env]: https://code.claude.com/docs/en/env-vars
[Agent SDK]: https://code.claude.com/docs/en/agent-sdk/overview
[Building effective agents]: https://www.anthropic.com/engineering/building-effective-agents
[SDK]: https://github.com/anthropics/anthropic-sdk-typescript/tree/sdk-v0.135.0
[client.ts]: https://github.com/anthropics/anthropic-sdk-typescript/blob/sdk-v0.135.0/src/client.ts
[npm SDK]: https://registry.npmjs.org/@anthropic-ai/sdk/latest
[server-external-packages]: https://github.com/vercel/next.js/blob/v16.4.0/packages/next/src/lib/server-external-packages.jsonc
[#867]: https://github.com/anthropics/claude-code/issues/867
[LangSmith]: https://docs.langchain.com/langsmith/trace-with-langchain
[AI SDK fournisseur]: https://ai-sdk.dev/docs/getting-started/choosing-a-provider
[AI SDK télémétrie]: https://ai-sdk.dev/docs/ai-sdk-core/telemetry
[THN]: https://thehackernews.com/2026/06/144-mastra-npm-packages-compromised-via.html
[Workflows]: https://vercel.com/docs/workflows
