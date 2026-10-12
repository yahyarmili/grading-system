# Solution

> Étape 2 de la démarche d'ingénierie. Statut : **validée**. Elle répond à [problematique.md](problematique.md).

## 1. Description de la solution

Une application web de notation qui fiabilise la correction de productions écrites en anglais et en français. Elle s'appuie sur une **rubrique analytique fixe et unique**, fournie par le client, qui sert de standard d'évaluation dans toute l'application.

L'application prend en charge la lecture de l'écriture et le traitement de plusieurs copies à la fois. Pour chaque copie, une IA propose une évaluation fondée sur la rubrique. Le professeur lié à l'élève la valide ou la modifie, puis l'affiche dans l'espace de l'élève.

## 2. Principes de la solution

1. **Une rubrique unique et fixe** : les mêmes critères, les mêmes niveaux et les mêmes pondérations pour l'anglais et le français, pour tous les niveaux scolaires et pour tous les professeurs. Les professeurs ne peuvent pas la modifier.
2. **Entrées** : les copies arrivent sous forme d'images (copies manuscrites scannées) et de texte. L'application traite **plusieurs copies à la fois**.
3. **L'IA propose, le professeur décide** : l'IA produit une proposition d'évaluation en prenant la rubrique comme référence. Le professeur lié à l'élève la valide ou la modifie librement.
4. **Publication** : après validation, les résultats sont affichés dans l'espace de l'élève.
5. **Un seul correcteur par copie** : c'est le professeur lié à l'élève. La cohérence entre professeurs vient du standard commun, pas de la double correction.
6. **L'identité de l'élève n'est pas masquée pour le professeur.**
7. **Le temps et la lecture de l'écriture sont gérés par l'application**, pas par la rubrique.

## 3. Couverture des problèmes

| Problème | Couverture |
|----------|------------|
| **P1 : temps** | **Couvert.** Traitement par lot, lecture automatique de l'écriture, et le professeur valide au lieu de corriger de zéro. |
| **P2 : écarts entre professeurs** | **Largement couvert.** Tous partent de la même rubrique et d'une proposition IA du même type. Les modifications du professeur peuvent réintroduire des écarts. |
| **P2 : inconstance d'un même correcteur** | **Partiel.** La fatigue pèse sur la validation plutôt que sur la correction complète. À mesurer. |
| **P3 : écriture** | **Réduit.** L'évaluation initiale ne dépend pas de la lecture de l'écriture par un humain, mais le professeur peut revoir la copie scannée en modifiant. |
| **P3 : connaissance de l'élève** | **Partiel.** L'identité n'est pas masquée pour le professeur, donc l'effet de halo peut se réintroduire au moment où il modifie. |

Une IA qui propose et un professeur qui valide, c'est mieux que de corriger à la main, mais cela ne supprime pas les biais. Il faut notamment mesurer la tendance du professeur à suivre la proposition de l'IA.

## 4. Risques identifiés

