import "server-only";
import { start } from "workflow/api";
import type { EvaluationRef } from "@/lib/evaluation";
import { errorKind } from "@/server/evaluation/evaluate";
import { evaluateSubmissionWorkflow } from "@/server/evaluation/workflow";

/**
 * PRC-01 R2: starts the evaluation of a version, after the response to the
 * student (after() in the Server Action): their confirmation never depends
 * on it. A failure to start is logged by kind only; the submission stays
 * received, nothing is lost. Starting twice is harmless: the claim lets one
 * run evaluate (CA2).
 */
export async function triggerEvaluation(ref: EvaluationRef): Promise<void> {
  try {
    await start(evaluateSubmissionWorkflow, [ref]);
  } catch (error) {
    console.error(`[evaluation] trigger failed: ${errorKind(error)}`);
  }
}
