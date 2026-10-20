import "server-only";
import { start } from "workflow/api";
import type { EvaluationRef } from "@/lib/evaluation";
import { errorKind } from "@/server/evaluation/evaluate";
import { sweepEvaluations } from "@/server/evaluation/sweep";
import { evaluateSubmissionWorkflow } from "@/server/evaluation/workflow";

/** Starts one run for a version; a failure is logged by kind only, the submission stays received. */
export async function startEvaluation(ref: EvaluationRef): Promise<void> {
  try {
    await start(evaluateSubmissionWorkflow, [ref]);
  } catch (error) {
    console.error(`[evaluation] trigger failed: ${errorKind(error)}`);
  }
}

/**
 * PRC-01 R2: starts the evaluation of a version, after the response to the
 * student (after() in the Server Action): their confirmation never depends
 * on it. Starting twice is harmless: the claim lets one run evaluate (CA2).
 * Then the sweep (E6.2): what a crash or a failed start left behind is taken
 * up at the next submission, not only by the daily cron.
 */
export async function triggerEvaluation(ref: EvaluationRef): Promise<void> {
  await startEvaluation(ref);
  try {
    await sweepEvaluations(startEvaluation);
  } catch (error) {
    console.error(`[evaluation] sweep failed: ${errorKind(error)}`);
  }
}
