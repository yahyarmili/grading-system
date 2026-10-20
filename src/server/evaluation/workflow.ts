import { getWorkflowMetadata, sleep } from "workflow";
import type { EvaluationRef } from "@/lib/evaluation";
import { orchestrate } from "@/server/evaluation/orchestrate";
import { evaluateStep, releaseStep } from "@/server/evaluation/steps";

// PRC-01: one run per trigger, started by trigger.ts once the submission or
// replacement committed, or by the sweep (sweep.ts). The workflow body runs
// in Workflows' sandbox and reaches the database only through its steps.

/**
 * Evaluates one version of a submission when a place is free; "skipped" when
 * another run took it or it was replaced. The run's identifier, the same at
 * every replay, is the token of its claim.
 */
export async function evaluateSubmissionWorkflow(ref: EvaluationRef) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  return orchestrate(ref, workflowRunId, { evaluate: evaluateStep, release: releaseStep, sleep });
}
