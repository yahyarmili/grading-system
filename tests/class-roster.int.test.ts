import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { createTeacherClass, CLASS_MESSAGES } from "@/server/classes/classes";
import { JOIN_MESSAGES, joinWithCode } from "@/server/classes/join";
import { readmitClassStudent, removeClassStudent } from "@/server/classes/roster";
import { listClasses } from "@/server/data/classes/classes";
import { getClassInvite } from "@/server/data/classes/invites";
import { listClassStudents, readmitStudent, removeStudent } from "@/server/data/classes/roster";
import { db } from "@/server/db/client";
import { classMemberships, securityEvents, users } from "@/server/db/schema";

// CLS-04: the teacher lists the students of a class, removes and readmits
// them (R1, R2, CA1, CA4). CA2 and CA3 are replayed in E3, E4 and E7.

let count = 0;
async function createUser(
  role: "student" | "teacher" | "admin",
  name: { firstName: string; lastName: string } = { firstName: role, lastName: `${++count}` },
): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${name.firstName} ${name.lastName}`, ...name, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

async function newClass(teacher: Actor, name: string) {
  const state = await createTeacherClass(teacher, { name });
  if (state.status !== "done") throw new Error("Class not created");
  const invite = await getClassInvite(teacher, state.classId);
  return { id: state.classId, code: invite!.code! };
}

async function join(student: Actor, code: string) {
  expect(await joinWithCode(student, { code })).toMatchObject({ status: "joined" });
}

async function studentClassNames(student: Actor) {
  const list = await listClasses(student);
  return list.role === "student" ? list.classes.map((c) => c.name) : [];
}

describe("CA1: the list shows each student's first name, last name and email", () => {
  it("lists the three students of a class, by last name", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const students = [
      await createUser("student", { firstName: "Lina", lastName: "Zahir" }),
      await createUser("student", { firstName: "Adam", lastName: "Benali" }),
      await createUser("student", { firstName: "Sara", lastName: "Mouline" }),
    ];
    for (const s of students) await join(s, grade10.code);

    const roster = await listClassStudents(teacher, grade10.id);
    expect(roster!.removed).toEqual([]);
    expect(roster!.active.map(({ firstName, lastName, email }) => ({ firstName, lastName, email }))).toEqual([
      { firstName: "Adam", lastName: "Benali", email: expect.stringMatching(/@example\.test$/) },
      { firstName: "Sara", lastName: "Mouline", email: expect.stringMatching(/@example\.test$/) },
      { firstName: "Lina", lastName: "Zahir", email: expect.stringMatching(/@example\.test$/) },
    ]);
    // Only the students of this class, nothing else about them.
    expect(Object.keys(roster!.active[0]).sort()).toEqual(["email", "firstName", "joinedAt", "lastName", "removedAt", "studentId"]);
  });

  it("gives an empty list for a class without students", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    expect(await listClassStudents(teacher, grade10.id)).toEqual({ active: [], removed: [] });
  });

  it("lists only the students of that class", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const grade11 = await newClass(teacher, "Grade 11");
    const inTen = await createUser("student");
    const inEleven = await createUser("student");
    await join(inTen, grade10.code);
    await join(inEleven, grade11.code);

    expect((await listClassStudents(teacher, grade10.id))!.active.map((s) => s.studentId)).toEqual([inTen.userId]);
  });
});

describe("R1: removing a student", () => {
  it("moves them to the removed list; the class leaves their space", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");
    await join(student, grade10.code);

    expect(await removeClassStudent(teacher, grade10.id, student.userId)).toMatchObject({ ok: true });

    const roster = await listClassStudents(teacher, grade10.id);
    expect(roster!.active).toEqual([]);
    expect(roster!.removed).toMatchObject([{ studentId: student.userId, removedAt: expect.any(String) }]);
    expect(await studentClassNames(student)).toEqual([]);
    const types = (await db.select().from(securityEvents)).map((e) => e.type);
    expect(types).toContain("class_member_removed");
  });

  it("refuses the old code to a removed student, like an unknown code (CLS-03 R4)", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");
    await join(student, grade10.code);
    await removeClassStudent(teacher, grade10.id, student.userId);

    expect(await joinWithCode(student, { code: grade10.code })).toEqual({
      status: "invalid",
      error: JOIN_MESSAGES.refused,
      code: grade10.code,
    });
    expect(await studentClassNames(student)).toEqual([]);
  });

  it("keeps the first removal date when removed twice", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");
    await join(student, grade10.code);
    await removeStudent(teacher, grade10.id, student.userId);
    const [first] = await db.select().from(classMemberships).where(eq(classMemberships.studentId, student.userId));

    expect(await removeStudent(teacher, grade10.id, student.userId)).toBe(true);
    const [second] = await db.select().from(classMemberships).where(eq(classMemberships.studentId, student.userId));
    expect(second.removedAt).toEqual(first.removedAt);
  });

  it("leaves the student's other classes alone", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const grade11 = await newClass(teacher, "Grade 11");
    const student = await createUser("student");
    await join(student, grade10.code);
    await join(student, grade11.code);

    await removeClassStudent(teacher, grade10.id, student.userId);
    expect(await studentClassNames(student)).toEqual(["Grade 11"]);
  });
});

describe("CA4: readmission; another teacher reaches nothing", () => {
  it("makes a removed student a member again, with no link or code", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");
    await join(student, grade10.code);
    await removeClassStudent(teacher, grade10.id, student.userId);

    expect(await readmitClassStudent(teacher, grade10.id, student.userId)).toMatchObject({ ok: true });

    const roster = await listClassStudents(teacher, grade10.id);
    expect(roster!.active).toMatchObject([{ studentId: student.userId, removedAt: null }]);
    expect(roster!.removed).toEqual([]);
    expect(await studentClassNames(student)).toEqual(["Grade 10"]);
    // A member again: the code says so, without a duplicate.
    expect(await joinWithCode(student, { code: grade10.code })).toMatchObject({ status: "alreadyMember" });
    expect(await db.select().from(classMemberships)).toHaveLength(1);
    const types = (await db.select().from(securityEvents)).map((e) => e.type);
    expect(types).toContain("class_member_readmitted");
  });

  it("gives another teacher neither the list nor the actions, like a missing class", async () => {
    const owner = await createUser("teacher");
    const other = await createUser("teacher");
    const grade10 = await newClass(owner, "Grade 10");
    const student = await createUser("student");
    await join(student, grade10.code);

    expect(await listClassStudents(other, grade10.id)).toBeNull();
    expect(await removeStudent(other, grade10.id, student.userId)).toBe(false);
    const notFound = { ok: false, message: "This student was not found in this class." };
    expect(await removeClassStudent(other, grade10.id, student.userId)).toEqual(notFound);
    expect(await readmitClassStudent(other, grade10.id, student.userId)).toEqual(notFound);
    expect(await removeClassStudent(owner, grade10.id, "not-a-uuid")).toEqual(notFound);
    expect(await removeClassStudent(owner, crypto.randomUUID(), student.userId)).toEqual(notFound);

    expect((await listClassStudents(owner, grade10.id))!.active).toHaveLength(1);
  });

  it("refuses the list and the actions to a student and an administrator", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");
    const admin = await createUser("admin");
    await join(student, grade10.code);

    for (const actor of [student, admin]) {
      await expect(listClassStudents(actor, grade10.id)).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(readmitStudent(actor, grade10.id, student.userId)).rejects.toBeInstanceOf(AccessDeniedError);
      expect(await removeClassStudent(actor, grade10.id, student.userId)).toEqual({ ok: false, message: CLASS_MESSAGES.notAllowed });
    }
    expect((await listClassStudents(teacher, grade10.id))!.active).toHaveLength(1);
  });
});
