import "server-only";
import { AI_CALL_TIMEOUT_MS, AI_RETRY_DELAY_MS, AI_RETRY_MAX_WAIT_MS, READ_REQUEST_MAX_MS } from "@/config/provisional";
import type { EvaluationError } from "@/lib/evaluation";
import { EvaluatorError, getReader, type Reader, type Usage } from "@/server/ai";
import { buildReadingRequest, parseReading, PROMPT_VERSION } from "@/server/ai/reading";
import type { PageReadResult } from "@/server/data/submissions/drafts";
import { aiGuard, type AiGuard } from "@/server/evaluation/budget";
import { addUsage } from "@/server/evaluation/evaluate";

// The reading of one page by the reader (TRX-01, E9, spec 0011), shared by
// the student's read of their draft (src/server/submissions/images.ts) and
// the pipeline's read of an unchecked version (transcribe.ts). Without the
// image checks of page-image.ts, so a workflow step never loads sharp.

/** Failures worth one more try: the provider late, busy or down, or an answer off the schema. */
const RETRIED = new Set<EvaluationError>(["timeout", "rate_limited", "unavailable", "schema"]);

/** How long a reading may try: its attempts, its deadline, and the wait before a new attempt (none by default). */
export type ReadingLimits = { attempts: number; maxMs: number; sleep?: (ms: number) => Promise<void> };

/** The student's read: one attempt and one retry, both within READ_REQUEST_MAX_MS, without a wait: they wait for it. */
export const INTERACTIVE_READING: ReadingLimits = { attempts: 2, maxMs: READ_REQUEST_MAX_MS };

export type ReadingDeps = { reader?: Reader; guard?: AiGuard };

/**
 * The page read by the reader; the caller records the run (reading_runs) and
 * writes the result. The guard of the AI is asked first (cost cap,
 * breaker): closed, nothing is sent and no run is written. A rate limit
 * asking for more than AI_RETRY_MAX_WAIT_MS ends the attempts, as for the
 * evaluation. The subject (a page id) names the security log line, never
 * sent to the AI. Also the pipeline's reading of an unchecked version
 * (src/server/evaluation/transcribe.ts), with its own limits.
 */
export function readPageWith(subjectId: string, deps: ReadingDeps = {}, limits: ReadingLimits = INTERACTIVE_READING) {
  return async (jpeg: Buffer): Promise<PageReadResult | "closed"> => {
    const reader = deps.reader ?? getReader();
    if ((await (deps.guard ?? aiGuard)(reader.provider)) !== "open") return "closed";
    const started = performance.now();
    const deadline = AbortSignal.timeout(limits.maxMs);
    const request = buildReadingRequest(jpeg);
    const errors: EvaluationError[] = [];
    let usage: Usage | null = null;
    let modelAnswered: string | null = null;
    let reading: PageReadResult["reading"] = null;
    let wait = 0;

    while (errors.length < limits.attempts && !reading && !deadline.aborted) {
      if (errors.length > 0 && limits.sleep && wait > 0) await limits.sleep(wait);
      try {
        const response = await reader.read(request, {
          signal: AbortSignal.any([deadline, AbortSignal.timeout(AI_CALL_TIMEOUT_MS)]),
          subjectId,
        });
        usage = addUsage(usage, response.usage);
        modelAnswered = response.modelAnswered;
        reading = parseReading(response.content);
        if (!reading) errors.push("schema");
        wait = AI_RETRY_DELAY_MS;
      } catch (error) {
        if (!(error instanceof EvaluatorError)) throw error;
        usage = addUsage(usage, error.usage ?? null);
        errors.push(error.kind);
        wait = error.kind === "rate_limited" ? (error.retryAfterMs ?? AI_RETRY_DELAY_MS) : AI_RETRY_DELAY_MS;
      }
      if (!reading && (!RETRIED.has(errors.at(-1)!) || wait > AI_RETRY_MAX_WAIT_MS)) break;
    }
    return {
      reading,
      run: {
        outcome: reading ? (reading.hasWriting ? "read" : "no_writing") : "failed",
        provider: reader.provider,
        modelRequested: reader.model,
        modelAnswered,
        promptVersion: PROMPT_VERSION,
        attempts: errors.length + (reading ? 1 : 0),
        attemptErrors: errors,
        durationMs: Math.round(performance.now() - started),
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
      },
    };
  };
}
