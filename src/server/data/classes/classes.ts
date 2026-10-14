import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { newInvite } from "@/server/classes/invite-codes";
import { db } from "@/server/db/client";
import { classes, classMemberships, users } from "@/server/db/schema";
import { compareText } from "@/lib/collation";
import { ownedBy } from "../access";

// CLS-01: a teacher's classes (row "class" of the matrix). The teacher owns
// the class; a student sees the classes they are an active member of, without
// the list of students.

/** The student side of the ownership: an active membership in the class. */
const activeMemberOf = (userId: string) =>
  sql`exists (select 1 from ${classMemberships}
    where ${classMemberships.classId} = ${classes.id}
      and ${classMemberships.studentId} = ${userId}
      and ${classMemberships.status} = 'active')`;

const owners = { teacher: classes.teacherId, student: activeMemberOf };

export type CreateClassResult = { ok: true; classId: string } | { ok: false; reason: "name_taken" };

/**
 * Creates a class for the teacher, with its link and code already usable.
 * CA2: a name this teacher already uses, whatever the case, is refused.
 */
export async function createClass(actor: Actor, input: { name: string }): Promise<CreateClassResult> {
  const { userId } = authorize(actor, "class", "write");
  // A second try only for the (40-bit) unlikely case of a code digest already taken.
  for (let attempt = 0; attempt < 2; attempt++) {
    const invite = newInvite();
    const [created] = await db
      .insert(classes)
      .values({
        teacherId: userId,
        name: input.name,
        inviteNonce: invite.nonce,
        inviteLinkDigest: invite.linkDigest,
        inviteCodeDigest: invite.codeDigest,
      })
      .onConflictDoNothing()
      .returning({ id: classes.id });
    if (created) return { ok: true, classId: created.id };

    const [taken] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.teacherId, userId), sql`lower(${classes.name}) = lower(${input.name})`));
    if (taken) return { ok: false, reason: "name_taken" };
  }
  throw new Error("Could not create a unique class invitation");
}

export type TeacherClassItem = { id: string; name: string; activeStudents: number; createdAt: string };
export type StudentClassItem = { id: string; name: string; teacherName: string };

export type ClassList =
  | { role: "teacher"; classes: TeacherClassItem[] }
  | { role: "student"; classes: StudentClassItem[] };

/** CA1, CA3: the teacher's own classes, or the student's active classes; sorted by name. */
export async function listClasses(actor: Actor): Promise<ClassList> {
  const grant = authorize(actor, "class", "read");
  const owner = ownedBy(grant, owners);

  if (grant.role === "student") {
    const rows = await db
      .select({ id: classes.id, name: classes.name, teacherName: users.name })
      .from(classes)
      .innerJoin(users, eq(users.id, classes.teacherId))
      .where(owner);
    return { role: "student", classes: rows.sort((a, b) => compareText(a.name, b.name)) };
  }

  const rows = await db
    .select({
      id: classes.id,
      name: classes.name,
      createdAt: classes.createdAt,
      activeStudents: count(classMemberships.id),
    })
    .from(classes)
    .leftJoin(
      classMemberships,
      and(eq(classMemberships.classId, classes.id), eq(classMemberships.status, "active")),
    )
    .where(owner)
    .groupBy(classes.id);
  return {
    role: "teacher",
    classes: rows
      .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
      .sort((a, b) => compareText(a.name, b.name)),
  };
}

/** One class, or null when it does not exist or is another person's (AUTH-04 R3). */
export async function getClass(actor: Actor, classId: string): Promise<{ id: string; name: string } | null> {
  const grant = authorize(actor, "class", "read");
  const [row] = await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(and(eq(classes.id, classId), ownedBy(grant, owners)));
  return row ?? null;
}
