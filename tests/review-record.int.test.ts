import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { applyChanges, fieldsFromProposal, type EvaluationChanges, type EvaluationFields } from "@/lib/review";
import { RUBRIC_VERSIONS, type CriterionId, type Level } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { getCurrentProposal } from "@/server/data/evaluation/proposals";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { writeEvaluation, type EvaluationWrite } from "@/server/data/review/record";
import { replaceText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import {
  aiProposals,
  classMemberships,
  evaluationRuns,
  reviewJournalEntries,
  submissions,
  teacherEvaluations,
  users,
} from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { submitStudentText } from "@/server/submissions/submissions";
import { recordTriggers } from "./helpers/triggers";
import { readTeacherNotice } from "./helpers/review";

// E7.1 (REV-03, REV-04, invariant 5): the teacher's evaluation is written
// with the log entries of its changes, in one transaction; a log entry never
// changes; the AI proposal stays as it was; the database refuses a revision
// without its entry at commit.

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

/** A copy To review, evaluated by the simulator: its teacher, student, proposal and the start of its evaluation. */
async function copyToReview() {
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
  const ref = trigger.refs[0];
  getSimulator().clear();
  const outcome = await evaluateSubmission(
    ref.submissionId,
    { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
    { expectedVersion: ref.versionNumber, claimToken: randomUUID() },
  );
  if (outcome.status !== "to_review") throw new Error(`Not to review: ${outcome.status}`);
  const proposal = await getCurrentProposal(teacher, ref.submissionId);
  if (!proposal) throw new Error("No proposal");
  const [run] = await db
    .select({ proposalId: aiProposals.id, rubricVersion: evaluationRuns.rubricVersion })
    .from(aiProposals)
    .innerJoin(evaluationRuns, eq(evaluationRuns.id, aiProposals.runId))
    .where(eq(aiProposals.submissionId, ref.submissionId));
  return {
    teacher, student, assignmentId: created.assignmentId, submissionId: ref.submissionId,
    fields: fieldsFromProposal(proposal),
    start: { origin: "proposal" as const, proposalId: run.proposalId, rubricVersion: run.rubricVersion! },
  };
}
type Copy = Awaited<ReturnType<typeof copyToReview>>;

/** The form of a save, from the current fields. */
const form = (fields: EvaluationFields, over: Partial<EvaluationChanges> = {}): EvaluationChanges => ({
  levels: { ...(fields.levels as Record<CriterionId, Level>) },
  remarks: { ...fields.remarks },
  generalComment: fields.generalComment,
  nextSteps: [...fields.nextSteps],
  grade: fields.gradeFixed ? { fixed: true, value: fields.finalGrade! } : { fixed: false },
  rereadDone: [],
  ...over,
});

/** One save, as saveEvaluation (E7.4) will make it: the submission row locked, then the write. */
async function save(copy: Copy, before: EvaluationFields, fromRevision: number, changes: EvaluationChanges) {
  const after = applyChanges(before, changes);
  const write: EvaluationWrite = {
    assignmentId: copy.assignmentId, submissionId: copy.submissionId, versionNumber: 1, actorId: copy.teacher.userId,
    fromRevision, start: copy.start, before, after,
  };
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.id, copy.submissionId)).for("update");
    return writeEvaluation(tx, write);
  });
  return { result, after };
}

const journalOf = (submissionId: string) =>
  db
    .select({
      event: reviewJournalEntries.event, field: reviewJournalEntries.field, oldValue: reviewJournalEntries.oldValue,
      newValue: reviewJournalEntries.newValue, actorId: reviewJournalEntries.actorId,
      revision: reviewJournalEntries.evaluationRevision, createdAt: reviewJournalEntries.createdAt,
    })
    .from(reviewJournalEntries)
    .where(eq(reviewJournalEntries.submissionId, submissionId))
    .orderBy(asc(reviewJournalEntries.evaluationRevision), asc(reviewJournalEntries.field));

const evaluationOf = async (submissionId: string) =>
  (await db.select().from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, submissionId)))[0];

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

