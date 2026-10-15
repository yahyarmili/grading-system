# Stack technologique

> Étape 7 de la démarche d'ingénierie. Statut : **validé** par l'utilisateur le 2026-10-12 (pile et stockage des images dans la base).
> Fait suite à [problematique.md](problematique.md), [solution.md](solution.md), [fonctionnalites.md](fonctionnalites.md), [besoins-non-fonctionnels.md](besoins-non-fonctionnels.md) et [acteurs.md](acteurs.md). Ce document ne les modifie pas.

**En bref.** Une application TypeScript sur Next.js, hébergée chez Vercel, avec PostgreSQL chez Neon et Mistral comme IA, le tout à 0 MAD pour une démonstration. Trois limites pèsent sur la conception : 4,5 Mo par requête, 1 Go de base, et des quotas Mistral encore inconnus. **[D]** = votre décision ; **[P]** = proposition à valider.

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
| IA | Mistral, mode gratuit, modèle `mistral-medium-3-5`. Lecture de l'écriture par un OCR dédié ou un modèle multimodal, à comparer en E5. | Mistral [D] ; modèle [D] 2026-10-15 ; comparaison [P] | EVL-02, QUA-02, EXP-04 |
| Email | Gmail SMTP (mot de passe d'application) pour la démonstration | Proposé, validé | AUTH-01, 03, 05 |
| Images | Dans PostgreSQL, table séparée | [D] 2026-10-12 | SEC-01, DON-01 |
| Sauvegarde | Export périodique de la base, à concevoir | [P] | FIA-02 (documentée seulement) |
| Développement local | Docker Desktop et Docker Compose : Node 24 en conteneur, aucun Node installé sur le poste | [D] 2026-10-12 | — |

## 3. Ce que ces choix impliquent

- **Images dans la base.** Neon gratuit : 1 Go par projet, écritures bloquées au-delà ([Neon](https://neon.com/pricing)). Une fonction Vercel accepte 4,5 Mo au plus en requête et en réponse ([Vercel](https://vercel.com/docs/functions/limitations)). Conséquences [P] : chaque page est réduite dans le navigateur avant l'envoi, une page par requête ; la photo reste « sans retouche » du point de vue de l'élève (USA-01). Il faut garder assez de résolution pour lire l'écriture, ce qui se vérifie en E9. Formats, poids et nombre de pages : à définir (TRT-02), pour tenir dans 1 Go. Supprimer les images à la fin de la revue (DON-01) libère la place.
- **Lots.** Workflows reprend après un plantage et relance les étapes en échec ([Vercel](https://vercel.com/docs/workflows)). Hobby inclut 50 000 événements par mois, une étape normale en produit 3, plus 1 par nouvelle tentative, et 1 Go de données écrites par mois ; l'état d'un traitement n'est conservé qu'un jour après sa fin ([tarifs](https://vercel.com/docs/workflows/pricing)). Le nombre d'étapes par copie est inconnu : à mesurer en E6. Le SDK multi-région est en bêta.
- **Mistral gratuit.** Il peut utiliser les entrées et sorties pour entraîner ses modèles, avec un droit de refus à tout moment ([aide](https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models), [procédure](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training)). D'où les données fictives. Les quotas ne sont pas publiés : relevés dans la console (ci-dessous). Les modèles sont retirés régulièrement (OCR 4.0 au 30/09/2026, Small 3.2, Medium 3.1 : [liste](https://docs.mistral.ai/getting-started/models/models_overview/)). La version utilisée est donc enregistrée avec chaque résultat. La précision de lecture de l'écriture manuscrite n'est pas vérifiée de façon indépendante : à mesurer en E5 et E9.
- **Limites du compte gratuit, relevées le 2026-10-15** (Admin Panel › API › Limits, par espace de travail, toutes clés confondues). Aucune limite mensuelle affichée. OCR : 625 pages par minute ; fichiers envoyés à Mistral : 100 Mo au plus (réglable jusqu'à 250 Mo), bien au-delà des 4,5 Mo d'une requête Vercel, qui restent la limite effective.

  | Modèle | Tokens par minute | Requêtes par seconde |
  |---|---|---|
  | `mistral-small-2603` | 20 000 | 1,00 |
  | `mistral-medium-latest` | 20 000 | 1,00 |
  | `mistral-large-2512` | 250 000 | 1,00 |
  | `mistral-large-4` | 20 000 | 0,83 |
  | `ministral-14b-2512` | 937 500 | 0,50 |
  | `ministral-8b-2512` | 625 000 | 3,13 |
  | `ministral-3b-2512` | 1 300 000 | 12,50 |

  `mistral-large-2512` figure sur cette page mais pas dans la liste des modèles de l'API (`/v1/models`) ; non vérifié en E5.0 (aucun appel à l'API), sans objet depuis le choix du modèle.
- **Modèle retenu [D, 2026-10-15]** : `mistral-medium-3-5` (Mistral Medium 3.5, GA, sorti le 2026-04-28, sorties structurées : [fiche](https://docs.mistral.ai/models/mistral-medium-3-5-26-04.md)), épinglé, jamais un alias (`mistral-medium-3` et `mistral-medium-latest` en sont). Identifiant fixe majeur-mineur, non daté, présenté par Mistral comme une version fixe ([cycle de vie](https://docs.mistral.ai/inference/model-lifecycle.md)). Aucune date de retrait annoncée au 2026-10-15. Préavis observés : environ 3 mois pour Small 3.2 (annoncé le 2026-04-30, retiré le 2026-07-31) et Medium 3.1 (2026-05-22, 2026-08-31), avant la publication du préavis de 6 mois pour un modèle GA (août 2026 d'après le [dépôt de la doc](https://github.com/mistralai/platform-docs-public)) ; 1 jour pour OCR 4.0 (2026-09-29, 2026-09-30), après. Le modèle qui a répondu est donc enregistré avec chaque résultat. Limites : celles de l'alias `mistral-medium-latest` ci-dessus, qui pointe aujourd'hui vers ce modèle ; sa propre ligne est à relever dans la console avant E6.
- **Refus d'entraînement fait le 2026-10-15** [D] : Admin Panel › Privacy (« Manage your privacy settings for our API »), « Allow the use of your API calls to train Mistral's AI models » désactivé ; vaut pour les nouvelles interactions. « Enable Labs models » reste désactivé : activer Labs autorise l'entraînement quel que soit ce réglage. Aucun modèle `labs-*` n'est donc utilisé.
- **Vercel Hobby.** Gratuit, fonctions de 300 s. Usage réservé au non commercial ([règles](https://vercel.com/docs/limits/fair-use-guidelines)), compatible avec un projet académique. Un projet payant ou commercial exigerait le plan Pro.
- **Neon.** Compute suspendu après 5 minutes d'inactivité, donc démarrage à froid à prévoir. Historique de restauration de 6 h seulement : d'où l'export périodique.
- **Gmail SMTP.** Environ 500 destinataires par jour selon des blogs ([source secondaire](https://serversmtp.com/limits-of-gmail-smtp-server/)), validation en deux étapes requise. Suffisant pour la démonstration, pas pour un usage réel. Resend exige un domaine à vous ([doc](https://resend.com/docs/dashboard/domains/introduction)).
- **Docker.** Sert seulement au développement (`docker compose up`, puis `http://localhost:3000`) ; les commandes npm se lancent dans le conteneur. La production reste sur Vercel, sans image Docker déployée.
- **Hors du Maroc.** Vercel, Neon et Mistral sont hors du Maroc. Sans objet pour des données fictives. Pour un usage réel, le transfert demande l'autorisation de la CNDP, à confirmer par la CNDP ou un juriste.

## 4. Règles d'architecture qui en découlent [P]

1. Le contrôle d'accès de la matrice 5.4 s'applique dans la couche d'accès aux données, en un point unique, et pas seulement dans un middleware (SEC-01).
2. Les images sont dans une table à part, lues par une seule route qui applique la matrice. Jamais de lien public, jamais dans les listes (SEC-01, TRT-03).
3. Mistral, la lecture de l'écriture et l'email passent chacun par une interface unique, avec un simulateur à pannes injectables pour les tests (EXP-04).
4. Les étapes d'un lot sont idempotentes et ne portent que des identifiants, jamais les images (PRC-01) ; les résultats sont écrits dans la base du projet.
5. La requête vers Mistral est construite en un point unique, depuis une liste blanche de champs (EVL-02).

## 5. Reste à choisir ou à vérifier

**Tranché le 2026-10-12 [D]** (à confirmer dans le plan de chaque étape, voir [prompts-implementation.md](prompts-implementation.md)) : Better Auth pour l'authentification et les sessions, Zod pour la validation, Vitest et Playwright pour les tests, Nodemailer pour l'email, SDK TypeScript officiel pour Mistral. Interface de l'application en anglais.

**À vérifier :**
- limite mensuelle du mode gratuit (les débits par minute et l'OCR sont relevés en §3, sauf la ligne de `mistral-medium-3-5`) ;
- si Vercel exige une carte à l'inscription ;
- région de la base Neon ;
- limites de poids et de pages des images (TRT-02) ;
- événements par copie (E6) ;
- lisibilité d'une photo réduite (E9).

Les pages officielles ont été lues par extraction. Les chiffres de Gmail SMTP viennent de blogs, pas de Google.
