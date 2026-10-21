import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { applyChanges, fieldsFromProposal } from "@/lib/review";
import { RUBRIC_VERSIONS, type CriterionId, type Level } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { removeStudent } from "@/server/data/classes/roster";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { getCopy, getStudentIdentity, recordCopyOpened } from "@/server/data/review/copy";
import { writeEvaluation } from "@/server/data/review/record";
import { submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { aiProposals, classMemberships, evaluationRuns, reviewJournalEntries, submissions, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { openCopy } from "@/server/review/copy";

// REV-02 (E7.3): one student's copy for one of the teacher's assignments,
// with their recipient classes only, their text as submitted and the
// proposal in force; absent for another teacher or a student who did not
// receive the assignment. Opening it logs "copy opened".

// Spaces, a line break and mistakes: kept exactly (SUB-02 R2).
const TEXT = "My town is small but it is beatiful.\n\n  There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher", firstName = "F", lastName = `L${count}`): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `copy-${role}${n}@example.test`, emailVerified: true, name: `${firstName} ${lastName}`, firstName, lastName, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

async function classOf(teacher: Actor, name: string, students: (Actor & { kind: "user" })[]) {
  const made = await createClass(teacher, { name });
  if (!made.ok) throw new Error("Class not created");
  if (students.length > 0) await db.insert(classMemberships).values(students.map((s) => ({ classId: made.classId, studentId: s.userId })));
  return made.classId;
}

async function assignmentTo(teacher: Actor, classIds: string[]) {
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds,
  });
  if (!created.ok) throw new Error("Assignment not created");
  return created.assignmentId;
}

async function submit(student: Actor, assignmentId: string, text = TEXT) {
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const done = await submitText(student, { assignmentId, contentVersion: 1, requestId: randomUUID(), text });
  if (!done?.ok) throw new Error("Not submitted");
  return done.ref.submissionId;
}

