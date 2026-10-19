import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { SUBMISSION_TEXT_MAX_LENGTH } from "@/config/decisions";
import { SUBMISSION_TEXT_ERRORS } from "@/lib/submission-text";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import {
  createAssignment,
  deleteAssignment,
  getStudentAssignment,
  listStudentAssignments,
  updateAssignment,
} from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { removeStudent } from "@/server/data/classes/roster";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import { assignments, classMemberships, submissions, submissionVersions, users } from "@/server/db/schema";
import { SUBMISSION_MESSAGES, submitStudentText, type SubmitTextInput } from "@/server/submissions/submissions";
import { noTrigger } from "./helpers/triggers";

// SUB-02: submit a pasted text (R1 to R3, CA1 to CA3), with the first
// submission's lock of the assignment (ASG-03) and its lateness (SUB-04 R2).

let count = 0;
async function createUser(role: "student" | "teacher", emailVerified = true): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

/** A teacher, a class with one member who read the notice, and an assignment sent to it, due in a week. */
async function setup() {
  const teacher = await createUser("teacher");
  const student = await createUser("student");
  const made = await createClass(teacher, { name: "Grade 10" });
  if (!made.ok) throw new Error("Class not created");
  await join(made.classId, student);
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  return { teacher, student, classId: made.classId, assignmentId: created.assignmentId };
}

const join = (classId: string, student: Actor & { kind: "user" }) =>
  db.insert(classMemberships).values({ classId, studentId: student.userId });

/** What the form sends, for a fresh form unless a request id is given. */
const form = (assignmentId: string, text: string, overrides: SubmitTextInput = {}): SubmitTextInput => ({
  assignmentId, contentVersion: "1", requestId: randomUUID(), text, ...overrides,
});

const storedTexts = async () => (await db.select({ text: submissionVersions.text }).from(submissionVersions)).map((r) => r.text);
const lockedAt = async (id: string) =>
  (await db.select({ lockedAt: assignments.lockedAt }).from(assignments).where(eq(assignments.id, id)))[0].lockedAt;

describe("CA1: the text is stored exactly as written, with a dated confirmation", () => {
  it.each([
    ["mistakes and odd spacing", "i has went to the beach , it were grate !!  my freind  is cool"],
    ["accents and typographic apostrophes", "L’été dernier, j’ai visité « Fès » — c’était très beau."],
    ["line breaks and blank lines", "First paragraph.\n\nSecond paragraph.\n  Indented line.\n"],
    ["non-normalized Unicode", "café and café, ﬁne, Ａ, 🇲🇦 👨‍👩‍👧"],
    ["spaces around it", "   My town.   "],
  ])("keeps %s", async (_, text) => {
    const { student, assignmentId } = await setup();
    const state = await submitStudentText(student, form(assignmentId, text), noTrigger);
    expect(state.status).toBe("done");
    expect(await storedTexts()).toEqual([text]);
  });

  it("changes only the line endings the browser sends as CRLF", async () => {
    const { student, assignmentId } = await setup();
    await submitStudentText(student, form(assignmentId, "One.\r\nTwo.\r\n\r\nThree."), noTrigger);
    expect(await storedTexts()).toEqual(["One.\nTwo.\n\nThree."]);
  });

  it("dates it by the database, then shows it as being marked", async () => {
    const { student, assignmentId } = await setup();
    const state = await submitStudentText(student, form(assignmentId, "My town is small."), noTrigger);
    if (state.status !== "done") throw new Error(state.status);

    const [row] = await db
      .select({
        submittedAt: submissions.submittedAt,
        status: submissions.status,
        late: submissions.late,
        recent: sql<boolean>`${submissions.submittedAt} between now() - interval '1 minute' and now()`,
      })
      .from(submissions);
    expect(row).toMatchObject({ status: "received", late: false, recent: true });
    expect(state.submittedAt).toBe(row.submittedAt.toISOString());

    expect((await listStudentAssignments(student))[0].status).toBe("being_marked");
    expect(await getStudentAssignment(student, assignmentId)).toMatchObject({
      status: "being_marked", submittedAt: state.submittedAt, canSubmit: false,
    });
  });

  it("never gives the text back to the student (A3)", async () => {
    const { student, assignmentId } = await setup();
    const text = "A sentence only the teacher reads.";
    const state = await submitStudentText(student, form(assignmentId, text), noTrigger);
    const read = [state, await listStudentAssignments(student), await getStudentAssignment(student, assignmentId)];
    expect(JSON.stringify(read)).not.toContain(text);
  });

  it(`accepts ${SUBMISSION_TEXT_MAX_LENGTH} characters as displayed`, async () => {
    const { student, assignmentId } = await setup();
    const text = "é".normalize("NFD").repeat(SUBMISSION_TEXT_MAX_LENGTH);
    expect((await submitStudentText(student, form(assignmentId, text), noTrigger)).status).toBe("done");
    expect(await storedTexts()).toEqual([text]);
  });

  it("marks it late only after the deadline, by the database clock", async () => {
    const { student, assignmentId } = await setup();
    await db.update(assignments).set({ deadline: sql`now() - interval '1 minute'` }).where(eq(assignments.id, assignmentId));
    expect((await submitStudentText(student, form(assignmentId, "Late text."), noTrigger)).status).toBe("done");
    expect((await db.select({ late: submissions.late }).from(submissions))[0].late).toBe(true);
  });
});

