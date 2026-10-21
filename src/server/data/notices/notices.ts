import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { STUDENT_NOTICE, TEACHER_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { authorize, type Grant } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { noticeAcknowledgements } from "@/server/db/schema";

// NFR-DON-04: the student reads their notice before their first submission
// (E4); the teacher reads theirs before their first access to copies (E7.7).
// Only the version in force counts: a new version is read again. Each role
// reads and records its own notice: the actor's role chooses it.

const NOTICES = {
  student_submission: STUDENT_NOTICE.version,
  teacher_review: TEACHER_NOTICE.version,
} as const;
type NoticeKind = keyof typeof NOTICES;

/** The account read the version in force of this notice: the SQL guard of a first submission, or of the review (E7.7). */
export const acknowledgedNotice = (userId: string, notice: NoticeKind = "student_submission") =>
  sql`exists (select 1 from ${noticeAcknowledgements}
    where ${noticeAcknowledgements.userId} = ${userId}
      and ${noticeAcknowledgements.notice} = ${notice}
      and ${noticeAcknowledgements.version} = ${NOTICES[notice]})`;

/** The notice of the actor's role; the matrix grants the row to students and teachers only. */
const noticeOf = (grant: Grant): NoticeKind => (grant.role === "teacher" ? "teacher_review" : "student_submission");

/** When the actor read the notice of their role in force; null when not yet. Refused to any other role. */
export async function getNoticeAcknowledgement(actor: Actor): Promise<{ acknowledgedAt: string } | null> {
  const grant = authorize(actor, "noticeAcknowledgement", "read");
  const notice = noticeOf(grant);
  const [found] = await db
    .select({ acknowledgedAt: noticeAcknowledgements.acknowledgedAt })
    .from(noticeAcknowledgements)
    .where(
      and(
        eq(noticeAcknowledgements.userId, grant.userId),
        eq(noticeAcknowledgements.notice, notice),
        eq(noticeAcknowledgements.version, NOTICES[notice]),
      ),
    );
  return found ? { acknowledgedAt: found.acknowledgedAt.toISOString() } : null;
}

/**
 * Records the reading of the version the actor was shown, of their role's
 * notice. False when that version is no longer in force (the page was older
 * than the text): nothing recorded, the new one is shown. Reading twice
 * keeps the first date.
 */
export async function acknowledgeNotice(actor: Actor, version: number): Promise<boolean> {
  const grant = authorize(actor, "noticeAcknowledgement", "write");
  const notice = noticeOf(grant);
  if (version !== NOTICES[notice]) return false;
  await db.insert(noticeAcknowledgements).values({ userId: grant.userId, notice, version }).onConflictDoNothing();
  return true;
}
