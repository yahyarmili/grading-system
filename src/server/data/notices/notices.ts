import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { noticeAcknowledgements } from "@/server/db/schema";

// NFR-DON-04: the student reads the notice before their first submission.
// Only the version in force counts: a new version is read again.

/** The account read the notice version in force: the SQL guard of a first submission. */
export const acknowledgedNotice = (userId: string) =>
  sql`exists (select 1 from ${noticeAcknowledgements}
    where ${noticeAcknowledgements.userId} = ${userId}
      and ${noticeAcknowledgements.notice} = 'student_submission'
      and ${noticeAcknowledgements.version} = ${STUDENT_NOTICE.version})`;

/** When the student read the notice in force; null when not yet. Refused to any other role. */
export async function getNoticeAcknowledgement(actor: Actor): Promise<{ acknowledgedAt: string } | null> {
  const { userId } = authorize(actor, "noticeAcknowledgement", "read");
  const [found] = await db
    .select({ acknowledgedAt: noticeAcknowledgements.acknowledgedAt })
    .from(noticeAcknowledgements)
    .where(
      and(
        eq(noticeAcknowledgements.userId, userId),
        eq(noticeAcknowledgements.notice, "student_submission"),
        eq(noticeAcknowledgements.version, STUDENT_NOTICE.version),
      ),
    );
  return found ? { acknowledgedAt: found.acknowledgedAt.toISOString() } : null;
}

/**
 * Records the reading of the version the student was shown. False when that
 * version is no longer in force (the page was older than the text): nothing
 * recorded, the new one is shown. Reading twice keeps the first date.
 */
export async function acknowledgeNotice(actor: Actor, version: number): Promise<boolean> {
  const { userId } = authorize(actor, "noticeAcknowledgement", "write");
  if (version !== STUDENT_NOTICE.version) return false;
  await db
    .insert(noticeAcknowledgements)
    .values({ userId, notice: "student_submission", version })
    .onConflictDoNothing();
  return true;
}
