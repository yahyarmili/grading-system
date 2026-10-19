import type { EvaluationRef } from "@/lib/evaluation";
import type { SubmissionContext } from "@/server/submissions/submissions";

// The trigger of the automatic evaluation (PRC-01), as the tests see it: the
// Server Action starts a workflow after the response; here nothing starts,
// or the versions handed over are recorded.

/** For the tests about submitting, not about evaluating: the versions are ignored. */
export const noTrigger: SubmissionContext = { onReceived: () => {} };

/** Records each version handed to the trigger, in order. */
export function recordTriggers(): SubmissionContext & { refs: EvaluationRef[] } {
  const refs: EvaluationRef[] = [];
  return { refs, onReceived: (ref) => void refs.push(ref) };
}
