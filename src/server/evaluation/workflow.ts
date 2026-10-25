import { getWorkflowMetadata, sleep } from "workflow";
import type { EvaluationRef } from "@/lib/evaluation";
import { orchestrate } from "@/server/evaluation/orchestrate";
import {
  abandonStep,
  endTranscriptionStep,
  evaluateStep,
  releaseStep,
  startTranscriptionStep,
  transcribePageStep,
} from "@/server/evaluation/steps";

// PRC-01: one run per trigger, started by trigger.ts once the submission or
// replacement committed, or by the sweep (sweep.ts). The workflow body runs
// in Workflows' sandbox and reaches the database only through its steps.

/**
 * Evaluates one version of a submission when a place is free, after reading
 * its pages when the student sent them unchecked (E9); "skipped" when
 * another run took it or it was replaced. The run's identifier, the same at
 * every replay, is the token of its claim.
 */
export async function evaluateSubmissionWorkflow(ref: EvaluationRef) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  return orchestrate(ref, workflowRunId, {
    startTranscription: startTranscriptionStep,
    transcribePage: transcribePageStep,
    endTranscription: endTranscriptionStep,
    evaluate: evaluateStep,
    release: releaseStep,
    abandon: abandonStep,
    sleep,
  });
}
