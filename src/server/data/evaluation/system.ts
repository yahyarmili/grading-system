import "server-only";
import { and, asc, count, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import {
  relaunchableCauses,
  type AiProvider,
  type EvaluationError,
  type EvaluationOrigin,
  type EvaluationRef,
  type NotAssessableCause,
  type ProposalAlert,
} from "@/lib/evaluation";
import type { CriterionId, Level } from "@/lib/rubric";
import type { TransitionId } from "@/lib/submission-status";
import { assembleText, type ReadingOutcome } from "@/lib/transcription";
import type { EvaluationInput } from "@/server/ai/request";
import { db } from "@/server/db/client";
import {
  aiProposals,
  assignments,
  evaluationRuns,
  readingRuns,
  securityEvents,
  submissionPages,
  submissions,
  submissionTranscriptions,
  submissionVersions,
  users,
} from "@/server/db/schema";
import { appendJournal } from "../review/record";
import type { PageReadResult } from "../submissions/drafts";
import { applyTransition, clearEvaluationRequest, markRestarted, markTranscribing } from "../submissions/transitions";

// System processing of the evaluation (§5.5, transitions 2, 5, 6 and 7): no Actor,
// called only by the evaluation service (src/server/evaluation/). Listed in
// inventory.ts. The only place that adds evaluation runs and AI proposals
// (tests/evaluation-writes.test.ts); a trigger refuses any later change (0011).

type Executor = Pick<typeof db, "select">;

/**
 * The whitelist of a submission for the AI (EVL-02), column by column: the
 * active version's text and the assignment's subject, instructions and
 * language. Nothing else is read: no title, level, deadline, lateness, name,
 * mode or identifier. An image version (E9, spec 0011) gives its
 * transcription: the text the student confirmed, or the one the pipeline
 * read. Null when the submission does not exist, or its active version has
 * no text yet (an image version not read): never evaluated. The version
 * number comes back beside the input, never in it: it guards the result.
 */
export async function readEvaluationInput(
  executor: Executor,
  submissionId: string,
): Promise<{ versionNumber: number; noWriting: boolean; input: EvaluationInput } | null> {
  const [row] = await executor
    .select({
      versionNumber: submissionVersions.number,
      text: sql<string | null>`coalesce(${submissionVersions.text}, ${submissionTranscriptions.text})`,
      // AC-6: an image version whose every page was read without writing.
      noWriting: sql<boolean>`${submissionVersions.mode} = 'images' and not exists (select 1 from ${submissionPages} where ${submissionPages.versionId} = ${submissionVersions.id} and ${submissionPages.hasWriting})`,
      subject: assignments.subject,
      instructions: assignments.instructions,
      language: assignments.language,
    })
    .from(submissions)
    .innerJoin(
      submissionVersions,
      and(eq(submissionVersions.submissionId, submissions.id), eq(submissionVersions.number, submissions.currentVersion)),
    )
    .leftJoin(submissionTranscriptions, eq(submissionTranscriptions.versionId, submissionVersions.id))
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(eq(submissions.id, submissionId));
  if (!row || row.text === null) return null;
  const { versionNumber, noWriting, ...input } = row;
  return { versionNumber, noWriting, input: { ...input, text: row.text } };
}

/**
 * A submission taken for evaluation: the version evaluated, its whitelist,
 * and the token of the claim (E6), which guards every later write of it.
 * `noWriting` (E9, AC-6): an image version without writing on any page, for
 * the blocking alerts; beside the whitelist, never in it.
 */
export type EvaluationClaim = { submissionId: string; versionNumber: number; claimToken: string; noWriting: boolean; input: EvaluationInput };

/** What records or frees a claim: never the whitelist. */
export type ClaimRef = Pick<EvaluationClaim, "submissionId" | "versionNumber" | "claimToken">;

/** The submission is still under this claim: its version and its token. */
const heldBy = (claim: ClaimRef) =>
  and(eq(submissions.currentVersion, claim.versionNumber), eq(submissions.claimToken, claim.claimToken));

/** The advisory lock that serializes the claims while they count the places taken (E6): a constant key. */
const EVALUATION_SLOTS_LOCK = 0x4556_414c;

/** The states that hold a claim and a place: transcribing and evaluating runs count together (E9, spec 0011). */
const CLAIMED = ["transcribing", "evaluating"] as const;

/** Submissions transcribing or evaluating, claimed less than `stuckAfterMs` ago: a stuck one holds no place. */
const evaluatingSince = (stuckAfterMs: number) =>
  and(
    inArray(submissions.status, [...CLAIMED]),
    sql`${submissions.updatedAt} > now() - make_interval(secs => ${stuckAfterMs / 1000})`,
  );

export type ClaimOptions = {
  /** E6: the version a submission or replacement triggered; any other active version is not claimed. */
  expectedVersion?: number;
  /** E6 (PRC-01 R3): most submissions evaluating at once; "busy" when they are all taken. */
  slots?: { concurrency: number; stuckAfterMs: number };
  /** E6.3: the transition of the claim, "auto" by default (EvaluationRef). */
  origin?: EvaluationOrigin;
  /** E6.6: the teacher's request a retry or relaunch claims (EvaluationRef). */
  request?: string;
  /**
   * E9 (spec 0011): the run transcribed this version itself and holds it,
   * transcribing, under its token: the claim is transition 3, without a new
   * place (the run holds one already) nor the origin's state.
   */
  transcribed?: boolean;
};

/**
 * Where each origin claims from (§5.5). The teacher's retry and relaunch
 * were authorized when asked (teacher.ts), which stored the request; here the
 * state is checked again, under the row lock, with that request: a copy
 * evaluated by hand (teacher_started_at), replaced, or already claimed for
 * this request is never claimed (E6.6: a request evaluates once, even when
 * its first run failed back to evaluation_failed; a ref without the stored
 * request, forged or replayed, claims nothing). A relaunch claims a
 * relaunchable cause only; whether it disappeared is checked again by the
 * attempts (the rubric, the cost cap): if not, the copy becomes not assessable
 * again, without a loop.
 */
function claimFrom(origin: EvaluationOrigin, request: string | undefined): { transition: TransitionId; from: SQL } {
  if (origin === "auto") return { transition: 2, from: eq(submissions.status, "received") };
  const requested = request === undefined ? sql`false` : eq(submissions.evaluationRequest, request);
  const open = and(isNull(submissions.teacherStartedAt), requested)!;
  if (origin === "retry") return { transition: 6, from: and(eq(submissions.status, "evaluation_failed"), open)! };
  return {
    transition: 7,
    from: and(eq(submissions.status, "not_assessable"), inArray(submissions.notAssessableCause, [...relaunchableCauses]), open)!,
  };
}

/**
 * Transition 2, received → evaluating, for a text or a checked image version (or 6 and 7 for the
 * teacher's retry and relaunch, `origin`, E6.3). One transaction: the row
 * is locked first, then the whitelist is read in a later statement (a fresh
 * snapshot), then the transition is guarded by the version read. Null when
 * the submission is not in the state of its origin (received by default) or
 * its active version has no text yet (images not read, E9). Two
 * claims at once give one evaluation; a replacement at the same time is
 * waited for, never missed. With `expectedVersion`, null as well when another
 * version is active: a trigger of a replaced text evaluates nothing (SUB-05
 * R2). With `slots`, the claims take an advisory lock in turn (held until
 * their commit, valid behind Neon's pooler), then count the places taken:
 * "busy" when none is free, and nothing changes. A count without the lock
 * would let two claims in at 9. `claimToken` (the workflow run's identifier)
 * is stored with the state: only its holder records a result or frees it.
 * `transcribed` (E9): transition 3 of the run that transcribed the version
 * itself (finishTranscription), under its own token, without a new place.
 */
export async function claimForEvaluation(
  submissionId: string,
  claimToken: string,
  opts: ClaimOptions = {},
): Promise<EvaluationClaim | "busy" | null> {
  const { expectedVersion } = opts;
  const slots = opts.transcribed ? undefined : opts.slots;
  const { transition, from } = opts.transcribed
    ? { transition: 3 as const, from: and(eq(submissions.status, "transcribing"), eq(submissions.claimToken, claimToken))! }
    : claimFrom(opts.origin ?? "auto", opts.request);
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.id, submissionId),
          from,
          expectedVersion === undefined ? undefined : eq(submissions.currentVersion, expectedVersion),
        ),
      )
      .for("update");
    if (!locked) return null;
    if (slots) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${EVALUATION_SLOTS_LOCK})`);
      const [taken] = await tx.select({ count: count() }).from(submissions).where(evaluatingSince(slots.stuckAfterMs));
      if (taken.count >= slots.concurrency) return "busy";
    }
    const read = await readEvaluationInput(tx, submissionId);
    if (!read) return null;
    const claimed = await applyTransition(tx, submissionId, transition, "evaluating", {
      where: and(eq(submissions.currentVersion, read.versionNumber), from),
      // The database clock, not the container's: releaseStuckEvaluations compares it in SQL.
      set: { updatedAt: sql`now()`, claimToken },
    });
    return claimed ? { submissionId, claimToken, ...read } : null;
  });
}

/**
 * Whether the claim still holds: the submission is evaluating the same
 * version under the same token. Read before a new attempt, so a replaced or
 * released text is not sent again.
 */
export async function stillEvaluating(claim: ClaimRef): Promise<boolean> {
  const [row] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.id, claim.submissionId), eq(submissions.status, "evaluating"), heldBy(claim)));
  return !!row;
}

/** How a run went, without content (QUA-02, EXP-01). */
export type RunRecord = {
  provider: AiProvider;
  modelRequested: string | null;
  modelAnswered: string | null;
  providerAnswered: string | null;
  promptVersion: string | null;
  rubricVersion: string | null;
  /** Attempts started, the one a replacement stopped included. */
  attempts: number;
  attemptErrors: EvaluationError[];
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

/** A conform answer, checked by the validator, with its alerts and the grade the system calculated. */
export type ProposalRecord = {
  criteria: Record<CriterionId, { level: Level; justification: string; quotes: string[] }>;
  generalComment: string;
  nextSteps: string[];
  alerts: ProposalAlert[];
  proposedGrade: number;
};

/**
 * `unavailable` (E6): the attempts failed because the AI is unavailable to
 * the application (a budget error, or the monthly cost cap reached after a
 * call): the run is a failure, the submission becomes not assessable, "AI
 * unavailable", and waits for the teacher's relaunch (transition 7).
 */
export type EvaluationResult =
  | { outcome: "proposed"; run: RunRecord; proposal: ProposalRecord }
  | { outcome: "failed"; run: RunRecord; unavailable?: boolean }
  | { outcome: "not_assessable"; cause: NotAssessableCause; run: RunRecord };

/**
 * What became of the submission: the state reached, or "stale" when its text
 * was replaced meanwhile. Either way the run (and its proposal) is kept;
 * a stale one is never current (SUB-05 R2).
 */
export type RecordedEvaluation = {
  status: "to_review" | "evaluation_failed" | "not_assessable" | "stale";
  runId: string;
  proposalId: string | null;
};

const STATUS_OF = { proposed: "to_review", failed: "evaluation_failed", not_assessable: "not_assessable" } as const;

/**
 * Transition 5, evaluating → to_review, evaluation_failed or not_assessable.
 * One transaction: the run is added (and its proposal, when there is one),
 * then the transition is guarded by the version evaluated and the claim's
 * token, and points the submission to the proposal. When the text was
 * replaced meanwhile, or the claim released (and maybe taken again by another
 * run), the transition is refused and the rows stay, not current.
 */
export async function recordEvaluation(claim: ClaimRef, result: EvaluationResult): Promise<RecordedEvaluation> {
  const { submissionId, versionNumber } = claim;
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(evaluationRuns)
      .values({
        ...result.run,
        submissionId,
        versionNumber,
        outcome: result.outcome,
        notAssessableCause: result.outcome === "not_assessable" ? result.cause : null,
      })
      .returning({ id: evaluationRuns.id });

    let proposalId: string | null = null;
    if (result.outcome === "proposed") {
      const { criteria: c, generalComment, nextSteps, alerts, proposedGrade } = result.proposal;
      const [proposal] = await tx
        .insert(aiProposals)
        .values({
          runId: run.id,
          submissionId,
          versionNumber,
          levelTask: c.task.level,
          levelOrganization: c.organization.level,
          levelVocabulary: c.vocabulary.level,
          levelGrammar: c.grammar.level,
          levelMechanics: c.mechanics.level,
          justificationTask: c.task.justification,
          justificationOrganization: c.organization.justification,
          justificationVocabulary: c.vocabulary.justification,
          justificationGrammar: c.grammar.justification,
          justificationMechanics: c.mechanics.justification,
          quotesTask: c.task.quotes,
          quotesOrganization: c.organization.quotes,
          quotesVocabulary: c.vocabulary.quotes,
          quotesGrammar: c.grammar.quotes,
          quotesMechanics: c.mechanics.quotes,
          generalComment,
          nextSteps,
          alerts,
          proposedGrade,
        })
        .returning({ id: aiProposals.id });
      proposalId = proposal.id;
    }

    const unavailable = result.outcome === "failed" && result.unavailable === true;
    const to = unavailable ? "not_assessable" : STATUS_OF[result.outcome];
    const moved = await applyTransition(tx, submissionId, 5, to, {
      where: heldBy(claim),
      set:
        result.outcome === "proposed"
          ? { currentProposalId: proposalId }
          : result.outcome === "not_assessable"
            ? { notAssessableCause: result.cause }
            : unavailable
              ? { notAssessableCause: "ai_unavailable" as const }
              : {},
    });
    return { status: moved ? to : "stale", runId: run.id, proposalId };
  });
}

/** The received submissions of an assignment, identifiers only (PRC-01). */
export async function listReceived(assignmentId: string): Promise<string[]> {
  const rows = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.status, "received")))
    .orderBy(submissions.submittedAt, submissions.id);
  return rows.map((row) => row.id);
}

/**
 * Transition 5, evaluating → evaluation_failed, without a run: the result of
 * the claim could not be recorded (the database refused it twice), the
 * breaker stopped it, or the workflow's step failed (releaseStep, E6). A run
 * still transcribing (E9) ends transcription_failed instead (transition 3).
 * Guarded by the version and the token of the claim: a run frees its own
 * claim only, never another run's. False when the submission is no longer
 * under this claim.
 */
export async function releaseEvaluation(claim: ClaimRef): Promise<boolean> {
  return db.transaction(async (tx) => {
    const moved =
      (await applyTransition(tx, claim.submissionId, 5, "evaluation_failed", { where: heldBy(claim) })) ??
      (await applyTransition(tx, claim.submissionId, 3, "transcription_failed", { where: heldBy(claim) }));
    return !!moved;
  });
}

/**
 * E7.6 (E6.6's open point, plan of E7 §1.11): a teacher's retry or relaunch
 * whose run found no evaluation place in time. Its request is dropped, it
 * only, and the log says so, by the system (no actor): the copy shows the
 * teacher why nothing happened. False when the request is no longer stored
 * (claimed, replaced by a newer one, or the copy replaced): nothing logged.
 */
export async function abandonEvaluationRequest(ref: EvaluationRef): Promise<boolean> {
  if (ref.origin === undefined || ref.origin === "auto" || ref.request === undefined) return false;
  const { request, origin } = ref;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ assignmentId: submissions.assignmentId })
      .from(submissions)
      .where(
        and(
          eq(submissions.id, ref.submissionId),
          eq(submissions.currentVersion, ref.versionNumber),
          eq(submissions.evaluationRequest, request),
        ),
      )
      .for("update");
    if (!row || !(await clearEvaluationRequest(tx, ref.submissionId, request))) return false;
    await appendJournal(tx, [
      {
        assignmentId: row.assignmentId,
        submissionId: ref.submissionId,
        actorId: null,
        event: "retry_abandoned",
        newValue: { origin },
        versionNumber: ref.versionNumber,
      },
    ]);
    return true;
  });
}

/**
 * PRC-02 R1: no submission stays evaluating. Those claimed longer ago than
 * `afterMs` (compared in SQL, on the database clock of the claim) go to
 * evaluation_failed, without a run: what the abandoned evaluation did is not
 * known (a crash, a killed process). Its result, if it ever arrives, is kept
 * but not current, like a replaced text's. Those transcribing (E9), dated by
 * their claim or their last page read (markTranscribing), go to
 * transcription_failed, for the teacher to relaunch. Identifiers of the released ones.
 */
export async function releaseStuckEvaluations(afterMs: number): Promise<string[]> {
  const stale = sql`${submissions.updatedAt} < now() - make_interval(secs => ${afterMs / 1000})`;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: submissions.id, status: submissions.status })
      .from(submissions)
      .where(and(inArray(submissions.status, [...CLAIMED]), stale))
      .orderBy(submissions.id)
      .for("update");
    const released: string[] = [];
    for (const { id, status } of rows) {
      const moved =
        status === "transcribing"
          ? await applyTransition(tx, id, 3, "transcription_failed", { where: stale })
          : await applyTransition(tx, id, 5, "evaluation_failed", { where: stale });
      if (moved) released.push(id);
    }
    return released;
  });
}

/**
 * The submissions still received `graceMs` after they were submitted,
 * replaced or last started again (E6, the sweep): their trigger failed, their
 * run gave up waiting for a place, or the process stopped. The oldest first,
 * `limit` at most; identifiers and the active version only. Taken, they are
 * dated (markRestarted, E6.6): the next sweeps leave each to the run just
 * started for another grace, longer than its waits, and take the others
 * first; two sweeps at once take different ones (skip locked). updated_at of
 * a submitted or replaced row is set by the application's clock: off by
 * seconds at most, under a grace of minutes.
 */
export async function takeStaleReceived(graceMs: number, limit: number): Promise<EvaluationRef[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          // Every mode (E9): the run transcribes first an image version the student did not check.
          eq(submissions.status, "received"),
          sql`${submissions.updatedAt} < now() - make_interval(secs => ${graceMs / 1000})`,
        ),
      )
      .orderBy(submissions.updatedAt, submissions.id)
      .limit(limit)
      .for("update", { of: submissions, skipLocked: true });
    const taken = await markRestarted(
      tx,
      rows.map((row) => row.id),
    );
    const order = new Map(rows.map((row, i) => [row.id, i]));
    return taken.sort((a, b) => order.get(a.submissionId)! - order.get(b.submissionId)!);
  });
}

/** What the guard of the AI reads (E6, EXP-02), counts only. */
export type AiGuardCounts = {
  /** Tokens of Anthropic's runs since the first day of the UTC month: what the application spent. */
  promptTokens: number;
  completionTokens: number;
  /**
   * E6.6: calls to Anthropic this month whose usage no run holds, to be
   * counted at a ceiling: the attempts that ended on a timeout (sent, maybe
   * billed, never counted), and the requests sent beyond the calls of the
   * runs (ai_request_sent, journaled before every sending: the trial's calls,
   * a result the database refused, a step killed). By excess.
   */
  uncountedCalls: number;
  /** Distinct subjects (a submission, or a draft for the student's readings, E9) whose run with this provider failed last on configuration or rejected, within the window. */
  breakerFailures: number;
};

/**
 * Three queries for the cost cap and the circuit breaker, over the evaluation runs and, E9, the reading runs. The cost counts
 * Anthropic's runs and requests whatever the provider in use: it is real
 * money; the breaker counts the provider in use only (a simulated 401 never
 * stops a real provider, and the other way round). The calls of a run are its
 * attempts that reached the provider: an answer, or an error other than
 * superseded and internal (an internal one may follow a call: not counted, so
 * by excess again). ai_request_sent names no provider: the calls of every
 * real provider's runs are taken from it (OpenRouter's, until 2026-10-19),
 * those of Anthropic alone are priced.
 */
export async function readAiGuardCounts(provider: AiProvider, breakerWindowMs: number): Promise<AiGuardCounts> {
  const monthStart = sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`;
  const errors = evaluationRuns.attemptErrors;
  const lastError = sql`${errors}[cardinality(${errors})]`;
  const times = (error: EvaluationError) => sql`cardinality(array_positions(${errors}, ${error}::evaluation_error))`;
  const anthropicThisMonth = sql`${evaluationRuns.provider} = 'anthropic' and ${evaluationRuns.createdAt} >= ${monthStart}`;
  const sentThisMonth = sql`${evaluationRuns.provider} <> 'simulator' and ${evaluationRuns.createdAt} >= ${monthStart}`;
  const [row] = await db
    .select({
      promptTokens: sql<string>`coalesce(sum(${evaluationRuns.promptTokens}) filter (where ${anthropicThisMonth}), 0)`,
      completionTokens: sql<string>`coalesce(sum(${evaluationRuns.completionTokens}) filter (where ${anthropicThisMonth}), 0)`,
      timeouts: sql<string>`coalesce(sum(${times("timeout")}) filter (where ${anthropicThisMonth}), 0)`,
      calls: sql<string>`coalesce(sum(cardinality(${errors}) - ${times("superseded")} - ${times("internal")} + (${evaluationRuns.outcome} = 'proposed')::int) filter (where ${sentThisMonth}), 0)`,
      sent: sql<string>`(select count(*) from ${securityEvents} where ${securityEvents.type} = 'ai_request_sent' and ${securityEvents.createdAt} >= ${monthStart})`,
    })
    .from(evaluationRuns)
    .where(sql`${evaluationRuns.createdAt} >= ${monthStart}`);

  // E9 (spec 0011): the page readings, interactive and by the pipeline, count as the evaluations do.
  const readErrors = readingRuns.attemptErrors;
  const readTimes = (error: EvaluationError) => sql`cardinality(array_positions(${readErrors}, ${error}::evaluation_error))`;
  const readAnthropic = sql`${readingRuns.provider} = 'anthropic'`;
  const [reads] = await db
    .select({
      promptTokens: sql<string>`coalesce(sum(${readingRuns.promptTokens}) filter (where ${readAnthropic}), 0)`,
      completionTokens: sql<string>`coalesce(sum(${readingRuns.completionTokens}) filter (where ${readAnthropic}), 0)`,
      timeouts: sql<string>`coalesce(sum(${readTimes("timeout")}) filter (where ${readAnthropic}), 0)`,
      calls: sql<string>`coalesce(sum(cardinality(${readErrors}) - ${readTimes("superseded")} - ${readTimes("internal")} + (${readingRuns.outcome} <> 'failed')::int) filter (where ${readingRuns.provider} <> 'simulator'), 0)`,
    })
    .from(readingRuns)
    .where(sql`${readingRuns.createdAt} >= ${monthStart}`);

  // The breaker's subjects: a submission's evaluations or readings, or a draft's readings.
  const window = sql`now() - make_interval(secs => ${breakerWindowMs / 1000})`;
  const readLastError = sql`${readErrors}[cardinality(${readErrors})]`;
  const [breaker] = await db
    .execute<{ failures: number }>(
      sql`select count(distinct subject)::int as failures from (
        select ${evaluationRuns.submissionId} as subject from ${evaluationRuns}
        where ${evaluationRuns.provider} = ${provider} and ${evaluationRuns.outcome} = 'failed' and ${lastError} in ('configuration', 'rejected') and ${evaluationRuns.createdAt} > ${window}
        union
        select coalesce(${readingRuns.submissionId}, ${readingRuns.draftId}) from ${readingRuns}
        where ${readingRuns.provider} = ${provider} and ${readingRuns.outcome} = 'failed' and ${readLastError} in ('configuration', 'rejected') and ${readingRuns.createdAt} > ${window}
      ) failed`,
    )
    .then((result) => result.rows);

  return {
    promptTokens: Number(row.promptTokens) + Number(reads.promptTokens),
    completionTokens: Number(row.completionTokens) + Number(reads.completionTokens),
    uncountedCalls: Number(row.timeouts) + Number(reads.timeouts) + Math.max(0, Number(row.sent) - Number(row.calls) - Number(reads.calls)),
    breakerFailures: breaker.failures,
  };
}

