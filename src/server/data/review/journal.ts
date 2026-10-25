import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { ReviewEvent } from "@/lib/review-lists";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { reviewJournalEntries, submissions, users } from "@/server/db/schema";
import { ownedBy } from "../access";
import { acknowledgedNotice } from "../notices/notices";

// REV-04 R3 (E7.7): the corrector reads the log of their own copies, read
// only: nothing here or anywhere changes or deletes an entry (0017). Never
// the student, never another teacher: absent like a missing copy.

export type JournalEntryView = {
  id: string;
  event: ReviewEvent;
  /** For evaluation_changed: level.task, remark.task, reread.task, general_comment, next_steps, final_grade, grade_fixed. */
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  /** Null: the system (a request dropped for want of a slot). */
  author: { firstName: string; lastName: string } | null;
  versionNumber: number | null;
  evaluationRevision: number | null;
  createdAt: string;
};

/**
 * The log of one of the teacher's copies, newest first; the entries of one
 * save share its revision (the screen groups them), each dated in order by
 * the database (clock_timestamp(), 0020). Null when the
 * copy is absent, another teacher's, or before the teacher notice is read.
 */
export async function listCopyJournal(actor: Actor, submissionId: string): Promise<JournalEntryView[] | null> {
  const grant = authorize(actor, "reviewLog", "read");
  const [copy] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.id, submissionId),
        ownedBy(grant, { teacher: submissions.teacherId }),
        acknowledgedNotice(grant.userId, "teacher_review"),
      ),
    );
  if (!copy) return null;
  const rows = await db
    .select({
      id: reviewJournalEntries.id,
      event: reviewJournalEntries.event,
      field: reviewJournalEntries.field,
      oldValue: reviewJournalEntries.oldValue,
      newValue: reviewJournalEntries.newValue,
      firstName: users.firstName,
      lastName: users.lastName,
      versionNumber: reviewJournalEntries.versionNumber,
      evaluationRevision: reviewJournalEntries.evaluationRevision,
      createdAt: reviewJournalEntries.createdAt,
    })
    .from(reviewJournalEntries)
    .leftJoin(users, eq(users.id, reviewJournalEntries.actorId))
    .where(eq(reviewJournalEntries.submissionId, copy.id))
    .orderBy(desc(reviewJournalEntries.createdAt), sql`${reviewJournalEntries.evaluationRevision} desc nulls last`);
  return rows.map(({ firstName, lastName, createdAt, ...row }) => ({
    ...row,
    author: firstName !== null && lastName !== null ? { firstName, lastName } : null,
    createdAt: createdAt.toISOString(),
  }));
}
