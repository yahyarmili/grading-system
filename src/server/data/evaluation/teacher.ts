import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AssignmentLanguage } from "@/lib/assignment";
import type { EvaluationRef, RelaunchableCause } from "@/lib/evaluation";
import { isOneOf, retriedStatuses } from "@/lib/submission-status";
import type { Actor } from "@/server/access/actor";
import { authorize, type Grant } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assignments, submissions } from "@/server/db/schema";
import { ownedBy } from "../access";
import { acknowledgedNotice } from "../notices/notices";
import { appendJournal } from "../review/record";
import { recordEvaluationRequest } from "../submissions/transitions";

// PRC-02 (E6.3): what the owner teacher does with a copy the AI did not
// evaluate; the buttons come in E7 and E8. The retry (transition 6) and the
// relaunch (7) check the copy, store the request and hand both over: the
// workflow's step claims it, under the places and the guard of the AI
// (system.ts), for that request only. The manual evaluation (6 or 7, to
// to_review) is no longer here (E8.2): it is the first write of the
// teacher's evaluation (review/copy.ts#editLocked). Never automatic: only
// these functions and that write leave evaluation_failed and not_assessable;
// the sweep takes the received copies only.
// Each request is logged with it (E7.6, REV-04): retry_requested,
// relaunch_requested.

/** Starts the evaluation of a version once the request answered: after() in the Server Action (E7), a recorder in the tests. */
export type EvaluationStartContext = { onStart: (ref: EvaluationRef) => void };

/** The version the teacher saw: a copy replaced since is not acted upon ("changed"). */
export type SeenVersion = { submissionId: string; versionNumber: number };

/** What disappeared since copies became not assessable, read by the evaluation service (relaunch.ts). */
export type RelaunchConditions = {
  /** The languages with a published rubric now (EVL-01 R4). */
  rubricLanguages: readonly AssignmentLanguage[];
  /** This month's cost reached the cap (EXP-02). */
  costCapReached: boolean;
};

/** A copy offered for a relaunch (PRC-02 R4, CA3): identifiers and cause only. */
export type RelaunchableCopy = { submissionId: string; versionNumber: number; cause: RelaunchableCause };

export type RetryResult = { ok: true } | { ok: false; reason: "changed" | "not_failed" };
export type RelaunchResult = { ok: true } | { ok: false; reason: "changed" | "not_relaunchable" };

/**
 * The teacher's own copies, once their notice is read (NFR-DON-04, E7.7):
 * before, a copy acts as absent.
 */
const owned = (grant: Grant) =>
  and(ownedBy(grant, { teacher: submissions.teacherId }), acknowledgedNotice(grant.userId, "teacher_review"));

/**
 * The copy's last run failed on the provider's budget (spending limit,
 * credit, billing), and no run of the same provider was proposed since:
 * nothing shows yet that the provider takes calls again (its credit renewed
 * at the next cycle, the workspace's limit raised). The application cannot
 * read the provider's account; any later submission, evaluated
 * automatically, is the proof.
 */
const providerBudgetBlocked = sql<boolean>`exists (
  select 1 from (
    select r.provider, r.outcome, r.attempt_errors, r.created_at
    from evaluation_runs r
    where r.submission_id = ${submissions.id}
    order by r.created_at desc, r.id desc
    limit 1
  ) last_run
  where last_run.outcome = 'failed'
    and last_run.attempt_errors[cardinality(last_run.attempt_errors)] = 'budget'
    and not exists (
      select 1 from evaluation_runs later
      where later.provider = last_run.provider and later.outcome = 'proposed' and later.created_at > last_run.created_at
    )
)`;

/**
 * PRC-02 R4: not assessable for a cause that disappeared, and never evaluated
 * by hand. The rubric of its language is published; or the AI is available
 * again: the cost cap lifted and, after a budget error, the provider back.
 * no_content is never offered. Needs the join to assignments.
 */
function relaunchable(conditions: RelaunchConditions): SQL {
  const rubricBack =
    conditions.rubricLanguages.length > 0
      ? and(eq(submissions.notAssessableCause, "rubric_unavailable"), inArray(assignments.language, [...conditions.rubricLanguages]))
      : sql`false`;
  const aiBack = conditions.costCapReached
    ? sql`false`
    : and(eq(submissions.notAssessableCause, "ai_unavailable"), sql`not ${providerBudgetBlocked}`);
  return and(eq(submissions.status, "not_assessable"), isNull(submissions.teacherStartedAt), or(rubricBack, aiBack))!;
}

/**
 * PRC-02 CA3: the owner's copies of an assignment offered for a relaunch,
 * those alone, oldest submission first. Empty for another teacher's
 * assignment, as for a missing one.
 */
