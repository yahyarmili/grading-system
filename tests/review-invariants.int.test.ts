import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AI_MAX_ATTEMPTS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import { applyChanges, fieldsFromProposal, type EvaluationChanges, type EvaluationFields } from "@/lib/review";
import { RUBRIC_VERSIONS, type CriterionId, type Level } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { getCurrentProposal } from "@/server/data/evaluation/proposals";
import {
  relaunchEvaluation,
  retryEvaluation,
  startManualEvaluation,
  type EvaluationStartContext,
} from "@/server/data/evaluation/teacher";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { writeEvaluation, type EvaluationWrite } from "@/server/data/review/record";
import { replaceText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { aiProposals, classMemberships, evaluationRuns, reviewJournalEntries, submissions, teacherEvaluations, users } from "@/server/db/schema";
import { evaluateSubmission, type EvaluationDeps } from "@/server/evaluation/evaluate";
import { submitStudentText } from "@/server/submissions/submissions";
import { readTeacherNotice } from "./helpers/review";
import { recordTriggers } from "./helpers/triggers";

// Review of E7 (0018): what the database itself holds of the teacher's
// review. A revision marks a write and a write only, and the write's own
// event stands for it; an evaluation is born on a started submission, on its
// active version, which then never changes. Each refusal below was accepted
// before 0018 (counter-tests); the normal paths still pass.

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A student's submitted copy, not evaluated yet: its teacher, student, assignment and ref. */
async function submitted() {
  const teacher = await createUser("teacher");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  const student = await createUser("student");
  await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const trigger = recordTriggers();
  await submitStudentText(student, { assignmentId: created.assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, trigger);
  if (trigger.refs.length !== 1) throw new Error("Not submitted once");
  return { teacher, student, assignmentId: created.assignmentId, ref: trigger.refs[0] };
}

/** The workflow's step for a ref, on the simulator. */
const evaluate = (ref: EvaluationRef, over: Partial<EvaluationDeps> = {}) =>
  evaluateSubmission(
    ref.submissionId,
    { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000, ...over },
    { expectedVersion: ref.versionNumber, origin: ref.origin, request: ref.request, claimToken: randomUUID() },
  );

/** Records the refs a teacher's request hands over. */
function recordStarts(): EvaluationStartContext & { refs: EvaluationRef[] } {
  const refs: EvaluationRef[] = [];
  return { refs, onStart: (ref) => void refs.push(ref) };
}

/** A copy To review, evaluated by the simulator: its proposal's fields and the start of an evaluation from it. */
async function copyToReview() {
  const copy = await submitted();
  const outcome = await evaluate(copy.ref);
  if (outcome.status !== "to_review") throw new Error(`Not to review: ${outcome.status}`);
  const proposal = await getCurrentProposal(copy.teacher, copy.ref.submissionId);
  if (!proposal) throw new Error("No proposal");
  const [run] = await db
    .select({ proposalId: aiProposals.id, rubricVersion: evaluationRuns.rubricVersion })
    .from(aiProposals)
    .innerJoin(evaluationRuns, eq(evaluationRuns.id, aiProposals.runId))
    .where(eq(aiProposals.submissionId, copy.ref.submissionId));
  return {
    ...copy,
    submissionId: copy.ref.submissionId,
    fields: fieldsFromProposal(proposal),
    start: { origin: "proposal" as const, proposalId: run.proposalId, rubricVersion: run.rubricVersion! },
  };
}
type Copy = Awaited<ReturnType<typeof copyToReview>>;

/** A copy the AI failed to evaluate (evaluation_failed). */
async function failedCopy() {
  const copy = await submitted();
  getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
  const outcome = await evaluate(copy.ref);
  if (outcome.status !== "evaluation_failed") throw new Error(`Not failed: ${outcome.status}`);
  return { ...copy, submissionId: copy.ref.submissionId };
}

const form = (fields: EvaluationFields, over: Partial<EvaluationChanges> = {}): EvaluationChanges => ({
  levels: { ...(fields.levels as Record<CriterionId, Level>) },
  remarks: { ...fields.remarks },
  generalComment: fields.generalComment,
  nextSteps: [...fields.nextSteps],
  grade: fields.gradeFixed ? { fixed: true, value: fields.finalGrade! } : { fixed: false },
  rereadDone: [],
  ...over,
});

/** One save, as saveEvaluation makes it: the submission row locked, then record.ts. On version 1 unless said. */
async function save(copy: Copy, before: EvaluationFields, fromRevision: number, changes: EvaluationChanges, versionNumber = 1) {
  const after = applyChanges(before, changes);
  const write: EvaluationWrite = {
    assignmentId: copy.assignmentId, submissionId: copy.submissionId, versionNumber, actorId: copy.teacher.userId,
    fromRevision, start: copy.start, before, after,
  };
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.id, copy.submissionId)).for("update");
    return writeEvaluation(tx, write);
  });
  return { result, after };
}

