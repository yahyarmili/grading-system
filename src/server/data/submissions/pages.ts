import "server-only";
import { and, eq, or } from "drizzle-orm";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { submissionDrafts, submissionPages, submissions, submissionVersions } from "@/server/db/schema";
import { ownedBy } from "../access";
import { acknowledgedNotice } from "../notices/notices";

// Architecture rule 2, matrix 5.4 (E9, spec 0011): a page's JPEG, read by one
// route only (/api/pages/[pageId]). A draft page by the draft's owner; a page
// of any version of a submission, old ones included, by its author student
// and the owner teacher. Anyone else: absent, as if the page did not exist.

/**
 * The page's JPEG, or null when it is absent for this actor (for a teacher,
 * also before the teacher notice in force is read). A role without
 * the right (an administrator) gets AccessDeniedError; the route answers 404
 * to both.
 */
export async function getPageImage(actor: Actor, pageId: string): Promise<Buffer | null> {
  const grant = authorize(actor, "submission", "read");
  // A teacher never sees a draft: only a version's page, of their own assignment.
  if (grant.role === "student") authorize(actor, "draft", "read");
  const visible = ownedBy(grant, {
    student: (userId) => or(eq(submissionDrafts.studentId, userId), eq(submissions.studentId, userId))!,
    teacher: submissions.teacherId,
  });
  // NFR-DON-04: as for the copy (getCopy), the owner teacher sees a page once the notice in force is read.
  const noticeRead = grant.role === "teacher" ? acknowledgedNotice(grant.userId, "teacher_review") : undefined;
  const [page] = await db
    .select({ image: submissionPages.image })
    .from(submissionPages)
    .leftJoin(submissionDrafts, eq(submissionDrafts.id, submissionPages.draftId))
    .leftJoin(submissionVersions, eq(submissionVersions.id, submissionPages.versionId))
    .leftJoin(submissions, eq(submissions.id, submissionVersions.submissionId))
    .where(and(eq(submissionPages.id, pageId), visible, noticeRead));
  return page?.image ?? null;
}
