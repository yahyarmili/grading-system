# Stack technologique

> Étape 7 de la démarche d'ingénierie. Statut : **validé** par l'utilisateur le 2026-10-12 (pile et stockage des images dans la base).
> Fait suite à [problematique.md](problematique.md), [solution.md](solution.md), [fonctionnalites.md](fonctionnalites.md), [besoins-non-fonctionnels.md](besoins-non-fonctionnels.md) et [acteurs.md](acteurs.md). Ce document ne les modifie pas.

**En bref.** Une application TypeScript sur Next.js, hébergée chez Vercel, avec PostgreSQL chez Neon et l'API d'Anthropic (`claude-haiku-5-5`) comme IA (Mistral jusqu'au 2026-10-16, OpenRouter jusqu'au 2026-10-19), le tout à 0 MAD décaissé pour une démonstration. Trois limites pèsent sur la conception : 4,5 Mo par requête, 1 Go de base, et le crédit API mensuel de votre abonnement Max (100 $, sans report), qui paie l'IA [D, 2026-10-19]. **[D]** = votre décision ; **[P]** = proposition à valider.

---

## 1. Cadre [D]

Projet académique d'un collègue, qui joue le rôle du « client ». Vous êtes le seul développeur. Budget strictement de 0 MAD décaissé : depuis le 2026-10-19 [D], l'IA est payée par le crédit API mensuel de votre abonnement Max (100 $ par mois, sans report, perdu à la fin de chaque cycle), sans moyen de paiement dans la Console. Cela vaut pendant le projet ; ensuite, la clé du client (coût par copie à mesurer en E5.16), sinon le simulateur ou l'évaluation manuelle (REV-06). Remplace « LLM gratuit en V1 » (QNF-5). Démonstration avec des acteurs de simulation et des données fictives, sans vrais élèves.

## 2. Pile retenue

