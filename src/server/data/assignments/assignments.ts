import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Actor } from "@/server/access/actor";
import { authorize, type Grant } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { SUBMISSION_MAX_REPLACEMENTS } from "@/config/decisions";
import { assignmentClasses, assignments, classes, submissions, submissionVersions } from "@/server/db/schema";
import type { AssignmentLanguage, AssignmentLevel } from "@/lib/assignment";
import { compareText } from "@/lib/collation";
import { toStudentStatus, type StudentStatus } from "@/lib/submission-status";
import { ownedBy } from "../access";
import { receivedBy, visibleTo } from "./received";
import { replacementOpen } from "../submissions/submissions";

// ASG-01: an assignment and the classes it is sent to (rows "assignment" and
// "assignmentRecipients" of the matrix). The teacher owns both; the database
// also refuses another teacher's class (composite keys, invariant 3).

export type NewAssignment = {
  title: string;
  subject: string;
  level: AssignmentLevel;
  language: AssignmentLanguage;
  deadline: Date;
  instructions: string | null;
  classIds: string[];
};

export type CreateAssignmentResult = { ok: true; assignmentId: string } | { ok: false; reason: "class_not_found" };

/**
 * R3: one transaction, at least one class, all of them the teacher's own.
 * A class that is missing or another teacher's refuses the whole creation:
 * nothing is created, not even partly.
 */
export async function createAssignment(actor: Actor, input: NewAssignment): Promise<CreateAssignmentResult> {
  const { userId } = authorize(actor, "assignment", "write");
  const recipients = authorize(actor, "assignmentRecipients", "write");
  const classIds = [...new Set(input.classIds)];
  if (classIds.length === 0) return { ok: false, reason: "class_not_found" };

  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: classes.id })
      .from(classes)
      .where(and(inArray(classes.id, classIds), ownedBy(recipients, { teacher: classes.teacherId })));
    if (owned.length !== classIds.length) return { ok: false, reason: "class_not_found" } as const;

    const [created] = await tx
      .insert(assignments)
      .values({
        teacherId: userId,
        title: input.title,
        subject: input.subject,
        level: input.level,
        language: input.language,
        deadline: input.deadline,
        instructions: input.instructions,
      })
      .returning({ id: assignments.id });
    await tx
      .insert(assignmentClasses)
      .values(classIds.map((classId) => ({ assignmentId: created.id, classId, teacherId: userId })));
    return { ok: true, assignmentId: created.id } as const;
  });
}

/** The student reads what they received or submitted to (received.ts). */
const owners = { teacher: assignments.teacherId, student: visibleTo };

/** ASG-02 R1: one row of the teacher's list, with its submissions and its copies to review (E7.2). */
export type TeacherAssignmentItem = {
  id: string;
  title: string;
  level: AssignmentLevel;
  language: AssignmentLanguage;
  deadline: string;
  /** Names of the recipient classes, sorted. */
  classes: string[];
  submissions: number;
  toReview: number;
};

export type TeacherAssignment = Omit<TeacherAssignmentItem, "submissions" | "toReview"> & {
  subject: string;
  instructions: string | null;
  /** ASG-03: a submission exists; the task fields no longer change. */
  locked: boolean;
};

/** The assignment fields with the name of one recipient class: one row per (assignment, class). */
async function assignmentRows(where: SQL | undefined) {
  return db
    .select({
      id: assignments.id,
      title: assignments.title,
      subject: assignments.subject,
      level: assignments.level,
      language: assignments.language,
      deadline: assignments.deadline,
      instructions: assignments.instructions,
      lockedAt: assignments.lockedAt,
      className: classes.name,
    })
    .from(assignments)
    .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .where(where)
    .orderBy(desc(assignments.deadline), assignments.id);
}

type AssignmentRow = Awaited<ReturnType<typeof assignmentRows>>[number];

/** Folds the per-class rows into one assignment each, in query order. */
function byAssignment(rows: AssignmentRow[]): TeacherAssignment[] {
  const found = new Map<string, TeacherAssignment>();
  for (const { className, lockedAt, deadline, ...row } of rows) {
    const item = found.get(row.id);
    if (item) item.classes.push(className);
    else found.set(row.id, { ...row, deadline: deadline.toISOString(), locked: lockedAt !== null, classes: [className] });
  }
  for (const item of found.values()) item.classes.sort(compareText);
  return [...found.values()];
}