/**
 * E7.6 (EXP-02, E6.6's open point): distinct submissions with a run of this
 * provider, within the window, that failed last on unavailable or timeout
 * (the provider not reached, its attempts spent). Read only after such a failure.
 */
export async function countUnreachableFailures(provider: AiProvider, windowMs: number): Promise<number> {
  const errors = evaluationRuns.attemptErrors;
  const [row] = await db
    .select({ failures: sql<number>`count(distinct ${evaluationRuns.submissionId})::int` })
    .from(evaluationRuns)
    .where(
      and(
        eq(evaluationRuns.provider, provider),
        eq(evaluationRuns.outcome, "failed"),
        sql`${errors}[cardinality(${errors})] in ('unavailable', 'timeout')`,
        sql`${evaluationRuns.createdAt} > now() - make_interval(secs => ${windowMs / 1000})`,
      ),
    );
  return row.failures;
}

/** The alerts of the AI to the administrators (E6; the configuration, E6.6; the provider unreachable, E7.6). */
export type AiAlert = "ai_cost_cap_reached" | "ai_breaker_tripped" | "ai_configuration_failed" | "ai_provider_unreachable";

/**
 * Records an alert once per period (the UTC month for the cost cap, the
 * window for the breaker and the configuration) once `send` emailed the
 * administrators' addresses it is given. An advisory lock per alert lets one
 * of two evaluations at once record it; the other waits, then finds it. When
 * `send` fails, nothing is recorded (E6.6): the next guard tries again, so an
 * alert is never lost, at the cost of a second email if a failed send had
 * delivered after all. False when the period already has it. The security
 * log keeps the event, without subject or content.
 */
