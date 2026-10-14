import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { instantToWallTime } from "@/lib/time-zone";
import { ASSIGNMENT_MESSAGES, createTeacherAssignment } from "@/server/assignments/assignments";
import { ASSIGNMENT_ERRORS } from "@/server/assignments/schemas";
import { getTeacherAssignment, listTeacherAssignments } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { db } from "@/server/db/client";
import { assignmentClasses, assignments, securityEvents, users } from "@/server/db/schema";

// ASG-01: create an assignment and choose its classes (R1 to R3, CA1 to CA3).
// ASG-02: list one's assignments and open one (R1, R2, CA1).

let count = 0;
async function createUser(role: "student" | "teacher" | "admin"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

async function newClass(teacher: Actor, name: string) {
  const result = await createClass(teacher, { name });
  if (!result.ok) throw new Error("Class not created");
  return result.classId;
}

/** A wall time in the single zone, a week from now, as the form sends it. */
const inAWeek = () => instantToWallTime(new Date(Date.now() + 7 * 24 * 3600 * 1000), DEADLINE_TIME_ZONE);

const form = (classIds: string[], overrides: Record<string, unknown> = {}) => ({
  title: "My town",
  subject: "Describe your town in about 150 words.",
  level: "B1",
  language: "en",
  deadline: inAWeek(),
  instructions: "Use the present simple.",
  classIds,
  ...overrides,
});

const allAssignments = () => db.select().from(assignments);
const allRecipients = () => db.select().from(assignmentClasses);

async function recipientsOf(assignmentId: string) {
  const rows = await db
    .select({ classId: assignmentClasses.classId })
    .from(assignmentClasses)
    .where(eq(assignmentClasses.assignmentId, assignmentId));
  return rows.map((r) => r.classId).sort();
}

describe("ASG-01 CA1: a teacher with three classes chooses C1 and C3", () => {
  it("sends the assignment to C1 and C3 only, with every field stored", async () => {
    const teacher = await createUser("teacher");
    const [c1, , c3] = [await newClass(teacher, "C1"), await newClass(teacher, "C2"), await newClass(teacher, "C3")];
    const deadline = inAWeek();

    const state = await createTeacherAssignment(teacher, form([c1, c3], { deadline }));
    if (state.status !== "done") throw new Error(JSON.stringify(state));

    expect(await recipientsOf(state.assignmentId)).toEqual([c1, c3].sort());
    const [row] = await allAssignments();
    expect(row).toMatchObject({
      teacherId: teacher.userId,
      title: "My town",
      subject: "Describe your town in about 150 words.",
      level: "B1",
      language: "en",
      instructions: "Use the present simple.",
      contentVersion: 1,
      lockedAt: null,
    });
    // The wall time typed is read in the single zone, and gives it back.
    expect(instantToWallTime(row.deadline, DEADLINE_TIME_ZONE)).toBe(deadline);
    expect(state.deadline).toBe(row.deadline.toISOString());
  });
});

describe("ASG-01 CA2: a refused field creates nothing", () => {
  it("gives one message per field, and keeps what was typed", async () => {
    const teacher = await createUser("teacher");
    const c1 = await newClass(teacher, "C1");
    const state = await createTeacherAssignment(teacher, {
      title: " ", subject: "", level: "B3", language: "de", deadline: "", classIds: [],
    });
    expect(state).toEqual({
      status: "invalid",
      fieldErrors: {
        title: ASSIGNMENT_ERRORS.title,
        subject: ASSIGNMENT_ERRORS.subject,
        level: ASSIGNMENT_ERRORS.level,
        language: ASSIGNMENT_ERRORS.language,
        deadline: ASSIGNMENT_ERRORS.deadline,
        classIds: ASSIGNMENT_ERRORS.classes,
      },
      values: { title: " ", subject: "", level: "B3", language: "de", deadline: "", instructions: "", classIds: [] },
    });
    expect((await createTeacherAssignment(teacher, form([c1], { deadline: "2020-01-01T10:00" }))).status).toBe("invalid");
    expect(await allAssignments()).toHaveLength(0);
    expect(await allRecipients()).toHaveLength(0);
  });

  it("refuses another teacher's class slipped into the request: nothing created, not even for the own class", async () => {
    const sarah = await createUser("teacher");
    const karim = await createUser("teacher");
    const own = await newClass(sarah, "C1");
    const karims = await newClass(karim, "K1");

    const state = await createTeacherAssignment(sarah, form([own, karims]));
    expect(state).toMatchObject({ status: "invalid", fieldErrors: { classIds: ASSIGNMENT_ERRORS.classNotFound } });
    // The same answer as a class that does not exist (AUTH-04 R3).
    const missing = await createTeacherAssignment(sarah, form([own, crypto.randomUUID()]));
    expect(missing).toMatchObject({ status: "invalid", fieldErrors: { classIds: ASSIGNMENT_ERRORS.classNotFound } });

    expect(await allAssignments()).toHaveLength(0);
    expect(await allRecipients()).toHaveLength(0);
  });

  it("the database itself refuses to send an assignment to another teacher's class", async () => {
    const sarah = await createUser("teacher");
    const karim = await createUser("teacher");
    const own = await newClass(sarah, "C1");
    const karims = await newClass(karim, "K1");
    const state = await createTeacherAssignment(sarah, form([own]));
    if (state.status !== "done") throw new Error(JSON.stringify(state));

    await expect(
      db.insert(assignmentClasses).values({ assignmentId: state.assignmentId, classId: karims, teacherId: sarah.userId }),
    ).rejects.toThrow();
    await expect(
      db.insert(assignmentClasses).values({ assignmentId: state.assignmentId, classId: karims, teacherId: karim.userId }),
    ).rejects.toThrow();
    expect(await recipientsOf(state.assignmentId)).toEqual([own]);
  });

  it("the database refuses an empty or untrimmed text written directly", async () => {
    const teacher = await createUser("teacher");
    const insert = (title: string, instructions: string | null) =>
      db.execute(sql`INSERT INTO assignments (teacher_id, title, subject, level, language, deadline, instructions)
        VALUES (${teacher.userId}, ${title}, 'Subject', 'B1', 'en', now() + interval '1 day', ${instructions})`);
    await expect(insert(" My town", null)).rejects.toThrow();
    await expect(insert("My town", "")).rejects.toThrow();
    await expect(insert("My town", null)).resolves.toBeDefined();
  });
});

describe("ASG-01 CA3", () => {
  it("an assignment without instructions is valid, stored without an empty block", async () => {
    const teacher = await createUser("teacher");
    const c1 = await newClass(teacher, "C1");
    for (const instructions of [undefined, "", "   \n  "]) {
      expect((await createTeacherAssignment(teacher, form([c1], { instructions }))).status).toBe("done");
    }
    expect((await allAssignments()).map((a) => a.instructions)).toEqual([null, null, null]);
  });

  it("the same class chosen twice is sent once", async () => {
    const teacher = await createUser("teacher");
    const c1 = await newClass(teacher, "C1");
    const state = await createTeacherAssignment(teacher, form([c1, c1]));
    if (state.status !== "done") throw new Error(JSON.stringify(state));
    expect(await recipientsOf(state.assignmentId)).toEqual([c1]);
  });
});

describe("only a teacher creates an assignment", () => {
  it.each(["student", "admin"] as const)("%s: refused, logged, nothing created", async (role) => {
    const teacher = await createUser("teacher");
    const c1 = await newClass(teacher, "C1");
    const actor = await createUser(role);
    expect(await createTeacherAssignment(actor, form([c1]))).toMatchObject({
      status: "error",
      message: ASSIGNMENT_MESSAGES.notAllowed,
    });
    expect(await allAssignments()).toHaveLength(0);
    const [event] = await db.select().from(securityEvents).where(eq(securityEvents.type, "access_denied"));
    expect(event.actorUserId).toBe(actor.userId);
  });

  it("visitor: refused, nothing created", async () => {
    const teacher = await createUser("teacher");
    const c1 = await newClass(teacher, "C1");
    expect((await createTeacherAssignment({ kind: "visitor" }, form([c1]))).status).toBe("error");
    expect(await allAssignments()).toHaveLength(0);
  });
});

describe("ASG-02 CA1: a teacher with three assignments", () => {
  /** A wall time in the single zone, n days from now. */
  const inDays = (n: number) => instantToWallTime(new Date(Date.now() + n * 24 * 3600 * 1000), DEADLINE_TIME_ZONE);

  async function create(teacher: Actor, title: string, classIds: string[], days: number, level = "B1", language = "en") {
    const state = await createTeacherAssignment(teacher, form(classIds, { title, deadline: inDays(days), level, language }));
    if (state.status !== "done") throw new Error(JSON.stringify(state));
    return state.assignmentId;
  }

  it("lists them with their fields, latest deadline first; another teacher sees none of them", async () => {
    const sarah = await createUser("teacher");
    const karim = await createUser("teacher");
    const [b, a] = [await newClass(sarah, "Grade 10 — B"), await newClass(sarah, "Grade 10 — A")];
    const soon = await create(sarah, "Soon", [a], 2, "A2", "fr");
    const later = await create(sarah, "Later", [b, a], 20, "C1");
    const middle = await create(sarah, "Middle", [b], 10);
    await create(karim, "Karim's", [await newClass(karim, "K1")], 5);

    const list = await listTeacherAssignments(sarah);
    expect(list.map((x) => x.id)).toEqual([later, middle, soon]);
    expect(list[0]).toMatchObject({
      title: "Later", level: "C1", language: "en", classes: ["Grade 10 — A", "Grade 10 — B"], submissions: 0, toReview: 0,
    });
    expect(list[2]).toMatchObject({ title: "Soon", level: "A2", language: "fr", classes: ["Grade 10 — A"] });
    expect(new Date(list[1].deadline).getTime()).toBeGreaterThan(Date.now());

    // Another teacher's assignment is absent, like a missing one (AUTH-04 R3).
    expect((await listTeacherAssignments(karim)).map((x) => x.title)).toEqual(["Karim's"]);
    expect(await getTeacherAssignment(karim, later)).toBeNull();
    expect(await getTeacherAssignment(sarah, crypto.randomUUID())).toBeNull();
    expect(await getTeacherAssignment(sarah, later)).toMatchObject({
      id: later, subject: "Describe your town in about 150 words.", instructions: "Use the present simple.", locked: false,
    });
  });

  it("an empty list for a teacher without assignments; refused to a student or an administrator", async () => {
    expect(await listTeacherAssignments(await createUser("teacher"))).toEqual([]);
    await expect(listTeacherAssignments(await createUser("student"))).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(listTeacherAssignments(await createUser("admin"))).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