/**
 * ASG-02 CA1: the teacher's own assignments, latest deadline first (R2).
 * The recipient classes are part of each row: a role without them (the
 * student) is refused here.
 */
export async function listTeacherAssignments(actor: Actor): Promise<TeacherAssignmentItem[]> {
  const grant = authorize(actor, "assignment", "read");
  authorize(actor, "assignmentRecipients", "read");
  const copies = authorize(actor, "submission", "read");
  const [rows, counts] = await Promise.all([
    assignmentRows(ownedBy(grant, owners)).then(byAssignment),
    db
      .select({
        assignmentId: submissions.assignmentId,
        submissions: sql<number>`count(*)::int`,
        toReview: sql<number>`(count(*) filter (where ${submissions.status} = 'to_review'))::int`,
      })
      .from(submissions)
      .where(ownedBy(copies, { teacher: submissions.teacherId }))
      .groupBy(submissions.assignmentId),
  ]);
  const countsOf = new Map(counts.map((c) => [c.assignmentId, c]));
  return rows.map(({ id, title, level, language, deadline, classes }) => ({
    id, title, level, language, deadline, classes,
    submissions: countsOf.get(id)?.submissions ?? 0,
    toReview: countsOf.get(id)?.toReview ?? 0,
  }));
}

/** One of the teacher's assignments, or null when it does not exist or is another person's (AUTH-04 R3). */
export async function getTeacherAssignment(actor: Actor, assignmentId: string): Promise<TeacherAssignment | null> {
  const grant = authorize(actor, "assignment", "read");
  authorize(actor, "assignmentRecipients", "read");
  const [found] = byAssignment(await assignmentRows(and(eq(assignments.id, assignmentId), ownedBy(grant, owners))));
  return found ?? null;
}

/** ASG-03: an edit. Without `task`, only the title and the level change, which a lock allows (R2). */
export type AssignmentChanges = {
  title: string;
  level: AssignmentLevel;
  task?: { subject: string; language: AssignmentLanguage; deadline: Date; instructions: string | null };
};

/** Done, or refused because a submission locked the assignment; null when absent or another person's. */
export type ChangeAssignmentResult = { ok: true } | { ok: false; reason: "locked" };

const mine = (grant: Grant, assignmentId: string) =>
  and(eq(assignments.id, assignmentId), ownedBy(grant, owners));

/** After 0 rows: the assignment exists for this teacher, so the lock refused the write. */
async function lockedOrAbsent(where: SQL | undefined): Promise<ChangeAssignmentResult | null> {
  const [found] = await db.select({ id: assignments.id }).from(assignments).where(where);
  return found ? { ok: false, reason: "locked" } : null;
}

/**
 * R1, R2: the guard is in the statement itself. A change of the task (subject,
 * language, instructions, deadline) needs `locked_at IS NULL`; the first
 * submission sets it on the same row (E4), so of the two only one goes
 * through. A task sent back unchanged is not a change: allowed even when
 * locked, and the content version stays.
 */
export async function updateAssignment(
  actor: Actor,
  assignmentId: string,
  changes: AssignmentChanges,
): Promise<ChangeAssignmentResult | null> {
  const grant = authorize(actor, "assignment", "write");
  const where = mine(grant, assignmentId);
  const { task } = changes;
  // Compared with the row as stored before the update (Postgres reads old values in SET and WHERE).
  const sameTask = task
    ? and(
        eq(assignments.subject, task.subject),
        eq(assignments.language, task.language),
        eq(assignments.deadline, task.deadline),
        task.instructions === null ? isNull(assignments.instructions) : eq(assignments.instructions, task.instructions),
      )
    : undefined;

  const [updated] = await db
    .update(assignments)
    .set({
      title: changes.title,
      level: changes.level,
      ...(task && {
        ...task,
        contentVersion: sql`${assignments.contentVersion} + case when ${sameTask} then 0 else 1 end`,
      }),
    })
    .where(and(where, task && or(isNull(assignments.lockedAt), sameTask)))
    .returning({ id: assignments.id });
  return updated ? { ok: true } : lockedOrAbsent(where);
}

/** R2: deleted only without a submission; its recipient rows go with it (cascade). */
export async function deleteAssignment(actor: Actor, assignmentId: string): Promise<ChangeAssignmentResult | null> {
  const grant = authorize(actor, "assignment", "write");
  const where = mine(grant, assignmentId);
  const [deleted] = await db
    .delete(assignments)
    .where(and(where, isNull(assignments.lockedAt)))
    .returning({ id: assignments.id });
  return deleted ? { ok: true } : lockedOrAbsent(where);
}

