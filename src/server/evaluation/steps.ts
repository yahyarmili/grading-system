import { FatalError } from "workflow";
import type { EvaluationRef } from "@/lib/evaluation";
import { defaultDeps, errorKind, evaluateSubmission, type EvaluationOutcome } from "@/server/evaluation/evaluate";

// The steps of the automatic evaluation (PRC-01, E6). Workflows keeps each
// step's arguments, result and error for a day, outside the database: they
// carry identifiers, statuses and counts only, never the text (rule 4).

/**
 * Claim, attempts and record of one version (evaluate.ts): "skipped" when it
 * is no longer received or another version is active, so a second run or a
 * second delivery of this step evaluates nothing. Not retried by Workflows
 * (maxRetries 0): a retry would call the AI again, billed, out of sight; the
 * attempts are evaluate.ts's own. An error is thrown again by its kind only:
 * a database message may quote values. If the process dies during the step,
 * the submission stays evaluating until releaseStuckSubmissions frees it.
 */
export async function evaluateStep(ref: EvaluationRef): Promise<EvaluationOutcome> {
  "use step";
  try {
    return await evaluateSubmission(ref.submissionId, defaultDeps(), { expectedVersion: ref.versionNumber });
  } catch (error) {
    throw new FatalError(`evaluation step failed: ${errorKind(error)}`);
  }
}
evaluateStep.maxRetries = 0;
