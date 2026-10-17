import type { RubricVersion } from "@/lib/rubric";

// TEST ONLY: a French rubric that exists in the tests alone, injected through
// the `registry` parameter (EVL-01 CA4). It is not the client's text and is
// never published: French stays without a rubric until the client validates
// one (Q6 [D]; conception/procedures.md, "Activer le français"). No file
// outside tests/ may import it (tests/rubric-versions.test.ts).

const descriptors = (what: string) => ({
  4: `${what} : excellent (test).`,
  3: `${what} : bon (test).`,
  2: `${what} : en cours d'acquisition (test).`,
  1: `${what} : limité (test).`,
  0: `${what} : insuffisant (test).`,
});

export const FR_TEST_RUBRIC: RubricVersion = {
  id: "fr-test",
  language: "fr",
  publishedOn: "2026-10-17",
  levelNames: {
    4: { name: "Excellent", qualifier: "Note maximale" },
    3: { name: "Bien", qualifier: "Niveau élevé" },
    2: { name: "En progrès", qualifier: "Niveau partiel" },
    1: { name: "Limité", qualifier: "Niveau faible" },
    0: { name: "Insuffisant", qualifier: "Aucun élément" },
  },
  criteria: [
    { id: "task", name: "Réalisation de la tâche (test)", weight: 20, descriptors: descriptors("Tâche") },
    { id: "organization", name: "Organisation et cohésion (test)", weight: 20, descriptors: descriptors("Organisation") },
    { id: "vocabulary", name: "Étendue et justesse du vocabulaire (test)", weight: 20, descriptors: descriptors("Vocabulaire") },
    { id: "grammar", name: "Étendue et justesse grammaticales (test)", weight: 20, descriptors: descriptors("Grammaire") },
    { id: "mechanics", name: "Orthographe et ponctuation (test)", weight: 20, descriptors: descriptors("Orthographe") },
  ],
};
