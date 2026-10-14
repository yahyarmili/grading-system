import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { CLASS_MESSAGES, createTeacherClass } from "@/server/classes/classes";
import { codeDigest, inviteCode, inviteKey, linkDigest, linkToken } from "@/server/classes/invite-codes";
import { getClass, listClasses } from "@/server/data/classes/classes";
import { db } from "@/server/db/client";
import { classes, classMemberships, securityEvents, users } from "@/server/db/schema";

// CLS-01: create and list one's classes (R1, R2, CA1 to CA3).

let count = 0;
async function createUser(role: "student" | "teacher" | "admin", name = `${role} ${++count}`): Promise<Actor & { kind: "user" }> {
  const [user] = await db
    .insert(users)
    .values({
      email: `${role}${++count}@example.test`,
      emailVerified: true,
      name,
      firstName: name.split(" ")[0],
      lastName: name.split(" ")[1] ?? "User",
      role,
    })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

async function create(actor: Actor, name: string) {
  const state = await createTeacherClass(actor, { name });
  if (state.status !== "done") throw new Error(`Class not created: ${JSON.stringify(state)}`);
  return state.classId;
}

async function teacherClasses(actor: Actor) {
  const list = await listClasses(actor);
  if (list.role !== "teacher") throw new Error("Expected a teacher list");
  return list.classes;
}

describe("CLS-01 CA1: two classes with distinct names", () => {
  it("appear in the teacher's list, empty, sorted by name", async () => {
    const teacher = await createUser("teacher");
    await create(teacher, "Grade 11 — Literature");
    await create(teacher, "Grade 10 — A");

    const list = await teacherClasses(teacher);
    expect(list.map((c) => c.name)).toEqual(["Grade 10 — A", "Grade 11 — Literature"]);
    expect(list.every((c) => c.activeStudents === 0)).toBe(true);
  });

  it("stores the normalised name", async () => {
    const teacher = await createUser("teacher");
    const id = await create(teacher, "  Grade   10  ");
    expect(await getClass(teacher, id)).toEqual({ id, name: "Grade 10" });
  });

  it("counts only active members", async () => {
    const teacher = await createUser("teacher");
    const id = await create(teacher, "Grade 10");
    const [a, b] = [await createUser("student"), await createUser("student")];
    await db.insert(classMemberships).values([
      { classId: id, studentId: a.userId },
      { classId: id, studentId: b.userId, status: "removed", removedAt: new Date() },
    ]);
    expect((await teacherClasses(teacher))[0].activeStudents).toBe(1);
  });

  it("gives each class a usable link and code from its creation, stored as digests only", async () => {
    const teacher = await createUser("teacher");
    const id = await create(teacher, "Grade 10");
    const [row] = await db.select().from(classes).where(eq(classes.id, id));
    const key = inviteKey();
    expect(row.inviteLinkDigest).toBe(linkDigest(linkToken(key, row.inviteNonce)));
    expect(row.inviteCodeDigest).toBe(codeDigest(key, inviteCode(key, row.inviteNonce)));
    expect(row.inviteDisabledAt).toBeNull();
  });
});

describe("CLS-01 CA2: a name the teacher already uses", () => {
  it.each(["Grade 10", "grade 10", "  GRADE   10 "])("is refused: %j", async (again) => {
    const teacher = await createUser("teacher");
    await create(teacher, "Grade 10");
    const state = await createTeacherClass(teacher, { name: again });
    expect(state).toEqual({ status: "invalid", error: CLASS_MESSAGES.nameTaken, name: again });
    expect(await teacherClasses(teacher)).toHaveLength(1);
  });

  it("is refused once when two requests race", async () => {
    const teacher = await createUser("teacher");
    const states = await Promise.all([
      createTeacherClass(teacher, { name: "Grade 10" }),
      createTeacherClass(teacher, { name: "Grade 10" }),
    ]);
    expect(states.map((s) => s.status).sort()).toEqual(["done", "invalid"]);
    expect(await teacherClasses(teacher)).toHaveLength(1);
  });

  it("refuses an empty or too long name before the database", async () => {
    const teacher = await createUser("teacher");
    expect((await createTeacherClass(teacher, { name: "   " })).status).toBe("invalid");
    expect((await createTeacherClass(teacher, { name: "x".repeat(200) })).status).toBe("invalid");
    expect((await createTeacherClass(teacher, { name: null })).status).toBe("invalid");
    expect(await teacherClasses(teacher)).toHaveLength(0);
  });
});

describe("CLS-01 CA3: two teachers with a class of the same name", () => {
  it("each sees only their own; the other's class is absent, like a missing one", async () => {
    const sarah = await createUser("teacher");
    const karim = await createUser("teacher");
    const sarahClass = await create(sarah, "Grade 10");
    const karimClass = await create(karim, "Grade 10");

    expect((await teacherClasses(sarah)).map((c) => c.id)).toEqual([sarahClass]);
    expect((await teacherClasses(karim)).map((c) => c.id)).toEqual([karimClass]);
    expect(await getClass(sarah, karimClass)).toBeNull();
    expect(await getClass(sarah, crypto.randomUUID())).toBeNull();
  });
});

describe("only a teacher creates a class", () => {
  it.each(["student", "admin"] as const)("%s: refused, logged, nothing created", async (role) => {
    const actor = await createUser(role);
    expect(await createTeacherClass(actor, { name: "Grade 10" })).toEqual({
      status: "error",
      message: CLASS_MESSAGES.notAllowed,
    });
    expect(await db.select().from(classes)).toHaveLength(0);
    const [event] = await db.select().from(securityEvents).where(eq(securityEvents.type, "access_denied"));
    expect(event.actorUserId).toBe(actor.userId);
  });

  it("visitor: refused", async () => {
    expect((await createTeacherClass({ kind: "visitor" }, { name: "Grade 10" })).status).toBe("error");
    await expect(listClasses({ kind: "visitor" })).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("the database refuses an untrimmed name written directly", async () => {
    const teacher = await createUser("teacher");
    await expect(
      db.execute(sql`INSERT INTO classes (teacher_id, name, invite_nonce, invite_link_digest, invite_code_digest)
        VALUES (${teacher.userId}, ' Grade 10', 'n', 'l', 'c')`),
    ).rejects.toThrow();
  });
});

describe("a student's classes", () => {
  it("lists the active ones only, with the teacher's name, never another student's", async () => {
    const teacher = await createUser("teacher", "Sarah Bennett");
    const student = await createUser("student");
    const other = await createUser("student");
    const active = await create(teacher, "Grade 10 — A");
    const removed = await create(teacher, "Grade 10 — B");
    const notJoined = await create(teacher, "Grade 11");
    await db.insert(classMemberships).values([
      { classId: active, studentId: student.userId },
      { classId: removed, studentId: student.userId, status: "removed", removedAt: new Date() },
      { classId: notJoined, studentId: other.userId },
    ]);

    expect(await listClasses(student)).toEqual({
      role: "student",
      classes: [{ id: active, name: "Grade 10 — A", teacherName: "Sarah Bennett" }],
    });
    expect(await getClass(student, active)).toEqual({ id: active, name: "Grade 10 — A" });
    expect(await getClass(student, removed)).toBeNull();
    expect(await getClass(student, notJoined)).toBeNull();
  });
});
