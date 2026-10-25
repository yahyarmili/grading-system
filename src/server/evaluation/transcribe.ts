import "server-only";
import { AI_MAX_ATTEMPTS, EVALUATION_STEP_MAX_MS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import type { ReadingOutcome } from "@/lib/transcription";
import { AiConfigurationError, getReader, type Reader } from "@/server/ai";
import {
  claimForTranscription,
  finishTranscription,
  readTranscriptionPage,
  recordTranscriptionPage,
  type ClaimOptions,
  type TranscriptionEnd,
} from "@/server/data/evaluation/system";
import { aiGuard, alertAiConfiguration, type AiGuard } from "@/server/evaluation/budget";
import { readPageWith, type ReadingLimits } from "@/server/evaluation/read-page";

// TRX-01, PRC-02 (E9, spec 0011): the pipeline reads an image version the
// student sent without checking it (AC-7), page by page, each page one step
// of the workflow (steps.ts), then assembles the text and hands the version
// over to the evaluation, under the same claim. Run by the workflow only.

/** How the run starts: the version claimed with its pages left to read, or not one to transcribe ("skipped"), or no place free. */
export type TranscriptionStart = { status: "claimed"; pageIds: string[] } | { status: "skipped" } | { status: "busy" };

/**
 * One page's step: read, without writing, failed after its attempts, the AI
 * closed (cost cap, breaker, configuration: nothing sent), "read" already
 * (a step delivered again), or "stopped": the claim no longer holds (the
 * version replaced, the run released), nothing sent or written.
 */
export type PageStepOutcome = ReadingOutcome | "closed" | "read" | "stopped";

/**
 * The pipeline's attempts: AI_MAX_ATTEMPTS, AI_RETRY_DELAY_MS apart (or the
 * provider's Retry-After), within EVALUATION_STEP_MAX_MS: a page's step lasts
 * at most an evaluation's, under a function's 300 s, and the claim is dated
 * again after each page, so EVALUATION_STUCK_AFTER_MS stays above it.
 */
const PIPELINE_READING: ReadingLimits = {
  attempts: AI_MAX_ATTEMPTS,
  maxMs: EVALUATION_STEP_MAX_MS,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type TranscriptionDeps = { reader?: Reader; guard?: AiGuard; limits?: ReadingLimits };

const claimOf = (ref: EvaluationRef, claimToken: string) => ({ submissionId: ref.submissionId, versionNumber: ref.versionNumber, claimToken });

/**
 * Transition 2 (or 4, the teacher's relaunch of a transcription_failed copy)
 * for the version of `ref`, under the run's token and the shared places.
 */
export async function startTranscription(ref: EvaluationRef, claimToken: string, slots: ClaimOptions["slots"]): Promise<TranscriptionStart> {
  const claim = await claimForTranscription(ref.submissionId, claimToken, {
    expectedVersion: ref.versionNumber,
    slots,
    origin: ref.origin,
    request: ref.request,
  });
  if (claim === "busy") return { status: "busy" };
  return claim ? { status: "claimed", pageIds: claim.pageIds } : { status: "skipped" };
}

/**
 * Reads one page of the claimed version: the claim checked before the call
 * (readTranscriptionPage) and before the write (recordTranscriptionPage). The
 * reader is made here: one that cannot be set up closes the AI for this copy
 * (it ends transcription_failed, relaunchable) and tells the administrators.
 */
export async function transcribePage(ref: EvaluationRef, claimToken: string, pageId: string, deps: TranscriptionDeps = {}): Promise<PageStepOutcome> {
  const claim = claimOf(ref, claimToken);
  const page = await readTranscriptionPage(claim, pageId);
  if (page === null) return "stopped";
  if (page === "read") return "read";
  let reader: Reader;
  try {
    reader = deps.reader ?? getReader();
  } catch (error) {
    if (!(error instanceof AiConfigurationError)) throw error;
    console.error("[evaluation] AI not configured: AiConfigurationError");
    await alertAiConfiguration();
    return "closed";
  }
  const result = await readPageWith(pageId, { reader, guard: deps.guard ?? aiGuard }, deps.limits ?? PIPELINE_READING)(page.jpeg);
  if (result === "closed") return "closed";
  return recordTranscriptionPage(claim, pageId, result);
}

/** After the pages: transcription_failed, not_assessable (no writing), or "assembled" for the evaluation; "stale" when the claim went. */
export function endTranscription(ref: EvaluationRef, claimToken: string): Promise<TranscriptionEnd> {
  return finishTranscription(claimOf(ref, claimToken));
}
