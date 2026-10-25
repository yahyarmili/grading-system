import { EVALUATION_BUSY_MAX_WAITS, EVALUATION_BUSY_WAIT_MS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import type { TranscriptionEnd } from "@/server/data/evaluation/system";
import type { EvaluationOutcome } from "@/server/evaluation/evaluate";
import type { PageStepOutcome, TranscriptionStart } from "@/server/evaluation/transcribe";

// The body of the evaluation workflow (workflow.ts), kept apart so that the
// unit tests run it with fakes: no database, no Node API, deterministic
// (Workflows replays it). Type imports only.

export type OrchestrateDeps = {
  /** E9: the step that claims an image version the student did not check, for transcription (steps.ts). */
  startTranscription: (ref: EvaluationRef, claimToken: string) => Promise<TranscriptionStart>;
  /** E9: the step that reads one page of the claimed version (steps.ts). */
  transcribePage: (ref: EvaluationRef, claimToken: string, pageId: string) => Promise<PageStepOutcome>;
  /** E9: the step that assembles the text, or ends the transcription (steps.ts). */
  endTranscription: (ref: EvaluationRef, claimToken: string) => Promise<TranscriptionEnd>;
  /** The step: claim under the token, attempts, record (steps.ts); `transcribed`: after this run's transcription. */
  evaluate: (ref: EvaluationRef, claimToken: string, transcribed: boolean) => Promise<EvaluationOutcome>;
  /** The step that frees this run's own claim after a failure (steps.ts). */
  release: (ref: EvaluationRef, claimToken: string) => Promise<boolean>;
  /** E7.6: the step that drops a teacher's request that found no place (steps.ts). */
  abandon: (ref: EvaluationRef) => Promise<boolean>;
  /** Workflows' durable sleep: no function runs while it waits. */
  sleep: (ms: number) => Promise<void>;
};

/** What a run ended on: the evaluation's outcome, or (E9) a transcription that did not reach it. */
export type WorkflowOutcome = EvaluationOutcome | { status: "transcription_failed" | "no_writing" | "stale"; pages: number };

/**
 * E9 (spec 0011): an image version sent without the student's check is
 * transcribed first, one step per page in order, under the claim; a page that
 * fails, an AI closed, or a claim lost stops the pages, and the last step
 * decides: transcription_failed, not_assessable without writing, "stale",
 * or the evaluation of the assembled text, under the same claim. Any other
 * version is not claimed for transcription ("skipped") and goes to the
 * evaluation as before.
 */
async function runOnce(ref: EvaluationRef, claimToken: string, deps: OrchestrateDeps): Promise<WorkflowOutcome> {
  const { startTranscription, transcribePage, endTranscription, evaluate } = deps;
  const start = await startTranscription(ref, claimToken);
  if (start.status === "busy") return { status: "busy" };
  if (start.status === "skipped") return evaluate(ref, claimToken, false);
  let pages = 0;
  for (const pageId of start.pageIds) {
    const page = await transcribePage(ref, claimToken, pageId);
    if (page !== "read" && page !== "no_writing") break;
    pages++;
  }
  const end = await endTranscription(ref, claimToken);
  if (end === "assembled") return evaluate(ref, claimToken, true);
  return { status: end === "not_assessable" ? "no_writing" : end, pages };
}

/**
 * PRC-01 R3: evaluates one version when a place is free. "busy": every place
 * is taken; the run waits EVALUATION_BUSY_WAIT_MS and asks again,
 * EVALUATION_BUSY_MAX_WAITS times at most, then ends "busy": a received
 * submission stays received and the sweep starts it again
 * (TRIGGER_GRACE_MS); a teacher's retry or relaunch, which no sweep takes up,
 * is dropped and logged (E7.6, plan of E7 §1.11): the copy tells the teacher
 * to ask again. Any other outcome is final. When a step fails, its claim
 * is released (this run's token only: another run's claim of the same
 * version stays), then the error ends the run.
 */
export async function orchestrate(ref: EvaluationRef, claimToken: string, deps: OrchestrateDeps): Promise<WorkflowOutcome> {
  // Called as plain functions, never as methods of `deps`: Workflows would
  // serialize `this` with the step's arguments, and fail on its functions.
  const { release, abandon, sleep } = deps;
  for (let waits = 0; ; waits++) {
    let outcome: WorkflowOutcome;
    try {
      outcome = await runOnce(ref, claimToken, deps);
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