export async function claimAiAlert(alert: AiAlert, windowMs: number, send: (emails: string[]) => Promise<void>): Promise<boolean> {
  const since =
    alert === "ai_cost_cap_reached"
      ? sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`
      : sql`now() - make_interval(secs => ${windowMs / 1000})`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${EVALUATION_SLOTS_LOCK}, hashtext(${alert}))`);
    const [already] = await tx
      .select({ id: securityEvents.id })
      .from(securityEvents)
      .where(and(eq(securityEvents.type, alert), sql`${securityEvents.createdAt} >= ${since}`))
      .limit(1);
    if (already) return false;
    const admins = await tx.select({ email: users.email }).from(users).where(eq(users.role, "admin"));
    await send(admins.map((admin) => admin.email));
    await tx.insert(securityEvents).values({ type: alert });
    return true;
  });
}

// E9 (spec 0011): the pipeline's reading of an image version the student did
// not check (sent without transcription, AC-7): transition 2 (or 4, the
// teacher's relaunch) to transcribing, one step per page, then the assembly
// and transition 3. The claim, its token and its places are the evaluation's.

/** A version taken for transcription: the claim, and its pages not read yet, in order. */
export type TranscriptionClaim = ClaimRef & { pageIds: string[] };

/** The submission is transcribing this version under this claim. */
const transcribingUnder = (claim: ClaimRef) => and(eq(submissions.status, "transcribing"), heldBy(claim));

