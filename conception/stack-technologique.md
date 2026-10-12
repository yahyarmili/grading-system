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
| IA | Mistral, mode gratuit. Lecture de l'écriture par un OCR dédié ou un modèle multimodal, à comparer en E5. | Mistral [D] ; comparaison [P] | EVL-02, QUA-02, EXP-04 |
| Email | Gmail SMTP (mot de passe d'application) pour la démonstration | Proposé, validé | AUTH-01, 03, 05 |
| Images | Dans PostgreSQL, table séparée | [D] 2026-10-12 | SEC-01, DON-01 |
| Sauvegarde | Export périodique de la base, à concevoir | [P] | FIA-02 (documentée seulement) |

## 3. Ce que ces choix impliquent

- **Images dans la base.** Neon gratuit : 1 Go par projet, écritures bloquées au-delà ([Neon](https://neon.com/pricing)). Une fonction Vercel accepte 4,5 Mo au plus en requête et en réponse ([Vercel](https://vercel.com/docs/functions/limitations)). Conséquences [P] : chaque page est réduite dans le navigateur avant l'envoi, une page par requête ; la photo reste « sans retouche » du point de vue de l'élève (USA-01). Il faut garder assez de résolution pour lire l'écriture, ce qui se vérifie en E9. Formats, poids et nombre de pages : à définir (TRT-02), pour tenir dans 1 Go. Supprimer les images à la fin de la revue (DON-01) libère la place.
- **Lots.** Workflows reprend après un plantage et relance les étapes en échec ([Vercel](https://vercel.com/docs/workflows)). Hobby inclut 50 000 événements par mois, une étape normale en produit 3, plus 1 par nouvelle tentative, et 1 Go de données écrites par mois ; l'état d'un traitement n'est conservé qu'un jour après sa fin ([tarifs](https://vercel.com/docs/workflows/pricing)). Le nombre d'étapes par copie est inconnu : à mesurer en E6. Le SDK multi-région est en bêta.
- **Mistral gratuit.** Il peut utiliser les entrées et sorties pour entraîner ses modèles, avec un droit de refus à tout moment ([aide](https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models), [procédure](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training)). D'où les données fictives. Les quotas ne sont pas publiés : à relever dans votre console. Les modèles sont retirés régulièrement (OCR 4.0 au 30/09/2026, Small 3.2, Medium 3.1 : [liste](https://docs.mistral.ai/getting-started/models/models_overview/)). La version utilisée est donc enregistrée avec chaque résultat. La précision de lecture de l'écriture manuscrite n'est pas vérifiée de façon indépendante : à mesurer en E5 et E9.
- **Vercel Hobby.** Gratuit, fonctions de 300 s. Usage réservé au non commercial ([règles](https://vercel.com/docs/limits/fair-use-guidelines)), compatible avec un projet académique. Un projet payant ou commercial exigerait le plan Pro.
- **Neon.** Compute suspendu après 5 minutes d'inactivité, donc démarrage à froid à prévoir. Historique de restauration de 6 h seulement : d'où l'export périodique.
- **Gmail SMTP.** Environ 500 destinataires par jour selon des blogs ([source secondaire](https://serversmtp.com/limits-of-gmail-smtp-server/)), validation en deux étapes requise. Suffisant pour la démonstration, pas pour un usage réel. Resend exige un domaine à vous ([doc](https://resend.com/docs/dashboard/domains/introduction)).
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
- quotas du compte Mistral et refus d'entraînement en mode gratuit (votre console) ;
- si Vercel exige une carte à l'inscription ;
- région de la base Neon ;
- limites de poids et de pages des images (TRT-02) ;
- événements par copie (E6) ;
- lisibilité d'une photo réduite (E9).

Les pages officielles ont été lues par extraction. Les chiffres de Gmail SMTP viennent de blogs, pas de Google.
