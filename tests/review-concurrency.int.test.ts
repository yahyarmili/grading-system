import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { getCopy } from "@/server/data/review/copy";
import { replaceText, submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { classMemberships, reviewJournalEntries, submissions, teacherEvaluations, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { saveTeacherEvaluation } from "@/server/review/evaluation";

// REV-03 R5, SUB-05 CA4 (E7.5): writes that race, in real concurrent
// transactions (Promise.all: two connections of the pool). Two saves from
// the same revision: one saved, one conflict, nothing overwritten silently.
// A replacement and the teacher's first save: exactly one goes through.
// Counter-proofs, each guard removed in turn, in the plan's history (E7.5).

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUsers(role: "student" | "teacher", n: number): Promise<(Actor & { kind: "user" })[]> {
  const rows = await db
    .insert(users)
    .values(
      Array.from({ length: n }, () => {
        const i = ++count;
        return { email: `race-${role}${i}@example.test`, emailVerified: true, name: `${role} ${i}`, firstName: role, lastName: `${i}`, role };
      }),
    )
    .returning({ id: users.id });
  return rows.map((user) => ({ kind: "user", userId: user.id, role }));
}

/** `n` copies To review of one assignment, evaluated by the simulator, as the page sees each. */
async function copiesToReview(n: number) {
  const [teacher] = await createUsers("teacher", 1);
  const students = await createUsers("student", n);
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values(students.map((s) => ({ classId: made.classId, studentId: s.userId })));
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  getSimulator().clear();
  const copies = [];
  for (const student of students) {
    await acknowledgeNotice(student, STUDENT_NOTICE.version);
    const submitted = await submitText(student, { assignmentId: created.assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT });
    if (!submitted?.ok) throw new Error("Not submitted");
    const outcome = await evaluateSubmission(
      submitted.ref.submissionId,
      { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
      { expectedVersion: 1, claimToken: randomUUID() },
    );
    if (outcome.status !== "to_review") throw new Error(`Not to review: ${outcome.status}`);
    const copy = (await getCopy(teacher, created.assignmentId, student.userId))!;
    const { submissionId, versionNumber, proposalId, revision } = copy.seen!;
    copies.push({ student, submissionId, seen: { submissionId, versionNumber, proposalId, revision }, proposal: copy.proposal! });
  }
  return { teacher, assignmentId: created.assignmentId, copies };
}
type Copy = Awaited<ReturnType<typeof copiesToReview>>["copies"][number];

/** The whole form, the proposal's values but the general comment, from revision `revision`. */
const form = (copy: Copy, generalComment: string, revision = copy.seen.revision) => {
  const c = copy.proposal.criteria;
  return {
    seen: { ...copy.seen, revision },
    levels: { task: c.task.level, organization: c.organization.level, vocabulary: c.vocabulary.level, grammar: c.grammar.level, mechanics: c.mechanics.level },
    remarks: {
      task: c.task.justification, organization: c.organization.justification, vocabulary: c.vocabulary.justification,
      grammar: c.grammar.justification, mechanics: c.mechanics.justification,
    },
    generalComment,
    nextSteps: copy.proposal.nextSteps.join("\n"),
    grade: { fixed: false },
    rereadDone: [],
  };
};

const commentLog = (submissionId: string) =>
  db
    .select({ oldValue: reviewJournalEntries.oldValue, newValue: reviewJournalEntries.newValue, revision: reviewJournalEntries.evaluationRevision })
    .from(reviewJournalEntries)
    .where(and(eq(reviewJournalEntries.submissionId, submissionId), eq(reviewJournalEntries.field, "general_comment")))
    .orderBy(reviewJournalEntries.evaluationRevision);

describe("concurrent writes on a copy (REV-03 R5)", { timeout: 600_000 }, () => {
  it("CA4: two tabs save from the same revision at once: one saved, the other a conflict with what is stored; nothing overwritten silently", async () => {
    const { teacher, copies } = await copiesToReview(3);
    for (const copy of copies) {
      const results = await Promise.all([
        saveTeacherEvaluation(teacher, form(copy, "From tab one.")),
        saveTeacherEvaluation(teacher, form(copy, "From tab two.")),
      ]);
      const saved = results.filter((r) => r.status === "saved");
      const conflicts = results.filter((r) => r.status === "conflict");
      expect(saved).toHaveLength(1);
      expect(conflicts).toHaveLength(1);
      const winner = saved[0].status === "saved" ? saved[0].evaluation.generalComment : "";
      // The loser gets what is stored: the winner's text, its revision.
      expect(conflicts[0]).toMatchObject({ saved: { revision: 1, generalComment: winner } });
      const [stored] = await db.select().from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, copy.submissionId));
      expect(stored).toMatchObject({ revision: 1, generalComment: winner });
      expect(await commentLog(copy.submissionId)).toEqual([{ oldValue: copy.proposal.generalComment, newValue: winner, revision: 1 }]);

      // "Save mine over it": the loser sends again from the revision it just read; the overwrite is logged.
      const loser = winner === "From tab one." ? "From tab two." : "From tab one.";
      expect(await saveTeacherEvaluation(teacher, form(copy, loser, 1))).toMatchObject({ status: "saved", evaluation: { revision: 2, generalComment: loser } });
      expect(await commentLog(copy.submissionId)).toEqual([
        { oldValue: copy.proposal.generalComment, newValue: winner, revision: 1 },
        { oldValue: winner, newValue: loser, revision: 2 },
      ]);
    }
  });

  it("SUB-05 CA4: the student's replacement and the teacher's first save at once, 20 times: exactly one goes through, the other is refused", async () => {
    const { teacher, assignmentId, copies } = await copiesToReview(20);
    const winners = { save: 0, replacement: 0 };
    for (const copy of copies) {
      const [saved, replaced] = await Promise.all([
        saveTeacherEvaluation(teacher, form(copy, "Good work.")),
        replaceText(copy.student, { assignmentId, requestId: randomUUID(), text: "My new text." }),
      ]);
      const [row] = await db
        .select({ version: submissions.currentVersion, startedAt: submissions.teacherStartedAt, status: submissions.status })
        .from(submissions)
        .where(eq(submissions.id, copy.submissionId));
      const evaluations = await db.select().from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, copy.submissionId));
      if (saved.status === "saved") {
        winners.save++;
        expect(replaced).toEqual({ ok: false, reason: "teacher_started" });
        expect(row).toMatchObject({ version: 1, status: "to_review", startedAt: expect.any(Date) });
        expect(evaluations).toHaveLength(1);
      } else {
        winners.replacement++;
        expect(saved).toMatchObject({ status: "replaced" });
        expect(replaced?.ok).toBe(true);
        expect(row).toMatchObject({ version: 2, status: "received", startedAt: null });
        expect(evaluations).toEqual([]);
      }
    }
    expect(winners.save + winners.replacement).toBe(20);
    console.info(`[E7.5] first to take the lock, out of 20: save ${winners.save}, replacement ${winners.replacement}`);
  });

  it("CA3: a save after the replacement, from the page opened before: refused as replaced; the new version stays replaceable", async () => {
    const { teacher, assignmentId, copies } = await copiesToReview(1);
    const [copy] = copies;
    expect((await replaceText(copy.student, { assignmentId, requestId: randomUUID(), text: "My new text." }))?.ok).toBe(true);
    expect(await saveTeacherEvaluation(teacher, form(copy, "Good work."))).toMatchObject({ status: "replaced" });
    expect(await db.select().from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, copy.submissionId))).toEqual([]);
    expect((await replaceText(copy.student, { assignmentId, requestId: randomUUID(), text: "My third text." }))?.ok).toBe(true);
  });
});
