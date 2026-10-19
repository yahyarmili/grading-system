import "server-only";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { SUBMISSION_MAX_REPLACEMENTS } from "@/config/decisions";
import type { EvaluationRef } from "@/lib/evaluation";
import { sourcesOf } from "@/lib/submission-status";
import { checkSubmissionText } from "@/lib/submission-text";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assignments, submissions, submissionVersions, users } from "@/server/db/schema";
import { memberOfRecipients, receivedBy } from "../assignments/received";
import { acknowledgedNotice } from "../notices/notices";
import { isLate } from "./late";
import { applyTransition, insertReceived } from "./transitions";

// SUB-02, SUB-04: the first submission of a text. The student writes their
// own submission and never reads it back (A3): nothing here returns the text.

export type NewTextSubmission = {
  assignmentId: string;
  /** The assignment's content_version the student read (ASG-03). */
  contentVersion: number;
  /** One per form shown: a resent form is the same submission. */
  requestId: string;
  /** Already normalized and checked (src/lib/submission-text.ts). */
  text: string;
};

/**
 * Submitted (again, for the same request: idempotent), or refused: the task
 * changed since it was shown, the notice in force was not read (NFR-DON-04),
 * or the student already submitted with another form. Null when the assignment is absent, not received through an active
 * membership, or the account is not confirmed (§5.5, transition 1). `ref`
 * names the version to evaluate, for the trigger once committed (PRC-01).
 */
export type SubmitTextResult =
  | { ok: true; submittedAt: string; late: boolean; ref: EvaluationRef }
  | { ok: false; reason: "changed" | "already_submitted" | "notice_not_read" };

/** An account that confirmed its address; an unconfirmed one has no session, checked again here. */
const confirmed = (userId: string) =>
  sql`exists (select 1 from ${users} where ${users.id} = ${userId} and ${users.emailVerified})`;

/**
 * One transaction, Read Committed. The first statement locks the assignment
 * row (ASG-03): a teacher's change of the task waits for it, then finds
 * locked_at set and is refused; a change that came first moved the content
 * version, and the submission is refused instead. Lateness is computed in
 * SQL, strictly after the deadline, with the same now() as submitted_at
 * (SUB-04 R2). The unique pair decides between two forms.
 */
export async function submitText(actor: Actor, input: NewTextSubmission): Promise<SubmitTextResult | null> {
  const { userId } = authorize(actor, "submission", "write");
  if (checkSubmissionText(input.text)) throw new Error("submitText: the text was not checked");
  const allowed = and(eq(assignments.id, input.assignmentId), receivedBy(userId), confirmed(userId));

  return db.transaction(async (tx) => {
    const [assignment] = await tx
      .update(assignments)
      // updated_at stays: locking is not an edit of the assignment.
      .set({ lockedAt: sql`coalesce(${assignments.lockedAt}, now())`, updatedAt: sql`${assignments.updatedAt}` })
      .where(and(allowed, eq(assignments.contentVersion, input.contentVersion), acknowledgedNotice(userId)))
      // now() is the transaction's: the same instant as submitted_at.
      .returning({ teacherId: assignments.teacherId, late: isLate(sql`now()`, assignments.deadline) });
    if (!assignment) {
      const [shown] = await tx
        .select({ noticeRead: sql<boolean>`${acknowledgedNotice(userId)}` })
        .from(assignments)
        .where(allowed);
      if (!shown) return null;
      return { ok: false, reason: shown.noticeRead ? "changed" : "notice_not_read" } as const;
    }

    const created = await insertReceived(tx, {
      assignmentId: input.assignmentId,
      teacherId: assignment.teacherId,
      studentId: userId,
      late: assignment.late,
      contentVersion: input.contentVersion,
    });
    if (!created) {
      // The pair has its submission: the same request again is the same answer.
      const [same] = await tx
        .select({
          submittedAt: submissions.submittedAt,
          late: submissions.late,
          ref: { submissionId: submissions.id, versionNumber: submissions.currentVersion },
        })
        .from(submissions)
        .innerJoin(submissionVersions, eq(submissionVersions.submissionId, submissions.id))
        .where(
          and(
            eq(submissions.assignmentId, input.assignmentId),
            eq(submissions.studentId, userId),
            eq(submissionVersions.requestId, input.requestId),
          ),
        );
      return same
        ? ({ ok: true, submittedAt: same.submittedAt.toISOString(), late: same.late, ref: same.ref } as const)
        : ({ ok: false, reason: "already_submitted" } as const);
    }

    await tx.insert(submissionVersions).values({
      submissionId: created.id,
      number: 1,
      mode: "text",
      text: input.text,
      requestId: input.requestId,
    });
    return {
      ok: true,
      submittedAt: created.submittedAt.toISOString(),
      late: created.late,
      ref: { submissionId: created.id, versionNumber: 1 },
    } as const;
  });
}

