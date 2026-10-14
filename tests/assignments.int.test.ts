import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { instantToWallTime } from "@/lib/time-zone";
import {
  ASSIGNMENT_MESSAGES,
  createTeacherAssignment,
  deleteTeacherAssignment,
  editTeacherAssignment,
} from "@/server/assignments/assignments";
import { ASSIGNMENT_ERRORS } from "@/server/assignments/schemas";
import {
  getTeacherAssignment,
  listStudentAssignments,
  listTeacherAssignments,
  updateAssignment,
} from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { readmitStudent, removeStudent } from "@/server/data/classes/roster";
import { db } from "@/server/db/client";
import { assignmentClasses, assignments, classMemberships, securityEvents, users } from "@/server/db/schema";

// ASG-01: create an assignment and choose its classes (R1 to R3, CA1 to CA3).
// ASG-02: list one's assignments and open one (R1, R2, CA1).
// ASG-03: edit or delete an assignment, locked by the first submission (R1, R2, CA1 to CA3).
// SUB-01: the assignments a student received, each once, with the closed list of fields (CA1, CA3).

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

describe("ASG-03: edit or delete an assignment", () => {
  async function setup() {
    const teacher = await createUser("teacher");
    const c1 = await newClass(teacher, "C1");
    const state = await createTeacherAssignment(teacher, form([c1]));
    if (state.status !== "done") throw new Error(JSON.stringify(state));
    const [row] = await db.select().from(assignments).where(eq(assignments.id, state.assignmentId));
    return { teacher, c1, id: state.assignmentId, row };
  }

  /** The edit form as sent, prefilled with the assignment as stored. */
  const edit = (row: typeof assignments.$inferSelect, overrides: Record<string, unknown> = {}) => ({
    title: row.title,
    level: row.level,
    subject: row.subject,
    language: row.language,
    deadline: instantToWallTime(row.deadline, DEADLINE_TIME_ZONE),
    instructions: row.instructions ?? "",
    ...overrides,
  });

  const stored = async (id: string) => (await db.select().from(assignments).where(eq(assignments.id, id)))[0];

  /** CA2 is replayed on real submissions in E4; here the lock is set as the first submission will set it. */
  const lock = (id: string) => db.update(assignments).set({ lockedAt: sql`now()` }).where(eq(assignments.id, id));

  const inDays = (n: number) => instantToWallTime(new Date(Date.now() + n * 24 * 3600 * 1000), DEADLINE_TIME_ZONE);

  describe("CA1: without a submission", () => {
    it("every field but the classes changes, at once, and the task version moves", async () => {
      const { teacher, c1, id, row } = await setup();
      const deadline = inDays(14);
      const state = await editTeacherAssignment(teacher, id, edit(row, {
        title: "  My   village ", level: "A2", subject: "Describe your village.", language: "fr",
        deadline, instructions: "  ",
      }));
      expect(state.status).toBe("done");

      const after = await stored(id);
      expect(after).toMatchObject({
        title: "My village", level: "A2", subject: "Describe your village.", language: "fr",
        instructions: null, contentVersion: 2, lockedAt: null,
      });
      expect(instantToWallTime(after.deadline, DEADLINE_TIME_ZONE)).toBe(deadline);
      // Every reading goes to the stored row: the new subject shows on the next request
      // (the student's side is replayed with SUB-01, E3.4 and E3.5).
      expect(await getTeacherAssignment(teacher, id)).toMatchObject({ subject: "Describe your village.", classes: ["C1"] });
      expect(await recipientsOf(id)).toEqual([c1]);
    });

    it("a change of the title or level alone, or a task sent back unchanged, keeps the task version", async () => {
      const { teacher, id, row } = await setup();
      expect((await editTeacherAssignment(teacher, id, edit(row, { title: "Renamed", level: "C1" }))).status).toBe("done");
      expect(await stored(id)).toMatchObject({ title: "Renamed", level: "C1", contentVersion: 1 });
    });

    it("a refused field saves nothing, with one message per field", async () => {
      const { teacher, id, row } = await setup();
      const state = await editTeacherAssignment(teacher, id, edit(row, {
        title: "", subject: " ", level: "D1", language: "de", deadline: "2020-01-01T10:00",
      }));
      expect(state).toMatchObject({
        status: "invalid",
        fieldErrors: {
          title: ASSIGNMENT_ERRORS.title, subject: ASSIGNMENT_ERRORS.subject, level: ASSIGNMENT_ERRORS.level,
          language: ASSIGNMENT_ERRORS.language,
        },
      });
      expect(await stored(id)).toEqual(row);
    });

    it("a deadline kept as it was may be past; a new one must be in the future [P]", async () => {
      const { teacher, id } = await setup();
      await db.update(assignments).set({ deadline: new Date("2026-01-05T09:00:00Z") }).where(eq(assignments.id, id));
      const past = await stored(id);
      expect((await editTeacherAssignment(teacher, id, edit(past, { title: "Kept deadline" }))).status).toBe("done");
      const moved = await editTeacherAssignment(teacher, id, edit(past, { deadline: "2026-01-06T09:00" }));
      expect(moved).toMatchObject({ status: "invalid", fieldErrors: { deadline: ASSIGNMENT_ERRORS.deadlinePast } });
      expect((await stored(id)).deadline).toEqual(past.deadline);
    });

    it("deleted: gone from the list, its recipient classes with it", async () => {
      const { teacher, id } = await setup();
      expect(await deleteTeacherAssignment(teacher, id)).toEqual({ ok: true });
      expect(await listTeacherAssignments(teacher)).toEqual([]);
      expect(await getTeacherAssignment(teacher, id)).toBeNull();
      expect(await allRecipients()).toHaveLength(0);
      // Deleted twice: not found, nothing else happens.
      expect(await deleteTeacherAssignment(teacher, id)).toEqual({ ok: false, message: ASSIGNMENT_MESSAGES.notFound });
    });
  });

  describe("CA2: with a submission (lock set in the test, replayed in E4)", () => {
    it.each([
      ["subject", { subject: "Another subject." }],
      ["language", { language: "fr" }],
      ["instructions", { instructions: "Use the past simple." }],
      ["deadline", { deadline: inDays(30) }],
    ])("changing the %s is refused, nothing saved, not even the title", async (_field, change) => {
      const { teacher, id, row } = await setup();
      await lock(id);
      const locked = await stored(id);
      const state = await editTeacherAssignment(teacher, id, edit(row, { ...change, title: "Renamed" }));
      expect(state).toMatchObject({ status: "error", message: ASSIGNMENT_MESSAGES.locked });
      expect(await stored(id)).toEqual(locked);
    });

    it("the title and the level still change, from the locked form or from a full form left unchanged", async () => {
      const { teacher, id, row } = await setup();
      await lock(id);
      // The locked form sends no task field.
      expect((await editTeacherAssignment(teacher, id, { title: "Renamed", level: "C1" })).status).toBe("done");
      expect(await stored(id)).toMatchObject({ title: "Renamed", level: "C1", subject: row.subject, contentVersion: 1 });
      // A form opened before the lock, task unchanged.
      expect((await editTeacherAssignment(teacher, id, edit(row, { title: "Again" }))).status).toBe("done");
      expect(await stored(id)).toMatchObject({ title: "Again", contentVersion: 1 });
      expect(await getTeacherAssignment(teacher, id)).toMatchObject({ locked: true });
    });

    it("deletion is refused with a clear message; the assignment and its classes stay", async () => {
      const { teacher, id } = await setup();
      await lock(id);
      expect(await deleteTeacherAssignment(teacher, id)).toEqual({ ok: false, message: ASSIGNMENT_MESSAGES.notDeleted });
      expect(await stored(id)).toBeDefined();
      expect(await allRecipients()).toHaveLength(1);
    });

    it("the guard is in the write statement: called directly, the data layer refuses too", async () => {
      const { teacher, id, row } = await setup();
      await lock(id);
      const task = { subject: "Another subject.", language: row.language, deadline: row.deadline, instructions: row.instructions };
      expect(await updateAssignment(teacher, id, { title: row.title, level: row.level, task })).toEqual({
        ok: false, reason: "locked",
      });
      expect((await stored(id)).subject).toBe(row.subject);
    });

    it("a first submission and an edit at the same time: only one goes through", async () => {
      const { teacher, id, row } = await setup();
      const task = { subject: "Another subject.", language: row.language, deadline: row.deadline, instructions: row.instructions };
      let edited: Promise<unknown> | undefined;
      await db.transaction(async (tx) => {
        // The first submission's statement (E4) holds the row until it commits.
        await tx
          .update(assignments)
          .set({ lockedAt: sql`coalesce(${assignments.lockedAt}, now())` })
          .where(eq(assignments.id, id));
        edited = updateAssignment(teacher, id, { title: row.title, level: row.level, task });
        // The edit waits on the row meanwhile, then reads it locked.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });
      expect(await edited).toEqual({ ok: false, reason: "locked" });
      expect(await stored(id)).toMatchObject({ subject: row.subject, contentVersion: 1 });
    });
  });

  describe("CA3: another teacher neither edits nor deletes", () => {
    it("answered as a missing assignment; nothing changes", async () => {
      const { id, row } = await setup();
      const karim = await createUser("teacher");
      expect(await editTeacherAssignment(karim, id, edit(row, { title: "Karim's" }))).toMatchObject({
        status: "error", message: ASSIGNMENT_MESSAGES.notFound,
      });
      expect(await editTeacherAssignment(karim, crypto.randomUUID(), edit(row))).toMatchObject({
        status: "error", message: ASSIGNMENT_MESSAGES.notFound,
      });
      expect(await deleteTeacherAssignment(karim, id)).toEqual({ ok: false, message: ASSIGNMENT_MESSAGES.notFound });
      expect(await deleteTeacherAssignment(karim, "not-an-id")).toEqual({ ok: false, message: ASSIGNMENT_MESSAGES.notFound });
      // The data layer itself finds nothing to change.
      expect(await updateAssignment(karim, id, { title: "Karim's", level: "A1" })).toBeNull();
      expect(await stored(id)).toEqual(row);
    });

    it.each(["student", "admin"] as const)("%s: refused and logged, nothing changes", async (role) => {
      const { id, row } = await setup();
      const actor = await createUser(role);
      expect(await editTeacherAssignment(actor, id, edit(row, { title: "Hacked" }))).toMatchObject({
        status: "error", message: ASSIGNMENT_MESSAGES.notAllowed,
      });
      expect(await deleteTeacherAssignment(actor, id)).toEqual({ ok: false, message: ASSIGNMENT_MESSAGES.notAllowed });
      expect(await stored(id)).toEqual(row);
      expect(await db.select().from(securityEvents).where(eq(securityEvents.actorUserId, actor.userId))).toHaveLength(2);
    });
  });
});

describe("SUB-01: the student's received assignments", () => {
  async function member(classId: string, student: Actor & { kind: "user" }) {
    await db.insert(classMemberships).values({ classId, studentId: student.userId });
  }

  async function send(teacher: Actor, classIds: string[], overrides: Record<string, unknown> = {}) {
    const state = await createTeacherAssignment(teacher, form(classIds, overrides));
    if (state.status !== "done") throw new Error(JSON.stringify(state));
    return state.assignmentId;
  }

  it("CA1: a student of C1 sees C1's assignment with the closed list of fields; C2's is absent", async () => {
    const teacher = await createUser("teacher");
    const [c1, c2] = [await newClass(teacher, "C1"), await newClass(teacher, "C2")];
    const student = await createUser("student");
    await member(c1, student);
    const forC1 = await send(teacher, [c1], { title: "For C1", instructions: "" });
    await send(teacher, [c2], { title: "For C2" });

    const list = await listStudentAssignments(student);
    expect(list).toHaveLength(1);
    const [received] = list;
    // Exactly these keys: no level, class, teacher, version or internal state.
    expect(Object.keys(received).sort()).toEqual(
      ["deadline", "deadlinePassed", "id", "instructions", "language", "status", "subject", "title"],
    );
    expect(received).toMatchObject({
      id: forC1, title: "For C1", subject: "Describe your town in about 150 words.", language: "en",
      instructions: null, deadlinePassed: false, status: "to_submit",
    });
  });

  it("R5: an assignment sent to two of the student's classes appears once", async () => {
    const teacher = await createUser("teacher");
    const [c1, , c3] = [await newClass(teacher, "C1"), await newClass(teacher, "C2"), await newClass(teacher, "C3")];
    const student = await createUser("student");
    await member(c1, student);
    await member(c3, student);
    const both = await send(teacher, [c1, c3]);
    expect((await listStudentAssignments(student)).map((a) => a.id)).toEqual([both]);
  });

  it("nearest deadline first; a past deadline is flagged, compared on the database clock", async () => {
    const teacher = await createUser("teacher");
    const c1 = await newClass(teacher, "C1");
    const student = await createUser("student");
    await member(c1, student);
    const later = await send(teacher, [c1], { title: "Later" });
    const passed = await send(teacher, [c1], { title: "Passed" });
    await db.update(assignments).set({ deadline: sql`now() - interval '1 hour'` }).where(eq(assignments.id, passed));

    const list = await listStudentAssignments(student);
    expect(list.map((a) => [a.id, a.deadlinePassed, a.status])).toEqual([
      [passed, true, "to_submit"],
      [later, false, "to_submit"],
    ]);
  });

  it("CA3: a student without a class has an empty list", async () => {
    const teacher = await createUser("teacher");
    await send(teacher, [await newClass(teacher, "C1")]);
    expect(await listStudentAssignments(await createUser("student"))).toEqual([]);
  });

  it("received by derivation [D]: joining late shows earlier assignments; removed, none; readmitted, back (CLS-04 CA2)", async () => {
    const teacher = await createUser("teacher");
    const c1 = await newClass(teacher, "C1");
    const student = await createUser("student");
    const before = await send(teacher, [c1], { title: "Sent before joining" });
    await member(c1, student);
    expect((await listStudentAssignments(student)).map((a) => a.id)).toEqual([before]);

    expect(await removeStudent(teacher, c1, student.userId)).toBe(true);
    const during = await send(teacher, [c1], { title: "Sent while removed" });
    expect(await listStudentAssignments(student)).toEqual([]);

    expect(await readmitStudent(teacher, c1, student.userId)).toBe(true);
    expect((await listStudentAssignments(student)).map((a) => a.id).sort()).toEqual([before, during].sort());
  });

  it("ASG-03 CA1 for the student: an edited subject shows at once; a deleted assignment disappears", async () => {
    const teacher = await createUser("teacher");
    const c1 = await newClass(teacher, "C1");
    const student = await createUser("student");
    await member(c1, student);
    const id = await send(teacher, [c1]);
    const [row] = await db.select().from(assignments).where(eq(assignments.id, id));

    const edited = await editTeacherAssignment(teacher, id, {
      title: row.title, level: row.level, subject: "Describe your village.", language: row.language,
      deadline: instantToWallTime(row.deadline, DEADLINE_TIME_ZONE), instructions: row.instructions ?? "",
    });
    expect(edited.status).toBe("done");
    expect((await listStudentAssignments(student))[0].subject).toBe("Describe your village.");

    expect(await deleteTeacherAssignment(teacher, id)).toEqual({ ok: true });
    expect(await listStudentAssignments(student)).toEqual([]);
  });

  it.each(["teacher", "admin"] as const)("refused to a %s: the student's view is not theirs", async (role) => {
    await expect(listStudentAssignments(await createUser(role))).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