- **L'IA n'est pas automatiquement plus fiable.** Les études sur la notation de rédactions par IA sont mixtes : bon accord avec les humains dans certains cas, performance inconsistante dans d'autres ([Hua et al.](https://arxiv.org/html/2509.23412v1)). Les résultats dépendent de la rubrique, du modèle et de la consigne ([Harada et al.](https://arxiv.org/html/2510.09030v1)).
- **La lecture de l'écriture peut effacer les erreurs mesurées par le critère Mechanics.** Les outils de transcription normalisent ou corrigent facilement l'orthographe et la ponctuation ([écriture d'apprenants](https://preview.aclanthology.org/fix_video/2023.cawl-1.3/), [post-correction de rédactions manuscrites](https://neurips.cc/virtual/2024/107779)). Les chiffres publiés concernent surtout de l'écriture d'adultes, pas celle d'élèves.

## 5. Points reportés aux étapes suivantes

- Ne pas transmettre l'identité de l'élève à l'IA, pour que sa proposition reste neutre.
- Transcrire l'écriture **sans corriger** l'orthographe ni la ponctuation.
- Mesurer l'accord de l'IA avec des correcteurs experts sur de vraies copies d'élèves.
- Préparer la **version française de la rubrique** (adaptation de la rubrique anglaise, avec les accents et les accords), à faire valider par le client.
- Fixer la **conversion des niveaux en note finale**. Avec cinq critères à 20 % et des niveaux de 0 à 4, une note sur 20 ou sur 100 est directe. Le format reste à confirmer avec le client.
- Prévoir l'**espace élève** parmi les acteurs (étape 6).

## 6. Points à confirmer

- **Rubrique de référence.** L'annexe ci-dessous est la version « texte » (5 critères pondérés à 20 %, niveaux de 0 à 4). Elle est supposée remplacer la version de l'image, qui avait 5 autres critères sur 4 niveaux. À confirmer.
- **Forme exacte des entrées de type texte** (texte saisi dans l'application, import de fichier, etc.), à préciser aux fonctionnalités.

## Annexe : rubrique de référence (fournie par le client)

Cinq critères, pondérés chacun à 20 %, avec des niveaux de 0 à 4.

### 1. Task Achievement / Content (20 %)
- **4 – Excellent (Full marks)** : Fully addresses the task; ideas relevant and well developed.
- **3 – Good (High level)** : Addresses the task; ideas adequately developed.
- **2 – Developing (Partial level)** : Partially addresses the task; ideas limited or somewhat developed.
- **1 – Limited (Low level)** : Limited relevance to the task; ideas underdeveloped or unclear.
- **0 – Inadequate (No evidence)** : Does not address the task or is completely irrelevant.

### 2. Organization & Cohesion (20 %)
- **4 – Excellent (Full marks)** : Clear and logical structure; well-organized paragraphs; effective use of cohesive devices and transitions.
- **3 – Good (High level)** : Generally clear structure; minor lapses in organization or cohesion.
- **2 – Developing (Partial level)** : Some organizational problems; limited use of cohesive devices; ideas can be difficult to follow at times.
- **1 – Limited (Low level)** : Weak organization; frequent lapses in cohesion, lacks flow and connection.
- **0 – Inadequate (No evidence)** : No clear organization; ideas are random or disconnected.

### 3. Vocabulary Range & Accuracy (20 %)
- **4 – Excellent (Full marks)** : Wide range of vocabulary; precise, natural and appropriate use; minimal inaccuracies.
- **3 – Good (High level)** : Adequate range of vocabulary; generally appropriate use; some minor inaccuracies.
- **2 – Developing (Partial level)** : Limited range of vocabulary; frequent misuse or repetition; some words used inappropriately.
- **1 – Limited (Low level)** : Very limited range; mostly basic vocabulary; frequent misuse and awkward wording.
- **0 – Inadequate (No evidence)** : Extremely limited or inaccurate vocabulary; severely affects meaning.

### 4. Grammatical Range & Accuracy (20 %)
- **4 – Excellent (Full marks)** : Wide range of structures; largely accurate with very few errors.
- **3 – Good (High level)** : Generally accurate; minor errors that do not interfere with meaning.
- **2 – Developing (Partial level)** : Limited range of structures; noticeable errors; meaning usually clear.
- **1 – Limited (Low level)** : Frequent errors; meaning sometimes unclear.
- **0 – Inadequate (No evidence)** : Persistent errors; seriously obstruct meaning.

### 5. Mechanics (20 %)
- **4 – Excellent (Full marks)** : Very few spelling, punctuation and capitalization errors.
- **3 – Good (High level)** : Some minor errors that do not distract the reader.
- **2 – Developing (Partial level)** : Noticeable errors in spelling, punctuation or capitalization.
- **1 – Limited (Low level)** : Frequent errors that distract the reader.
- **0 – Inadequate (No evidence)** : Errors are pervasive and make the text difficult to read.