export async function listRelaunchable(
  actor: Actor,
  assignmentId: string,
  conditions: RelaunchConditions,
): Promise<RelaunchableCopy[]> {
  const grant = authorize(actor, "submission", "read");
  const rows = await db
    .select({ submissionId: submissions.id, versionNumber: submissions.currentVersion, cause: submissions.notAssessableCause })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(eq(submissions.assignmentId, assignmentId), owned(grant), relaunchable(conditions)))
    .orderBy(submissions.submittedAt, submissions.id);
  return rows.map((row) => ({ ...row, cause: row.cause as RelaunchableCause }));
}

/**
 * The ref of a teacher's request, field by field (E6.6): Workflows keeps it,
 * so nothing else that came with the request travels (rule 4).
 */
const requestRef = (seen: SeenVersion, origin: "retry" | "relaunch", request: string): EvaluationRef => ({
  submissionId: seen.submissionId,
  versionNumber: seen.versionNumber,
  origin,
  request,
});

/** The log entry of a teacher's request, written in its transaction (E7.6), without a revision (0018). */
const requestEntry = (
  grant: Grant,
  assignmentId: string,
  seen: SeenVersion,
  event: "retry_requested" | "relaunch_requested",
) => ({
  assignmentId,
  submissionId: seen.submissionId,
  actorId: grant.userId,
  event,
  versionNumber: seen.versionNumber,
});

/**
 * Transition 6, by the teacher (PRC-02 R3, CA2): an evaluation_failed copy
 * is evaluated again; a refusal too (the teacher may ask again). Stores a new
 * request with the copy, under its row lock, then hands the version and the
 * request to `ctx`, which starts the workflow once the request answered; the
 * claim happens in the step, checks the state again and takes the request:
 * one request evaluates once, and of two requests in a row only the last one
 * (E6.6). Null when the copy is absent or another teacher's. Never a copy to
 * review (R3): "not_failed". A transcription_failed copy (E9, transition 4)
 * the same way: its run claims it for transcription (system.ts).
 */
export async function retryEvaluation(actor: Actor, seen: SeenVersion, ctx: EvaluationStartContext): Promise<RetryResult | null> {
  const grant = authorize(actor, "unpublishedEvaluation", "write");
  const request = randomUUID();
  const result = await db.transaction(async (tx): Promise<RetryResult | null> => {
    const [row] = await tx
      .select({
        assignmentId: submissions.assignmentId,
        status: submissions.status,
        versionNumber: submissions.currentVersion,
        started: sql<boolean>`${submissions.teacherStartedAt} is not null`,
      })
      .from(submissions)
      .where(and(eq(submissions.id, seen.submissionId), owned(grant)))
      .for("update");
    if (!row) return null;
    if (row.versionNumber !== seen.versionNumber) return { ok: false, reason: "changed" };
    if (!isOneOf(retriedStatuses, row.status) || row.started) return { ok: false, reason: "not_failed" };
    await recordEvaluationRequest(tx, seen.submissionId, request, inArray(submissions.status, [...retriedStatuses]));
    await appendJournal(tx, [requestEntry(grant, row.assignmentId, seen, "retry_requested")]);
    return { ok: true };
  });
  if (result?.ok) ctx.onStart(requestRef(seen, "retry", request));
  return result;
}

/**
 * Transition 7, by the teacher (PRC-02 R4): a copy offered by
 * listRelaunchable, and it only, is evaluated by the AI again. Never
 * automatic, never a copy evaluated by hand. Stores a request and hands it to
 * `ctx`, like the retry. Null when the copy is absent or another teacher's.
 */
export async function relaunchEvaluation(
  actor: Actor,
  seen: SeenVersion,
  conditions: RelaunchConditions,
  ctx: EvaluationStartContext,
): Promise<RelaunchResult | null> {
  const grant = authorize(actor, "unpublishedEvaluation", "write");
  const request = randomUUID();
  const result = await db.transaction(async (tx): Promise<RelaunchResult | null> => {
    const [row] = await tx
      .select({
        assignmentId: submissions.assignmentId,
        versionNumber: submissions.currentVersion,
        offered: sql<boolean>`${relaunchable(conditions)}`,
      })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .where(and(eq(submissions.id, seen.submissionId), owned(grant)))
      .for("update", { of: submissions });
    if (!row) return null;
    if (row.versionNumber !== seen.versionNumber) return { ok: false, reason: "changed" };
    if (!row.offered) return { ok: false, reason: "not_relaunchable" };
    await recordEvaluationRequest(tx, seen.submissionId, request, eq(submissions.status, "not_assessable"));
    await appendJournal(tx, [requestEntry(grant, row.assignmentId, seen, "relaunch_requested")]);
    return { ok: true };
  });
  if (result?.ok) ctx.onStart(requestRef(seen, "relaunch", request));
  return result;
}