/** The columns of an evaluation started from the copy's proposal, every level at 4. */
const fromProposal = (copy: Copy) => ({
  submissionId: copy.submissionId, versionNumber: 1, origin: "proposal" as const, proposalId: copy.start.proposalId,
  rubricVersion: copy.start.rubricVersion, createdBy: copy.teacher.userId,
  levelTask: 4, levelOrganization: 4, levelVocabulary: 4, levelGrammar: 4, levelMechanics: 4, finalGrade: 20,
});

/** The common part of a copy's log entry. */
const entryOf = (copy: { assignmentId: string; submissionId: string; teacher: { userId: string } }) => ({
  assignmentId: copy.assignmentId, submissionId: copy.submissionId, actorId: copy.teacher.userId, versionNumber: 1,
});

const startedAt = async (submissionId: string) =>
  (await db.select({ at: submissions.teacherStartedAt }).from(submissions).where(eq(submissions.id, submissionId)))[0].at;

const evaluationOf = async (submissionId: string) =>
  (await db.select().from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, submissionId)))[0];

const entriesOf = (submissionId: string, event: (typeof reviewJournalEntries.event.enumValues)[number]) =>
  db
    .select({ actorId: reviewJournalEntries.actorId, revision: reviewJournalEntries.evaluationRevision, versionNumber: reviewJournalEntries.versionNumber })
    .from(reviewJournalEntries)
    .where(and(eq(reviewJournalEntries.submissionId, submissionId), eq(reviewJournalEntries.event, event)));

