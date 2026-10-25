import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { SubmissionMode } from "@/lib/submission-status";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { submissionPages, submissions, submissionTranscriptions, submissionVersions } from "@/server/db/schema";
import { ownedBy } from "../access";

// SUB-01 R2 [D, 2026-10-22] (revises A3, Q4): the student reads their
// submission back, from the moment it is sent, whatever its state: the text
// of the active version, as sent, and its dates. Images (E9, spec 0011): its
// pages and the transcription they confirmed. Nothing of the processing
// (state, cause, earlier versions, proposal, an engine reading after sending)
// is read.

export type OwnSubmission = Readonly<{
  mode: SubmissionMode;
  /** The text as sent; for images, the transcription the student confirmed (null when they sent it unchecked). */
  text: string | null;
  /** Images: the pages in their order, by id only (the image route serves them). */
  pages: readonly { id: string; position: number }[];
  /** The first submission. */
  submittedAt: string;
  /** The active version: the last replacement, or the first submission. */
  lastVersionAt: string;
}>;

/** The student's own submission to an assignment; null before any, or for another person's. */
export async function getOwnSubmission(actor: Actor, assignmentId: string): Promise<OwnSubmission | null> {
  const grant = authorize(actor, "submission", "read");
  authorize(actor, "transcription", "read");
  const [row] = await db
    .select({
      versionId: submissionVersions.id,
      mode: submissionVersions.mode,
      text: submissionVersions.text,
      transcription: submissionTranscriptions.text,
      checked: submissionTranscriptions.checkedByStudent,
      submittedAt: submissions.submittedAt,
      lastVersionAt: submissionVersions.createdAt,
    })
    .from(submissions)
    .innerJoin(
      submissionVersions,
      and(eq(submissionVersions.submissionId, submissions.id), eq(submissionVersions.number, submissions.currentVersion)),
    )
    .leftJoin(submissionTranscriptions, eq(submissionTranscriptions.versionId, submissionVersions.id))
    .where(and(eq(submissions.assignmentId, assignmentId), ownedBy(grant, { student: submissions.studentId })));
  if (!row) return null;
  const dates = { submittedAt: row.submittedAt.toISOString(), lastVersionAt: row.lastVersionAt.toISOString() };
  if (row.mode === "text") return row.text === null ? null : { mode: "text", text: row.text, pages: [], ...dates };
  const pages = await db
    .select({ id: submissionPages.id, position: submissionPages.position })
    .from(submissionPages)
    .where(eq(submissionPages.versionId, row.versionId))
    .orderBy(asc(submissionPages.position));
  // A text the pipeline read was never checked by the student: not theirs to read as confirmed (AC-14).
  return { mode: "images", text: row.checked ? row.transcription : null, pages, ...dates };
}
