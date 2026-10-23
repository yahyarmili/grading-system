import "server-only";
import { and, eq } from "drizzle-orm";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { submissions, submissionVersions } from "@/server/db/schema";
import { ownedBy } from "../access";

// SUB-01 R2 [D, 2026-10-22] (revises A3, Q4): the student reads their
// submission back, from the moment it is sent, whatever its state: the text
// of the active version, as sent, and its dates. Nothing of the processing
// (state, cause, earlier versions, proposal) is read.

export type OwnSubmission = Readonly<{
  text: string;
  /** The first submission. */
  submittedAt: string;
  /** The active version: the last replacement, or the first submission. */
  lastVersionAt: string;
}>;

/** The student's own submission to an assignment; null before any, or for another person's. */
export async function getOwnSubmission(actor: Actor, assignmentId: string): Promise<OwnSubmission | null> {
  const grant = authorize(actor, "submission", "read");
  const [row] = await db
    .select({ text: submissionVersions.text, submittedAt: submissions.submittedAt, lastVersionAt: submissionVersions.createdAt })
    .from(submissions)
    .innerJoin(
      submissionVersions,
      and(eq(submissionVersions.submissionId, submissions.id), eq(submissionVersions.number, submissions.currentVersion)),
    )
    .where(and(eq(submissions.assignmentId, assignmentId), ownedBy(grant, { student: submissions.studentId })));
  // A text submission always has its text (E9 brings the images and their transcription).
  if (!row?.text) return null;
  return { text: row.text, submittedAt: row.submittedAt.toISOString(), lastVersionAt: row.lastVersionAt.toISOString() };
}
