import { FatalError } from "workflow";
import { EVALUATION_CONCURRENCY, EVALUATION_STUCK_AFTER_MS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import { releaseEvaluation } from "@/server/data/evaluation/system";
import { defaultDeps, errorKind, evaluateSubmission, type EvaluationOutcome } from "@/server/evaluation/evaluate";

// The steps of the automatic evaluation (PRC-01, E6). Workflows keeps each
// step's arguments, result and error for a day, outside the database: they
// carry identifiers, statuses and counts only, never the text (rule 4).
// `claimToken` is the workflow run's identifier: the claim is stored with it.

/** The places of the step (PRC-01 R3): EVALUATION_CONCURRENCY at once; a stuck one holds none. */
const STEP_SLOTS = { concurrency: EVALUATION_CONCURRENCY, stuckAfterMs: EVALUATION_STUCK_AFTER_MS };

/**
 * Claim, attempts and record of one version (evaluate.ts): "skipped" when it
 * is no longer in the state of its origin (received, or failed or not
 * assessable for the teacher's retry and relaunch, E6.3) or another version
 * is active, so a second run or a second delivery of this step evaluates
 * nothing; "busy" when every place is taken, nothing changed. Not retried by Workflows (maxRetries 0): a retry
 * would call the AI again, billed, out of sight; the attempts are
 * evaluate.ts's own, EVALUATION_STEP_MAX_MS at most, under a function's
 * 300 s. An error is thrown again by its kind only: a database message may
 * quote values. The workflow then runs releaseStep; if the process dies
 * during the step, the sweep releases it (EVALUATION_STUCK_AFTER_MS).
 */
export async function evaluateStep(ref: EvaluationRef, claimToken: string): Promise<EvaluationOutcome> {
  "use step";
  try {
    // The dependencies are made after the claim (E6.6): an AI that cannot be
    // set up fails the claimed copy, never leaves it received.
    return await evaluateSubmission(ref.submissionId, () => defaultDeps(), {
      expectedVersion: ref.versionNumber,
      slots: STEP_SLOTS,
      claimToken,
      origin: ref.origin,
      request: ref.request,
    });
  } catch (error) {
    throw new FatalError(`evaluation step failed: ${errorKind(error)}`);
  }
}
evaluateStep.maxRetries = 0;

/**
 * After evaluateStep failed: ends evaluation_failed the claim of this run,
 * and only it (its token): when another run holds the submission, or this
 * one never claimed it, nothing changes (false). Retried by Workflows (no AI
 * call, and doing it twice changes nothing); an error by its kind only.
 */
export async function releaseStep(ref: EvaluationRef, claimToken: string): Promise<boolean> {
  "use step";
  try {
    return await releaseEvaluation({ ...ref, claimToken });
  } catch (error) {
    throw new Error(`release step failed: ${errorKind(error)}`);
  }
}
