import "server-only";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assignmentClasses, assignments, classes } from "@/server/db/schema";
import type { AssignmentLanguage, AssignmentLevel } from "@/lib/assignment";
import { compareText } from "@/lib/collation";
import { ownedBy } from "../access";

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

/** The teacher side of the ownership; the student side (received by derivation) arrives with SUB-01. */
const owners = { teacher: assignments.teacherId };

/** ASG-02 R1: one row of the teacher's list. Counts stay 0 until submissions exist (E4, E7). */
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
  const rows = byAssignment(await assignmentRows(ownedBy(grant, owners)));
  // Submissions arrive in E4, copies to review in E7.
  return rows.map(({ id, title, level, language, deadline, classes }) => ({
    id, title, level, language, deadline, classes, submissions: 0, toReview: 0,
  }));
}

/** One of the teacher's assignments, or null when it does not exist or is another person's (AUTH-04 R3). */
export async function getTeacherAssignment(actor: Actor, assignmentId: string): Promise<TeacherAssignment | null> {
  const grant = authorize(actor, "assignment", "read");
  authorize(actor, "assignmentRecipients", "read");
  const [found] = byAssignment(await assignmentRows(and(eq(assignments.id, assignmentId), ownedBy(grant, owners))));
  return found ?? null;
}
