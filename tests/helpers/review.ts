import { TEACHER_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getCopy as getCopyOrNotice } from "@/server/data/review/copy";
import { listAssignmentCopies as listOrNotice } from "@/server/data/review/list";
import { db } from "@/server/db/client";
import { noticeAcknowledgements } from "@/server/db/schema";

// E7.7: the review functions return "notice_required" until the teacher read
// their notice (NFR-DON-04). The review tests' teachers read it when created;
// tests/review-notice.int.test.ts covers the guard itself.

/** Records these teachers' reading of the teacher notice in force. */
export async function readTeacherNotice(...userIds: string[]) {
  if (userIds.length === 0) return;
  await db
    .insert(noticeAcknowledgements)
    .values(userIds.map((userId) => ({ userId, notice: "teacher_review" as const, version: TEACHER_NOTICE.version })));
}

const shown = <T,>(value: T | "notice_required"): T => {
  if (value === "notice_required") throw new Error("The teacher notice was not read");
  return value;
};

/** getCopy for a teacher who read the notice: the copy, or null. */
export const getCopy = async (actor: Actor, assignmentId: string, studentId: string) => shown(await getCopyOrNotice(actor, assignmentId, studentId));

/** listAssignmentCopies for a teacher who read the notice: the list, or null. */
export const listAssignmentCopies = async (actor: Actor, assignmentId: string) => shown(await listOrNotice(actor, assignmentId));
