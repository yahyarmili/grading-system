import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import { statusLabels, storedSubmissionStatuses, toStudentStatus } from "@/lib/submission-status";
import { STUDENT_NOTICE } from "@/lib/texts";
import { instantToWallTime } from "@/lib/time-zone";
import type { Actor } from "@/server/access/actor";
import {
  ASSIGNMENT_MESSAGES,
  deleteTeacherAssignment,
  editTeacherAssignment,
} from "@/server/assignments/assignments";
import {
  createAssignment,
  deleteAssignment,
  getStudentAssignment,
  getTeacherAssignment,
  listStudentAssignments,
} from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { readmitStudent, removeStudent } from "@/server/data/classes/roster";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import {
  assignmentClasses,
  assignments,
  classMemberships,
  securityEvents,
  submissions,
  submissionVersions,
  users,
} from "@/server/db/schema";
import {
  REPLACEMENT_MESSAGES,
  replaceStudentText,
  SUBMISSION_MESSAGES,
  submitStudentText,
} from "@/server/submissions/submissions";
import { giveCompleteEvaluation } from "./helpers/review";
import { noTrigger } from "./helpers/triggers";

// E4.6: the replays of the step on real submissions (fonctionnalites.md §8.3):
// ASG-03 CA2, CLS-04 CA3 (the submission kept; the teacher's list in E7),
// SUB-01 CA3 (read only for the removed student), and the "Submission" row of
// the matrix seen from the student's answers.

let count = 0;
async function createUser(role: "student" | "teacher" | "admin"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

/** A student of the class who read the notice in force. */
async function studentOf(classId: string) {
  const student = await createUser("student");
  await db.insert(classMemberships).values({ classId, studentId: student.userId });
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  return student;
}

async function newAssignment(teacher: Actor, classIds: string[], title = "My town") {
  const created = await createAssignment(teacher, {
    title, subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: "Use the present simple.", classIds,
  });
  if (!created.ok) throw new Error("Assignment not created");
  return created.assignmentId;
}

/** A teacher, class C1 with Lina and Omar, and an assignment sent to C1, due in a week. */
async function setup() {
  const teacher = await createUser("teacher");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  const [lina, omar] = [await studentOf(made.classId), await studentOf(made.classId)];
  const assignmentId = await newAssignment(teacher, [made.classId]);
  return { teacher, lina, omar, classId: made.classId, assignmentId };
}

const submit = (student: Actor, assignmentId: string, text: string, requestId = randomUUID()) =>
  submitStudentText(student, { assignmentId, contentVersion: "1", requestId, text }, noTrigger);

const replace = (student: Actor, assignmentId: string, text: string, requestId = randomUUID()) =>
  replaceStudentText(student, { assignmentId, requestId, text }, noTrigger);

async function submitted(student: Actor, assignmentId: string, text: string) {
  const state = await submit(student, assignmentId, text);
  if (state.status !== "done") throw new Error(JSON.stringify(state));
  return state;
}

const storedAssignment = async (id: string) => (await db.select().from(assignments).where(eq(assignments.id, id)))[0];

/** Everything stored of a student's submission: the row and its versions, in order. */
async function storedSubmission(student: Actor & { kind: "user" }) {
  const [row] = await db.select().from(submissions).where(eq(submissions.studentId, student.userId));
  if (!row) return null;
  const versions = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.submissionId, row.id))
    .orderBy(asc(submissionVersions.number));
  return { row, versions };
}

/** The teacher's edit form as sent, prefilled with the assignment as stored. */
const edit = (row: typeof assignments.$inferSelect, overrides: Record<string, unknown> = {}) => ({
  title: row.title,
  level: row.level,
  subject: row.subject,
  language: row.language,
  deadline: instantToWallTime(row.deadline, DEADLINE_TIME_ZONE),
  instructions: row.instructions ?? "",
  ...overrides,
});

const inDays = (n: number) => instantToWallTime(new Date(Date.now() + n * 864e5), DEADLINE_TIME_ZONE);

/** The PostgreSQL error code, through the query builder's wrapping. */
const pgCode = (error: unknown): string | undefined => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
};

