import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { compareText } from "@/lib/collation";
import type { NotAssessableCause } from "@/lib/evaluation";
import type { ReviewRow, RowClass } from "@/lib/review-list";
import type { StoredSubmissionStatus, SubmissionMode } from "@/lib/submission-status";
import type { Actor } from "@/server/access/actor";
import { authorize, type Grant } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assignmentClasses, assignments, classes } from "@/server/db/schema";
import { ownedBy } from "../access";
import { appendJournal } from "./record";

// REV-01 (E7.2): the submissions of one of the teacher's assignments, one
// line per student (row "submission" of the matrix). Another teacher's
// assignment, or a missing one, is absent (AUTH-04 R3): the ownership filter
// is in each query. Sorting, filters and pages: src/lib/review-list.ts.

const owned = (grant: Grant) => ownedBy(grant, { teacher: assignments.teacherId });

export type AssignmentCopies = {
  /** The recipient classes, by name: the class filter. */
  classes: { id: string; name: string }[];
  /** In no order: the caller sorts the whole list. */
  rows: ReviewRow[];
  /** Changes with any line: the page compares it once the list is opened (E7 plan §1.6). */
  stamp: string;
};

type CopyRow = {
  student_id: string;
  submission_id: string | null;
  version_number: number | null;
  requested: boolean | null;
  first_name: string;
  last_name: string;
  classes: RowClass[];
  status: StoredSubmissionStatus | null;
  late: boolean | null;
  mode: SubmissionMode | null;
  version_ms: number | null;
  cause: NotAssessableCause | null;
  teacher_grade: number | null;
  proposed_grade: number | null;
};

/**
 * R2: the active members of the recipient classes, and every student with a
 * submission, removed or not; once each, with the recipient classes they
 * belong to. Their submission, its active version, the proposal in force and
 * the teacher's evaluation. One round trip.
 */
async function copyRows(grant: Grant, assignmentId: string): Promise<ReviewRow[]> {
  const { rows } = await db.execute<CopyRow>(sql`
    with recipient as (
      select ac.class_id from assignment_classes ac
      join assignments on assignments.id = ac.assignment_id
      where ac.assignment_id = ${assignmentId} and ${owned(grant) ?? sql`true`}
    ),
    member as (
      select cm.student_id, cm.class_id, cm.status from class_memberships cm
      join recipient r on r.class_id = cm.class_id
    ),
    listed as (
      select student_id from member where status = 'active'
      union
      select s.student_id from submissions s
      join assignments on assignments.id = s.assignment_id
      where s.assignment_id = ${assignmentId} and ${owned(grant) ?? sql`true`}
    )
    select
      u.id as student_id, u.first_name, u.last_name,
      coalesce((
        select json_agg(json_build_object('id', c.id, 'name', c.name, 'removed', m.status = 'removed'))
        from member m join classes c on c.id = m.class_id
        where m.student_id = u.id
      ), '[]') as classes,
      s.id as submission_id, s.current_version as version_number, s.evaluation_request is not null as requested,
      s.status, s.late, v.mode,
      (extract(epoch from v.created_at) * 1000)::float8 as version_ms,
      s.not_assessable_cause as cause,
      te.final_grade::float8 as teacher_grade,
      p.proposed_grade
    from listed l
    join users u on u.id = l.student_id
    left join submissions s on s.assignment_id = ${assignmentId} and s.student_id = l.student_id
    left join submission_versions v on v.submission_id = s.id and v.number = s.current_version
    left join teacher_evaluations te on te.submission_id = s.id
    left join ai_proposals p on p.id = s.current_proposal_id
  `);
  return rows.map((row) => ({
    studentId: row.student_id,
    submission: row.submission_id === null ? null : { id: row.submission_id, versionNumber: row.version_number! },
    requested: row.requested ?? false,
    firstName: row.first_name,
    lastName: row.last_name,
    classes: [...row.classes].sort((a, b) => compareText(a.name, b.name)),
    status: row.status ?? "to_submit",
    late: row.late ?? false,
    mode: row.mode,
    versionAt: row.version_ms === null ? null : new Date(row.version_ms).toISOString(),
    cause: row.cause,
    teacherGrade: row.teacher_grade,
    proposedGrade: row.proposed_grade,
  }));
}

/** A digest of the lines, in a fixed order. */
const stampOf = (rows: ReviewRow[]) =>
  createHash("sha256")
    .update(JSON.stringify([...rows].sort((a, b) => (a.studentId < b.studentId ? -1 : 1))))
    .digest("base64url")
    .slice(0, 22);

/** REV-01: the list of one of the teacher's assignments; null when absent or another person's. */
export async function listAssignmentCopies(actor: Actor, assignmentId: string): Promise<AssignmentCopies | null> {
  const grant = authorize(actor, "submission", "read");
  const [recipients, rows] = await Promise.all([
    db
      .select({ id: classes.id, name: classes.name })
      .from(assignments)
      .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
      .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
      .where(and(eq(assignments.id, assignmentId), owned(grant))),
    copyRows(grant, assignmentId),
  ]);
  // An assignment always has a recipient class (ASG-01 R3).
  if (recipients.length === 0) return null;
  return {
    classes: recipients.sort((a, b) => compareText(a.name, b.name)),
    rows,
    stamp: stampOf(rows),
  };
}

/**
 * REV-04: the teacher opened the list (journal "list opened", by the
 * database clock), for the measure of O1. Called by the page once shown,
 * never while rendering: a prefetch logs nothing (E7 plan §1.6). Gives the
 * list's stamp now, so a page shown from the router's cache is refreshed
 * when it changed. Null when absent or another person's: nothing logged.
 */
export async function recordListOpened(actor: Actor, assignmentId: string): Promise<{ stamp: string } | null> {
  const grant = authorize(actor, "submission", "read");
  const logged = await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), owned(grant)));
    if (!found) return false;
    await appendJournal(tx, [{ assignmentId, submissionId: null, actorId: grant.userId, event: "list_opened" }]);
    return true;
  });
  if (!logged) return null;
  return { stamp: stampOf(await copyRows(grant, assignmentId)) };
}