/**
 * Where a transcription claims from: received (transition 2), or
 * transcription_failed for the teacher's relaunch (transition 4, origin
 * "retry"), with the request they stored and never on a copy evaluated by
 * hand, as for the evaluation's retry (claimFrom). A relaunch of a not
 * assessable copy is never a transcription.
 */
function transcriptionFrom(origin: EvaluationOrigin, request: string | undefined): { transition: TransitionId; from: SQL } | null {
  if (origin === "auto") return { transition: 2, from: eq(submissions.status, "received") };
  if (origin === "relaunch") return null;
  const requested = request === undefined ? sql`false` : eq(submissions.evaluationRequest, request);
  return { transition: 4, from: and(eq(submissions.status, "transcription_failed"), isNull(submissions.teacherStartedAt), requested)! };
}

/**
 * Transition 2 (or 4), to transcribing, for an image version the student did
 * not check; null for any other (a text, a checked version: the evaluation's
 * claim takes it), or when the submission is not in the state of its origin.
 * One transaction, as claimForEvaluation: the row locked, the version read
 * again, the places counted under the same advisory lock (transcribing and
 * evaluating together), the transition guarded by the version read, with the
 * token and the database clock. The pages already read (by the student
 * before sending, or by an earlier run) are not read again.
 */
export async function claimForTranscription(
  submissionId: string,
  claimToken: string,
  opts: ClaimOptions = {},
): Promise<TranscriptionClaim | "busy" | null> {
  const origin = transcriptionFrom(opts.origin ?? "auto", opts.request);
  if (!origin) return null;
  const { transition, from } = origin;
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.id, submissionId),
          from,
          opts.expectedVersion === undefined ? undefined : eq(submissions.currentVersion, opts.expectedVersion),
        ),
      )
      .for("update");
    if (!locked) return null;
    const [version] = await tx
      .select({ id: submissionVersions.id, number: submissionVersions.number })
      .from(submissions)
      .innerJoin(
        submissionVersions,
        and(eq(submissionVersions.submissionId, submissions.id), eq(submissionVersions.number, submissions.currentVersion)),
      )
      .innerJoin(submissionTranscriptions, eq(submissionTranscriptions.versionId, submissionVersions.id))
      .where(and(eq(submissions.id, submissionId), eq(submissionTranscriptions.checkedByStudent, false)));
    if (!version) return null;
    if (opts.slots) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${EVALUATION_SLOTS_LOCK})`);
      const [taken] = await tx.select({ count: count() }).from(submissions).where(evaluatingSince(opts.slots.stuckAfterMs));
      if (taken.count >= opts.slots.concurrency) return "busy";
    }
    const claimed = await applyTransition(tx, submissionId, transition, "transcribing", {
      where: and(eq(submissions.currentVersion, version.number), from),
      set: { updatedAt: sql`now()`, claimToken },
    });
    if (!claimed) return null;
    const pages = await tx
      .select({ id: submissionPages.id })
      .from(submissionPages)
      .where(and(eq(submissionPages.versionId, version.id), ne(submissionPages.readingStatus, "read")))
      .orderBy(asc(submissionPages.position));
    return { submissionId, versionNumber: version.number, claimToken, pageIds: pages.map((page) => page.id) };
  });
}

/**
 * A page's JPEG for the pipeline's reading, while the claim holds: "read"
 * when it already is (a step delivered twice), null when the claim no longer
 * holds (the version replaced, the claim released) or the page is not of
 * this version: nothing is sent (AC-10).
 */
export async function readTranscriptionPage(claim: ClaimRef, pageId: string): Promise<{ jpeg: Buffer } | "read" | null> {
  const [page] = await db
    .select({ image: submissionPages.image, status: submissionPages.readingStatus })
    .from(submissionPages)
    .innerJoin(submissionVersions, eq(submissionVersions.id, submissionPages.versionId))
    .innerJoin(submissions, eq(submissions.id, submissionVersions.submissionId))
    .where(
      and(
        eq(submissionPages.id, pageId),
        eq(submissions.id, claim.submissionId),
        eq(submissionVersions.number, claim.versionNumber),
        transcribingUnder(claim),
      ),
    );
  if (!page) return null;
  return page.status === "read" ? "read" : { jpeg: page.image };
}

/**
 * The pipeline's reading of one page: its run recorded in any case (the call
 * was made), then, only while the claim holds, the reading written to the
 * page (pending or failed to read, the one change an attached page allows,
 * 0022) and the claim dated again (markTranscribing), so that the release of
 * stuck runs counts from the last page. "stopped" when the claim no longer
 * holds: a replaced version gets no reading (AC-10). A failed reading leaves
 * the page as it was.
 */
export async function recordTranscriptionPage(
  claim: ClaimRef,
  pageId: string,
  result: PageReadResult,
): Promise<ReadingOutcome | "stopped"> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(readingRuns)
      .values({ ...result.run, pageId, submissionId: claim.submissionId })
      .returning({ id: readingRuns.id });
    const [held] = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.id, claim.submissionId), transcribingUnder(claim)))
      .for("update");
    if (!held) return "stopped";
    const { reading } = result;
    if (reading) {
      await tx
        .update(submissionPages)
        .set({ readingStatus: "read", readingText: reading.text, hasWriting: reading.hasWriting, readingRunId: run.id, readAt: sql`now()` })
        .where(and(eq(submissionPages.id, pageId), inArray(submissionPages.readingStatus, ["pending", "failed"])));
    }
    await markTranscribing(tx, claim.submissionId, heldBy(claim)!);
    return result.run.outcome;
  });
}

/** How a transcription ended: assembled and handed to the evaluation, failed, without writing, or no longer this run's. */
export type TranscriptionEnd = "assembled" | "transcription_failed" | "not_assessable" | "stale";

/**
 * After the pages' steps, under the claim (compare and set on its token): a
 * page still not read ends the run transcription_failed (transition 3, for
 * the teacher to relaunch or evaluate by hand); otherwise the text is
 * assembled from the readings in page order, without changes, and written
 * once (it stays when an earlier run wrote it). No page with writing:
 * not_assessable, no_writing (transition 3, AC-6). Else "assembled": the
 * submission stays transcribing under the token, for the evaluation's claim
 * (claimForEvaluation, `transcribed`).
 */
export async function finishTranscription(claim: ClaimRef): Promise<TranscriptionEnd> {
  return db.transaction(async (tx) => {
    const [held] = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.id, claim.submissionId), transcribingUnder(claim)))
      .for("update");
    if (!held) return "stale";
    const [version] = await tx
      .select({ id: submissionVersions.id })
      .from(submissionVersions)
      .where(and(eq(submissionVersions.submissionId, claim.submissionId), eq(submissionVersions.number, claim.versionNumber)));
    const pages = await tx
      .select({
        position: submissionPages.position,
        status: submissionPages.readingStatus,
        text: submissionPages.readingText,
        hasWriting: submissionPages.hasWriting,
      })
      .from(submissionPages)
      .where(eq(submissionPages.versionId, version.id));
    if (pages.length === 0 || pages.some((page) => page.status !== "read")) {
      await applyTransition(tx, claim.submissionId, 3, "transcription_failed", { where: heldBy(claim) });
      return "transcription_failed";
    }
    const text = assembleText(pages.map((page) => ({ position: page.position, hasWriting: page.hasWriting!, text: page.text! })));
    await tx
      .update(submissionTranscriptions)
      .set({ text })
      .where(and(eq(submissionTranscriptions.versionId, version.id), isNull(submissionTranscriptions.text)));
    if (!pages.some((page) => page.hasWriting)) {
      await applyTransition(tx, claim.submissionId, 3, "not_assessable", { where: heldBy(claim), set: { notAssessableCause: "no_writing" } });
      return "not_assessable";
    }
    await markTranscribing(tx, claim.submissionId, heldBy(claim)!);
    return "assembled";
  });
}