describe("ASG-03 CA2 on a real submission: the task locked, the deletion refused", () => {
  it.each([
    ["subject", { subject: "Another subject." }],
    ["language", { language: "fr" }],
    ["instructions", { instructions: "Use the past simple." }],
    ["deadline", { deadline: inDays(30) }],
  ])("after Lina's first submission, changing the %s is refused, nothing saved", async (_field, change) => {
    const { teacher, lina, assignmentId } = await setup();
    // The form the teacher opened before the submission.
    const opened = await storedAssignment(assignmentId);
    await submitted(lina, assignmentId, "My town is small.");
    const locked = await storedAssignment(assignmentId);
    expect(locked.lockedAt).not.toBeNull();

    const state = await editTeacherAssignment(teacher, assignmentId, edit(opened, { ...change, title: "Renamed" }));
    expect(state).toMatchObject({ status: "error", message: ASSIGNMENT_MESSAGES.locked });
    expect(await storedAssignment(assignmentId)).toEqual(locked);
  });

  it("the title and the level still change; the page says it is locked", async () => {
    const { teacher, lina, assignmentId } = await setup();
    await submitted(lina, assignmentId, "My town is small.");
    expect((await editTeacherAssignment(teacher, assignmentId, { title: "My village", level: "B2" })).status).toBe("done");
    expect(await storedAssignment(assignmentId)).toMatchObject({
      title: "My village", level: "B2", subject: "Describe your town.", contentVersion: 1,
    });
    expect(await getTeacherAssignment(teacher, assignmentId)).toMatchObject({ locked: true });
  });

  it("deletion is refused; the assignment, its classes, the submission and its text stay", async () => {
    const { teacher, lina, assignmentId } = await setup();
    await submitted(lina, assignmentId, "My town is small.");
    const before = await storedSubmission(lina);
    expect(await deleteTeacherAssignment(teacher, assignmentId)).toEqual({
      ok: false, message: ASSIGNMENT_MESSAGES.notDeleted,
    });
    expect(await storedAssignment(assignmentId)).toBeDefined();
    expect(await db.select().from(assignmentClasses)).toHaveLength(1);
    expect(await storedSubmission(lina)).toEqual(before);
  });

  it("the database holds it too: with the lock cleared by hand, the submission still forbids the deletion", async () => {
    const { teacher, lina, assignmentId } = await setup();
    await submitted(lina, assignmentId, "My town is small.");
    await db.update(assignments).set({ lockedAt: null }).where(eq(assignments.id, assignmentId));
    const error = await deleteAssignment(teacher, assignmentId).then(() => null, (e: unknown) => e);
    // A foreign key violation: the assignment and its recipient classes stay.
    expect(pgCode(error)).toBe("23503");
    expect(await storedAssignment(assignmentId)).toBeDefined();
    expect(await db.select().from(assignmentClasses)).toHaveLength(1);
  });

  it("another student still submits to the locked assignment; the lock keeps its first date", async () => {
    const { lina, omar, assignmentId } = await setup();
    await submitted(lina, assignmentId, "Lina's text.");
    const { lockedAt } = await storedAssignment(assignmentId);
    await submitted(omar, assignmentId, "Omar's text.");
    expect((await storedAssignment(assignmentId)).lockedAt).toEqual(lockedAt);
    expect(await db.select().from(submissions)).toHaveLength(2);
  });
});

describe("CLS-04 CA3: a removed student's submission is kept", () => {
  it("removed, then readmitted: the submission, its versions and its dates are untouched", async () => {
    const { teacher, lina, classId, assignmentId } = await setup();
    await submitted(lina, assignmentId, "First text.");
    expect((await replace(lina, assignmentId, "Second text.")).status).toBe("done");
    const before = await storedSubmission(lina);
    expect(before?.versions.map((v) => v.text)).toEqual(["First text.", "Second text."]);

    expect(await removeStudent(teacher, classId, lina.userId)).toBe(true);
    expect(await storedSubmission(lina)).toEqual(before);
    expect(await readmitStudent(teacher, classId, lina.userId)).toBe(true);
    expect(await storedSubmission(lina)).toEqual(before);
    expect(await db.select().from(submissions)).toHaveLength(1);
  });

  it("the only submitter removed: the assignment stays locked, its deletion still refused", async () => {
    const { teacher, lina, classId, assignmentId } = await setup();
    await submitted(lina, assignmentId, "My town is small.");
    await removeStudent(teacher, classId, lina.userId);
    expect(await getTeacherAssignment(teacher, assignmentId)).toMatchObject({ locked: true });
    expect(await deleteTeacherAssignment(teacher, assignmentId)).toEqual({
      ok: false, message: ASSIGNMENT_MESSAGES.notDeleted,
    });
  });
});

