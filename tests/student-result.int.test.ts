import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AssignmentLanguage } from "@/lib/assignment";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { getSimulator } from "@/server/ai";
import { createAssignment, getStudentAssignment, listStudentAssignments } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { withdrawPublication } from "@/server/data/review/publication";
import { getPublishedResult } from "@/server/data/results/student";
import { getOwnSubmission } from "@/server/data/submissions/student";
import { submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { aiProposals, classMemberships, submissions, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { saveTeacherEvaluation } from "@/server/review/evaluation";
import { validateTeacherEvaluation } from "@/server/review/publication";
import { checkAssignmentFreshness, checkListFreshness, checkResultFreshness, resultToken, viewToken } from "@/server/results/freshness";
import { getCopy, listAssignmentCopies, readTeacherNotice } from "./helpers/review";

// PUB-02 (E8.3): the student reads their published result through one closed
// projection, and their text as sent from the moment it is sent (SUB-01 R2).
// CA1: everything the teacher published. CA3: the teacher's version only,
// never the proposal; another student finds nothing. EVL-04 CA3: no alert.
// Nothing before publication or after withdrawal, the same answer as a
// missing result (R2). A removed student still reads theirs (SUB-01 R4).

/** Under SHORT_TEXT_MIN_WORDS: the proposal carries the "very short" alert. */
const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `result-${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** Two students of one class; A submits (Received). */
async function submittedCopy({ language = "en" as AssignmentLanguage } = {}) {
  const teacher = await createUser("teacher");
  const [student, classmate] = [await createUser("student"), await createUser("student")];
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values([student, classmate].map((s) => ({ classId: made.classId, studentId: s.userId })));
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language,
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const submitted = await submitText(student, { assignmentId: created.assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT });
  if (!submitted?.ok) throw new Error("Not submitted");
  const submissionId = submitted.ref.submissionId;
  return { teacher, student, classmate, classId: made.classId, assignmentId: created.assignmentId, submissionId };
}

async function evaluate(submissionId: string, { refused = false } = {}) {
  getSimulator().clear();
  if (refused) getSimulator().failNext({ kind: "refusal", category: null }, 1);
  return evaluateSubmission(
    submissionId,
    { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
    { expectedVersion: 1, claimToken: randomUUID() },
  );
}

/** The teacher's own evaluation, every field changed from the proposal: levels 3 3 3 2 2 (13), grade fixed at 15. */
const TEACHER = {
  levels: { task: 3, organization: 3, vocabulary: 3, grammar: 2, mechanics: 2 },
  remarks: {
    task: "EVAL-task: you answer the question.",
    organization: "EVAL-organization: two clear parts.",
    vocabulary: "EVAL-vocabulary: varied words.",
    grammar: "EVAL-grammar: check the plurals.",
    mechanics: "EVAL-mechanics: check “beautiful”.",
  },
  generalComment: "EVAL-comment: a lively description.",
  nextSteps: "EVAL-step one\nEVAL-step two",
  grade: { fixed: true, value: 15 },
  rereadDone: [],
};

const seenOf = async (teacher: Actor, assignmentId: string, studentId: string) => {
  const copy = (await getCopy(teacher, assignmentId, studentId))!;
  return { copy, seen: copy.seen! };
};

/** Every text of the proposal and its alerts: none may reach the student. */
async function proposalWords(submissionId: string): Promise<string[]> {
  const [p] = await db.select().from(aiProposals).where(eq(aiProposals.submissionId, submissionId));
  return [
    p.justificationTask, p.justificationOrganization, p.justificationVocabulary, p.justificationGrammar, p.justificationMechanics,
    p.generalComment, ...p.nextSteps, ...p.alerts,
    ...[p.quotesTask, p.quotesOrganization, p.quotesVocabulary, p.quotesGrammar, p.quotesMechanics].flat(),
  ].filter((w) => w.length > 0);
}

describe("the student's result (PUB-02)", { timeout: 180_000 }, () => {
  it("CA1, CA3, EVL-04 CA3: changed before publication, the student reads the teacher's version only: no proposal, no alert; the grade as set, adjusted", async () => {
    const copy = await submittedCopy();
    expect((await evaluate(copy.submissionId)).status).toBe("to_review");
    const proposal = await proposalWords(copy.submissionId);
    expect(proposal).toContain("very_short");

    // To review, then saved with the teacher's changes: nothing yet.
    expect(await getPublishedResult(copy.student, copy.assignmentId)).toBeNull();
    const { seen } = await seenOf(copy.teacher, copy.assignmentId, copy.student.userId);
    const saved = await saveTeacherEvaluation(copy.teacher, { ...TEACHER, seen });
    expect(saved.status).toBe("saved");
    expect(await getPublishedResult(copy.student, copy.assignmentId)).toBeNull();

    // Validated, not published: nothing either (R2).
    const validated = await validateTeacherEvaluation(copy.teacher, { ...TEACHER, seen: { ...seen, revision: 1 } });
    expect(validated).toMatchObject({ status: "decided", published: false });
    expect(await getPublishedResult(copy.student, copy.assignmentId)).toBeNull();

    // Published: the teacher's version, field by field, and nothing else.
    const { seen: now } = await seenOf(copy.teacher, copy.assignmentId, copy.student.userId);
    expect(await validateTeacherEvaluation(copy.teacher, { ...TEACHER, seen: now }, { publish: true })).toMatchObject({ status: "decided", published: true });
    const result = await getPublishedResult(copy.student, copy.assignmentId);
    expect(result).toEqual({
      assignmentId: copy.assignmentId,
      title: "My town",
      language: "en",
      finalGrade: 15,
      gradeAdjusted: true,
      criteria: [
        { id: "task", level: 3, remark: TEACHER.remarks.task },
        { id: "organization", level: 3, remark: TEACHER.remarks.organization },
        { id: "vocabulary", level: 3, remark: TEACHER.remarks.vocabulary },
        { id: "grammar", level: 2, remark: TEACHER.remarks.grammar },
        { id: "mechanics", level: 2, remark: TEACHER.remarks.mechanics },
      ],
      generalComment: TEACHER.generalComment,
      nextSteps: ["EVAL-step one", "EVAL-step two"],
      rubricVersion: "en-1",
      aiAssisted: true,
    });
    const json = JSON.stringify(result);
    expect(proposal.filter((word) => json.includes(word))).toEqual([]);

    // CA3: student B, in the same class, asks for A's result: absent, as a missing one.
    expect(await getPublishedResult(copy.classmate, copy.assignmentId)).toBeNull();
    expect(await getPublishedResult(copy.classmate, randomUUID())).toBeNull();
    // The freshness check answers a boolean, true only for the result shown.
    const token = resultToken(result!);
    expect(await checkResultFreshness(copy.student, { assignmentId: copy.assignmentId, token })).toBe(true);
    expect(await checkResultFreshness(copy.classmate, { assignmentId: copy.assignmentId, token })).toBe(false);
    expect(await checkResultFreshness(copy.teacher, { assignmentId: copy.assignmentId, token })).toBe(false);

    // E8.7: My assignments and the assignment as shown are fresh too, for this student only.
    const listToken = viewToken(await listStudentAssignments(copy.student));
    const assignmentToken = viewToken(await getStudentAssignment(copy.student, copy.assignmentId));
    expect(await checkListFreshness(copy.student, { token: listToken })).toBe(true);
    expect(await checkAssignmentFreshness(copy.student, { assignmentId: copy.assignmentId, token: assignmentToken })).toBe(true);
    expect(await checkListFreshness(copy.classmate, { token: listToken })).toBe(false);
    expect(await checkAssignmentFreshness(copy.classmate, { assignmentId: copy.assignmentId, token: assignmentToken })).toBe(false);
    expect(await checkAssignmentFreshness(copy.teacher, { assignmentId: copy.assignmentId, token: assignmentToken })).toBe(false);

    // Withdrawn: nothing again, and the pages shown before are no longer fresh (PUB-01 CA3).
    const { seen: published } = await seenOf(copy.teacher, copy.assignmentId, copy.student.userId);
    expect(await withdrawPublication(copy.teacher, published)).toMatchObject({ ok: true });
    expect(await getPublishedResult(copy.student, copy.assignmentId)).toBeNull();
    expect(await checkResultFreshness(copy.student, { assignmentId: copy.assignmentId, token })).toBe(false);
    expect(await checkListFreshness(copy.student, { token: listToken })).toBe(false);
    expect(await checkAssignmentFreshness(copy.student, { assignmentId: copy.assignmentId, token: assignmentToken })).toBe(false);
  });

  it("a removed student still reads their published result (SUB-01 R4, CLS-04 CA3)", async () => {
    const copy = await submittedCopy();
    await evaluate(copy.submissionId);
    const { copy: shown, seen } = await seenOf(copy.teacher, copy.assignmentId, copy.student.userId);
    const c = shown.proposal!.criteria;
    const levels = { task: c.task.level, organization: c.organization.level, vocabulary: c.vocabulary.level, grammar: c.grammar.level, mechanics: c.mechanics.level };
    expect(
      await validateTeacherEvaluation(copy.teacher, { ...TEACHER, levels, grade: { fixed: false }, seen }, { publish: true }),
    ).toMatchObject({ published: true });
    await db
      .update(classMemberships)
      .set({ status: "removed", removedAt: new Date() })
      .where(and(eq(classMemberships.classId, copy.classId), eq(classMemberships.studentId, copy.student.userId)));
    const result = await getPublishedResult(copy.student, copy.assignmentId);
    // Not changed from the proposal's levels, the grade calculated: not adjusted.
    expect(result).toMatchObject({ gradeAdjusted: false, aiAssisted: true, finalGrade: shown.proposal!.proposedGrade });
    expect((await getOwnSubmission(copy.student, copy.assignmentId))?.text).toBe(TEXT);
  });

  it("a French copy entered by hand: no AI mention, the English rubric recorded (Q6)", async () => {
    const copy = await submittedCopy({ language: "fr" });
    expect((await evaluate(copy.submissionId)).status).toBe("not_assessable");
    const seen = { submissionId: copy.submissionId, versionNumber: 1, proposalId: null, revision: 0 };
    expect(
      await validateTeacherEvaluation(copy.teacher, { ...TEACHER, grade: { fixed: false }, seen }, { publish: true }),
    ).toMatchObject({ published: true });
    expect(await getPublishedResult(copy.student, copy.assignmentId)).toMatchObject({
      language: "fr", rubricVersion: "en-1", aiAssisted: false, gradeAdjusted: false, finalGrade: 13,
    });
  });

  it("the projection is refused to a teacher, and a student is refused the teachers' readers", async () => {
    const copy = await submittedCopy();
    await expect(getPublishedResult(copy.teacher, copy.assignmentId)).rejects.toThrow(AccessDeniedError);
    await expect(getOwnSubmission(copy.teacher, copy.assignmentId)).rejects.toThrow(AccessDeniedError);
    // The student reads a submission now (E8.3): the teachers' screens still refuse them, by their ownership.
    await expect(listAssignmentCopies(copy.student, copy.assignmentId)).rejects.toThrow(AccessDeniedError);
    await expect(getCopy(copy.student, copy.assignmentId, copy.student.userId)).rejects.toThrow(AccessDeniedError);
  });
});

describe("the student reads their submission back (SUB-01 R2 [D, 2026-10-22])", { timeout: 120_000 }, () => {
  it("from the moment it is sent, whatever its state; a classmate reads nothing of it", async () => {
    const copy = await submittedCopy();
    const [{ submittedAt }] = await db.select({ submittedAt: submissions.submittedAt }).from(submissions).where(eq(submissions.id, copy.submissionId));
    expect(await getOwnSubmission(copy.student, copy.assignmentId)).toEqual({
      text: TEXT, submittedAt: submittedAt.toISOString(), lastVersionAt: expect.any(String),
    });
    await evaluate(copy.submissionId, { refused: true });
    expect((await getOwnSubmission(copy.student, copy.assignmentId))?.text).toBe(TEXT);
    expect(await getOwnSubmission(copy.classmate, copy.assignmentId)).toBeNull();
  });
});
