import "server-only";
import { assignmentLanguages } from "@/lib/assignment";
import { publishedRubric, RUBRIC_VERSIONS, type RubricVersion } from "@/lib/rubric";
import type { RelaunchConditions } from "@/server/data/evaluation/teacher";
import { costCapReached, type AiGuardSettings } from "@/server/evaluation/budget";

// PRC-02 R4 (E6.3): what disappeared since copies became "not assessable",
// for listRelaunchable and relaunchEvaluation (src/server/data/evaluation/teacher.ts).
// Read when the teacher asks, never acted upon by the system itself.

/**
 * The languages with a published rubric (French once the client validated
 * it, Q6) and whether the monthly cost cap is reached. `registry` and
 * `settings`: the tests give their own.
 */
export async function relaunchConditions(
  registry: readonly RubricVersion[] = RUBRIC_VERSIONS,
  settings?: AiGuardSettings,
): Promise<RelaunchConditions> {
  return {
    rubricLanguages: assignmentLanguages.filter((language) => publishedRubric(language, registry) !== null),
    costCapReached: await costCapReached(settings),
  };
}