/**
 * SUB-01 R2: what the student reads of an assignment, a closed list.
 * Neither the level (D4), nor the classes, nor the teacher, nor any internal
 * state, version or text leaves the server (A3).
 */
export type StudentAssignment = {
  id: string;
  title: string;
  subject: string;
  instructions: string | null;
  language: AssignmentLanguage;
  deadline: string;
  /** Compared in SQL, against the database clock. */
  deadlinePassed: boolean;
  /** SUB-01 R3: the closed list of three, never the internal state. */
  status: StudentStatus;
  /** SUB-04: the first submission came strictly after the deadline; false before any. */
  late: boolean;
};

/** One assignment, with what the submission screen needs (SUB-02). */
export type StudentAssignmentDetail = StudentAssignment & {
  /** The task version shown: a submission names it (ASG-03). */
  contentVersion: number;
  /** Date of the first submission, by the database clock; null before. */
  submittedAt: string | null;
  /** Not submitted yet, and still an active member of a recipient class (SUB-01 R4). */
  canSubmit: boolean;
  /** Date of the active version: the last replacement, or the first submission (SUB-05 R1). */
  lastVersionAt: string | null;
  /** SUB-05, Q3 [D]: replacements the student has left, 2 at first. */
  replacementsLeft: number;
  /** The teacher has neither changed nor validated it, a replacement is left, still a member. */
  canReplace: boolean;
};

/** The student's assignments with their own submission, if any: never another student's. */
function studentRows(userId: string, where: SQL | undefined) {
  return db
    .select({
      id: assignments.id,
      title: assignments.title,
      subject: assignments.subject,
      instructions: assignments.instructions,
      language: assignments.language,
      deadline: assignments.deadline,
      deadlinePassed: sql<boolean>`${assignments.deadline} < now()`,
      contentVersion: assignments.contentVersion,
      submissionStatus: submissions.status,
      submittedAt: submissions.submittedAt,
      late: submissions.late,
      currentVersion: submissions.currentVersion,
      lastVersionAt: submissionVersions.createdAt,
      received: sql<boolean>`${receivedBy(userId)}`,
      canReplace: sql<boolean>`coalesce(${replacementOpen(userId)}, false)`,
    })
    .from(assignments)
    .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, userId)))
    .leftJoin(
      submissionVersions,
      and(eq(submissionVersions.submissionId, submissions.id), eq(submissionVersions.number, submissions.currentVersion)),
    )
    .where(where)
    .orderBy(asc(assignments.deadline), assignments.id);
}

type StudentRow = Awaited<ReturnType<typeof studentRows>>[number];

const toStudentAssignment = (row: StudentRow): StudentAssignment => ({
  id: row.id,
  title: row.title,
  subject: row.subject,
  instructions: row.instructions,
  language: row.language,
  deadline: row.deadline.toISOString(),
  deadlinePassed: row.deadlinePassed,
  status: toStudentStatus(row.submissionStatus ?? "to_submit"),
  late: row.late ?? false,
});

/** SUB-01 CA1: the student's assignments, nearest deadline first. Refused to a teacher. */
export async function listStudentAssignments(actor: Actor): Promise<StudentAssignment[]> {
  const grant = authorize(actor, "assignment", "read");
  authorize(actor, "ownSubmissionStatus", "read");
  return (await studentRows(grant.userId, ownedBy(grant, owners))).map(toStudentAssignment);
}

/**
 * One of the student's assignments, for the submission screen; null when it
 * does not exist or is not theirs (AUTH-04 R3). Refused to a teacher.
 */
export async function getStudentAssignment(actor: Actor, assignmentId: string): Promise<StudentAssignmentDetail | null> {
  const grant = authorize(actor, "assignment", "read");
  authorize(actor, "ownSubmissionStatus", "read");
  const [row] = await studentRows(grant.userId, and(eq(assignments.id, assignmentId), ownedBy(grant, owners)));
  if (!row) return null;
  return {
    ...toStudentAssignment(row),
    contentVersion: row.contentVersion,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    canSubmit: row.submittedAt === null && row.received,
    lastVersionAt: row.lastVersionAt?.toISOString() ?? null,
    replacementsLeft: Math.max(0, SUBMISSION_MAX_REPLACEMENTS + 1 - (row.currentVersion ?? 1)),
    canReplace: row.canReplace,
  };
}
