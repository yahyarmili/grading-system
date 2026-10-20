import { EVALUATION_BUSY_MAX_WAITS, EVALUATION_BUSY_WAIT_MS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import type { EvaluationOutcome } from "@/server/evaluation/evaluate";

// The body of the evaluation workflow (workflow.ts), kept apart so that the
// unit tests run it with fakes: no database, no Node API, deterministic
// (Workflows replays it). Type imports only from evaluate.ts.

export type OrchestrateDeps = {
  /** The step: claim, attempts, record (steps.ts). */
  evaluate: (ref: EvaluationRef) => Promise<EvaluationOutcome>;
  /** Workflows' durable sleep: no function runs while it waits. */
  sleep: (ms: number) => Promise<void>;
};

/**
 * PRC-01 R3: evaluates one version when a place is free. "busy": every place
 * is taken; the run waits EVALUATION_BUSY_WAIT_MS and asks again,
 * EVALUATION_BUSY_MAX_WAITS times at most, then ends "busy": the submission
 * stays received and the sweep starts it again (TRIGGER_GRACE_MS). Any other
 * outcome is final. An error of the step ends the run (no retry: the
 * submission is released by the sweep).
 */
export async function orchestrate(ref: EvaluationRef, deps: OrchestrateDeps): Promise<EvaluationOutcome> {
  // Called as plain functions, never as methods of `deps`: Workflows would
  // serialize `this` with the step's arguments, and fail on its functions.
  const { evaluate, sleep } = deps;
  for (let waits = 0; ; waits++) {
    const outcome = await evaluate(ref);
    if (outcome.status !== "busy" || waits >= EVALUATION_BUSY_MAX_WAITS) return outcome;
    await sleep(EVALUATION_BUSY_WAIT_MS);
  }
}