describe("each write of the teacher's evaluation leaves its log entries (REV-04 CA1)", { timeout: 60_000 }, () => {
  it("the first change creates the evaluation from the proposal, logs it with old and new value, and starts the teacher", async () => {
    const copy = await copyToReview();
    const level = copy.fields.levels.task === 4 ? 3 : 4;
    const { result } = await save(copy, copy.fields, 0, form(copy.fields, { levels: { ...form(copy.fields).levels, task: level } }));

    expect(result).toMatchObject({ revision: 1 });
    expect(await evaluationOf(copy.submissionId)).toMatchObject({
      origin: "proposal", proposalId: copy.start.proposalId, rubricVersion: copy.start.rubricVersion, revision: 1,
      levelTask: level, rereadTask: true, remarkTask: copy.fields.remarks.task, gradeFixed: false,
      finalGrade: (copy.fields.finalGrade ?? 0) - (copy.fields.levels.task ?? 0) + level,
      createdBy: copy.teacher.userId,
    });
    const journal = await journalOf(copy.submissionId);
    expect(journal.map(({ event, field, oldValue, newValue, actorId, revision }) => ({ event, field, oldValue, newValue, actorId, revision }))).toEqual([
      { event: "evaluation_changed", field: "final_grade", oldValue: copy.fields.finalGrade, newValue: expect.any(Number), actorId: copy.teacher.userId, revision: 1 },
      { event: "evaluation_changed", field: "level.task", oldValue: copy.fields.levels.task, newValue: level, actorId: copy.teacher.userId, revision: 1 },
      { event: "evaluation_changed", field: "reread.task", oldValue: false, newValue: true, actorId: copy.teacher.userId, revision: 1 },
      { event: "evaluation_created", field: null, oldValue: null, newValue: copy.start, actorId: copy.teacher.userId, revision: 1 },
    ]);
    for (const entry of journal) expect(entry.createdAt).toBeInstanceOf(Date);

    // The first act closes replacement (SUB-05 R3).
    const [row] = await db.select({ started: submissions.teacherStartedAt }).from(submissions).where(eq(submissions.id, copy.submissionId));
    expect(row.started).toBeInstanceOf(Date);
    expect(await replaceText(copy.student, { assignmentId: copy.assignmentId, requestId: randomUUID(), text: TEXT })).toEqual({
      ok: false, reason: "teacher_started",
    });
  });

  it("each later save is one revision with one entry per changed field; a save without change writes nothing", async () => {
    const copy = await copyToReview();
    const first = await save(copy, copy.fields, 0, form(copy.fields, { generalComment: "Mine." }));
    const second = await save(copy, first.after, 1, form(first.after, { grade: { fixed: true, value: 12.5 } }));
    expect(second.result).toEqual({
      revision: 2,
      changes: [
        { field: "final_grade", oldValue: first.after.finalGrade, newValue: 12.5 },
        { field: "grade_fixed", oldValue: false, newValue: true },
      ],
    });
    const unchanged = await save(copy, second.after, 2, form(second.after));
    expect(unchanged.result).toBeNull();

    expect(await evaluationOf(copy.submissionId)).toMatchObject({ revision: 2, finalGrade: 12.5, gradeFixed: true, generalComment: "Mine." });
    const journal = await journalOf(copy.submissionId);
    expect(journal.map((entry) => [entry.revision, entry.event, entry.field])).toEqual([
      [1, "evaluation_changed", "general_comment"],
      [1, "evaluation_created", null],
      [2, "evaluation_changed", "final_grade"],
      [2, "evaluation_changed", "grade_fixed"],
    ]);
  });

  it("leaves the AI proposal exactly as it was (invariant 5)", async () => {
    const copy = await copyToReview();
    const proposalBefore = await db.select().from(aiProposals).where(eq(aiProposals.id, copy.start.proposalId));
    const first = await save(copy, copy.fields, 0, form(copy.fields, {
      levels: { task: 0, organization: 0, vocabulary: 0, grammar: 0, mechanics: 0 },
      remarks: { task: "a", organization: "b", vocabulary: "c", grammar: "d", mechanics: "e" },
      generalComment: "Changed.", nextSteps: ["Other."],
    }));
    await save(copy, first.after, 1, form(first.after, { grade: { fixed: true, value: 20 } }));
    expect(await db.select().from(aiProposals).where(eq(aiProposals.id, copy.start.proposalId))).toEqual(proposalBefore);
    expect(await getCurrentProposal(copy.teacher, copy.submissionId)).toMatchObject({ generalComment: proposalBefore[0].generalComment });
  });
});

