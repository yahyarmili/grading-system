import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { getCurrentProposal } from "@/server/data/evaluation/proposals";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { recordCopyOpened, saveEvaluation, type SeenEvaluation } from "@/server/data/review/copy";
import { replaceText, submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { aiProposals, classMemberships, reviewJournalEntries, submissions, teacherEvaluations, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { saveTeacherEvaluation, EVALUATION_MESSAGES } from "@/server/review/evaluation";
import { getCopy, readTeacherNotice } from "./helpers/review";

// REV-03, REV-04 (E7.4): the teacher saves the whole form of a copy. Each
// save is checked field by field, written with its log entries in one
// transaction, never touches the proposal; the first one closes the
// student's replacement (SUB-05 CA3). The student reaches none of it.

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `save-${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A copy To review, evaluated by the simulator, as the page sees it. */
async function copyToReview() {
  const teacher = await createUser("teacher");
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
  const submitted = await submitText(student, { assignmentId: created.assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT });
  if (!submitted?.ok) throw new Error("Not submitted");
  const submissionId = submitted.ref.submissionId;
  getSimulator().clear();
  const outcome = await evaluateSubmission(
    submissionId,
    { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
    { expectedVersion: 1, claimToken: randomUUID() },
  );
  if (outcome.status !== "to_review") throw new Error(`Not to review: ${outcome.status}`);
  const copy = (await getCopy(teacher, created.assignmentId, student.userId))!;
  const { submissionId: id, versionNumber, proposalId, revision } = copy.seen!;
  const seen: SeenEvaluation = { submissionId: id, versionNumber, proposalId, revision };
  return { teacher, student, assignmentId: created.assignmentId, submissionId, proposal: copy.proposal!, seen };
}
type Copy = Awaited<ReturnType<typeof copyToReview>>;

/** The form as the page sends it: the proposal's values, then `over`. */
const form = (copy: Copy, over: Record<string, unknown> = {}, seen: Partial<SeenEvaluation> = {}) => {
  const c = copy.proposal.criteria;
  return {
    seen: { ...copy.seen, ...seen },
    levels: { task: c.task.level, organization: c.organization.level, vocabulary: c.vocabulary.level, grammar: c.grammar.level, mechanics: c.mechanics.level },
    remarks: {
      task: c.task.justification, organization: c.organization.justification, vocabulary: c.vocabulary.justification,
      grammar: c.grammar.justification, mechanics: c.mechanics.justification,
    },
    generalComment: copy.proposal.generalComment,
    nextSteps: copy.proposal.nextSteps.join("\n"),
    grade: { fixed: false },
    rereadDone: [],
    ...over,
  };
};
const otherLevel = (level: number) => (level === 4 ? 3 : level + 1);

const journalOf = (submissionId: string) =>
  db
    .select({
      actorId: reviewJournalEntries.actorId, event: reviewJournalEntries.event, field: reviewJournalEntries.field,
      oldValue: reviewJournalEntries.oldValue, newValue: reviewJournalEntries.newValue,
      revision: reviewJournalEntries.evaluationRevision, createdAt: reviewJournalEntries.createdAt,
    })
    .from(reviewJournalEntries)
    .where(and(eq(reviewJournalEntries.submissionId, submissionId), eq(reviewJournalEntries.event, "evaluation_changed")))
    // One save, one revision; its fields by name (0020 dates each entry apart).
    .orderBy(asc(reviewJournalEntries.evaluationRevision), asc(reviewJournalEntries.field));
const proposalRow = async (submissionId: string) =>
  (await db.select().from(aiProposals).where(eq(aiProposals.submissionId, submissionId)))[0];
const startedAt = async (submissionId: string) =>
  (await db.select({ at: submissions.teacherStartedAt }).from(submissions).where(eq(submissions.id, submissionId)))[0].at;

describe("saving the teacher's evaluation (REV-03, REV-04)", { timeout: 120_000 }, () => {
  it("CA1: a level changed, the grade not fixed: recalculated, 'to re-read', logged with old and new values, author and date; the proposal unchanged", async () => {
    const copy = await copyToReview();
    const before = await proposalRow(copy.submissionId);
    const task = copy.proposal.criteria.task.level;
    const saved = await saveTeacherEvaluation(copy.teacher, form(copy, { levels: { ...form(copy).levels, task: otherLevel(task) } }));
    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") return;
    const grade = copy.proposal.proposedGrade - task + otherLevel(task);
    expect(saved.evaluation).toMatchObject({ revision: 1, finalGrade: grade, gradeFixed: false });
    expect(saved.evaluation.reread.task).toBe(true);

    const journal = await journalOf(copy.submissionId);
    expect(journal.map(({ field, oldValue, newValue }) => ({ field, oldValue, newValue }))).toEqual([
      { field: "final_grade", oldValue: copy.proposal.proposedGrade, newValue: grade },
      { field: "level.task", oldValue: task, newValue: otherLevel(task) },
      { field: "reread.task", oldValue: false, newValue: true },
    ]);
    for (const entry of journal) {
      expect(entry).toMatchObject({ actorId: copy.teacher.userId, revision: 1 });
      expect(entry.createdAt).toBeInstanceOf(Date);
    }
    // Invariant 5: the proposal reads as it was; the first change set teacher_started_at.
    expect(await proposalRow(copy.submissionId)).toEqual(before);
    expect(await getCurrentProposal(copy.teacher, copy.submissionId)).toMatchObject({ proposedGrade: copy.proposal.proposedGrade });
    expect(await startedAt(copy.submissionId)).toBeInstanceOf(Date);
  });

  it("CA2: the grade alone, without justification; then a level: the fixed grade kept", async () => {
    const copy = await copyToReview();
    const fixed = await saveTeacherEvaluation(copy.teacher, form(copy, { grade: { fixed: true, value: "14,5" } }));
    expect(fixed).toMatchObject({ status: "saved", evaluation: { finalGrade: 14.5, gradeFixed: true, revision: 1 } });
    expect(fixed.status === "saved" && fixed.evaluation.levels).toEqual(form(copy).levels);

    const task = copy.proposal.criteria.task.level;
    const level = await saveTeacherEvaluation(
      copy.teacher,
      form(copy, { levels: { ...form(copy).levels, task: otherLevel(task) }, grade: { fixed: true, value: 14.5 } }, { revision: 1 }),
    );
    expect(level).toMatchObject({ status: "saved", evaluation: { finalGrade: 14.5, gradeFixed: true, revision: 2 } });
    // Back to the calculated grade.
    const back = await saveTeacherEvaluation(
      copy.teacher,
      form(copy, { levels: { ...form(copy).levels, task: otherLevel(task) } }, { revision: 2 }),
    );
    expect(back).toMatchObject({ status: "saved", evaluation: { gradeFixed: false, finalGrade: copy.proposal.proposedGrade - task + otherLevel(task) } });
  });

  it("CA3: a level out of 0 to 4 is refused, by the form's server check and by a direct call; nothing is written", async () => {
    const copy = await copyToReview();
    for (const level of [5, -1, 2.5, "3"]) {
      expect(await saveTeacherEvaluation(copy.teacher, form(copy, { levels: { ...form(copy).levels, task: level } }))).toEqual({
        status: "invalid", fieldErrors: { "level.task": EVALUATION_MESSAGES.level },
      });
    }
    expect(await saveTeacherEvaluation(copy.teacher, form(copy, { grade: { fixed: true, value: "13.25" } }))).toEqual({
      status: "invalid", fieldErrors: { grade: EVALUATION_MESSAGES.gradeStep },
    });
    expect(await saveTeacherEvaluation(copy.teacher, form(copy, { grade: { fixed: true, value: "21" }, remarks: { ...form(copy).remarks, grammar: "x".repeat(4001) } }))).toEqual({
      status: "invalid", fieldErrors: { grade: EVALUATION_MESSAGES.gradeRange, "remark.grammar": EVALUATION_MESSAGES.tooLong },
    });
    // The data layer, called directly without the check: refused too.
    const { seen, levels, remarks, generalComment } = form(copy);
    await expect(
      saveEvaluation(copy.teacher, seen, {
        levels: { ...levels, task: 5 as never }, remarks, generalComment, nextSteps: [], grade: { fixed: false }, rereadDone: [],
      }),
    ).rejects.toThrow(RangeError);
    expect(await db.select().from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, copy.submissionId))).toEqual([]);
    expect(await startedAt(copy.submissionId)).toBeNull();
  });

  it("CA3: replaced while open: refused with its message; SUB-05 CA3: after a change, the student's replacement is refused", async () => {
    const replacedFirst = await copyToReview();
    const replaced = await replaceText(replacedFirst.student, { assignmentId: replacedFirst.assignmentId, requestId: randomUUID(), text: "A new text." });
    expect(replaced?.ok).toBe(true);
    expect(await saveTeacherEvaluation(replacedFirst.teacher, form(replacedFirst, { generalComment: "Good." }))).toEqual({
      status: "replaced", message: EVALUATION_MESSAGES.replaced,
    });

    const changedFirst = await copyToReview();
    expect((await saveTeacherEvaluation(changedFirst.teacher, form(changedFirst, { generalComment: "Good." }))).status).toBe("saved");
    expect(await replaceText(changedFirst.student, { assignmentId: changedFirst.assignmentId, requestId: randomUUID(), text: "A new text." })).toEqual({
      ok: false, reason: "teacher_started",
    });
  });

  it("E8.2: an evaluation from a proposal keeps its five levels: a level left empty is refused next to it, nothing written", async () => {
    const copy = await copyToReview();
    expect(await saveTeacherEvaluation(copy.teacher, form(copy, { levels: { ...form(copy).levels, grammar: null } }))).toEqual({
      status: "invalid", fieldErrors: { "level.grammar": EVALUATION_MESSAGES.levelMissing },
    });
    expect(await journalOf(copy.submissionId)).toEqual([]);
    expect(await startedAt(copy.submissionId)).toBeNull();
  });

  it("a save with nothing new writes nothing: the copy stays replaceable", async () => {
    const copy = await copyToReview();
    expect(await saveTeacherEvaluation(copy.teacher, form(copy))).toMatchObject({ status: "saved", changed: false, evaluation: { revision: 0 } });
    expect(await journalOf(copy.submissionId)).toEqual([]);
    expect(await startedAt(copy.submissionId)).toBeNull();
  });

  it("a save from an older revision is a conflict, never overwrites silently (R5)", async () => {
    const copy = await copyToReview();
    expect((await saveTeacherEvaluation(copy.teacher, form(copy, { generalComment: "From tab one." }))).status).toBe("saved");
    const second = await saveTeacherEvaluation(copy.teacher, form(copy, { generalComment: "From tab two." }));
    expect(second).toMatchObject({ status: "conflict", saved: { revision: 1, generalComment: "From tab one." } });
  });

  it("the student, or another teacher, reaches neither the evaluation, nor the log, nor the proposal (direct requests)", async () => {
    const copy = await copyToReview();
    expect((await saveTeacherEvaluation(copy.teacher, form(copy, { generalComment: "Mine." }))).status).toBe("saved");
    const other = await createUser("teacher");
    for (const actor of [copy.student, other]) {
      expect(await saveTeacherEvaluation(actor, form(copy, { generalComment: "Theirs." }, { revision: 1 }))).toEqual({
        status: "not_found", message: EVALUATION_MESSAGES.notFound,
      });
    }
    await expect(getCopy(copy.student, copy.assignmentId, copy.student.userId)).rejects.toThrow(AccessDeniedError);
    await expect(getCurrentProposal(copy.student, copy.submissionId)).rejects.toThrow(AccessDeniedError);
    await expect(recordCopyOpened(copy.student, copy.submissionId)).rejects.toThrow(AccessDeniedError);
    await expect(saveEvaluation(copy.student, { ...copy.seen, revision: 1 }, null as never)).rejects.toThrow(AccessDeniedError);
    expect(await getCopy(other, copy.assignmentId, copy.student.userId)).toBeNull();
    expect((await db.select().from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, copy.submissionId)))[0].generalComment).toBe("Mine.");
  });
});