// SUB-05: replacing the submission with a new text version.

/**
 * Transition 11 is open on the student's submission: the teacher has neither
 * changed nor validated it (E7, E8 set teacher_started_at), its state is one
 * transition 11 leaves, fewer than SUBMISSION_MAX_REPLACEMENTS replacements
 * (Q3 [D]), and the student is still an active member of a recipient class
 * (SUB-01 R4). The write guard and the screen read the same predicate.
 */
export const replacementOpen = (userId: string) =>
  and(
    isNull(submissions.teacherStartedAt),
    inArray(submissions.status, sourcesOf(11, "received")),
    lte(submissions.currentVersion, SUBMISSION_MAX_REPLACEMENTS),
    memberOfRecipients(userId, submissions.assignmentId),
  );

/** Replacements left once `currentVersion` versions exist: 2, 1, then 0. */
const left = (currentVersion: number) => Math.max(0, SUBMISSION_MAX_REPLACEMENTS + 1 - currentVersion);

export type ReplaceTextInput = Omit<NewTextSubmission, "contentVersion">;

/**
 * Replaced (again, for the same request: idempotent), or refused: the
 * teacher started first, or no replacement is left. Null when the student has
 * no submission for this assignment, or is no longer an active member.
 * `ref` names the active version, to evaluate again (SUB-05 R2).
 */
export type ReplaceTextResult =
  | { ok: true; replacedAt: string; replacementsLeft: number; ref: EvaluationRef }
  | { ok: false; reason: "teacher_started" | "limit_reached" };

/**
 * One transaction. The submission row is locked first (FOR UPDATE): two
 * replacements, or a replacement and the teacher's first act (E7, E8: an
 * update of this row that names the version seen), run one after the other,
 * and the first one wins. The guard is in the write statement itself.
 * submitted_at and late stay those of the first submission (SUB-04 R2).
 */
export async function replaceText(actor: Actor, input: ReplaceTextInput): Promise<ReplaceTextResult | null> {
  const { userId } = authorize(actor, "submission", "write");
  if (checkSubmissionText(input.text)) throw new Error("replaceText: the text was not checked");

  return db.transaction(async (tx) => {
    const [submission] = await tx
      .select({
        id: submissions.id,
        currentVersion: submissions.currentVersion,
        teacherStarted: sql<boolean>`${submissions.teacherStartedAt} is not null`,
      })
      .from(submissions)
      .where(and(eq(submissions.assignmentId, input.assignmentId), eq(submissions.studentId, userId)))
      .for("update");
    if (!submission) return null;

    // The same form sent again: the same answer, nothing counted twice.
    const [same] = await tx
      .select({ createdAt: submissionVersions.createdAt })
      .from(submissionVersions)
      .where(and(eq(submissionVersions.submissionId, submission.id), eq(submissionVersions.requestId, input.requestId)));
    if (same) {
      return {
        ok: true,
        replacedAt: same.createdAt.toISOString(),
        replacementsLeft: left(submission.currentVersion),
        ref: { submissionId: submission.id, versionNumber: submission.currentVersion },
      } as const;
    }

    const replaced = await applyTransition(tx, submission.id, 11, "received", {
      where: replacementOpen(userId),
      // The proposal in force was of the old version: none is current any more (SUB-05 R2).
      set: { currentVersion: sql`${submissions.currentVersion} + 1`, currentProposalId: null },
    });
    if (!replaced) {
      if (submission.teacherStarted) return { ok: false, reason: "teacher_started" } as const;
      if (left(submission.currentVersion) === 0) return { ok: false, reason: "limit_reached" } as const;
      // Validated or published without the mark is impossible (check constraint): not a member.
      return null;
    }

    const [version] = await tx
      .insert(submissionVersions)
      .values({
        submissionId: submission.id,
        number: replaced.currentVersion,
        mode: "text",
        text: input.text,
        requestId: input.requestId,
      })
      .returning({ createdAt: submissionVersions.createdAt });
    return {
      ok: true,
      replacedAt: version.createdAt.toISOString(),
      replacementsLeft: left(replaced.currentVersion),
      ref: { submissionId: submission.id, versionNumber: replaced.currentVersion },
    } as const;
  });
}