describe("the database keeps the log and the evaluation honest (0017)", { timeout: 60_000 }, () => {
  it("never changes nor deletes a log entry", async () => {
    const copy = await copyToReview();
    await save(copy, copy.fields, 0, form(copy.fields, { generalComment: "Mine." }));
    expect(await refusal(db.execute(sql`update review_journal_entries set new_value = '"forged"' where submission_id = ${copy.submissionId}`))).toMatch(/forbidden/);
    expect(await refusal(db.execute(sql`delete from review_journal_entries where submission_id = ${copy.submissionId}`))).toMatch(/forbidden/);
    expect(await journalOf(copy.submissionId)).toHaveLength(2);
  });

  it("refuses at commit an evaluation written without its log entry", async () => {
    const copy = await copyToReview();
    const message = await refusal(
      db.transaction(async (tx) => {
        await tx.insert(teacherEvaluations).values({
          submissionId: copy.submissionId, versionNumber: 1, origin: "proposal", proposalId: copy.start.proposalId,
          rubricVersion: copy.start.rubricVersion, createdBy: copy.teacher.userId,
          levelTask: 4, levelOrganization: 4, levelVocabulary: 4, levelGrammar: 4, levelMechanics: 4, finalGrade: 20,
        });
      }),
    );
    expect(message).toMatch(/without its review log entry/);
    expect(await evaluationOf(copy.submissionId)).toBeUndefined();

    // Later revisions too: an update without its entry is refused at commit.
    await save(copy, copy.fields, 0, form(copy.fields, { generalComment: "Mine." }));
    expect(
      await refusal(db.execute(sql`update teacher_evaluations set general_comment = 'unlogged', revision = 2 where submission_id = ${copy.submissionId}`)),
    ).toMatch(/without its review log entry/);
    expect(await evaluationOf(copy.submissionId)).toMatchObject({ revision: 1, generalComment: "Mine." });
  });

  it("never deletes an evaluation, keeps its origin, moves one revision at a time, and holds levels 0 to 4 and the grade rule", async () => {
    const copy = await copyToReview();
    await save(copy, copy.fields, 0, form(copy.fields, { generalComment: "Mine." }));
    const id = copy.submissionId;
    expect(await refusal(db.execute(sql`delete from teacher_evaluations where submission_id = ${id}`))).toMatch(/forbidden/);
    expect(await refusal(db.execute(sql`update teacher_evaluations set origin = 'manual', proposal_id = null, revision = 2 where submission_id = ${id}`))).toMatch(/origin/);
    expect(await refusal(db.execute(sql`update teacher_evaluations set general_comment = 'x', revision = 5 where submission_id = ${id}`))).toMatch(/one revision/);
    expect(await refusal(db.execute(sql`update teacher_evaluations set level_task = 5, grade_fixed = true, revision = 2 where submission_id = ${id}`))).toMatch(/teacher_evaluations_levels_range/);
    expect(await refusal(db.execute(sql`update teacher_evaluations set final_grade = 3, revision = 2 where submission_id = ${id}`))).toMatch(/teacher_evaluations_grade_calculated/);
    expect(await refusal(db.execute(sql`update teacher_evaluations set final_grade = 21, grade_fixed = true, revision = 2 where submission_id = ${id}`))).toMatch(/teacher_evaluations_grade_range/);
    expect(await evaluationOf(id)).toMatchObject({ revision: 1, origin: "proposal", generalComment: "Mine." });
  });

  it("keeps one evaluation per submission", async () => {
    const copy = await copyToReview();
    await save(copy, copy.fields, 0, form(copy.fields, { generalComment: "Mine." }));
    // A second creation (a stale caller that read no evaluation) breaks the unique constraint, and nothing is logged.
    expect(await refusal(save(copy, copy.fields, 0, form(copy.fields, { generalComment: "Other." })))).toMatch(/teacher_evaluations_submission_unique/);
    expect(await journalOf(copy.submissionId)).toHaveLength(2);
  });
});
