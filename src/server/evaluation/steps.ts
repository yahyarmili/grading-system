import { FatalError } from "workflow";
import { EVALUATION_CONCURRENCY, EVALUATION_STUCK_AFTER_MS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import { abandonEvaluationRequest, releaseEvaluation, type TranscriptionEnd } from "@/server/data/evaluation/system";
import { defaultDeps, errorKind, evaluateSubmission, type EvaluationOutcome } from "@/server/evaluation/evaluate";
import { endTranscription, startTranscription, transcribePage, type PageStepOutcome, type TranscriptionStart } from "@/server/evaluation/transcribe";

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
export async function evaluateStep(ref: EvaluationRef, claimToken: string, transcribed = false): Promise<EvaluationOutcome> {
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
      // E9: the version this run transcribed, handed over under its claim (transition 3).
      transcribed,
    });
  } catch (error) {
    throw new FatalError(`evaluation step failed: ${errorKind(error)}`);
  }
}
evaluateStep.maxRetries = 0;

/**
 * E9 (spec 0011): claims an image version sent without the student's check
 * for transcription (transition 2, or 4 for the teacher's relaunch), under
 * the run's token and the shared places; "skipped" for any other version,
 * which evaluateStep takes. Not retried by Workflows: a claim delivered
 * twice would find its own claim and skip the copy. An error by its kind only.
 */
export async function startTranscriptionStep(ref: EvaluationRef, claimToken: string): Promise<TranscriptionStart> {
  "use step";
  try {
    return await startTranscription(ref, claimToken, STEP_SLOTS);
  } catch (error) {
    throw new FatalError(`transcription claim failed: ${errorKind(error)}`);
  }
}
startTranscriptionStep.maxRetries = 0;

/**
 * E9: reads one page of the claimed version (transcribe.ts), the claim
 * checked before the call and before the write. Not retried by Workflows: a
 * retry would call the AI again, billed; the attempts are the reading's own,
 * within EVALUATION_STEP_MAX_MS. The page id is all the step carries (rule 4).
 */
export async function transcribePageStep(ref: EvaluationRef, claimToken: string, pageId: string): Promise<PageStepOutcome> {
  "use step";
  try {
    return await transcribePage(ref, claimToken, pageId);
  } catch (error) {
    throw new FatalError(`transcription step failed: ${errorKind(error)}`);
  }
}
transcribePageStep.maxRetries = 0;

/**
 * E9: after the pages, the text assembled and written once, or the
 * transcription ended (transcription_failed, not_assessable). Not retried
 * by Workflows; an error ends the run, whose release frees the claim to
 * transcription_failed.
 */
export async function endTranscriptionStep(ref: EvaluationRef, claimToken: string): Promise<TranscriptionEnd> {
  "use step";
  try {
    return await endTranscription(ref, claimToken);
  } catch (error) {
    throw new FatalError(`transcription end failed: ${errorKind(error)}`);
  }
}
endTranscriptionStep.maxRetries = 0;

/**
 * After a step failed: ends evaluation_failed (transcription_failed while
 * transcribing, E9) the claim of this run,
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

/**
 * E7.6: a teacher's retry or relaunch whose run found no place in time is
 * dropped, its request only, and logged (abandonEvaluationRequest). Retried
 * by Workflows (no AI call; a second time finds nothing to drop); an error
 * by its kind only.
 */
export async function abandonStep(ref: EvaluationRef): Promise<boolean> {
  "use step";
  try {
    return await abandonEvaluationRequest(ref);
  } catch (error) {
    throw new Error(`abandon step failed: ${errorKind(error)}`);
  }
}
