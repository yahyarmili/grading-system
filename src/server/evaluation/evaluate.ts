import "server-only";
import {
  AI_CALL_TIMEOUT_MS,
  AI_MAX_ATTEMPTS,
  AI_RETRY_DELAY_MS,
  AI_RETRY_MAX_WAIT_MS,
  EVALUATION_STUCK_AFTER_MS,
} from "@/config/provisional";
import type { EvaluationError, ProposalAlert } from "@/lib/evaluation";
import { calculateGrade } from "@/lib/grade";
import { criterionIds, RUBRIC_VERSIONS, type RubricVersion } from "@/lib/rubric";
import { EvaluatorError, getEvaluator, type Evaluator, type Usage } from "@/server/ai";
import { parseProposalOutput, type ProposalOutput } from "@/server/ai/output";
import { buildEvaluationRequest, PROMPT_VERSION } from "@/server/ai/request";
import {
  claimForEvaluation,
  listReceived,
  recordEvaluation,
  releaseEvaluation,
  releaseStuckEvaluations,
  stillEvaluating,
  type EvaluationClaim,
  type EvaluationResult,
  type RunRecord,
} from "@/server/data/evaluation/system";
import { checkBlockingAlerts, isVeryShort } from "@/server/evaluation/alerts";

// The evaluation of a submission by the AI (EVL-03), transitions 2 and 5 of
// §5.5: claim, request built from the whitelist, bounded attempts, answer
// checked against the output contract, grade calculated by the system, run
// and proposal recorded. No transaction stays open during a call to the AI.
// Run by the internal command (scripts/evaluate.ts) and, after each
// submission or replacement, by the workflow's step (steps.ts, E6).

export type EvaluationDeps = {
  evaluator: Evaluator;
  /** The published rubrics; the tests add a version of their own. */
  registry: readonly RubricVersion[];
  /** Waits between attempts; the tests skip the wait. */
  sleep: (ms: number) => Promise<void>;
  /** Longest wait for one call, answer read included. */
  callTimeoutMs: number;
};

export const defaultDeps = (evaluator: Evaluator = getEvaluator()): EvaluationDeps => ({
  evaluator,
  registry: RUBRIC_VERSIONS,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  callTimeoutMs: AI_CALL_TIMEOUT_MS,
});

/** What happened to one submission, without content: for the command's line and the tests. */
export type EvaluationOutcome =
  | { status: "skipped" }
  | { status: "to_review" | "evaluation_failed" | "not_assessable" | "stale"; attempts: number; durationMs: number; errors: EvaluationError[] };

/** Failed calls retried: a later attempt may succeed. configuration, rejected and refused stop at once. */
const RETRIED = new Set<EvaluationError>(["timeout", "rate_limited", "unavailable"]);

/** The three flags of the model, as information alerts (EVL-04), best effort; very_short is the system's own (alerts.ts). */
function flagAlerts(flags: ProposalOutput["flags"]): ProposalAlert[] {
  const alerts: ProposalAlert[] = [];
  if (flags.otherLanguage) alerts.push("other_language");
  if (flags.offTopic) alerts.push("off_topic");
  if (flags.addressedToMarker) alerts.push("addressed_to_marker");
  return alerts;
}

/** A sum over the attempts of what the provider counted; null when it never said. */
function addUsage(total: Usage | null, usage: Usage | null): Usage | null {
  if (!usage) return total;
  const add = (a: number | null | undefined, b: number | null) => (a == null ? b : b == null ? a : a + b);
  return {
    promptTokens: add(total?.promptTokens, usage.promptTokens),
    completionTokens: add(total?.completionTokens, usage.completionTokens),
    totalTokens: add(total?.totalTokens, usage.totalTokens),
  };
}

