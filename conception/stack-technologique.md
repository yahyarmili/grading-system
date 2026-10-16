# Stack technologique

> Étape 7 de la démarche d'ingénierie. Statut : **validé** par l'utilisateur le 2026-10-12 (pile et stockage des images dans la base).
> Fait suite à [problematique.md](problematique.md), [solution.md](solution.md), [fonctionnalites.md](fonctionnalites.md), [besoins-non-fonctionnels.md](besoins-non-fonctionnels.md) et [acteurs.md](acteurs.md). Ce document ne les modifie pas.

**En bref.** Une application TypeScript sur Next.js, hébergée chez Vercel, avec PostgreSQL chez Neon et un modèle gratuit d'OpenRouter comme IA (Mistral jusqu'au 2026-10-16), le tout à 0 MAD pour une démonstration. Trois limites pèsent sur la conception : 4,5 Mo par requête, 1 Go de base, et 50 requêtes par jour sur les modèles gratuits d'OpenRouter. **[D]** = votre décision ; **[P]** = proposition à valider.

---

## 1. Cadre [D]

Projet académique d'un collègue, qui joue le rôle du « client ». Vous êtes le seul développeur. Budget strictement de 0 MAD. Démonstration avec des acteurs de simulation et des données fictives, sans vrais élèves.

## 2. Pile retenue