describe("CA2: an empty, blank or too long text is refused, nothing stored", () => {
  it.each([
    ["empty", "", SUBMISSION_TEXT_ERRORS.empty],
    ["spaces only", "    ", SUBMISSION_TEXT_ERRORS.empty],
    ["line breaks and tabs", "\r\n\t\n  ", SUBMISSION_TEXT_ERRORS.empty],
    [`${SUBMISSION_TEXT_MAX_LENGTH + 1} characters`, "a".repeat(SUBMISSION_TEXT_MAX_LENGTH + 1), SUBMISSION_TEXT_ERRORS.tooLong],
  ])("refuses %s", async (_, text, error) => {
    const { student, assignmentId } = await setup();
    expect(await submitStudentText(student, form(assignmentId, text), noTrigger)).toEqual({ status: "invalid", error });
    expect(await db.select().from(submissions)).toEqual([]);
    expect(await lockedAt(assignmentId)).toBeNull();
  });
});

describe("CA3: only a confirmed, active member of a recipient class submits", () => {
  const refused = async (actor: Actor, assignmentId: string) => {
    expect(await submitStudentText(actor, form(assignmentId, "My town."), noTrigger)).toEqual({
      status: "error", reason: "unavailable", message: SUBMISSION_MESSAGES.unavailable,
    });
    expect(await db.select().from(submissions)).toEqual([]);
    expect(await lockedAt(assignmentId)).toBeNull();
  };

  it("refuses an unconfirmed account", async () => {
    const { classId, assignmentId } = await setup();
    const unconfirmed = await createUser("student", false);
    await join(classId, unconfirmed);
    await refused(unconfirmed, assignmentId);
  });

  it("refuses a student removed from the class", async () => {
    const { teacher, student, classId, assignmentId } = await setup();
    await removeStudent(teacher, classId, student.userId);
    await refused(student, assignmentId);
    expect(await getStudentAssignment(student, assignmentId)).toBeNull();
  });

  it("refuses student A for a class they never joined", async () => {
    const { assignmentId } = await setup();
    await refused(await createUser("student"), assignmentId);
  });

  it("refuses an assignment that does not exist", async () => {
    const { student } = await setup();
    expect(await submitStudentText(student, form(randomUUID(), "My town."), noTrigger)).toMatchObject({ reason: "unavailable" });
  });

  it("refuses a teacher, even the assignment's own", async () => {
    const { teacher, assignmentId } = await setup();
    expect(await submitStudentText(teacher, form(assignmentId, "My town."), noTrigger)).toMatchObject({ reason: "notAllowed" });
    expect(await db.select().from(submissions)).toEqual([]);
  });

  it("keeps a removed student's submission, read only (SUB-01 R4, CLS-04 CA3)", async () => {
    const { teacher, student, classId, assignmentId } = await setup();
    await submitStudentText(student, form(assignmentId, "My town."), noTrigger);
    await removeStudent(teacher, classId, student.userId);
    expect(await db.select().from(submissions)).toHaveLength(1);
    expect(await getStudentAssignment(student, assignmentId)).toMatchObject({ status: "being_marked", canSubmit: false });
    expect(await submitStudentText(student, form(assignmentId, "Again."), noTrigger)).toMatchObject({ reason: "unavailable" });
  });
});

describe("one submission, however often it is sent", () => {
  it("makes a double send of the same form one submission (race)", async () => {
    const { student, assignmentId } = await setup();
    const sent = form(assignmentId, "My town is small.");
    const [first, second] = await Promise.all([submitStudentText(student, sent, noTrigger), submitStudentText(student, sent, noTrigger)]);
    expect(first).toEqual(second);
    expect(first.status).toBe("done");
    expect(await db.select().from(submissions)).toHaveLength(1);
    expect(await storedTexts()).toHaveLength(1);
  });

  it("answers a resend after a network cut with the same confirmation", async () => {
    const { student, assignmentId } = await setup();
    const sent = form(assignmentId, "My town is small.");
    const first = await submitStudentText(student, sent, noTrigger);
    expect(await submitStudentText(student, sent, noTrigger)).toEqual(first);
    expect(await storedTexts()).toHaveLength(1);
  });

  it("makes two forms sent at once one submission: the other is told it is already submitted", async () => {
    const { student, assignmentId } = await setup();
    const results = await Promise.all([
      submitStudentText(student, form(assignmentId, "From one tab."), noTrigger),
      submitStudentText(student, form(assignmentId, "From another tab."), noTrigger),
    ]);
    expect(results.map((r) => (r.status === "error" ? r.reason : r.status)).sort()).toEqual(["alreadySubmitted", "done"]);
    expect(await db.select().from(submissions)).toHaveLength(1);
    expect(await storedTexts()).toHaveLength(1);
  });

  it("refuses a second form: the student already submitted", async () => {
    const { student, assignmentId } = await setup();
    await submitStudentText(student, form(assignmentId, "First."), noTrigger);
    expect(await submitStudentText(student, form(assignmentId, "Second."), noTrigger)).toMatchObject({ reason: "alreadySubmitted" });
    expect(await storedTexts()).toEqual(["First."]);
  });
});