/**
 * The attempts on one claimed version, AI_MAX_ATTEMPTS at most (R3). Retried:
 * a timeout, an unavailable provider, a rate limit (after its Retry-After,
 * bounded) and any answer the validator refuses. Before each new attempt, the
 * claim is read again: a replaced text stops on "superseded", never sent
 * again. An unexpected error ends the run on "internal".
 */
async function attempt(claim: EvaluationClaim, deps: EvaluationDeps, started: number): Promise<EvaluationResult> {
  const { evaluator } = deps;
  const errors: EvaluationError[] = [];
  let attempts = 0;
  let usage: Usage | null = null;
  let modelAnswered: string | null = null;
  let providerAnswered: string | null = null;
  let rubric: RubricVersion | null = null;

  const run = (): RunRecord => ({
    provider: evaluator.provider,
    modelRequested: evaluator.model,
    modelAnswered,
    providerAnswered,
    promptVersion: PROMPT_VERSION,
    rubricVersion: rubric?.id ?? null,
    attempts,
    attemptErrors: [...errors],
    durationMs: Math.round(performance.now() - started),
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
  });

  try {
    const blocking = checkBlockingAlerts(claim.input, deps.registry);
    if ("cause" in blocking) {
      // Blocking alert (EVL-04 R1): no request, no proposal, no grade 0, no retry.
      return {
        outcome: "not_assessable",
        cause: blocking.cause,
        run: { ...run(), modelRequested: null, promptVersion: null, rubricVersion: null },
      };
    }
    rubric = blocking.rubric;
    const request = buildEvaluationRequest(claim.input, rubric);
    let wait = 0;
    while (attempts < AI_MAX_ATTEMPTS) {
      if (attempts > 0) {
        await deps.sleep(wait);
        if (!(await stillEvaluating(claim))) {
          attempts++;
          errors.push("superseded");
          return { outcome: "failed", run: run() };
        }
      }
      attempts++;
      wait = AI_RETRY_DELAY_MS;
      let content: string;
      try {
        const response = await evaluator.evaluate(request, {
          signal: AbortSignal.timeout(deps.callTimeoutMs),
          subjectId: claim.submissionId,
        });
        usage = addUsage(usage, response.usage);
        modelAnswered = response.modelAnswered;
        providerAnswered = response.providerAnswered;
        content = response.content;
      } catch (error) {
        if (!(error instanceof EvaluatorError)) throw error;
        // A billed failure (a refusal) still counts in the run's usage.
        usage = addUsage(usage, error.usage ?? null);
        errors.push(error.kind);
        if (!RETRIED.has(error.kind)) break;
        if (error.kind === "rate_limited") wait = Math.min(error.retryAfterMs ?? AI_RETRY_DELAY_MS, AI_RETRY_MAX_WAIT_MS);
        continue;
      }
      const parsed = parseProposalOutput(content, claim.input.text);
      if (!parsed.ok) {
        errors.push(parsed.code);
        continue;
      }
      const { criteria, generalComment, nextSteps, flags } = parsed.value;
      return {
        outcome: "proposed",
        run: run(),
        proposal: {
          criteria,
          generalComment,
          nextSteps,
          alerts: [...(isVeryShort(claim.input.text, claim.input.language) ? ["very_short" as const] : []), ...flagAlerts(flags)],
          proposedGrade: calculateGrade(criterionIds.map((id) => criteria[id].level)),
        },
      };
    }
    return { outcome: "failed", run: run() };
  } catch {
    // Nothing of the error is kept: it may carry content. The attempt under way
    // ends on "internal" (one is counted when none had started).
    if (errors.length === attempts) attempts++;
    errors.push("internal");
    return { outcome: "failed", run: run() };
  }
}

/**
 * Evaluates one received submission. "skipped" when it is not received (or
 * not a text); "stale" when its text was replaced during the evaluation: the
 * run is kept, not current, and the new version stays received (SUB-05 R2).
 * After the claim, an unexpected error ends on evaluation_failed. When the
 * database refuses the result twice, the submission is released to
 * evaluation_failed without a run, and the error is thrown; if even that
 * fails, or the process stops, releaseStuckSubmissions frees it later.
 * `expectedVersion`: only that version is claimed, "skipped" otherwise.
 */
