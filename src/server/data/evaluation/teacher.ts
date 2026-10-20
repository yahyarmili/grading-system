import "server-only";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AssignmentLanguage } from "@/lib/assignment";
import type { EvaluationRef, RelaunchableCause } from "@/lib/evaluation";
import type { Actor } from "@/server/access/actor";
import { authorize, type Grant } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assignments, submissions } from "@/server/db/schema";
import { ownedBy } from "../access";
import { applyTransition } from "../submissions/transitions";

// PRC-02 (E6.3): what the owner teacher does with a copy the AI did not
// evaluate; the buttons come in E7 and E8. The retry (transition 6) and the
// relaunch (7) check the copy and hand its version over: the workflow's step
// claims it, under the places and the guard of the AI (system.ts). The
// manual evaluation (6 or 7, to to_review) is written here. Never automatic:
// only these functions leave evaluation_failed and not_assessable; the sweep
// takes the received copies only.

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
export type ManualEvaluationResult = { ok: true } | { ok: false; reason: "changed" | "not_open" };

const owned = (grant: Grant) => ownedBy(grant, { teacher: submissions.teacherId });

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
 * Transition 6, by the teacher (PRC-02 R3, CA2): an evaluation_failed copy
 * is evaluated again; a refusal too (the teacher may ask again). Hands the
 * version to `ctx`, which starts the workflow once the request answered; the
 * claim happens in the step and checks the state again: two retries at once
 * evaluate once. Null when the copy is absent or another teacher's. Never a
 * copy to review (R3): "not_failed".
 */
export async function retryEvaluation(actor: Actor, seen: SeenVersion, ctx: EvaluationStartContext): Promise<RetryResult | null> {
  const grant = authorize(actor, "unpublishedEvaluation", "write");
  const [row] = await db
    .select({
      status: submissions.status,
      versionNumber: submissions.currentVersion,
      started: sql<boolean>`${submissions.teacherStartedAt} is not null`,
    })
    .from(submissions)
    .where(and(eq(submissions.id, seen.submissionId), owned(grant)));
  if (!row) return null;
  if (row.versionNumber !== seen.versionNumber) return { ok: false, reason: "changed" };
  if (row.status !== "evaluation_failed" || row.started) return { ok: false, reason: "not_failed" };
  ctx.onStart({ ...seen, origin: "retry" });
  return { ok: true };
}

/**
 * Transition 7, by the teacher (PRC-02 R4): a copy offered by
 * listRelaunchable, and it only, is evaluated by the AI again. Never
 * automatic, never a copy evaluated by hand. Hands the version to `ctx`, like
 * the retry. Null when the copy is absent or another teacher's.
 */
export async function relaunchEvaluation(
  actor: Actor,
  seen: SeenVersion,
  conditions: RelaunchConditions,
  ctx: EvaluationStartContext,
): Promise<RelaunchResult | null> {
  const grant = authorize(actor, "unpublishedEvaluation", "write");
  const [row] = await db
    .select({ versionNumber: submissions.currentVersion, offered: sql<boolean>`${relaunchable(conditions)}` })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(eq(submissions.id, seen.submissionId), owned(grant)));
  if (!row) return null;
  if (row.versionNumber !== seen.versionNumber) return { ok: false, reason: "changed" };
  if (!row.offered) return { ok: false, reason: "not_relaunchable" };
  ctx.onStart({ ...seen, origin: "relaunch" });
  return { ok: true };
}

/**
 * Transitions 6 and 7 to to_review (REV-06, PRC-02 R3): the teacher
 * evaluates the copy by hand, without a proposal; the form comes in E8. The
 * teacher's first act is recorded (teacher_started_at): the student can no
 * longer replace it (SUB-05), and it is never offered for a relaunch. The row
 * is locked first, so a replacement at the same time runs before or after,
 * never both. Null when the copy is absent or another teacher's; "not_open"
 * outside evaluation_failed and not_assessable.
 */
export async function startManualEvaluation(actor: Actor, seen: SeenVersion): Promise<ManualEvaluationResult | null> {
  const grant = authorize(actor, "unpublishedEvaluation", "write");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: submissions.status, versionNumber: submissions.currentVersion })
      .from(submissions)
      .where(and(eq(submissions.id, seen.submissionId), owned(grant)))
      .for("update");
    if (!row) return null;
    if (row.versionNumber !== seen.versionNumber) return { ok: false, reason: "changed" } as const;
    const transition = row.status === "evaluation_failed" ? 6 : row.status === "not_assessable" ? 7 : null;
    if (!transition) return { ok: false, reason: "not_open" } as const;
    const moved = await applyTransition(tx, seen.submissionId, transition, "to_review", {
      where: eq(submissions.currentVersion, seen.versionNumber),
      set: { teacherStartedAt: sql`coalesce(${submissions.teacherStartedAt}, now())` },
    });
    return moved ? ({ ok: true } as const) : ({ ok: false, reason: "not_open" } as const);
  });
}
