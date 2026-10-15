import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { checkSubmissionText } from "@/lib/submission-text";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assignments, submissions, submissionVersions, users } from "@/server/db/schema";
import { receivedBy } from "../assignments/received";
import { acknowledgedNotice } from "../notices/notices";
import { isLate } from "./late";
import { insertReceived } from "./transitions";

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
 * membership, or the account is not confirmed (§5.5, transition 1).
 */
export type SubmitTextResult =
  | { ok: true; submittedAt: string; late: boolean }
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
        .select({ submittedAt: submissions.submittedAt, late: submissions.late })
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
        ? ({ ok: true, submittedAt: same.submittedAt.toISOString(), late: same.late } as const)
        : ({ ok: false, reason: "already_submitted" } as const);
    }

    await tx.insert(submissionVersions).values({
      submissionId: created.id,
      number: 1,
      mode: "text",
      text: input.text,
      requestId: input.requestId,
    });
    return { ok: true, submittedAt: created.submittedAt.toISOString(), late: created.late } as const;
  });
}
