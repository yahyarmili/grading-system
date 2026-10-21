import { EVALUATION_BUSY_MAX_WAITS, EVALUATION_BUSY_WAIT_MS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import type { EvaluationOutcome } from "@/server/evaluation/evaluate";

// The body of the evaluation workflow (workflow.ts), kept apart so that the
// unit tests run it with fakes: no database, no Node API, deterministic
// (Workflows replays it). Type imports only from evaluate.ts.

export type OrchestrateDeps = {
  /** The step: claim under the token, attempts, record (steps.ts). */
  evaluate: (ref: EvaluationRef, claimToken: string) => Promise<EvaluationOutcome>;
  /** The step that frees this run's own claim after a failure (steps.ts). */
  release: (ref: EvaluationRef, claimToken: string) => Promise<boolean>;
  /** E7.6: the step that drops a teacher's request that found no place (steps.ts). */
  abandon: (ref: EvaluationRef) => Promise<boolean>;
  /** Workflows' durable sleep: no function runs while it waits. */
  sleep: (ms: number) => Promise<void>;
};

/**
 * PRC-01 R3: evaluates one version when a place is free. "busy": every place
 * is taken; the run waits EVALUATION_BUSY_WAIT_MS and asks again,
 * EVALUATION_BUSY_MAX_WAITS times at most, then ends "busy": a received
 * submission stays received and the sweep starts it again
 * (TRIGGER_GRACE_MS); a teacher's retry or relaunch, which no sweep takes up,
 * is dropped and logged (E7.6, plan of E7 §1.11): the copy tells the teacher
 * to ask again. Any other outcome is final. When the step fails, its claim
 * is released (this run's token only: another run's claim of the same
 * version stays), then the error ends the run.
 */
export async function orchestrate(ref: EvaluationRef, claimToken: string, deps: OrchestrateDeps): Promise<EvaluationOutcome> {
  // Called as plain functions, never as methods of `deps`: Workflows would
  // serialize `this` with the step's arguments, and fail on its functions.
  const { evaluate, release, abandon, sleep } = deps;
  for (let waits = 0; ; waits++) {
    let outcome: EvaluationOutcome;
    try {
      outcome = await evaluate(ref, claimToken);
    } catch (error) {
      // If even the release fails, the sweep frees the claim later.
      await release(ref, claimToken).catch(() => false);
      throw error;
    }
    if (outcome.status !== "busy") return outcome;
    if (waits >= EVALUATION_BUSY_MAX_WAITS) {
      if (ref.origin === "retry" || ref.origin === "relaunch") await abandon(ref);
      return outcome;
    }
    await sleep(EVALUATION_BUSY_WAIT_MS);
  }
}