describe("SUB-01 CA3: the removed student keeps the assignment, read only", () => {
  it("still listed with its state and late mark; nothing more is submitted or replaced", async () => {
    const { teacher, lina, classId, assignmentId } = await setup();
    await db.update(assignments).set({ deadline: sql`now() - interval '1 minute'` }).where(eq(assignments.id, assignmentId));
    await submitted(lina, assignmentId, "Late text.");
    const without = await newAssignment(teacher, [classId], "Not submitted");
    await removeStudent(teacher, classId, lina.userId);
    const after = await newAssignment(teacher, [classId], "Sent after removal");

    // SUB-01 R4: only the assignment with a submission stays.
    const list = await listStudentAssignments(lina);
    expect(list.map((a) => [a.id, a.status, a.late])).toEqual([[assignmentId, "being_marked", true]]);
    expect(await getStudentAssignment(lina, without)).toBeNull();
    expect(await getStudentAssignment(lina, after)).toBeNull();
    expect(await getStudentAssignment(lina, assignmentId)).toMatchObject({
      status: "being_marked", late: true, canSubmit: false, canReplace: false,
    });

    const before = await storedSubmission(lina);
    expect(await replace(lina, assignmentId, "Changed after removal.")).toEqual({
      status: "error", reason: "unavailable", message: REPLACEMENT_MESSAGES.unavailable,
    });
    expect(await submit(lina, assignmentId, "Again.")).toMatchObject({ reason: "unavailable" });
    expect(await submit(lina, without, "To the other one.")).toMatchObject({ reason: "unavailable" });
    expect(await storedSubmission(lina)).toEqual(before);
  });

  it("readmitted, the student may replace again, within the same limit", async () => {
    const { teacher, lina, classId, assignmentId } = await setup();
    await submitted(lina, assignmentId, "First text.");
    await replace(lina, assignmentId, "Second text.");
    await removeStudent(teacher, classId, lina.userId);
    expect(await readmitStudent(teacher, classId, lina.userId)).toBe(true);
    expect(await getStudentAssignment(lina, assignmentId)).toMatchObject({ canReplace: true, replacementsLeft: 1 });
    expect(await replace(lina, assignmentId, "Third text.")).toMatchObject({ status: "done", replacementsLeft: 0 });
  });

  it("removed from C1 but still in C3, both recipients: the student still replaces", async () => {
    const teacher = await createUser("teacher");
    const [c1, c3] = await Promise.all(["C1", "C3"].map(async (name) => {
      const made = await createClass(teacher, { name });
      if (!made.ok) throw new Error("Class not created");
      return made.classId;
    }));
    const lina = await studentOf(c1);
    await db.insert(classMemberships).values({ classId: c3, studentId: lina.userId });
    const assignmentId = await newAssignment(teacher, [c1, c3]);
    await submitted(lina, assignmentId, "First text.");
    await removeStudent(teacher, c1, lina.userId);
    expect(await getStudentAssignment(lina, assignmentId)).toMatchObject({ canReplace: true });
    expect((await replace(lina, assignmentId, "Second text.")).status).toBe("done");
  });
});

