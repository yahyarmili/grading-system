import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { applyChanges, fieldsFromProposal } from "@/lib/review";
import { RUBRIC_VERSIONS, type CriterionId, type Level } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { getSimulator } from "@/server/ai";
import { createAssignment, listTeacherAssignments } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { removeStudent } from "@/server/data/classes/roster";
import { getCurrentProposal } from "@/server/data/evaluation/proposals";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { recordListOpened } from "@/server/data/review/list";
import { writeEvaluation } from "@/server/data/review/record";
import { submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { aiProposals, assignments, classMemberships, evaluationRuns, reviewJournalEntries, submissions, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import type { SweepResult } from "@/server/evaluation/sweep";
import { openReviewList, type SweepContext } from "@/server/review/list";
import { listAssignmentCopies, readTeacherNotice } from "./helpers/review";

// REV-01 (E7.2): one line per student of an assignment, removed students
// with a submission included (CLS-04 CA3), "Late" visible (SUB-04 CA3);
// another teacher's list is absent; opening it logs, then sweeps after the response.

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUsers(role: "student" | "teacher", n: number): Promise<(Actor & { kind: "user" })[]> {
  const rows = await db
    .insert(users)
    .values(
      Array.from({ length: n }, () => {
        const i = ++count;
        return { email: `list-${role}${i}@example.test`, emailVerified: true, name: `${role} ${i}`, firstName: `F${i}`, lastName: `L${i}`, role };
      }),
    )
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(...rows.map((user) => user.id));
  return rows.map((user) => ({ kind: "user", userId: user.id, role }));
}

async function classOf(teacher: Actor, name: string, students: Actor[]) {
  const made = await createClass(teacher, { name });
  if (!made.ok) throw new Error("Class not created");
  if (students.length > 0) {
    await db.insert(classMemberships).values(
      students.map((s) => ({ classId: made.classId, studentId: s.kind === "user" ? s.userId : "" })),
    );
  }
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

async function submit(student: Actor, assignmentId: string) {
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const done = await submitText(student, { assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT });
  if (!done?.ok) throw new Error("Not submitted");
  return done.ref;
}

const idOf = (actor: Actor) => (actor.kind === "user" ? actor.userId : "");
const lineOf = <Row extends { studentId: string }>(rows: Row[], student: Actor) => rows.find((r) => r.studentId === idOf(student));

describe("the list of an assignment's submissions", { timeout: 120_000 }, () => {
  it("CA1: a class of 8 where 5 submitted gives 8 lines, 3 not submitted; the counts of the assignments list follow", async () => {
    const [teacher] = await createUsers("teacher", 1);
    const students = await createUsers("student", 8);
    const classId = await classOf(teacher, "Grade 9", students);
    const assignmentId = await assignmentTo(teacher, [classId]);
    for (const student of students.slice(0, 5)) await submit(student, assignmentId);

    const copies = await listAssignmentCopies(teacher, assignmentId);
    expect(copies?.rows).toHaveLength(8);
    expect(copies?.rows.filter((r) => r.status === "to_submit")).toHaveLength(3);
    expect(copies?.rows.filter((r) => r.status === "received")).toHaveLength(5);
    const line = lineOf(copies!.rows, students[0])!;
    expect(line).toMatchObject({ firstName: expect.any(String), lastName: expect.any(String), mode: "text", late: false });
    expect(Date.parse(line.versionAt!)).not.toBeNaN();
    expect(lineOf(copies!.rows, students[7])).toMatchObject({ status: "to_submit", mode: null, versionAt: null, proposedGrade: null });

    // ASG-02 R1: the assignment's line counts its submissions and its copies to review.
    const [item] = (await listTeacherAssignments(teacher)).filter((a) => a.id === assignmentId);
    expect(item).toMatchObject({ submissions: 5, toReview: 0 });
  });

  it("CA4, CLS-04 CA3, SUB-04 CA3: removed with a submission listed and marked, removed without one absent; one line for two classes; late shown", async () => {
    const [teacher] = await createUsers("teacher", 1);
    const [both, removedWith, removedWithout, late] = await createUsers("student", 4);
    const p = await classOf(teacher, "P", [both, removedWith, removedWithout, late]);
    const q = await classOf(teacher, "Q", [both]);
    const assignmentId = await assignmentTo(teacher, [p, q]);
    await submit(both, assignmentId);
    await submit(removedWith, assignmentId);
    await removeStudent(teacher, p, idOf(removedWith));
    await removeStudent(teacher, p, idOf(removedWithout));
    // The deadline passes: the next submission is late (test only; the lock forbids it in the application).
    await db.update(assignments).set({ deadline: new Date(Date.now() - 60_000) }).where(eq(assignments.id, assignmentId));
    await submit(late, assignmentId);

    const copies = (await listAssignmentCopies(teacher, assignmentId))!;
    expect(copies.classes.map((c) => c.name)).toEqual(["P", "Q"]);
    expect(copies.rows).toHaveLength(3);
    expect(lineOf(copies.rows, removedWithout)).toBeUndefined();
    expect(lineOf(copies.rows, removedWith)?.classes).toEqual([{ id: p, name: "P", removed: true }]);
    expect(lineOf(copies.rows, both)?.classes).toEqual([
      { id: p, name: "P", removed: false },
      { id: q, name: "Q", removed: false },
    ]);
    expect(lineOf(copies.rows, late)).toMatchObject({ late: true, status: "received" });
    expect(lineOf(copies.rows, both)).toMatchObject({ late: false });
  });

  it("gives the proposed grade, then the teacher's once they changed it", async () => {
    const [teacher] = await createUsers("teacher", 1);
    const [student] = await createUsers("student", 1);
    const assignmentId = await assignmentTo(teacher, [await classOf(teacher, "R", [student])]);
    const ref = await submit(student, assignmentId);
    getSimulator().clear();
    const outcome = await evaluateSubmission(
      ref.submissionId,
      { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
      { expectedVersion: 1, claimToken: randomUUID() },
    );
    expect(outcome.status).toBe("to_review");
    const proposal = (await getCurrentProposal(teacher, ref.submissionId))!;
    let line = lineOf((await listAssignmentCopies(teacher, assignmentId))!.rows, student);
    expect(line).toMatchObject({ status: "to_review", proposedGrade: proposal.proposedGrade, teacherGrade: null });

    const [run] = await db
      .select({ proposalId: aiProposals.id, rubricVersion: evaluationRuns.rubricVersion })
      .from(aiProposals)
      .innerJoin(evaluationRuns, eq(evaluationRuns.id, aiProposals.runId))
      .where(eq(aiProposals.submissionId, ref.submissionId));
    const before = fieldsFromProposal(proposal);
    const after = applyChanges(before, {
      levels: before.levels as Record<CriterionId, Level>, remarks: before.remarks, generalComment: before.generalComment,
      nextSteps: before.nextSteps, grade: { fixed: true, value: 13.5 }, rereadDone: [],
    });
    await db.transaction(async (tx) => {
      await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.id, ref.submissionId)).for("update");
      await writeEvaluation(tx, {
        assignmentId, submissionId: ref.submissionId, versionNumber: 1, actorId: idOf(teacher), fromRevision: 0,
        start: { origin: "proposal", proposalId: run.proposalId, rubricVersion: run.rubricVersion! }, before, after,
      });
    });
    line = lineOf((await listAssignmentCopies(teacher, assignmentId))!.rows, student);
    expect(line).toMatchObject({ teacherGrade: 13.5, proposedGrade: proposal.proposedGrade });
    const [item] = (await listTeacherAssignments(teacher)).filter((a) => a.id === assignmentId);
    expect(item).toMatchObject({ submissions: 1, toReview: 1 });
  });

  it("another teacher's list is absent, like a missing one, and nothing is logged; a student is refused", async () => {
    const [teacher, other] = await createUsers("teacher", 2);
    const [student] = await createUsers("student", 1);
    const assignmentId = await assignmentTo(teacher, [await classOf(teacher, "S", [student])]);
    await submit(student, assignmentId);

    expect(await listAssignmentCopies(other, assignmentId)).toBeNull();
    expect(await listAssignmentCopies(other, randomUUID())).toBeNull();
    expect(await recordListOpened(other, assignmentId)).toBeNull();
    await expect(listAssignmentCopies(student, assignmentId)).rejects.toThrow(AccessDeniedError);
    await expect(recordListOpened(student, assignmentId)).rejects.toThrow(AccessDeniedError);
    expect(await db.select().from(reviewJournalEntries).where(eq(reviewJournalEntries.assignmentId, assignmentId))).toEqual([]);
    expect((await listTeacherAssignments(other)).some((a) => a.id === assignmentId)).toBe(false);
  });
});

describe("opening the list (E7 plan §1.7)", { timeout: 120_000 }, () => {
  const NOTHING: SweepResult = { released: [], restarted: [] };
  const listOpened = (assignmentId: string) =>
    db
      .select({ actorId: reviewJournalEntries.actorId, submissionId: reviewJournalEntries.submissionId })
      .from(reviewJournalEntries)
      .where(and(eq(reviewJournalEntries.assignmentId, assignmentId), eq(reviewJournalEntries.event, "list_opened")));

  async function fixture() {
    const [teacher, other] = await createUsers("teacher", 2);
    const [student] = await createUsers("student", 1);
    const assignmentId = await assignmentTo(teacher, [await classOf(teacher, "T", [student])]);
    const { stamp } = (await listAssignmentCopies(teacher, assignmentId))!;
    return { teacher, other, student, assignmentId, stamp };
  }

  /** What after() would run once the response is sent: recorded, run by the test. */
  function recordLater() {
    const tasks: (() => Promise<unknown>)[] = [];
    const later = vi.fn<SweepContext["later"]>((task) => void tasks.push(task));
    return { tasks, later };
  }

  it("logs 'list opened' with the teacher and answers; sweeps after the response; refreshes only when the list changed", async () => {
    const { teacher, student, assignmentId, stamp } = await fixture();
    const { tasks, later } = recordLater();
    const sweep = vi.fn(async () => {
      // C8c: the response was sent, "list opened" with it.
      expect(await listOpened(assignmentId)).toEqual([{ actorId: idOf(teacher), submissionId: null }]);
      return NOTHING;
    });
    expect(await openReviewList(teacher, { assignmentId, stamp }, { sweep, later })).toEqual({ refresh: false });
    expect(await listOpened(assignmentId)).toEqual([{ actorId: idOf(teacher), submissionId: null }]);
    // Nothing swept before the answer: one task for after().
    expect(sweep).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledOnce();
    await tasks[0]();
    expect(sweep).toHaveBeenCalledOnce();

    // A submission arrived since the page was rendered: the stamp differs.
    await submit(student, assignmentId);
    expect(await openReviewList(teacher, { assignmentId, stamp }, { sweep, later })).toEqual({ refresh: true });
    expect(await listOpened(assignmentId)).toHaveLength(2);
  });

  it("never waits for the sweep (C8c), however long; a failed sweep is logged by kind, never shown", async () => {
    const { teacher, assignmentId, stamp } = await fixture();
    const { tasks, later } = recordLater();
    let finish: (result: SweepResult) => void = () => {};
    const sweep = vi.fn(() => new Promise<SweepResult>((resolve) => (finish = resolve)));
    const result = await openReviewList(teacher, { assignmentId, stamp }, { sweep, later });
    expect(result).toEqual({ refresh: false });
    // The sweep starts after the response only, and its end is awaited there.
    expect(sweep).not.toHaveBeenCalled();
    const running = tasks[0]();
    expect(sweep).toHaveBeenCalledOnce();
    finish(NOTHING);
    await expect(running).resolves.toEqual(NOTHING);

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await openReviewList(teacher, { assignmentId, stamp }, {
      sweep: async () => {
        throw new TypeError("the database said something");
      },
      later,
    });
    expect(failed).toEqual({ refresh: false });
    await expect(tasks[1]()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[evaluation] sweep failed: TypeError");
    error.mockRestore();
    expect(await listOpened(assignmentId)).toHaveLength(2);
  });

  it("does nothing for another teacher, a student or a malformed request: no sweep, no log", async () => {
    const { other, student, assignmentId, stamp } = await fixture();
    const sweep = vi.fn(async () => NOTHING);
    const later = vi.fn();
    for (const actor of [other, student]) {
      expect(await openReviewList(actor, { assignmentId, stamp }, { sweep, later })).toEqual({ refresh: false });
    }
    expect(await openReviewList(other, { assignmentId: "not-an-id", stamp }, { sweep, later })).toEqual({ refresh: false });
    expect(sweep).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
    expect(await listOpened(assignmentId)).toEqual([]);
  });
});
