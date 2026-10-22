import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { EvaluationRef } from "@/lib/evaluation";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { classMemberships, reviewJournalEntries, submissions, users } from "@/server/db/schema";
import { sweepEvaluations } from "@/server/evaluation/sweep";
import { openCopy } from "@/server/review/copy";
import { openReviewList, type SweepContext } from "@/server/review/list";
import { getCopy, listAssignmentCopies, readTeacherNotice } from "./helpers/review";

// E7 plan §1.7, [D, 2026-10-20] (the Vercel cron does not run on the
// preview): opening the list, and opening a copy (C10), sweeps the
// evaluations once the opening answered (C8c): a submission stuck in
// received is started again, even when its copy is opened by its address,
// the list never shown. Another teacher, a student, a malformed request:
// no sweep. The real sweep; the start recorded instead of a workflow.

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `sweep-open-${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A teacher's assignment and one student's text, received and never started: its trigger was lost a day ago. */
async function stuckCopy() {
  const teacher = await createUser("teacher");
  const other = await createUser("teacher");
  const student = await createUser("student");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const done = await submitText(student, { assignmentId: created.assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT });
  if (!done?.ok) throw new Error("Not submitted");
  // Older than TRIGGER_GRACE_MS, and than any other test's leftover: the sweep takes it first.
  await db.update(submissions).set({ updatedAt: sql`now() - interval '1 day'` }).where(eq(submissions.id, done.ref.submissionId));
  return { teacher, other, student, assignmentId: created.assignmentId, submissionId: done.ref.submissionId };
}

/** The real sweep, its starts recorded; after() recorded, run by the test. */
function recordSweep() {
  const started: EvaluationRef[] = [];
  const tasks: (() => Promise<unknown>)[] = [];
  const sweep = vi.fn(() => sweepEvaluations(async (ref) => void started.push(ref)));
  const later = vi.fn<SweepContext["later"]>((task) => void tasks.push(task));
  const runLater = () => Promise.all(tasks.splice(0).map((task) => task()));
  return { started, sweep, later, runLater, context: { sweep, later } satisfies SweepContext };
}

describe("the sweep when a copy or the list is opened (C10, C8c)", { timeout: 120_000 }, () => {
  it("opening a copy by its address starts its stuck submission again, after the answer, without changing the answer", async () => {
    const { teacher, student, assignmentId, submissionId } = await stuckCopy();
    const seen = (await getCopy(teacher, assignmentId, student.userId))!.seen!;
    expect(seen.status).toBe("received");
    const { started, sweep, later, runLater, context } = recordSweep();

    expect(await openCopy(teacher, seen, context)).toEqual({ refresh: false });
    // Nothing swept before the answer.
    expect(sweep).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledOnce();
    await runLater();
    expect(sweep).toHaveBeenCalledOnce();
    expect(started).toContainEqual({ submissionId, versionNumber: 1 });
    // The start is the workflow's: the copy stays received until its run claims it; RefreshWhileEvaluating shows the rest.
    expect((await getCopy(teacher, assignmentId, student.userId))!.status).toBe("received");
  });

  it("opening the list does the same", async () => {
    const { teacher, assignmentId, submissionId } = await stuckCopy();
    const { stamp } = (await listAssignmentCopies(teacher, assignmentId))!;
    const { started, sweep, runLater, context } = recordSweep();

    // markRestarted dates the submission: the stamp it reads was taken before, nothing to refresh yet.
    expect(await openReviewList(teacher, { assignmentId, stamp }, context)).toEqual({ refresh: false });
    expect(sweep).not.toHaveBeenCalled();
    await runLater();
    expect(started).toContainEqual({ submissionId, versionNumber: 1 });
  });

  it("an after() that refuses the sweep: the openings answer all the same, their journal written, the refusal logged by kind", async () => {
    const { teacher, student, assignmentId, submissionId } = await stuckCopy();
    const seen = (await getCopy(teacher, assignmentId, student.userId))!.seen!;
    const { stamp } = (await listAssignmentCopies(teacher, assignmentId))!;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const sweep = vi.fn(() => sweepEvaluations(async () => {}));
    const later = vi.fn<SweepContext["later"]>(() => {
      throw new TypeError("`after` was called outside a request scope");
    });
    try {
      expect(await openCopy(teacher, seen, { sweep, later })).toEqual({ refresh: false });
      expect(await openReviewList(teacher, { assignmentId, stamp }, { sweep, later })).toEqual({ refresh: false });
      expect(logged.mock.calls.flat()).toEqual([
        "[evaluation] sweep not scheduled: TypeError",
        "[evaluation] sweep not scheduled: TypeError",
      ]);
    } finally {
      logged.mockRestore();
    }
    expect(sweep).not.toHaveBeenCalled();
    const journal = await db
      .select({ event: reviewJournalEntries.event, submissionId: reviewJournalEntries.submissionId })
      .from(reviewJournalEntries)
      .where(and(eq(reviewJournalEntries.assignmentId, assignmentId), eq(reviewJournalEntries.actorId, teacher.userId)));
    expect(journal).toEqual(
      expect.arrayContaining([
        { event: "copy_opened", submissionId },
        { event: "list_opened", submissionId: null },
      ]),
    );
  });

  it("another teacher, a student, a malformed request, a copy opened without the action's context: no sweep", async () => {
    const { teacher, other, student, assignmentId } = await stuckCopy();
    const seen = (await getCopy(teacher, assignmentId, student.userId))!.seen!;
    const { stamp } = (await listAssignmentCopies(teacher, assignmentId))!;
    const { sweep, later, context } = recordSweep();

    for (const actor of [other, student]) {
      expect(await openCopy(actor, seen, context)).toEqual({ refresh: false });
      expect(await openReviewList(actor, { assignmentId, stamp }, context)).toEqual({ refresh: false });
    }
    expect(await openCopy(teacher, { ...seen, submissionId: "x" }, context)).toEqual({ refresh: false });
    expect(await openReviewList(teacher, { assignmentId: "x", stamp }, context)).toEqual({ refresh: false });
    expect(later).not.toHaveBeenCalled();
    expect(sweep).not.toHaveBeenCalled();
    // The comparison alone (the tests of E7.3): logged, nothing swept.
    expect(await openCopy(teacher, seen)).toEqual({ refresh: false });
  });
});
