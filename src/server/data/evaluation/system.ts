import "server-only";
import { and, count, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
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
import type { EvaluationInput } from "@/server/ai/request";
import { db } from "@/server/db/client";
import { aiProposals, assignments, evaluationRuns, securityEvents, submissions, submissionVersions, users } from "@/server/db/schema";
import { applyTransition } from "../submissions/transitions";

// System processing of the evaluation (§5.5, transitions 2, 5, 6 and 7): no Actor,
// called only by the evaluation service (src/server/evaluation/). Listed in
// inventory.ts. The only place that adds evaluation runs and AI proposals
// (tests/evaluation-writes.test.ts); a trigger refuses any later change (0011).

type Executor = Pick<typeof db, "select">;

/**
 * The whitelist of a submission for the AI (EVL-02), column by column: the
 * active version's text and the assignment's subject, instructions and
 * language. Nothing else is read: no title, level, deadline, lateness, name or
 * identifier. Null when the submission does not exist or its active version
 * is not a text (images: E9). The version number comes back beside the
 * input, never in it: it guards the result.
 */
export async function readEvaluationInput(
  executor: Executor,
  submissionId: string,
): Promise<{ versionNumber: number; input: EvaluationInput } | null> {
  const [row] = await executor
    .select({
      versionNumber: submissionVersions.number,
      text: submissionVersions.text,
      subject: assignments.subject,
      instructions: assignments.instructions,
      language: assignments.language,
    })
    .from(submissions)
    .innerJoin(
      submissionVersions,
      and(eq(submissionVersions.submissionId, submissions.id), eq(submissionVersions.number, submissions.currentVersion)),
    )
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(eq(submissions.id, submissionId), eq(submissionVersions.mode, "text")));
  if (!row || row.text === null) return null;
  const { versionNumber, ...input } = row;
  return { versionNumber, input: { ...input, text: row.text } };
}

/**
 * A submission taken for evaluation: the version evaluated, its whitelist,
 * and the token of the claim (E6), which guards every later write of it.
 */
export type EvaluationClaim = { submissionId: string; versionNumber: number; claimToken: string; input: EvaluationInput };

/** What records or frees a claim: never the whitelist. */
export type ClaimRef = Pick<EvaluationClaim, "submissionId" | "versionNumber" | "claimToken">;

/** The submission is still under this claim: its version and its token. */
const heldBy = (claim: ClaimRef) =>
  and(eq(submissions.currentVersion, claim.versionNumber), eq(submissions.claimToken, claim.claimToken));

/** The advisory lock that serializes the claims while they count the places taken (E6): a constant key. */
const EVALUATION_SLOTS_LOCK = 0x4556_414c;

/** Submissions evaluating, claimed less than `stuckAfterMs` ago: a stuck one holds no place. */
const evaluatingSince = (stuckAfterMs: number) =>
  and(
    eq(submissions.status, "evaluating"),
    sql`${submissions.updatedAt} > now() - make_interval(secs => ${stuckAfterMs / 1000})`,
  );

export type ClaimOptions = {
  /** E6: the version a submission or replacement triggered; any other active version is not claimed. */
  expectedVersion?: number;
  /** E6 (PRC-01 R3): most submissions evaluating at once; "busy" when they are all taken. */
  slots?: { concurrency: number; stuckAfterMs: number };
  /** E6.3: the transition of the claim, "auto" by default (EvaluationRef). */
  origin?: EvaluationOrigin;
};

/**
 * Where each origin claims from (§5.5). The teacher's retry and relaunch
 * were authorized when asked (teacher.ts); here the state is checked again,
 * under the row lock: a copy evaluated by hand (teacher_started_at) or
 * replaced meanwhile is never claimed. A relaunch claims a relaunchable cause
 * only; whether it disappeared is checked again by the attempts (the rubric,
 * the cost cap): if not, the copy becomes not assessable again, without a loop.
 */
const CLAIM_FROM = {
  auto: { transition: 2, from: eq(submissions.status, "received") },
  retry: { transition: 6, from: and(eq(submissions.status, "evaluation_failed"), isNull(submissions.teacherStartedAt)) },
  relaunch: {
    transition: 7,
    from: and(
      eq(submissions.status, "not_assessable"),
      inArray(submissions.notAssessableCause, [...relaunchableCauses]),
      isNull(submissions.teacherStartedAt),
    ),
  },
} as const satisfies Record<EvaluationOrigin, { transition: TransitionId; from: SQL | undefined }>;

/**
 * Transition 2, received → evaluating, for a text (or 6 and 7 for the
 * teacher's retry and relaunch, `origin`, E6.3). One transaction: the row
 * is locked first, then the whitelist is read in a later statement (a fresh
 * snapshot), then the transition is guarded by the version read. Null when
 * the submission is not in the state of its origin (received by default) or
 * its active version is not a text. Two
 * claims at once give one evaluation; a replacement at the same time is
 * waited for, never missed. With `expectedVersion`, null as well when another
 * version is active: a trigger of a replaced text evaluates nothing (SUB-05
 * R2). With `slots`, the claims take an advisory lock in turn (held until
 * their commit, valid behind Neon's pooler), then count the places taken:
 * "busy" when none is free, and nothing changes. A count without the lock
 * would let two claims in at 9. `claimToken` (the workflow run's identifier)
 * is stored with the state: only its holder records a result or frees it.
 */