describe("the first submission locks the assignment (ASG-03)", () => {
  it("sets the lock; the task and the deletion are then refused", async () => {
    const { teacher, student, assignmentId } = await setup();
    await submitStudentText(student, form(assignmentId, "My town."), noTrigger);
    expect(await lockedAt(assignmentId)).not.toBeNull();
    const task = { subject: "Another subject.", language: "en" as const, deadline: new Date(Date.now() + 864e5), instructions: null };
    expect(await updateAssignment(teacher, assignmentId, { title: "My town", level: "B1", task })).toEqual({
      ok: false, reason: "locked",
    });
    expect(await deleteAssignment(teacher, assignmentId)).toEqual({ ok: false, reason: "locked" });
  });

  it("refuses a text written on a task the teacher changed since", async () => {
    const { teacher, student, assignmentId } = await setup();
    const task = { subject: "Describe your school.", language: "en" as const, deadline: new Date(Date.now() + 864e5), instructions: null };
    expect(await updateAssignment(teacher, assignmentId, { title: "My town", level: "B1", task })).toEqual({ ok: true });
    expect(await submitStudentText(student, form(assignmentId, "My town."), noTrigger)).toMatchObject({ reason: "changed" });
    expect(await lockedAt(assignmentId)).toBeNull();
    // The page now shows version 2: the same text goes through.
    expect((await submitStudentText(student, form(assignmentId, "My town.", { contentVersion: "2" }), noTrigger)).status).toBe("done");
  });
});

describe("a first submission and a change of the task at the same time: one goes through", () => {
  const newTask = { subject: "Describe your school.", language: "en" as const, deadline: new Date(Date.now() + 864e5), instructions: null };
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Holds the assignment row, then starts the two calls a little apart: both
   * wait on the row, and are served in the order they came once it is free.
   */
  async function queued<A, B>(assignmentId: string, first: () => Promise<A>, second: () => Promise<B>) {
    let results: Promise<[A, B]> | undefined;
    await db.transaction(async (tx) => {
      await tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.id, assignmentId)).for("update");
      const a = first();
      await wait(1500);
      const b = second();
      results = Promise.all([a, b]);
      await wait(1500);
    });
    return results!;
  }

  it("submission first: the teacher's change waits, then is refused (locked)", async () => {
    const { teacher, student, assignmentId } = await setup();
    const [submitted, edited] = await queued(
      assignmentId,
      () => submitStudentText(student, form(assignmentId, "My town."), noTrigger),
      () => updateAssignment(teacher, assignmentId, { title: "My town", level: "B1", task: newTask }),
    );
    expect(submitted.status).toBe("done");
    expect(edited).toEqual({ ok: false, reason: "locked" });
    const [row] = await db.select().from(assignments);
    expect(row).toMatchObject({ subject: "Describe your town.", contentVersion: 1 });
    expect(row.lockedAt).not.toBeNull();
  }, 60_000);

  it("change first: the submission waits, then is refused (changed), nothing stored", async () => {
    const { teacher, student, assignmentId } = await setup();
    const [edited, submitted] = await queued(
      assignmentId,
      () => updateAssignment(teacher, assignmentId, { title: "My town", level: "B1", task: newTask }),
      () => submitStudentText(student, form(assignmentId, "My town."), noTrigger),
    );
    expect(edited).toEqual({ ok: true });
    expect(submitted).toMatchObject({ status: "error", reason: "changed" });
    expect(await db.select().from(submissions)).toEqual([]);
    expect(await lockedAt(assignmentId)).toBeNull();
  }, 60_000);

  it("raced freely: exactly one of the two outcomes, never both", async () => {
    const { teacher, student, assignmentId } = await setup();
    const [submitted, edited] = await Promise.all([
      submitStudentText(student, form(assignmentId, "My town."), noTrigger),
      updateAssignment(teacher, assignmentId, { title: "My town", level: "B1", task: newTask }),
    ]);
    const stored = await db.select().from(submissions);
    if (submitted.status === "done") {
      expect(edited).toEqual({ ok: false, reason: "locked" });
      expect(stored).toHaveLength(1);
    } else {
      expect(submitted).toMatchObject({ reason: "changed" });
      expect(edited).toEqual({ ok: true });
      expect(stored).toEqual([]);
    }
  }, 60_000);
});