| Domaine | Choix | Origine | Exigences servies |
|---|---|---|---|
| Interface | TypeScript, Next.js, Tailwind CSS, GSAP | [D] vos préférences | USA-01, USA-03 |
| Base de données | PostgreSQL avec Drizzle ORM, chez Neon (offre gratuite) | PostgreSQL et Drizzle [D] ; Neon proposé, validé | FIA-01 |
| Hébergement | Vercel, plan Hobby | Proposé, validé | — |
| Traitement par lots | Vercel Workflows | Proposé, validé | TRT-01, PRC-01, PRC-02 |
| IA | API d'Anthropic en direct, modèle `claude-haiku-5-5`, inférence aux États-Unis (`inference_geo: "us"`), appelée par le SDK officiel `@anthropic-ai/sdk` 0.135.0 en version exacte, durci et importé par un seul fichier. Lecture de l'écriture : Haiku (vision), derrière une interface distincte, essai en E9.0. | Anthropic, modèle, `inference_geo` et SDK durci [D, 2026-10-19], remplacent OpenRouter [D, 2026-10-16], qui remplaçait Mistral [D, 2026-10-12] ; lecture de l'écriture : [P], essai en E9.0 | EVL-02, QUA-02, EXP-04 |
| Email | Gmail SMTP (mot de passe d'application) pour la démonstration | Proposé, validé | AUTH-01, 03, 05 |
| Images | Dans PostgreSQL, table séparée | [D] 2026-10-12 | SEC-01, DON-01 |
| Sauvegarde | Export périodique de la base, à concevoir | [P] | FIA-02 (documentée seulement) |
| Développement local | Docker Desktop et Docker Compose : Node 24 en conteneur, aucun Node installé sur le poste | [D] 2026-10-12 | — |

## 3. Ce que ces choix impliquent

- **Images dans la base.** Neon gratuit : 1 Go par projet, écritures bloquées au-delà ([Neon](https://neon.com/pricing)). Une fonction Vercel accepte 4,5 Mo au plus en requête et en réponse ([Vercel](https://vercel.com/docs/functions/limitations)). Conséquences [P] : chaque page est réduite dans le navigateur avant l'envoi, une page par requête ; la photo reste « sans retouche » du point de vue de l'élève (USA-01). Il faut garder assez de résolution pour lire l'écriture, ce qui se vérifie en E9. Formats, poids et nombre de pages : à définir (TRT-02), pour tenir dans 1 Go. Supprimer les images à la fin de la revue (DON-01) libère la place.
- **Lots.** Workflows reprend après un plantage et relance les étapes en échec ([Vercel](https://vercel.com/docs/workflows)). Hobby inclut 50 000 événements par mois, une étape normale en produit 3, plus 1 par nouvelle tentative, et 1 Go de données écrites par mois ; l'état d'un traitement n'est conservé qu'un jour après sa fin ([tarifs](https://vercel.com/docs/workflows/pricing)). Le nombre d'étapes par copie est inconnu : à mesurer en E6. Le SDK multi-région est en bêta.
- **Anthropic [D, 2026-10-19], à la place d'OpenRouter.** Avec OpenRouter, CA3 (EVL-03) n'était pas mesurable : le 2026-10-17, 27 appels sur 34 ont dépassé 60 s et 14 réponses `429` ont dû être relancées ([essai](annexe-essais-ia.md)) ; le quota de 50 requêtes par jour bornait en outre tout essai. L'API est appelée en direct (`https://api.anthropic.com/v1/messages`). Faits datés, confiance de chaque source, audit du SDK et options écartées : [annexe-ia-anthropic.md](annexe-ia-anthropic.md).
- **Architecture [D, 2026-10-19]** : une chaîne fixe d'appels spécialisés, une mission par appel (l'évaluation ; plus tard la lecture des images), orchestrée par le code (commande en E5, Vercel Workflows en E6) avec des portes déterministes. Ni agent autonome, ni framework : LangChain/LangGraph, Vercel AI SDK, Mastra, Claude Agent SDK et Managed Agents sont écartés.
- **Modèle [D, 2026-10-19]** : `claude-haiku-5-5`, sorti le 2026-10-07 ([fiche](https://platform.claude.com/docs/en/models/haiku-5-5/overview)). 0,10 $ en entrée et 0,50 $ en sortie par million de tokens, cache lu 0,01 $ et écrit (5 min) 0,125 $, au-delà de 100 K tokens de prompt 0,50 et 2,50 $, ×1,1 avec `inference_geo: "us"` ([prix](https://platform.claude.com/docs/en/about-claude/pricing), lus le 2026-10-19 en E5.11 ; repris dans `src/server/evaluation/prices.ts`) ; coût par copie mesuré en E5.16 : environ 0,0011 $ ([essai](annexe-essais-ia.md)). Texte et images ([vision](https://platform.claude.com/docs/en/build-with-claude/vision) ; bornes : [annexe](annexe-ia-anthropic.md) §1). Une `temperature` différente de 1 donne un 400 ([migration](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide)) : la stabilité se mesure, elle ne se règle pas.
- **Client [D, 2026-10-19]** : le SDK officiel `@anthropic-ai/sdk` 0.135.0 (version lue le 2026-10-19), en version exacte, importé par le seul `src/server/ai/anthropic.ts` ; la règle « `fetch` sans bibliothèque » [P, E5.4b] est levée. Il est durci par des options explicites (liste [P], fixée au plan d'E5.11 : [annexe-ia-anthropic.md](annexe-ia-anthropic.md) §5) et par le refus de variables d'environnement au démarrage : `NODE_DEBUG` et toute variable `ANTHROPIC_*` [P], car `ANTHROPIC_CUSTOM_HEADERS` est lue quelles que soient les options. Clé [P] : `GRADING_ANTHROPIC_API_KEY`, jamais `ANTHROPIC_API_KEY`, que Claude Code utiliserait à la place de l'abonnement ([doc](https://code.claude.com/docs/en/env-vars)).
- **Crédit, palier et limites de dépense** ([crédits](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers), [limites](https://platform.claude.com/docs/en/api/rate-limits)) :
  - crédit : 100 $ par mois (Max 5x), sans report, lié à une organisation, que seul le support peut changer, et partagé par toutes ses clés ; épuisé, les requêtes s'arrêtent jusqu'au cycle suivant, sans rien facturer (détail : [annexe](annexe-ia-anthropic.md) §3). Console (relevée par vous le 2026-10-19) : un **crédit promotionnel** de 100 $, accordé le 2026-10-17, qui expire le 2026-11-12 (UTC), sans moyen de paiement ; écart avec « par mois, sans report », non tranché ; renouvellement à relever après cette date ;
  - palier : au moins Start pour une organisation liée à un abonnement. Console (2026-10-19) : Start ; `claude-haiku-5-5` à 1 000 requêtes, 2 M tokens d'entrée et 400 K de sortie par minute ; plafond de 500 $ par mois ;
  - limite de dépense fixée par vous : impossible sur l'espace Default ([espaces](https://platform.claude.com/docs/en/manage-claude/workspaces)). Console (2026-10-19) : espace `grading_system` limité à 10 $ par mois (remise à zéro le 1er), alertes à 5 et 8 $, limites de débit de l'organisation. [P] : garde des commandes à 200 requêtes par jour UTC.

  Le lot de 100 copies (NFR-TRT-01) n'est plus borné par le prestataire, mais par Workflows Hobby et Neon.
- **Valeurs [P] de la reprise**, consignées après E5.16 (2026-10-19), dans `src/config/provisional.ts` :
  - génération (`evaluation-2`) : effort `low`, réflexion adaptative (`display: "omitted"`), `max_tokens` 4 000 ; E5.16 : sortie au plus 2 073 tokens ;
  - délai par appel 120 s ; E5.16 : au plus 11,3 s, médiane 7,4 s ; **proposé pour E6, non appliqué : 60 s** (3 tentatives de 60 s et 2 attentes de 30 s font 240 s, sous les 300 s de Vercel) ;
  - 3 tentatives, attente de 2 s, `Retry-After` honoré jusqu'à 30 s ; remise libérée en échec après 12 min en « en cours » (dérivé, E5.9) ;
  - garde des commandes à 200 requêtes par jour UTC, essai de connexion compris ; pause de 1 s entre deux appels d'essai ;
  - écart adverse permis : 1 niveau ; E5.16 : dépassé une fois sur 21 (a03, écart 2), suites proposées dans [l'essai](annexe-essais-ia.md) ;
  - `refused` jamais relancé ; budget (limite de dépense, plafond du palier, crédit) classé `configuration`, jamais relancé ; clé `GRADING_ANTHROPIC_API_KEY`.
- **Mesures d'E5.16** (2026-10-19, [essai](annexe-essais-ia.md)) : 60 appels, 60 propositions conformes, aucun refus (jeu sensible compris) ; coût estimé 0,065 $, soit environ 0,0011 $ par copie ; Console : 0,07 $ dépensés, crédit 99,94 $.
- **Fiche DON-02 d'Anthropic**, lue le 2026-10-19 (« résumé » : page lue en résumé seulement) :
  - **conditions** : une organisation de la Console relève des [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) (résumé), ses crédits des [Supplemental Credit Terms](https://www.anthropic.com/legal/credit-terms) ; que l'API payée par le crédit Max relève des premières est une déduction, à vérifier ;
  - **entraînement** : aucun sur les données de l'API par défaut, sauf retour envoyé ou accord explicite ([entraînement](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training), résumé) ;
  - **conservation** : entrées et sorties supprimées sous 30 jours ([conservation](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), résumé), formulée autrement dans la [doc Platform](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) ; Console (2026-10-19) : « On · 30 days », pas de ZDR ; programme partenaire non rejoint, retours des utilisateurs désactivés. Exceptions : contenu signalé par les systèmes de sécurité jusqu'à 2 ans, et ses scores de classification 7 ans ; retours (pouce) 5 ans ;
  - **plus de ZDR**, recul par rapport à OpenRouter (endpoint Phala listé ZDR) : il demande un accord commercial ([doc Platform](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)) ; le jeu adverse peut déclencher la conservation de 2 ans d'un contenu signalé. Le schéma de la sortie structurée, fixe et sans donnée d'élève, est gardé 24 h ([doc Platform](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), extraits) ;
  - **lieu** : `inference_geo: "us"` [D, 2026-10-19] ; la région d'un espace ne peut valoir que `us`, donc le stockage au repos est aux États-Unis ([résidence](https://platform.claude.com/docs/en/manage-claude/data-residency)). Console (2026-10-19) : `inference_geo` autorisé `us` seulement, défaut `us`, région de l'espace United States ;
  - **sous-traitants** : à définir ;
  - **transfert hors du Maroc**, vers les États-Unis : à confirmer par la CNDP ou un juriste ;
  - **politique d'usage** ([AUP](https://www.anthropic.com/legal/aup), par extraits) : catégorie à haut risque « Education and credentials », en vigueur le 2026-11-12 (version applicable avant cette date : non lue), qui exige un humain qualifié dans la boucle et l'information sur l'usage de l'IA. Y répondent D6 (le professeur valide, puis publie), l'invariant 7 (publiée implique validée) et Q5 (mention de l'IA). Les règles sur les mineurs visent les produits que des mineurs utilisent directement ([article](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors), résumé) : élèves de 18 ans [D], QNF-1 ouvert. Champ de la catégorie et de ces règles : à confirmer par un juriste.

  D'où, toujours, des données fictives : aucune copie réelle avant que le client ait validé cette fiche. Notice élève v4, texte seul : approuvée par l'utilisateur [D, 2026-10-19].
- **Sortie structurée** : disponible (GA) par `output_config.format` (`json_schema`). Elle garantit la forme ; ni `minimum`/`maximum` ni `minLength` ne sont acceptés, donc le validateur côté serveur (E5.5) garde le fond ([sortie structurée](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), résumé).
- **Stabilité (QUA-02) [D, 2026-10-19]** : identifiant fixe, sans date ni alias ; retrait pas avant le 2027-10-07, engagement minimal publié ([fiche](https://platform.claude.com/docs/en/models/haiku-5-5/overview)) ; modèle qui a répondu enregistré avec chaque résultat. Remplace le critère « identifiant daté » d'E5.0. La fidélité de lecture de l'écriture manuscrite n'est pas vérifiée de façon indépendante : à mesurer en E9.0 et E9.
- **Erreurs** ([erreurs](https://platform.claude.com/docs/en/api/errors)) :
  - codes et corps : [annexe-ia-anthropic.md](annexe-ia-anthropic.md) §3 ;
  - budget : limite de dépense atteinte, 400 ; plafond du palier, 429 `enforced_spend_limit_reached` sans `retry-after` ([limites](https://platform.claude.com/docs/en/api/rate-limits)) ; crédit épuisé, code non documenté (400 probable, [source tierce](https://github.com/anthropics/claude-code/issues/867)). [P] : `configuration` en E5, donc échec final sans relance ; « IA indisponible » en E6 ;
  - refus : réponse 200 avec `stop_reason: "refusal"` et une catégorie (nommée, ou `null`), sans repli côté serveur ; la même requête est en général refusée à nouveau ([refus](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback)). [P] : valeur `refused`, jamais relancée automatiquement ;
  - le SDK met le corps de l'erreur dans `error.message` : on ne garde que le statut, le type et le `request_id`.
- **Vercel Hobby.** Gratuit, fonctions de 300 s au plus ([limites](https://vercel.com/docs/functions/limitations#max-duration)). Usage réservé au non commercial ([règles](https://vercel.com/docs/limits/fair-use-guidelines)), compatible avec un projet académique. Un projet payant ou commercial exigerait le plan Pro.
- **Neon.** Compute suspendu après 5 minutes d'inactivité, donc démarrage à froid à prévoir. Historique de restauration de 6 h seulement : d'où l'export périodique.
- **Gmail SMTP.** Environ 500 destinataires par jour selon des blogs ([source secondaire](https://serversmtp.com/limits-of-gmail-smtp-server/)), validation en deux étapes requise. Suffisant pour la démonstration, pas pour un usage réel. Resend exige un domaine à vous ([doc](https://resend.com/docs/dashboard/domains/introduction)).
- **Docker.** Sert seulement au développement (`docker compose up`, puis `http://localhost:3000`) ; les commandes npm se lancent dans le conteneur. La production reste sur Vercel, sans image Docker déployée.
- **Hors du Maroc.** Vercel, Neon et Anthropic sont hors du Maroc ; Anthropic traite et stocke aux États-Unis (fiche DON-02 ci-dessus). Sans objet pour des données fictives. Pour un usage réel, le transfert demande l'autorisation de la CNDP, à confirmer par la CNDP ou un juriste.
- **Historique, Mistral (2026-10-12 au 2026-10-16).** Abandonné : l'organisation était sur l'offre Free, dont les clés d'API ne sont pas activées (chaque appel répondait `429`, constaté le 2026-10-16). Relevés et réglages du 2026-10-15 (limites, refus d'entraînement, modèle `mistral-medium-3-5`) : §3 au commit `a7aaf44`.
- **Historique, OpenRouter (2026-10-16 au 2026-10-19).** Modèle gratuit `xingchen-agi/xing4.0-29b-a4b:free` (endpoint Phala, listé ZDR), appelé par `fetch` sans bibliothèque, à 50 requêtes par jour. Limites, politiques des fournisseurs, sortie structurée, erreurs et lieu de traitement : §3 au commit `85b60c4`.

## 4. Règles d'architecture qui en découlent [P]

1. Le contrôle d'accès de la matrice 5.4 s'applique dans la couche d'accès aux données, en un point unique, et pas seulement dans un middleware (SEC-01).
2. Les images sont dans une table à part, lues par une seule route qui applique la matrice. Jamais de lien public, jamais dans les listes (SEC-01, TRT-03).
3. L'évaluation par l'IA, la lecture de l'écriture et l'email passent chacun par une interface unique, avec un simulateur à pannes injectables pour les tests (EXP-04).
4. Les étapes d'un lot sont idempotentes et ne portent que des identifiants, jamais les images (PRC-01) ; les résultats sont écrits dans la base du projet.
5. La requête vers l'IA est construite en un point unique, depuis une liste blanche de champs (EVL-02).

## 5. Reste à choisir ou à vérifier

**Tranché le 2026-10-12 [D]** (à confirmer dans le plan de chaque étape, voir [prompts-implementation.md](prompts-implementation.md)) : Better Auth pour l'authentification et les sessions, Zod pour la validation, Vitest et Playwright pour les tests, Nodemailer pour l'email. Interface de l'application en anglais.

**Remplacés [D]** : Mistral et son SDK par OpenRouter, appelé par `fetch` sans bibliothèque (2026-10-16 ; `fetch` [P, E5.4b, 2026-10-17]) ; puis OpenRouter par Anthropic (`claude-haiku-5-5`) et le SDK officiel durci, la règle « `fetch` sans bibliothèque » levée (2026-10-19, §3).

**À vérifier :**
- relevés de la Console : faits le 2026-10-19 (§3) ; restent les conditions acceptées, l'expiration de la clé (E5.15) et le crédit après le 2026-11-12 ;
- code HTTP à l'épuisement du crédit (non documenté) ;
- conditions : Commercial Terms appliquées à l'API payée par le crédit, usage permis par les Supplemental Credit Terms, champ de l'AUP ;
- empaquetage du SDK par Next 16 : vérifié en E6.1, puis sur la preview ;
- si Vercel exige une carte à l'inscription ;
- région de la base Neon ;
- limites de poids et de pages des images (TRT-02) ;
- événements par copie (E6) ;
- lisibilité d'une photo réduite (E9.0, puis E9).

Les pages officielles ont été lues par extraction. Les chiffres de Gmail SMTP viennent de blogs, pas de Google. Pour Anthropic (2026-10-19), la confiance de chaque fait (lu en entier, par extraits ou en résumé seulement) est dans [annexe-ia-anthropic.md](annexe-ia-anthropic.md) ; la Console a été relevée par vous le 2026-10-19, pas par moi. Pour OpenRouter : §3 au commit `85b60c4`.
