import { sql } from "drizzle-orm";
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

/**
 * E8.1 (0019): a Validated or Published submission needs the teacher's
 * complete evaluation of its active version, and an evaluation is written
 * only To review, on a started submission, with its log entry (0018). For
 * tests that put a submission in those states directly: gives it one, as
 * record.ts would (manual origin, every level 2, grade 10), then puts back
 * its state. The submission is started from then on (teacher_started_at),
 * and its version is frozen (0018). From a state without a cause or a claim.
 */
export async function giveCompleteEvaluation(submissionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ assignment_id: string; teacher_id: string; current_version: number; status: string }>(
      sql`select assignment_id, teacher_id, current_version, status from submissions where id = ${submissionId} for update`,
    );
    const s = rows[0];
    if (!s) throw new Error("giveCompleteEvaluation: no such submission");
    await tx.execute(sql`
      insert into submission_versions (submission_id, number, mode, text, request_id)
      select ${submissionId}, ${s.current_version}, 'text', 'A text.', gen_random_uuid()
      where not exists (select 1 from submission_versions where submission_id = ${submissionId} and number = ${s.current_version})`);
    await tx.execute(sql`update submissions set status = 'to_review', teacher_started_at = coalesce(teacher_started_at, now()) where id = ${submissionId}`);
    await tx.execute(sql`
      insert into teacher_evaluations (submission_id, version_number, origin, rubric_version, level_task, level_organization,
        level_vocabulary, level_grammar, level_mechanics, final_grade, created_by)
      values (${submissionId}, ${s.current_version}, 'manual', 'en-1', 2, 2, 2, 2, 2, 10, ${s.teacher_id})`);
    await tx.execute(sql`
      insert into review_journal_entries (assignment_id, submission_id, actor_id, event, evaluation_revision, version_number)
      values (${s.assignment_id}, ${submissionId}, ${s.teacher_id}, 'evaluation_created', 1, ${s.current_version})`);
    await tx.execute(sql`update submissions set status = ${s.status} where id = ${submissionId}`);
  });
}