describe("the Submission row (§5.4): the student writes their own, never reads it back", () => {
  it("a classmate who received the same assignment reaches only their own submission", async () => {
    const { lina, omar, assignmentId } = await setup();
    await submitted(lina, assignmentId, "Lina's text.");
    const linas = await storedSubmission(lina);

    // Omar has no submission yet: nothing to replace, Lina's untouched.
    expect(await replace(omar, assignmentId, "Omar over Lina.")).toMatchObject({ reason: "unavailable" });
    expect(await storedSubmission(lina)).toEqual(linas);

    // His own: submitted and replaced, each on his row.
    await submitted(omar, assignmentId, "Omar's text.");
    expect((await replace(omar, assignmentId, "Omar's new text.")).status).toBe("done");
    expect(await storedSubmission(lina)).toEqual(linas);
    expect((await storedSubmission(omar))?.versions.map((v) => v.text)).toEqual(["Omar's text.", "Omar's new text."]);
  });

  it.each(["teacher", "admin"] as const)("another %s writes nothing, refused and logged; the owner teacher neither", async (role) => {
    const { teacher, lina, assignmentId } = await setup();
    await submitted(lina, assignmentId, "Lina's text.");
    const before = await storedSubmission(lina);
    for (const actor of [await createUser(role), teacher]) {
      expect(await submit(actor, assignmentId, "Not theirs.")).toEqual({
        status: "error", reason: "notAllowed", message: SUBMISSION_MESSAGES.notAllowed,
      });
      expect(await replace(actor, assignmentId, "Not theirs.")).toEqual({
        status: "error", reason: "notAllowed", message: REPLACEMENT_MESSAGES.notAllowed,
      });
      expect(await db.select().from(securityEvents).where(eq(securityEvents.actorUserId, actor.userId))).toHaveLength(2);
    }
    expect(await storedSubmission(lina)).toEqual(before);
    expect(await db.select().from(submissions)).toHaveLength(1);
  });

  it("another teacher reads nothing of it: not the assignment, not the student's view", async () => {
    const { lina, assignmentId } = await setup();
    await submitted(lina, assignmentId, "Lina's text.");
    const karim = await createUser("teacher");
    expect(await getTeacherAssignment(karim, assignmentId)).toBeNull();
    await expect(getStudentAssignment(karim, assignmentId)).rejects.toThrow();
    await expect(listStudentAssignments(karim)).rejects.toThrow();
  });

  /** The internal states and their labels: the student reads none of them (SUB-01 R3). */
  const internal = storedSubmissionStatuses.flatMap((s) => [s, statusLabels[s]]);
  const leaks = (answer: unknown, texts: string[]) => {
    const json = JSON.stringify(answer);
    return [...texts, ...internal].filter((word) => new RegExp(`\\b${word}\\b`, "i").test(json));
  };

  it("no answer to the student carries their text or an internal state, whatever the state", async () => {
    const { lina, assignmentId } = await setup();
    const texts = ["Lina wrote this first.", "Lina wrote this next."];
    const firstRequest = randomUUID();
    const answers: unknown[] = [
      await submit(lina, assignmentId, texts[0], firstRequest),
      // A resend after a network cut, then a second form.
      await submit(lina, assignmentId, texts[0], firstRequest),
      await submit(lina, assignmentId, "Another form."),
      await replace(lina, assignmentId, texts[1]),
    ];
    expect(leaks(answers, texts)).toEqual([]);

    const { row } = (await storedSubmission(lina))!;
    for (const status of storedSubmissionStatuses) {
      // Set as E5 to E8 will: validated and published only once the teacher started,
      // not assessable with its cause and no other state with one, evaluating with a claim
      // token and no other state with one (check constraints).
      const started = status === "validated" || status === "published";
      // 0019: Validated, then Published, need the teacher's complete evaluation (given once: the states come in order).
      if (status === "validated") await giveCompleteEvaluation(row.id);
      await db
        .update(submissions)
        .set({
          status,
          teacherStartedAt: started ? sql`now()` : null,
          notAssessableCause: status === "not_assessable" ? "no_content" : null,
          claimToken: status === "evaluating" ? "test-claim" : null,
        })
        .where(eq(submissions.id, row.id));
      const list = await listStudentAssignments(lina);
      const detail = await getStudentAssignment(lina, assignmentId);
      const replaced = await replace(lina, assignmentId, "One more.");

      expect(leaks([list, detail, replaced], texts), status).toEqual([]);
      expect(detail?.status, status).toBe(toStudentStatus(status));
      expect(list[0].status, status).toBe(toStudentStatus(status));
      // The closed list of fields: no version, teacher mark or internal state.
      expect(Object.keys(detail!).sort()).toEqual([
        "canReplace", "canSubmit", "contentVersion", "deadline", "deadlinePassed", "id", "instructions",
        "language", "lastVersionAt", "late", "replacementsLeft", "status", "subject", "submittedAt", "title",
      ]);
      if (started) {
        expect(replaced).toMatchObject({ reason: "teacherStarted" });
      } else {
        // Undo the replacement, to try the next state from the same point.
        expect(replaced.status, status).toBe("done");
        await db.delete(submissionVersions).where(and(eq(submissionVersions.submissionId, row.id), eq(submissionVersions.number, 3)));
        await db.update(submissions).set({ currentVersion: 2 }).where(eq(submissions.id, row.id));
      }
    }
    // Nine states, a few round trips each to a distant database.
  }, 120_000);
});