const evaluate = (submissionId: string) =>
  evaluateSubmission(
    submissionId,
    { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
    { expectedVersion: 1, claimToken: randomUUID() },
  );

describe("the copy of one student (REV-02)", { timeout: 120_000 }, () => {
  it("CA1: two students with the same name each open their own copy, with name, email and class", async () => {
    const teacher = await createUser("teacher");
    const first = await createUser("student", "Sam", "Lee");
    const second = await createUser("student", "Sam", "Lee");
    const assignmentId = await assignmentTo(teacher, [await classOf(teacher, "C1", [first, second])]);
    await submit(first, assignmentId, "First text.");
    await submit(second, assignmentId, "Second text.");

    const emails = [];
    for (const [student, text] of [[first, "First text."], [second, "Second text."]] as const) {
      const copy = (await getCopy(teacher, assignmentId, student.userId))!;
      expect(copy.version).toMatchObject({ number: 1, mode: "text", text });
      expect(copy.classes.map((c) => c.name)).toEqual(["C1"]);
      const identity = (await getStudentIdentity(teacher, student.userId))!;
      expect(identity).toMatchObject({ firstName: "Sam", lastName: "Lee" });
      emails.push(identity.email);
    }
    expect(new Set(emails).size).toBe(2);
  });

  it("CA2: only the student's recipient classes of this assignment, never another class", async () => {
    const teacher = await createUser("teacher");
    const other = await createUser("teacher");
    const student = await createUser("student");
    const a = await classOf(teacher, "A", [student]);
    const b = await classOf(teacher, "B", [student]);
    await classOf(teacher, "C (not a recipient)", [student]);
    await classOf(other, "D (another teacher)", [student]);
    const assignmentId = await assignmentTo(teacher, [a, b]);
    const copy = (await getCopy(teacher, assignmentId, student.userId))!;
    expect(copy.classes).toEqual([
      { id: a, name: "A", removed: false },
      { id: b, name: "B", removed: false },
    ]);
    // Not submitted: a status page, nothing to log or write.
    expect(copy).toMatchObject({ status: "to_submit", version: null, proposal: null, evaluation: null, seen: null });
  });

  it("gives the text exactly as submitted, the proposal in force with its quotes, then the teacher's evaluation", async () => {
    const teacher = await createUser("teacher");
    const student = await createUser("student");
    const assignmentId = await assignmentTo(teacher, [await classOf(teacher, "C1", [student])]);
    const submissionId = await submit(student, assignmentId);

    let copy = (await getCopy(teacher, assignmentId, student.userId))!;
    expect(copy).toMatchObject({ status: "received", proposal: null, late: false, lastError: null });
    expect(copy.version?.text).toBe(TEXT);
    expect(copy.seen).toEqual({ submissionId, versionNumber: 1, proposalId: null, revision: 0, status: "received" });

    getSimulator().clear();
    expect((await evaluate(submissionId)).status).toBe("to_review");
    copy = (await getCopy(teacher, assignmentId, student.userId))!;
    expect(copy.status).toBe("to_review");
    expect(copy.proposal?.model).toEqual(expect.any(String));
    expect(copy.proposal?.criteria.task.quotes.length).toBeGreaterThan(0);
    expect(copy.evaluation).toBeNull();
    const [proposal] = await db
      .select({ id: aiProposals.id, rubricVersion: evaluationRuns.rubricVersion })
      .from(aiProposals)
      .innerJoin(evaluationRuns, eq(evaluationRuns.id, aiProposals.runId))
      .where(eq(aiProposals.submissionId, submissionId));
    expect(copy.seen).toMatchObject({ proposalId: proposal.id, revision: 0 });

    const before = fieldsFromProposal(copy.proposal!);
    const after = applyChanges(before, {
      levels: { ...(before.levels as Record<CriterionId, Level>), task: before.levels.task === 4 ? 3 : 4 },
      remarks: before.remarks, generalComment: before.generalComment, nextSteps: before.nextSteps,
      grade: { fixed: false }, rereadDone: [],
    });
    await db.transaction(async (tx) => {
      await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.id, submissionId)).for("update");
      await writeEvaluation(tx, {
        assignmentId, submissionId, versionNumber: 1, actorId: teacher.userId, fromRevision: 0,
        start: { origin: "proposal", proposalId: proposal.id, rubricVersion: proposal.rubricVersion! }, before, after,
      });
    });
    copy = (await getCopy(teacher, assignmentId, student.userId))!;
    expect(copy.evaluation).toMatchObject({ ...after, revision: 1 });
    expect(copy.evaluation?.reread.task).toBe(true);
    expect(copy.seen?.revision).toBe(1);
  });

  it("names why an evaluation failed: the AI declined", async () => {
    const teacher = await createUser("teacher");
    const student = await createUser("student");
    const assignmentId = await assignmentTo(teacher, [await classOf(teacher, "C1", [student])]);
    const submissionId = await submit(student, assignmentId);
    getSimulator().clear();
    getSimulator().failNext({ kind: "refusal", category: null });
    expect((await evaluate(submissionId)).status).toBe("evaluation_failed");
    expect(await getCopy(teacher, assignmentId, student.userId)).toMatchObject({
      status: "evaluation_failed", lastError: "refused", proposal: null,
    });
  });

  it("is absent for another teacher, a student who did not receive the assignment, or a removed one without a submission; a student is refused", async () => {
    const teacher = await createUser("teacher");
    const other = await createUser("teacher");
    const [student, outsider, removedWithout, removedWith] = [
      await createUser("student"), await createUser("student"), await createUser("student"), await createUser("student"),
    ];
    const c1 = await classOf(teacher, "C1", [student, removedWithout, removedWith]);
    await classOf(teacher, "C2", [outsider]);
    const assignmentId = await assignmentTo(teacher, [c1]);
    await submit(student, assignmentId);
    await submit(removedWith, assignmentId);
    await removeStudent(teacher, c1, removedWithout.userId);
    await removeStudent(teacher, c1, removedWith.userId);

    expect(await getCopy(other, assignmentId, student.userId)).toBeNull();
    expect(await getCopy(teacher, randomUUID(), student.userId)).toBeNull();
    expect(await getCopy(teacher, assignmentId, outsider.userId)).toBeNull();
    expect(await getCopy(teacher, assignmentId, removedWithout.userId)).toBeNull();
    expect(await getCopy(teacher, assignmentId, randomUUID())).toBeNull();
    // CLS-04 CA3: removed with a submission, still the teacher's to read.
    expect((await getCopy(teacher, assignmentId, removedWith.userId))?.classes).toEqual([{ id: c1, name: "C1", removed: true }]);
    await expect(getCopy(student, assignmentId, student.userId)).rejects.toThrow(AccessDeniedError);

    // Invariant 9: the identity for the teacher of one of their classes, and the student themself only.
    expect(await getStudentIdentity(teacher, removedWith.userId)).not.toBeNull();
    expect(await getStudentIdentity(other, student.userId)).toBeNull();
    expect(await getStudentIdentity(student, student.userId)).not.toBeNull();
    expect(await getStudentIdentity(student, outsider.userId)).toBeNull();
  });
});

describe("opening the copy (E7 plan §1.6)", { timeout: 120_000 }, () => {
  const copyOpened = (submissionId: string) =>
    db
      .select({ actorId: reviewJournalEntries.actorId, versionNumber: reviewJournalEntries.versionNumber })
      .from(reviewJournalEntries)
      .where(and(eq(reviewJournalEntries.submissionId, submissionId), eq(reviewJournalEntries.event, "copy_opened")));

  it("logs 'copy opened' with the teacher and the version; refreshes only when the copy changed", async () => {
    const teacher = await createUser("teacher");
    const other = await createUser("teacher");
    const student = await createUser("student");
    const assignmentId = await assignmentTo(teacher, [await classOf(teacher, "C1", [student])]);
    const submissionId = await submit(student, assignmentId);
    const seen = (await getCopy(teacher, assignmentId, student.userId))!.seen!;

    expect(await openCopy(teacher, seen)).toEqual({ refresh: false });
    expect(await copyOpened(submissionId)).toEqual([{ actorId: teacher.userId, versionNumber: 1 }]);

    // Evaluated since the page was rendered: the proposal and the status differ.
    getSimulator().clear();
    await evaluate(submissionId);
    expect(await openCopy(teacher, seen)).toEqual({ refresh: true });
    expect(await copyOpened(submissionId)).toHaveLength(2);

    // Another teacher, a student, a malformed request: nothing logged.
    expect(await openCopy(other, seen)).toEqual({ refresh: false });
    expect(await openCopy(student, seen)).toEqual({ refresh: false });
    expect(await openCopy(teacher, { ...seen, submissionId: "x" })).toEqual({ refresh: false });
    expect(await recordCopyOpened(other, submissionId)).toBeNull();
    expect(await copyOpened(submissionId)).toHaveLength(2);
  });
});