/** The database's error behind a refused query or commit: Drizzle wraps some of them. */
async function refusal(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { message: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  throw new Error("The query was not refused");
}

/** A second version of the copy, as a replacement writes it, without the application's guard. */
const insertSecondVersion = (submissionId: string) =>
  db.execute(sql`insert into submission_versions (submission_id, number, mode, text, request_id)
    values (${submissionId}, 2, 'text', 'My new text about my village.', ${randomUUID()})`);
const moveToSecondVersion = (submissionId: string) =>
  db.execute(sql`update submissions set current_version = 2, current_proposal_id = null, status = 'received' where id = ${submissionId}`);

beforeEach(() => {
  getSimulator().clear();
});

describe("a revision is the mark of a write, and of a write only (C3)", { timeout: 60_000 }, () => {
  it("refuses an entry of another event that carries a revision, whatever the event", async () => {
    const copy = await copyToReview();
    for (const event of ["copy_opened", "retry_requested", "relaunch_requested", "retry_abandoned", "manual_started", "validated"] as const) {
      expect(await refusal(db.insert(reviewJournalEntries).values({ ...entryOf(copy), event, evaluationRevision: 1 }))).toMatch(
        /review_journal_entries_revision_of_writes/,
      );
    }
    // A write without its revision stays refused (0016).
    expect(await refusal(db.insert(reviewJournalEntries).values({ ...entryOf(copy), event: "evaluation_created" }))).toMatch(
      /review_journal_entries_revision_of_writes/,
    );
    expect(await entriesOf(copy.submissionId, "copy_opened")).toEqual([]);
  });

  it("refuses an evaluation whose only entry of its revision is a copy_opened (accepted at commit before 0018)", async () => {
    const copy = await copyToReview();
    const message = await refusal(
      db.transaction(async (tx) => {
        await tx.update(submissions).set({ teacherStartedAt: sql`now()` }).where(eq(submissions.id, copy.submissionId));
        await tx.insert(teacherEvaluations).values(fromProposal(copy));
        await tx.insert(reviewJournalEntries).values({ ...entryOf(copy), event: "copy_opened", evaluationRevision: 1 });
      }),
    );
    expect(message).toMatch(/review_journal_entries_revision_of_writes/);
    expect(await evaluationOf(copy.submissionId)).toBeUndefined();
    expect(await startedAt(copy.submissionId)).toBeNull();
  });

  it("a new evaluation needs its evaluation_created entry, of its revision and version", async () => {
    const copy = await copyToReview();
    const born = (entry: Partial<typeof reviewJournalEntries.$inferInsert>) =>
      db.transaction(async (tx) => {
        await tx.update(submissions).set({ teacherStartedAt: sql`now()` }).where(eq(submissions.id, copy.submissionId));
        await tx.insert(teacherEvaluations).values(fromProposal(copy));
        await tx.insert(reviewJournalEntries).values({ ...entryOf(copy), event: "evaluation_created", evaluationRevision: 1, ...entry });
      });
    // A change entry alone does not stand for the creation.
    expect(await refusal(born({ event: "evaluation_changed", field: "general_comment" }))).toMatch(/without its review log entry/);
    // Nor a creation of another revision or version.
    expect(await refusal(born({ evaluationRevision: 2 }))).toMatch(/without its review log entry/);
    expect(await refusal(born({ versionNumber: 2 }))).toMatch(/without its review log entry/);
    expect(await evaluationOf(copy.submissionId)).toBeUndefined();
    // Its own creation entry: committed.
    await born({});
    expect(await evaluationOf(copy.submissionId)).toMatchObject({ revision: 1 });
  });

  it("a later revision needs an evaluation_changed entry: a creation entry of that revision does not stand for it", async () => {
    const copy = await copyToReview();
    await save(copy, copy.fields, 0, form(copy.fields, { generalComment: "Mine." }));
    const message = await refusal(
      db.transaction(async (tx) => {
        await tx.execute(sql`update teacher_evaluations set general_comment = 'unlogged', revision = 2 where submission_id = ${copy.submissionId}`);
        await tx.insert(reviewJournalEntries).values({ ...entryOf(copy), event: "evaluation_created", evaluationRevision: 2 });
      }),
    );
    expect(message).toMatch(/without its review log entry/);
    expect(await evaluationOf(copy.submissionId)).toMatchObject({ revision: 1, generalComment: "Mine." });
  });
});

describe("an evaluation is born on the started, active version, which then never changes (C4)", { timeout: 60_000 }, () => {
  it("refuses an evaluation on a submission whose teacher has not started (accepted before 0018)", async () => {
    const copy = await copyToReview();
    const message = await refusal(
      db.transaction(async (tx) => {
        await tx.insert(teacherEvaluations).values(fromProposal(copy));
        await tx.insert(reviewJournalEntries).values({ ...entryOf(copy), event: "evaluation_created", evaluationRevision: 1 });
      }),
    );
    expect(message).toMatch(/only on a started submission, on its active version/);
    expect(await evaluationOf(copy.submissionId)).toBeUndefined();
  });

  it("refuses an evaluation of a version that is no longer active, and one born past revision 1", async () => {
    const copy = await failedCopy();
    await insertSecondVersion(copy.submissionId);
    const manual = (over: Partial<typeof teacherEvaluations.$inferInsert>) =>
      db.transaction(async (tx) => {
        await tx.update(submissions).set({ teacherStartedAt: sql`now()` }).where(eq(submissions.id, copy.submissionId));
        await tx.insert(teacherEvaluations).values({
          submissionId: copy.submissionId, versionNumber: 1, origin: "manual", rubricVersion: "en-1", createdBy: copy.teacher.userId, ...over,
        });
        await tx.insert(reviewJournalEntries).values({
          ...entryOf(copy), event: "evaluation_created", evaluationRevision: over.revision ?? 1, versionNumber: over.versionNumber ?? 1,
        });
      });
    expect(await refusal(manual({ versionNumber: 2 }))).toMatch(/only on a started submission, on its active version/);
    expect(await refusal(manual({ revision: 5 }))).toMatch(/born at revision 1/);
    expect(await evaluationOf(copy.submissionId)).toBeUndefined();
  });

  it("refuses to move the version, or to clear teacher_started_at, of a submission with an evaluation (accepted before 0018)", async () => {
    const copy = await copyToReview();
    await save(copy, copy.fields, 0, form(copy.fields, { generalComment: "Mine." }));
    await insertSecondVersion(copy.submissionId);
    expect(await refusal(moveToSecondVersion(copy.submissionId))).toMatch(/keeps its version and stays started/);
    expect(await refusal(db.execute(sql`update submissions set teacher_started_at = null where id = ${copy.submissionId}`))).toMatch(
      /keeps its version and stays started/,
    );
    const [row] = await db
      .select({ version: submissions.currentVersion, started: submissions.teacherStartedAt, status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, copy.submissionId));
    expect(row).toMatchObject({ version: 1, started: expect.any(Date), status: "to_review" });
  });

  it("leaves a submission without an evaluation free to move (the same update, without an evaluation)", async () => {
    const copy = await copyToReview();
    await insertSecondVersion(copy.submissionId);
    await moveToSecondVersion(copy.submissionId);
    const [row] = await db.select({ version: submissions.currentVersion }).from(submissions).where(eq(submissions.id, copy.submissionId));
    expect(row.version).toBe(2);
  });
});

describe("the normal paths still pass", { timeout: 60_000 }, () => {
  it("first save, then a later save: one evaluation, its entries", async () => {
    const copy = await copyToReview();
    const first = await save(copy, copy.fields, 0, form(copy.fields, { generalComment: "Mine." }));
    const second = await save(copy, first.after, 1, form(first.after, { grade: { fixed: true, value: 12.5 } }));
    expect(second.result).toMatchObject({ revision: 2 });
    expect(await evaluationOf(copy.submissionId)).toMatchObject({ revision: 2, versionNumber: 1, finalGrade: 12.5 });
    expect(await entriesOf(copy.submissionId, "evaluation_created")).toEqual([{ actorId: copy.teacher.userId, revision: 1, versionNumber: 1 }]);
    expect(await entriesOf(copy.submissionId, "evaluation_changed")).toHaveLength(3);
  });

  it("the student replaces the copy before the teacher's first act; the teacher then saves on the new version", async () => {
    const copy = await copyToReview();
    const replaced = await replaceText(copy.student, { assignmentId: copy.assignmentId, requestId: randomUUID(), text: `${TEXT} Again.` });
    expect(replaced).toMatchObject({ ok: true, ref: { submissionId: copy.submissionId, versionNumber: 2 } });
    const [row] = await db.select({ version: submissions.currentVersion }).from(submissions).where(eq(submissions.id, copy.submissionId));
    expect(row.version).toBe(2);

    // The new version evaluated, as its trigger would; the teacher's first save starts from its proposal.
    expect(await evaluate({ submissionId: copy.submissionId, versionNumber: 2 })).toMatchObject({ status: "to_review" });
    const proposal = await getCurrentProposal(copy.teacher, copy.submissionId);
    const [current] = await db
      .select({ proposalId: aiProposals.id, rubricVersion: evaluationRuns.rubricVersion })
      .from(submissions)
      .innerJoin(aiProposals, eq(aiProposals.id, submissions.currentProposalId))
      .innerJoin(evaluationRuns, eq(evaluationRuns.id, aiProposals.runId))
      .where(eq(submissions.id, copy.submissionId));
    expect(current.proposalId).not.toBe(copy.start.proposalId);
    const onSecond: Copy = {
      ...copy,
      fields: fieldsFromProposal(proposal!),
      start: { origin: "proposal", proposalId: current.proposalId, rubricVersion: current.rubricVersion! },
    };
    const { result } = await save(onSecond, onSecond.fields, 0, form(onSecond.fields, { generalComment: "On the new text." }), 2);
    expect(result).toMatchObject({ revision: 1 });
    expect(await evaluationOf(copy.submissionId)).toMatchObject({
      versionNumber: 2, revision: 1, proposalId: current.proposalId, generalComment: "On the new text.",
    });
    expect(await startedAt(copy.submissionId)).toEqual(expect.any(Date));
    expect(await entriesOf(copy.submissionId, "evaluation_created")).toEqual([{ actorId: copy.teacher.userId, revision: 1, versionNumber: 2 }]);
  });

  it("retry and relaunch (E6.3): logged without a revision, then evaluated to To review", async () => {
    const failed = await failedCopy();
    const retried = recordStarts();
    expect(await retryEvaluation(failed.teacher, failed.ref, retried)).toEqual({ ok: true });
    expect(await entriesOf(failed.submissionId, "retry_requested")).toEqual([
      { actorId: failed.teacher.userId, revision: null, versionNumber: 1 },
    ]);
    expect(await evaluate(retried.refs[0])).toMatchObject({ status: "to_review" });

    // Not assessable for want of the AI (the cost cap), relaunched once it is lifted.
    const capped = await submitted();
    expect(await evaluate(capped.ref, { guard: async () => "cost_cap" })).toMatchObject({ status: "not_assessable" });
    const relaunched = recordStarts();
    expect(await relaunchEvaluation(capped.teacher, capped.ref, { rubricLanguages: ["en"], costCapReached: false }, relaunched)).toEqual({
      ok: true,
    });
    expect(await entriesOf(capped.ref.submissionId, "relaunch_requested")).toEqual([
      { actorId: capped.teacher.userId, revision: null, versionNumber: 1 },
    ]);
    expect(await evaluate(relaunched.refs[0])).toMatchObject({ status: "to_review" });
  });

  it("a manual evaluation (E8's path): started, then born on the started version with its creation entry", async () => {
    const copy = await failedCopy();
    expect(await startManualEvaluation(copy.teacher, copy.ref)).toEqual({ ok: true });
    await db.transaction(async (tx) => {
      await tx.insert(teacherEvaluations).values({
        submissionId: copy.submissionId, versionNumber: 1, origin: "manual", rubricVersion: "en-1", createdBy: copy.teacher.userId,
      });
      await tx.insert(reviewJournalEntries).values({ ...entryOf(copy), event: "evaluation_created", evaluationRevision: 1 });
    });
    expect(await evaluationOf(copy.submissionId)).toMatchObject({ origin: "manual", revision: 1 });
  });
});
