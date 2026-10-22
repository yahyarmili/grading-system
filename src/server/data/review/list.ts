import "server-only";
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
import { acknowledgedNotice } from "../notices/notices";
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
  refused: boolean | null;
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
  stamp: string;
};

/**
 * R2: the active members of the recipient classes, and every student with a
 * submission, removed or not (`listed`); `member`: their memberships of the
 * recipient classes. The ownership filter is in each CTE.
 */
const listedStudents = (grant: Grant, assignmentId: string) => sql`
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
`;

/**
 * Each listed student once (`u`), their submission (`s`), the teacher's
 * evaluation (`te`) and, for a failed submission, the last error of the
 * version's last run (`lr`, at most one row: still one line per student). A
 * lateral join rather than a subquery in `refused`: a line reads the runs
 * once, though copyRows uses `refused` twice (its column and the stamp).
 */
const lines = (assignmentId: string) => sql`
  from listed l
  join users u on u.id = l.student_id
  left join submissions s on s.assignment_id = ${assignmentId} and s.student_id = l.student_id
  left join teacher_evaluations te on te.submission_id = s.id and te.version_number = s.current_version
  left join lateral (
    select r.attempt_errors[cardinality(r.attempt_errors)] = 'refused' as last_refused from evaluation_runs r
    where s.status = 'evaluation_failed' and r.submission_id = s.id and r.version_number = s.current_version
    order by r.created_at desc, r.id desc limit 1
  ) lr on true
`;

/**
 * E7.8: failed, and the last attempt of the version's last run was refused
 * by the AI. The value of the former scalar subquery, null included: false
 * when not failed, null when failed without a run or without a last error.
 */
const refused = sql`(s.status = 'evaluation_failed' and lr.last_refused)`;

/**
 * What the stamp reads of a line: every column a ReviewRow is made of, or
 * the one that fixes it. The active version (mode, date) is fixed by the
 * submission and its version number, submission_versions refusing any
 * update (0011); the proposed grade by the proposal in force, ai_proposals
 * being immutable (0011); the teacher's grade by the evaluation's revision,
 * one more at each write (0017). So the stamp read when the list is opened
 * needs neither these two joins nor the lines themselves (C8a).
 */
const lineKey = sql`json_build_array(
  u.id, u.first_name, u.last_name,
  (select json_agg(json_build_array(m.class_id, m.status, c.name) order by m.class_id)
   from member m join classes c on c.id = m.class_id where m.student_id = u.id),
  s.id, s.current_version, s.evaluation_request is not null, ${refused},
  s.status, s.late, s.not_assessable_cause, s.current_proposal_id, te.revision
)::text`;

/** The stamp of a list without lines. */
const EMPTY_STAMP = "empty";

/**
 * The lines' keys in a fixed order (the student), digested by the database:
 * the stamp of the rendered list (a window over its lines) and the one read
 * when it is opened (an aggregate) are the same expression, in the same order.
 */
const stampOverLines = sql`coalesce(md5(string_agg(${lineKey}, '|') over (order by u.id rows between unbounded preceding and unbounded following)), ${EMPTY_STAMP})`;
const stampAlone = sql`coalesce(md5(string_agg(${lineKey}, '|' order by u.id)), ${EMPTY_STAMP})`;

/**
 * R2: the listed students, once each, with the recipient classes they belong
 * to. Their submission, its active version, the proposal in force and the
 * teacher's evaluation; the list's stamp on each line. One round trip.
 */
async function copyRows(grant: Grant, assignmentId: string): Promise<{ rows: ReviewRow[]; stamp: string }> {
  const { rows } = await db.execute<CopyRow>(sql`
    ${listedStudents(grant, assignmentId)}
    select
      u.id as student_id, u.first_name, u.last_name,
      coalesce((
        select json_agg(json_build_object('id', c.id, 'name', c.name, 'removed', m.status = 'removed'))
        from member m join classes c on c.id = m.class_id
        where m.student_id = u.id
      ), '[]') as classes,
      s.id as submission_id, s.current_version as version_number, s.evaluation_request is not null as requested,
      ${refused} as refused,
      s.status, s.late, v.mode,
      (extract(epoch from v.created_at) * 1000)::float8 as version_ms,
      s.not_assessable_cause as cause,
      te.final_grade::float8 as teacher_grade,
      p.proposed_grade,
      ${stampOverLines} as stamp
    ${lines(assignmentId)}
    left join submission_versions v on v.submission_id = s.id and v.number = s.current_version
    left join ai_proposals p on p.id = s.current_proposal_id
  `);
  return {
    stamp: rows[0]?.stamp ?? EMPTY_STAMP,
    rows: rows.map((row) => ({
      studentId: row.student_id,
      submission: row.submission_id === null ? null : { id: row.submission_id, versionNumber: row.version_number! },
      requested: row.requested ?? false,
      refused: row.refused ?? false,
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
    })),
  };
}

/** The list's stamp alone, equal to copyRows's: a scalar subquery, one value back. */
const stampOf = (grant: Grant, assignmentId: string) => sql`(
  ${listedStudents(grant, assignmentId)}
  select ${stampAlone} ${lines(assignmentId)}
)`;

/**
 * REV-01: the list of one of the teacher's assignments; null when absent or
 * another person's; "notice_required" until the teacher read their notice
 * (NFR-DON-04, E7.7): nothing is returned before.
 */
export async function listAssignmentCopies(actor: Actor, assignmentId: string): Promise<AssignmentCopies | "notice_required" | null> {
  const grant = authorize(actor, "submission", "read");
  const [recipients, { rows, stamp }] = await Promise.all([
    db
      .select({ id: classes.id, name: classes.name, noticeRead: sql<boolean>`${acknowledgedNotice(grant.userId, "teacher_review")}` })
      .from(assignments)
      .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
      .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
      .where(and(eq(assignments.id, assignmentId), owned(grant))),
    copyRows(grant, assignmentId),
  ]);
  // An assignment always has a recipient class (ASG-01 R3).
  if (recipients.length === 0) return null;
  // NFR-DON-04 (E7.7): the teacher notice read first, checked by the server.
  if (!recipients[0].noticeRead) return "notice_required";
  return {
    classes: recipients.map(({ id, name }) => ({ id, name })).sort((a, b) => compareText(a.name, b.name)),
    rows,
    stamp,
  };
}

/**
 * REV-04: the teacher opened the list (journal "list opened", by the
 * database clock), for the measure of O1. Called by the page once shown,
 * never while rendering: a prefetch logs nothing (E7 plan §1.6). Gives the
 * list's stamp now, so a page shown from the router's cache is refreshed
 * when it changed; read by the ownership check itself, as one value (C8a).
 * Null when absent or another person's, or before the teacher notice is
 * read: nothing logged.
 */
export async function recordListOpened(actor: Actor, assignmentId: string): Promise<{ stamp: string } | null> {
  const grant = authorize(actor, "submission", "read");
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ stamp: sql<string>`${stampOf(grant, assignmentId)}` })
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), owned(grant), acknowledgedNotice(grant.userId, "teacher_review")));
    if (!found) return null;
    await appendJournal(tx, [{ assignmentId, submissionId: null, actorId: grant.userId, event: "list_opened" }]);
    return { stamp: found.stamp };
  });
}
