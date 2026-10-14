import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { classes, classMemberships, users } from "@/server/db/schema";
import { compareText } from "@/lib/collation";
import { ownedBy } from "../access";
import { recordSecurityEvent } from "../auth/security-events";

// CLS-04: the students of a class (row "classRoster" of the matrix), for its
// teacher only: first name, last name and email (invariant 9). Removing keeps
// the membership, marked removed (invariant 10); readmitting reactivates it.

const owners = { teacher: classes.teacherId };

export type RosterStudent = {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  joinedAt: string;
  /** Set for a removed student only. */
  removedAt: string | null;
};

export type ClassRoster = { active: RosterStudent[]; removed: RosterStudent[] };

/** CA1: the class's active and removed students, by last then first name; null when absent or another person's. */
export async function listClassStudents(actor: Actor, classId: string): Promise<ClassRoster | null> {
  const grant = authorize(actor, "classRoster", "read");
  // From the class, so an owned class without students gives one empty row, not none.
  const rows = await db
    .select({
      studentId: classMemberships.studentId,
      status: classMemberships.status,
      joinedAt: classMemberships.joinedAt,
      removedAt: classMemberships.removedAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(classes)
    .leftJoin(classMemberships, eq(classMemberships.classId, classes.id))
    .leftJoin(users, eq(users.id, classMemberships.studentId))
    .where(and(eq(classes.id, classId), ownedBy(grant, owners)));
  if (rows.length === 0) return null;

  const roster: ClassRoster = { active: [], removed: [] };
  for (const r of rows) {
    if (!r.studentId || !r.status || !r.joinedAt || r.firstName === null || r.lastName === null || r.email === null) continue;
    roster[r.status].push({
      studentId: r.studentId,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      joinedAt: r.joinedAt.toISOString(),
      removedAt: r.removedAt?.toISOString() ?? null,
    });
  }
  const byName = (a: RosterStudent, b: RosterStudent) =>
    compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName);
  roster.active.sort(byName);
  roster.removed.sort(byName);
  return roster;
}

/**
 * R1: the student leaves the class and cannot join again alone (CLS-03 R4).
 * False when the class or the membership is absent or another person's.
 */
export async function removeStudent(actor: Actor, classId: string, studentId: string): Promise<boolean> {
  const grant = authorize(actor, "classRoster", "write");
  return setStatus(grant.userId, ownedBy(grant, owners), classId, studentId, "removed");
}

/** R2, CA4: the teacher brings a removed student back; no link or code needed. */
export async function readmitStudent(actor: Actor, classId: string, studentId: string): Promise<boolean> {
  const grant = authorize(actor, "classRoster", "write");
  return setStatus(grant.userId, ownedBy(grant, owners), classId, studentId, "active");
}

async function setStatus(
  teacherId: string,
  owner: ReturnType<typeof ownedBy>,
  classId: string,
  studentId: string,
  status: "active" | "removed",
): Promise<boolean> {
  const ownedClass = db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, classId), owner));
  return db.transaction(async (tx) => {
    // Already in that state: done, the date of the first removal is kept.
    const [changed] = await tx
      .update(classMemberships)
      .set(
        status === "removed"
          ? { status, removedAt: sql`coalesce(${classMemberships.removedAt}, now())` }
          : { status, removedAt: null },
      )
      .where(and(inArray(classMemberships.classId, ownedClass), eq(classMemberships.studentId, studentId)))
      .returning({ id: classMemberships.id });
    if (!changed) return false;
    await recordSecurityEvent(
      status === "removed" ? "class_member_removed" : "class_member_readmitted",
      { actorUserId: teacherId, subjectId: changed.id },
      tx,
    );
    return true;
  });
}