export async function evaluateSubmission(
  submissionId: string,
  deps: EvaluationDeps = defaultDeps(),
  opts: { expectedVersion?: number } = {},
): Promise<EvaluationOutcome> {
  const started = performance.now();
  const claim = await claimForEvaluation(submissionId, opts.expectedVersion);
  if (!claim) return { status: "skipped" };

  let result = await attempt(claim, deps, started);
  let recorded;
  try {
    recorded = await recordEvaluation(claim, result);
  } catch {
    // A proposal the database refused (a bug) is recorded as a failure
    // instead; a failure, once more (the database may have been down).
    if (result.outcome !== "failed") {
      result = { outcome: "failed", run: { ...result.run, attemptErrors: [...result.run.attemptErrors, "internal"] } };
    }
    try {
      recorded = await recordEvaluation(claim, result);
    } catch (error) {
      // Refused twice: never left evaluating, even without a run.
      await releaseEvaluation(claim).catch(() => false);
      throw error;
    }
  }
  return {
    status: recorded.status,
    attempts: result.run.attempts,
    durationMs: result.run.durationMs,
    errors: result.run.attemptErrors,
  };
}

type AssignmentOutcome = EvaluationOutcome | { status: "error"; kind: string } | { status: "postponed" };

/**
 * Evaluates, one after the other, the received submissions of an assignment;
 * one failure never stops the others. `mayStart`, asked before each one (the
 * daily guard of the commands, AI_DAILY_REQUEST_LIMIT), leaves the rest received, "postponed".
 */
export async function evaluateAssignment(
  assignmentId: string,
  deps: EvaluationDeps = defaultDeps(),
  mayStart: () => Promise<boolean> = async () => true,
): Promise<{ submissionId: string; outcome: AssignmentOutcome }[]> {
  const results: { submissionId: string; outcome: AssignmentOutcome }[] = [];
  let postponed = false;
  for (const submissionId of await listReceived(assignmentId)) {
    postponed ||= !(await mayStart());
    if (postponed) {
      results.push({ submissionId, outcome: { status: "postponed" } });
      continue;
    }
    try {
      results.push({ submissionId, outcome: await evaluateSubmission(submissionId, deps) });
    } catch (error) {
      results.push({ submissionId, outcome: { status: "error" as const, kind: errorKind(error) } });
    }
  }
  return results;
}

/** An error by its kind or class name only: never its message, which may carry content. */
export function errorKind(error: unknown): string {
  if (error instanceof EvaluatorError) return error.kind;
  return error instanceof Error ? error.name : "unknown";
}

/** One line per submission for the internal command, without text or identity. */
export function formatOutcomeLine(label: string, outcome: AssignmentOutcome): string {
  if (outcome.status === "skipped") return `${label}: skipped (not received, or not a text)`;
  if (outcome.status === "postponed") return `${label}: postponed, still received (daily AI request limit)`;
  if (outcome.status === "error") return `${label}: error (${outcome.kind})`;
  const errors = outcome.errors.length > 0 ? `, errors: ${outcome.errors.join(", ")}` : "";
  return `${label}: ${outcome.status}, ${outcome.attempts} attempt(s), ${outcome.durationMs} ms${errors}`;
}

/**
 * PRC-02 R1: releases to evaluation_failed the submissions evaluating for
 * longer than the longest evaluation (EVALUATION_STUCK_AFTER_MS [P]): a crash
 * or a stopped process left them. Run by the command before it evaluates;
 * E6 decides when its processing runs it. Identifiers of the released ones.
 */
export function releaseStuckSubmissions(afterMs: number = EVALUATION_STUCK_AFTER_MS): Promise<string[]> {
  return releaseStuckEvaluations(afterMs);
}
