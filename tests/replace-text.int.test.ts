import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { SUBMISSION_MAX_REPLACEMENTS } from "@/config/decisions";
import { SUBMISSION_TEXT_ERRORS } from "@/lib/submission-text";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { createAssignment, getStudentAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { removeStudent } from "@/server/data/classes/roster";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import { assignments, classMemberships, submissions, submissionVersions, users } from "@/server/db/schema";
import {
  REPLACEMENT_MESSAGES,
  replaceStudentText,
  submitStudentText,
  type ReplaceTextState,
} from "@/server/submissions/submissions";
import { noTrigger } from "./helpers/triggers";

// SUB-05: replace the submission while the teacher has neither changed nor
// validated it, 2 times at most (Q3 [D]). CA1, CA3, CA4 here, with SUB-04
// CA2; CA2 (processing restarted, late results not current) in E6.

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

/** A student who submitted "First text." on time, in a class of the teacher. */
async function submitted() {
  const teacher = await createUser("teacher");
  const student = await createUser("student");
  const made = await createClass(teacher, { name: "Grade 10" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  const first = await submitStudentText(student, {
    assignmentId: created.assignmentId, contentVersion: "1", requestId: randomUUID(), text: "First text.",
  }, noTrigger);
  if (first.status !== "done") throw new Error(first.status);
  const [{ id }] = await db.select({ id: submissions.id }).from(submissions);
  return { teacher, student, classId: made.classId, assignmentId: created.assignmentId, submissionId: id };
}

const replace = (actor: Actor, assignmentId: string, text: string, requestId = randomUUID()) =>
  replaceStudentText(actor, { assignmentId, requestId, text }, noTrigger);

/**
 * The teacher's first change or validation, as E7 and E8 will write it: it
 * names the version the teacher saw, and marks the submission in one statement.
 */
const teacherFirstAct = (executor: Pick<typeof db, "update">, submissionId: string, seenVersion: number) =>
  executor
    .update(submissions)
    .set({ teacherStartedAt: sql`coalesce(${submissions.teacherStartedAt}, now())` })
    .where(and(eq(submissions.id, submissionId), eq(submissions.currentVersion, seenVersion)))
    .returning({ id: submissions.id });

const versions = () =>
  db
    .select({ number: submissionVersions.number, text: submissionVersions.text, createdAt: submissionVersions.createdAt })
    .from(submissionVersions)
    .orderBy(asc(submissionVersions.number));

const row = async () => (await db.select().from(submissions))[0];
const refusedWith = (reason: keyof typeof REPLACEMENT_MESSAGES): ReplaceTextState => ({
  status: "error", reason, message: REPLACEMENT_MESSAGES[reason],
});

describe("CA1: a new active version, the previous one archived and dated", () => {
  it("replaces, keeps the old text, and counts down the replacements", async () => {
    const { student, assignmentId } = await submitted();
    const state = await replace(student, assignmentId, "Second text, better.");
    expect(state).toMatchObject({ status: "done", replacementsLeft: 1 });

    const kept = await versions();
    expect(kept.map(({ number, text }) => [number, text])).toEqual([[1, "First text."], [2, "Second text, better."]]);
    expect(kept[1].createdAt.getTime()).toBeGreaterThanOrEqual(kept[0].createdAt.getTime());
    expect(await row()).toMatchObject({ currentVersion: 2, status: "received", teacherStartedAt: null });

    const seen = await getStudentAssignment(student, assignmentId);
    expect(seen).toMatchObject({ replacementsLeft: 1, canReplace: true, status: "being_marked" });
    expect(seen?.lastVersionAt).toBe(kept[1].createdAt.toISOString());
    expect(seen?.submittedAt).toBe(kept[0].createdAt.toISOString());
    // A3: the student's read carries no text, old or new.
    expect(JSON.stringify(seen)).not.toMatch(/First text|Second text/);
  });

  it(`refuses the third replacement: ${SUBMISSION_MAX_REPLACEMENTS} at most, 3 versions`, async () => {
    const { student, assignmentId } = await submitted();
    expect(await replace(student, assignmentId, "Second.")).toMatchObject({ replacementsLeft: 1 });
    expect(await replace(student, assignmentId, "Third.")).toMatchObject({ replacementsLeft: 0 });
    expect(await getStudentAssignment(student, assignmentId)).toMatchObject({ replacementsLeft: 0, canReplace: false });
    expect(await replace(student, assignmentId, "Fourth.")).toEqual(refusedWith("limitReached"));
    expect((await versions()).map((v) => v.text)).toEqual(["First text.", "Second.", "Third."]);
  });

  it("never goes past the cap under concurrency: three at once give two", async () => {
    const { student, assignmentId } = await submitted();
    const results = await Promise.all(["A.", "B.", "C."].map((text) => replace(student, assignmentId, text)));
    expect(results.filter((r) => r.status === "done")).toHaveLength(2);
    expect(results.filter((r) => r.status === "error")).toEqual([refusedWith("limitReached")]);
    expect(await versions()).toHaveLength(3);
    expect(await row()).toMatchObject({ currentVersion: 3 });
  });

  it("with one left, two at once give one", async () => {
    const { student, assignmentId } = await submitted();
    await replace(student, assignmentId, "Second.");
    const results = await Promise.all([replace(student, assignmentId, "A."), replace(student, assignmentId, "B.")]);
    expect(results.map((r) => r.status).sort()).toEqual(["done", "error"]);
    expect(await versions()).toHaveLength(3);
  });

  it("counts a resent form once, even sent twice at once", async () => {
    const { student, assignmentId } = await submitted();
    const requestId = randomUUID();
    const [a, b] = await Promise.all([
      replace(student, assignmentId, "Second.", requestId),
      replace(student, assignmentId, "Second.", requestId),
    ]);
    expect(a).toEqual(b);
    expect(await replace(student, assignmentId, "Second.", requestId)).toEqual(a);
    expect(await versions()).toHaveLength(2);
  });

  it("checks the new text like a first one, nothing stored", async () => {
    const { student, assignmentId } = await submitted();
    expect(await replace(student, assignmentId, "   \n ")).toEqual({ status: "invalid", error: SUBMISSION_TEXT_ERRORS.empty });
    expect(await versions()).toHaveLength(1);
  });

  it("keeps the new text exactly as written", async () => {
    const { student, assignmentId } = await submitted();
    const text = "i has went , L’été — café 🇲🇦\n\n  end ";
    await replace(student, assignmentId, text);
    expect((await versions())[1].text).toBe(text);
  });
});

describe("SUB-04 CA2: the late mark stays that of the first submission", () => {
  it("is not set by a replacement after the deadline; both dates are kept", async () => {
    const { student, assignmentId } = await submitted();
    // The deadline passes just after the first submission, before the replacement.
    await db
      .update(assignments)
      .set({ deadline: sql`(select ${submissions.submittedAt} from ${submissions}) + interval '1 millisecond'` })
      .where(eq(assignments.id, assignmentId));
    expect((await replace(student, assignmentId, "After the deadline.")).status).toBe("done");

    const [dates] = await db
      .select({
        late: submissions.late,
        firstOnTime: sql<boolean>`${submissions.submittedAt} <= ${assignments.deadline}`,
        secondAfter: sql<boolean>`(select max(${submissionVersions.createdAt}) from ${submissionVersions}) > ${assignments.deadline}`,
      })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId));
    expect(dates).toEqual({ late: false, firstOnTime: true, secondAfter: true });
    expect(await getStudentAssignment(student, assignmentId)).toMatchObject({ late: false });
  });
});

describe("CA3: refused once the teacher changed or validated", () => {
  it("refuses after the teacher's first act, nothing replaced", async () => {
    const { student, assignmentId, submissionId } = await submitted();
    expect(await teacherFirstAct(db, submissionId, 1)).toHaveLength(1);
    expect(await getStudentAssignment(student, assignmentId)).toMatchObject({ canReplace: false, replacementsLeft: 2 });
    expect(await replace(student, assignmentId, "Too late.")).toEqual(refusedWith("teacherStarted"));
    expect(await versions()).toHaveLength(1);
  });

  it("refuses a validated submission", async () => {
    const { student, assignmentId, submissionId } = await submitted();
    await db
      .update(submissions)
      .set({ status: "validated", teacherStartedAt: sql`now()` })
      .where(eq(submissions.id, submissionId));
    expect(await replace(student, assignmentId, "Too late.")).toEqual(refusedWith("teacherStarted"));
    expect(await row()).toMatchObject({ status: "validated", currentVersion: 1 });
  });
});

describe("CA4: replacement and the teacher's first act at once: one wins, the other is told", () => {
  it("lets exactly one of them through when they race", async () => {
    const { student, assignmentId, submissionId } = await submitted();
    const [replaced, acted] = await Promise.all([
      replace(student, assignmentId, "Second."),
      teacherFirstAct(db, submissionId, 1),
    ]);
    const replacementWon = replaced.status === "done";
    expect(replacementWon).toBe(acted.length === 0);
    if (!replacementWon) expect(replaced).toEqual(refusedWith("teacherStarted"));
    expect(await versions()).toHaveLength(replacementWon ? 2 : 1);
  });

  it("teacher first: the replacement waits for the teacher's transaction, then is refused", async () => {
    const { student, assignmentId, submissionId } = await submitted();
    let pending: Promise<ReplaceTextState> | undefined;
    await db.transaction(async (tx) => {
      expect(await teacherFirstAct(tx, submissionId, 1)).toHaveLength(1);
      pending = replace(student, assignmentId, "Second.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
    expect(await pending).toEqual(refusedWith("teacherStarted"));
    expect(await versions()).toHaveLength(1);
  });

  it("student first: the teacher's act on the version seen finds a newer one, and changes nothing", async () => {
    const { student, assignmentId, submissionId } = await submitted();
    expect((await replace(student, assignmentId, "Second.")).status).toBe("done");
    expect(await teacherFirstAct(db, submissionId, 1)).toEqual([]);
    expect(await row()).toMatchObject({ teacherStartedAt: null, currentVersion: 2 });
  });
});

describe("only the student's own submission, while a member", () => {
  it("refuses a student removed from the class", async () => {
    const { teacher, student, classId, assignmentId } = await submitted();
    await removeStudent(teacher, classId, student.userId);
    expect(await getStudentAssignment(student, assignmentId)).toMatchObject({ canReplace: false });
    expect(await replace(student, assignmentId, "Second.")).toEqual(refusedWith("unavailable"));
    expect(await versions()).toHaveLength(1);
  });

  it("refuses another student, who has no submission there", async () => {
    const { assignmentId } = await submitted();
    expect(await replace(await createUser("student"), assignmentId, "Not mine.")).toEqual(refusedWith("unavailable"));
  });

  it("refuses a teacher, even the owner", async () => {
    const { teacher, assignmentId } = await submitted();
    expect(await replace(teacher, assignmentId, "Not mine.")).toEqual(refusedWith("notAllowed"));
    expect(await versions()).toHaveLength(1);
  });
});
