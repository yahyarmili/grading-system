import "server-only";
import { randomUUID } from "node:crypto";
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
import { AiConfigurationError, EvaluatorError, getEvaluator, type Evaluator, type Usage } from "@/server/ai";
import { parseProposalOutput, type ProposalOutput } from "@/server/ai/output";
import { buildEvaluationRequest, PROMPT_VERSION } from "@/server/ai/request";
import {
  claimForEvaluation,
  listReceived,
  type ClaimOptions,
  recordEvaluation,
  releaseEvaluation,
  releaseStuckEvaluations,
  stillEvaluating,
  type EvaluationClaim,
  type EvaluationResult,
  type RunRecord,
} from "@/server/data/evaluation/system";
import { checkBlockingAlerts, isVeryShort } from "@/server/evaluation/alerts";
import { aiGuard, alertAiConfiguration, alertIfUnreachable, type AiGuard } from "@/server/evaluation/budget";

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
  /** The cost cap and the circuit breaker, asked before each attempt (E6); the application's by default. */
  guard?: AiGuard;
};

export const defaultDeps = (evaluator: Evaluator = getEvaluator()): EvaluationDeps => ({
  evaluator,
  registry: RUBRIC_VERSIONS,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  callTimeoutMs: AI_CALL_TIMEOUT_MS,
  guard: aiGuard,
});

/**
 * What happened to one submission, without content: for the command's line,
 * the workflow and the tests. "busy" (E6): every place was taken, nothing
 * changed, the submission stays received.
 */
export type EvaluationOutcome =
  | { status: "skipped" }
  | { status: "busy" }
  | { status: "to_review" | "evaluation_failed" | "not_assessable" | "stale"; attempts: number; durationMs: number; errors: EvaluationError[] };

/**
 * Failed calls retried: a later attempt may succeed (a 529 is unavailable).
 * Never retried: configuration, rejected, refused, budget, truncated, and a
 * rate limit whose wait is longer than AI_RETRY_MAX_WAIT_MS (E6).
 */
const RETRIED = new Set<EvaluationError>(["timeout", "rate_limited", "unavailable"]);

/** The guard closed before any call, by the circuit breaker: no run, the submission ends evaluation_failed. */
type Halted = { outcome: "halted" };

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
 * a timeout, an unavailable provider, a rate limit (after its Retry-After, if
 * at most AI_RETRY_MAX_WAIT_MS) and any answer the validator refuses. Before
 * each new attempt, the claim is read again: a replaced text stops on
 * "superseded", never sent again. Before every attempt, the guard (E6): the
 * cost cap reached makes the submission "AI unavailable" (a run without a
 * call before the first, a failed run after), the breaker open stops it
 * (halted before the first, a failed run after). A budget error makes it "AI
 * unavailable" too. An unexpected error ends the run on "internal".
 */
async function attempt(claim: EvaluationClaim, deps: EvaluationDeps, started: number): Promise<EvaluationResult | Halted> {
  const { evaluator } = deps;
  const guard = deps.guard ?? aiGuard;
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
      const state = await guard(evaluator.provider);
      if (state === "cost_cap" && attempts === 0) {
        return {
          outcome: "not_assessable",
          cause: "ai_unavailable",
          run: { ...run(), modelRequested: null, promptVersion: null, rubricVersion: null },
        };
      }
      if (state === "breaker" && attempts === 0) return { outcome: "halted" };
      if (state !== "open") return { outcome: "failed", run: run(), unavailable: state === "cost_cap" };
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
        if (error.kind === "budget") return { outcome: "failed", run: run(), unavailable: true };
        if (!RETRIED.has(error.kind)) break;
        if (error.kind === "rate_limited") {
          // A long wait asked for: stop rather than call again too early (E6, chosen on 2026-10-19 [P]).
          if ((error.retryAfterMs ?? 0) > AI_RETRY_MAX_WAIT_MS) break;
          wait = error.retryAfterMs ?? AI_RETRY_DELAY_MS;
        }
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
 * `slots` (E6): "busy" when EVALUATION_CONCURRENCY submissions are already
 * evaluating; nothing changed. The circuit breaker open before any call: no
 * run, evaluation_failed, for the teacher to retry. `claimToken` (E6): the
 * workflow run's identifier, so that its releaseStep frees this claim only;
 * a random one for the command. `deps` may be made after the claim (the
 * workflow's step, E6.6): an AI that cannot be set up (AiConfigurationError)
 * ends the claimed copy evaluation_failed, without a run, and tells the
 * administrators once per window, instead of leaving it received, started
 * again by every sweep, unseen.
 */
export async function evaluateSubmission(
  submissionId: string,
  deps: EvaluationDeps | (() => EvaluationDeps) = defaultDeps,
  opts: ClaimOptions & { claimToken?: string } = {},
): Promise<EvaluationOutcome> {
  const started = performance.now();
  const claim = await claimForEvaluation(submissionId, opts.claimToken ?? randomUUID(), opts);
  if (claim === "busy") return { status: "busy" };
  if (!claim) return { status: "skipped" };

  const ended = async (errors: EvaluationError[]): Promise<EvaluationOutcome> => {
    const released = await releaseEvaluation(claim);
    return { status: released ? "evaluation_failed" : "stale", attempts: 0, durationMs: Math.round(performance.now() - started), errors };
  };
  let resolved: EvaluationDeps;
  try {
    resolved = typeof deps === "function" ? deps() : deps;
  } catch (error) {
    if (!(error instanceof AiConfigurationError)) {
      await releaseEvaluation(claim).catch(() => false);
      throw error;
    }
    console.error("[evaluation] AI not configured: AiConfigurationError");
    await alertAiConfiguration();
    return ended(["configuration"]);
  }

  const tried = await attempt(claim, resolved, started);
  if (tried.outcome === "halted") return ended([]);
  let result: EvaluationResult = tried;
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
  const lastError = result.run.attemptErrors.at(-1);
  if (recorded.status === "evaluation_failed" && (lastError === "unavailable" || lastError === "timeout")) {
    await alertIfUnreachable(resolved.evaluator.provider);
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
  if (outcome.status === "busy") return `${label}: busy, still received (every evaluation place taken)`;
  if (outcome.status === "postponed") return `${label}: postponed, still received (daily AI request limit)`;
  if (outcome.status === "error") return `${label}: error (${outcome.kind})`;
  const errors = outcome.errors.length > 0 ? `, errors: ${outcome.errors.join(", ")}` : "";
  return `${label}: ${outcome.status}, ${outcome.attempts} attempt(s), ${outcome.durationMs} ms${errors}`;
}

/**
 * PRC-02 R1: releases to evaluation_failed the submissions evaluating for
 * longer than the longest evaluation (EVALUATION_STUCK_AFTER_MS [P]): a crash
 * or a stopped process left them. Run by the command before it evaluates,
 * and by the sweep (sweep.ts, E6). Identifiers of the released ones.
 */
export function releaseStuckSubmissions(afterMs: number = EVALUATION_STUCK_AFTER_MS): Promise<string[]> {
  return releaseStuckEvaluations(afterMs);
}