| Domaine | Choix | Origine | Exigences servies |
|---|---|---|---|
| Interface | TypeScript, Next.js, Tailwind CSS, GSAP | [D] vos préférences | USA-01, USA-03 |
| Base de données | PostgreSQL avec Drizzle ORM, chez Neon (offre gratuite) | PostgreSQL et Drizzle [D] ; Neon proposé, validé | FIA-01 |
| Hébergement | Vercel, plan Hobby | Proposé, validé | — |
| Traitement par lots | Vercel Workflows | Proposé, validé | TRT-01, PRC-01, PRC-02 |
| IA | OpenRouter, modèle gratuit (identifiant en `:free`), à choisir. Lecture de l'écriture par un modèle multimodal gratuit, à essayer en E5.8. | OpenRouter [D, 2026-10-16], remplace Mistral [D, 2026-10-12] ; modèle : à définir ; lecture de l'écriture : [P], à comparer en E5.8 et E9.0 | EVL-02, QUA-02, EXP-04 |
| Email | Gmail SMTP (mot de passe d'application) pour la démonstration | Proposé, validé | AUTH-01, 03, 05 |
| Images | Dans PostgreSQL, table séparée | [D] 2026-10-12 | SEC-01, DON-01 |
| Sauvegarde | Export périodique de la base, à concevoir | [P] | FIA-02 (documentée seulement) |
| Développement local | Docker Desktop et Docker Compose : Node 24 en conteneur, aucun Node installé sur le poste | [D] 2026-10-12 | — |

## 3. Ce que ces choix impliquent

- **Images dans la base.** Neon gratuit : 1 Go par projet, écritures bloquées au-delà ([Neon](https://neon.com/pricing)). Une fonction Vercel accepte 4,5 Mo au plus en requête et en réponse ([Vercel](https://vercel.com/docs/functions/limitations)). Conséquences [P] : chaque page est réduite dans le navigateur avant l'envoi, une page par requête ; la photo reste « sans retouche » du point de vue de l'élève (USA-01). Il faut garder assez de résolution pour lire l'écriture, ce qui se vérifie en E9. Formats, poids et nombre de pages : à définir (TRT-02), pour tenir dans 1 Go. Supprimer les images à la fin de la revue (DON-01) libère la place.
- **Lots.** Workflows reprend après un plantage et relance les étapes en échec ([Vercel](https://vercel.com/docs/workflows)). Hobby inclut 50 000 événements par mois, une étape normale en produit 3, plus 1 par nouvelle tentative, et 1 Go de données écrites par mois ; l'état d'un traitement n'est conservé qu'un jour après sa fin ([tarifs](https://vercel.com/docs/workflows/pricing)). Le nombre d'étapes par copie est inconnu : à mesurer en E6. Le SDK multi-région est en bêta.
- **OpenRouter [D, 2026-10-16], à la place de Mistral.** L'organisation Mistral est sur l'offre Free, dont les clés d'API ne sont pas activées : bandeau « Upgrade to activate your API keys » de la console ; chaque appel répond `429`, avec `x-ratelimit-limit-req-minute: 0` (constaté le 2026-10-16). Les relevés et réglages Mistral du 2026-10-15 (limites, refus d'entraînement, modèle `mistral-medium-3-5` [D]) sont donc sans objet ; ils restent dans l'historique git de ce fichier (§3 au commit `a7aaf44`). OpenRouter relaie chaque requête à l'un des fournisseurs du modèle choisi, selon le routage ([sélection](https://openrouter.ai/docs/guides/routing/provider-selection)). Son API est compatible OpenAI (`https://openrouter.ai/api/v1`, [démarrage](https://openrouter.ai/docs/quickstart)). Modèle : à définir.
- **Limites des modèles gratuits** ([limites](https://openrouter.ai/docs/api_reference/limits)) :
  - 20 requêtes par minute ;
  - 50 par jour (jour UTC) tant que moins de 10 crédits (dollars) ont été achetés, 1 000 à partir de 10.

  À 0 MAD, c'est donc 50 requêtes par jour, tentatives comprises : un lot de 100 copies (NFR-TRT-01) demande au moins deux jours. Ce sont les plafonds d'OpenRouter ; le fournisseur peut limiter davantage. Plusieurs clés ou comptes ne changent rien. OpenRouter dit lui-même ces modèles « usually not suitable for production use » ([FAQ](https://openrouter.ai/docs/faq)).
- **Entraînement et conservation.**
  - **OpenRouter** ne stocke pas les prompts par défaut : les deux options qui le font sont désactivées par défaut. Il garde des métadonnées et échantillonne quelques prompts pour les classer ([collecte](https://openrouter.ai/docs/guides/privacy/data-collection)).
  - **Le fournisseur amont** peut entraîner ou conserver, selon sa politique. Le compte a un réglage séparé pour les modèles gratuits ; une requête peut aussi exiger `provider.data_collection: "deny"` ou `provider.zdr: true` ([fournisseurs](https://openrouter.ai/docs/guides/privacy/provider-logging), [sélection](https://openrouter.ai/docs/guides/routing/provider-selection), [ZDR](https://openrouter.ai/docs/guides/features/zdr)). OpenRouter présente ces étiquettes comme « our best knowledge », pas comme une garantie. Un endpoint de politique inconnue est traité comme s'il conservait et entraînait ([ZDR](https://openrouter.ai/docs/guides/features/zdr)).
  - **Publication.** Certains endpoints gratuits publient les prompts ; un réglage du compte et le garde-fou `enable_free_model_publication` l'interdisent ([garde-fous](https://openrouter.ai/docs/guides/features/guardrails)).
  - **Politiques par défaut des fournisseurs des modèles gratuits**, relevées le 2026-10-16 dans le tableau de la page [fournisseurs](https://openrouter.ai/docs/guides/privacy/provider-logging), chargé depuis un point d'API non documenté. C'est la politique du fournisseur, pas celle de l'endpoint :
    - entraînent : Nvidia, Liquid, Thinking Machines ;
    - conservent sans entraîner : Google AI Studio (55 jours), Cohere (30 jours), AtlasCloud, Poolside ;
    - ne conservent pas (ZDR) : Phala, qui sert `xing4.0-29b-a4b:free`.

  D'où, toujours, des données fictives. La notice élève v2 nomme Mistral AI et promet son refus d'entraînement : elle est à réécrire (v3) selon le modèle choisi.
- **Sortie structurée.** Elle est prise en charge endpoint par endpoint et peut changer ; `strict` n'est pas garanti partout ([sorties structurées](https://openrouter.ai/docs/guides/features/structured-outputs)). Sans `provider.require_parameters: true`, un paramètre non pris en charge peut être ignoré en silence ; la documentation se contredit sur ce point. La validation côté serveur (E5.5) reste donc indispensable. Le 2026-10-16, 5 des 16 modèles gratuits annoncent `structured_outputs` ([liste des modèles](https://openrouter.ai/api/v1/models)).
- **Stabilité.** La disponibilité des modèles gratuits « changes frequently » ([routeur gratuit](https://openrouter.ai/docs/guides/routing/routers/free-router)). Certains ont déjà une date de retrait (`expiration_date` ; Poolside au 2026-10-31), et aucun préavis n'est documenté. Le routeur `openrouter/free` tire un modèle au hasard : il est exclu (NFR-QUA-02) [P]. [P] Le modèle qui a répondu (champ `model` de la réponse) est enregistré avec chaque résultat, et le fournisseur aussi si l'API le donne : à vérifier en E5.4b, car la réponse documentée n'a pas de champ dédié. La précision de lecture de l'écriture manuscrite n'est pas vérifiée de façon indépendante : à mesurer en E5.8 et E9.
- **Erreurs.** Le corps est `{error: {code, message, metadata?}}`. Une erreur peut aussi arriver dans une réponse 200, et un 402 est possible même sur un modèle gratuit, si le solde est négatif ([erreurs](https://openrouter.ai/docs/api_reference/errors-and-debugging)). `Retry-After` n'est présent que si tous les fournisseurs essayés ont indiqué un délai ([limites](https://openrouter.ai/docs/api_reference/limits)).
- **Vercel Hobby.** Gratuit, fonctions de 300 s. Usage réservé au non commercial ([règles](https://vercel.com/docs/limits/fair-use-guidelines)), compatible avec un projet académique. Un projet payant ou commercial exigerait le plan Pro.
- **Neon.** Compute suspendu après 5 minutes d'inactivité, donc démarrage à froid à prévoir. Historique de restauration de 6 h seulement : d'où l'export périodique.
- **Gmail SMTP.** Environ 500 destinataires par jour selon des blogs ([source secondaire](https://serversmtp.com/limits-of-gmail-smtp-server/)), validation en deux étapes requise. Suffisant pour la démonstration, pas pour un usage réel. Resend exige un domaine à vous ([doc](https://resend.com/docs/dashboard/domains/introduction)).
- **Docker.** Sert seulement au développement (`docker compose up`, puis `http://localhost:3000`) ; les commandes npm se lancent dans le conteneur. La production reste sur Vercel, sans image Docker déployée.
- **Hors du Maroc.** Vercel, Neon et OpenRouter sont hors du Maroc. Le lieu de traitement des fournisseurs des modèles est inconnu, sauf pour Nvidia (centres de données aux États-Unis). Aucune garantie de lieu n'est documentée sur le domaine global d'OpenRouter : le [routage régional](https://openrouter.ai/docs/guides/features/in-region-routing) (UE, États-Unis) est réservé aux offres Business et Enterprise. La [politique de confidentialité](https://openrouter.ai/privacy), lue seulement en résumé, prévoit des transferts possibles vers les États-Unis ou d'autres pays hors de l'EEE et du Royaume-Uni. Sans objet pour des données fictives. Pour un usage réel, le transfert demande l'autorisation de la CNDP, à confirmer par la CNDP ou un juriste.

## 4. Règles d'architecture qui en découlent [P]

1. Le contrôle d'accès de la matrice 5.4 s'applique dans la couche d'accès aux données, en un point unique, et pas seulement dans un middleware (SEC-01).
2. Les images sont dans une table à part, lues par une seule route qui applique la matrice. Jamais de lien public, jamais dans les listes (SEC-01, TRT-03).
3. L'évaluation par l'IA, la lecture de l'écriture et l'email passent chacun par une interface unique, avec un simulateur à pannes injectables pour les tests (EXP-04).
4. Les étapes d'un lot sont idempotentes et ne portent que des identifiants, jamais les images (PRC-01) ; les résultats sont écrits dans la base du projet.
5. La requête vers l'IA est construite en un point unique, depuis une liste blanche de champs (EVL-02).

## 5. Reste à choisir ou à vérifier

**Tranché le 2026-10-12 [D]** (à confirmer dans le plan de chaque étape, voir [prompts-implementation.md](prompts-implementation.md)) : Better Auth pour l'authentification et les sessions, Zod pour la validation, Vitest et Playwright pour les tests, Nodemailer pour l'email, SDK TypeScript officiel pour Mistral. Interface de l'application en anglais.

**Remplacé le 2026-10-16 [D]** : Mistral et son SDK, par OpenRouter (§3). Le client (`fetch` ou bibliothèque compatible OpenAI) est à choisir dans le plan de l'adaptateur [P].

**À vérifier :**
- le modèle gratuit à retenir : sortie structurée, politique d'entraînement et de conservation de son fournisseur, date de retrait, limites réelles ;
- les réglages de confidentialité du compte OpenRouter pour les modèles gratuits ;
- si Vercel exige une carte à l'inscription ;
- région de la base Neon ;
- limites de poids et de pages des images (TRT-02) ;
- événements par copie (E6) ;
- lisibilité d'une photo réduite (E9).

Les pages officielles ont été lues par extraction. Les chiffres de Gmail SMTP viennent de blogs, pas de Google. Pour OpenRouter (2026-10-16), la documentation a été lue en texte brut, mais la politique de confidentialité et les CGU seulement en résumé ; les réglages du compte n'ont pas été vus.