export async function claimForEvaluation(
  submissionId: string,
  claimToken: string,
  opts: ClaimOptions = {},
): Promise<EvaluationClaim | "busy" | null> {
  const { expectedVersion, slots } = opts;
  const { transition, from } = CLAIM_FROM[opts.origin ?? "auto"];
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
 * breaker stopped it, or the workflow's step failed (releaseStep, E6).
 * Guarded by the version and the token of the claim: a run frees its own
 * claim only, never another run's. False when the submission is no longer
 * under this claim.
 */
export async function releaseEvaluation(claim: ClaimRef): Promise<boolean> {
  return db.transaction(async (tx) => {
    const moved = await applyTransition(tx, claim.submissionId, 5, "evaluation_failed", { where: heldBy(claim) });
    return !!moved;
  });
}

/**
 * PRC-02 R1: no submission stays evaluating. Those claimed longer ago than
 * `afterMs` (compared in SQL, on the database clock of the claim) go to
 * evaluation_failed, without a run: what the abandoned evaluation did is not
 * known (a crash, a killed process). Its result, if it ever arrives, is kept
 * but not current, like a replaced text's. Identifiers of the released ones.
 */
export async function releaseStuckEvaluations(afterMs: number): Promise<string[]> {
  const stuck = and(
    eq(submissions.status, "evaluating"),
    sql`${submissions.updatedAt} < now() - make_interval(secs => ${afterMs / 1000})`,
  );
  return db.transaction(async (tx) => {
    const rows = await tx.select({ id: submissions.id }).from(submissions).where(stuck).orderBy(submissions.id).for("update");
    const released: string[] = [];
    for (const { id } of rows) {
      if (await applyTransition(tx, id, 5, "evaluation_failed", { where: stuck })) released.push(id);
    }
    return released;
  });
}

/**
 * The text submissions still received `graceMs` after they were submitted or
 * replaced (E6, the sweep): their trigger failed, their run gave up waiting
 * for a place, or the process stopped. The oldest first, `limit` at most;
 * identifiers and the active version only. updated_at of a received row is
 * set by the application's clock: off by seconds at most, under a grace of
 * minutes.
 */
export async function listStaleReceived(graceMs: number, limit: number): Promise<EvaluationRef[]> {
  const rows = await db
    .select({ submissionId: submissions.id, versionNumber: submissions.currentVersion })
    .from(submissions)
    .innerJoin(
      submissionVersions,
      and(eq(submissionVersions.submissionId, submissions.id), eq(submissionVersions.number, submissions.currentVersion)),
    )
    .where(
      and(
        eq(submissions.status, "received"),
        eq(submissionVersions.mode, "text"),
        sql`${submissions.updatedAt} < now() - make_interval(secs => ${graceMs / 1000})`,
      ),
    )
    .orderBy(submissions.updatedAt, submissions.id)
    .limit(limit);
  return rows;
}

/** What the guard of the AI reads (E6, EXP-02), counts only. */
export type AiGuardCounts = {
  /** Tokens of Anthropic's runs since the first day of the UTC month: what the application spent. */
  promptTokens: number;
  completionTokens: number;
  /** Distinct submissions whose run with this provider failed last on configuration or rejected, within the window. */
  breakerFailures: number;
};

/**
 * One query for the cost cap and the circuit breaker. The cost counts
 * Anthropic's runs whatever the provider in use: it is real money; the
 * breaker counts the provider in use only (a simulated 401 never stops a
 * real provider, and the other way round).
 */
export async function readAiGuardCounts(provider: AiProvider, breakerWindowMs: number): Promise<AiGuardCounts> {
  const monthStart = sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`;
  const lastError = sql`${evaluationRuns.attemptErrors}[cardinality(${evaluationRuns.attemptErrors})]`;
  const [row] = await db
    .select({
      promptTokens: sql<string>`coalesce(sum(${evaluationRuns.promptTokens}) filter (where ${evaluationRuns.provider} = 'anthropic' and ${evaluationRuns.createdAt} >= ${monthStart}), 0)`,
      completionTokens: sql<string>`coalesce(sum(${evaluationRuns.completionTokens}) filter (where ${evaluationRuns.provider} = 'anthropic' and ${evaluationRuns.createdAt} >= ${monthStart}), 0)`,
      breakerFailures: sql<number>`(count(distinct ${evaluationRuns.submissionId}) filter (where ${evaluationRuns.provider} = ${provider} and ${evaluationRuns.outcome} = 'failed' and ${lastError} in ('configuration', 'rejected') and ${evaluationRuns.createdAt} > now() - make_interval(secs => ${breakerWindowMs / 1000})))::int`,
    })
    .from(evaluationRuns)
    .where(
      sql`${evaluationRuns.createdAt} >= least(${monthStart}, now() - make_interval(secs => ${breakerWindowMs / 1000}))`,
    );
  return {
    promptTokens: Number(row.promptTokens),
    completionTokens: Number(row.completionTokens),
    breakerFailures: row.breakerFailures,
  };
}

/** The two alerts of the AI to the administrators (E6). */
export type AiAlert = "ai_cost_cap_reached" | "ai_breaker_tripped";

/**
 * Records an alert once per period (the UTC month for the cost cap, the
 * window for the breaker) and gives the administrators' addresses to email,
 * or none when the period already has it. An advisory lock per alert lets
 * one of two evaluations at once record it. The security log keeps the event,
 * without subject or content.
 */
export async function claimAiAlert(alert: AiAlert, windowMs: number): Promise<string[]> {
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
    if (already) return [];
    await tx.insert(securityEvents).values({ type: alert });
    const admins = await tx.select({ email: users.email }).from(users).where(eq(users.role, "admin"));
    return admins.map((admin) => admin.email);
  });
}
