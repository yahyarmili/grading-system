import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AssignmentLanguage } from "@/lib/assignment";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { listRelaunchable } from "@/server/data/evaluation/teacher";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { classMemberships, reviewJournalEntries, submissions, teacherEvaluations, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { EVALUATION_MESSAGES, saveTeacherEvaluation } from "@/server/review/evaluation";
import { PUBLICATION_MESSAGES, validateTeacherEvaluation } from "@/server/review/publication";
import { getCopy, readTeacherNotice } from "./helpers/review";

// REV-06 (E8.2): a copy the AI did not evaluate (failed, a refusal included,
// or not assessable) is evaluated by hand with the same form, without a
// proposal. Its first save starts the copy (transition 6 or 7) and the
// evaluation, "manual", with its rubric version, in one transaction, logged
// "entered manually, without AI proposal"; it leaves the relaunches. Then it
// is validated and published as any other (E8.1).

const TEXT = { en: "My town is small but it is beatiful. There is a market every friday.", fr: "Ma ville est petite mais elle est belle. Il y a un marché le vendredi." };

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `manual-${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A copy the AI did not evaluate: refused (English), or not assessable for want of a French rubric (Q6). */
async function unevaluatedCopy(language: AssignmentLanguage = "en") {
  const teacher = await createUser("teacher");
  const student = await createUser("student");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language,
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const submitted = await submitText(student, { assignmentId: created.assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT[language] });
  if (!submitted?.ok) throw new Error("Not submitted");
  const submissionId = submitted.ref.submissionId;
  getSimulator().clear();
  if (language === "en") getSimulator().failNext({ kind: "refusal", category: null }, 1);
  const outcome = await evaluateSubmission(
    submissionId,
    { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
    { expectedVersion: 1, claimToken: randomUUID() },
  );
  if (outcome.status !== (language === "en" ? "evaluation_failed" : "not_assessable")) throw new Error(`Unexpected: ${outcome.status}`);
  const copy = (await getCopy(teacher, created.assignmentId, student.userId))!;
  expect(copy).toMatchObject({ proposal: null, evaluation: null, seen: { proposalId: null, revision: 0 } });
  return { teacher, student, assignmentId: created.assignmentId, submissionId, seen: copy.seen! };
}
type Copy = Awaited<ReturnType<typeof unevaluatedCopy>>;

const empty = { task: null, organization: null, vocabulary: null, grammar: null, mechanics: null };
/** The manual form as the page sends it: nothing chosen, then `over`. */
const form = (copy: Copy, over: Record<string, unknown> = {}, revision = 0) => ({
  seen: { submissionId: copy.submissionId, versionNumber: 1, proposalId: null, revision },
  levels: empty,
  remarks: { task: "", organization: "", vocabulary: "", grammar: "", mechanics: "" },
  generalComment: "",
  nextSteps: "",
  grade: { fixed: false },
  rereadDone: [],
  ...over,
});
const ALL_THREE = { task: 3, organization: 3, vocabulary: 3, grammar: 3, mechanics: 3 };

const statusOf = async (submissionId: string) =>
  (await db.select({ status: submissions.status, started: submissions.teacherStartedAt }).from(submissions).where(eq(submissions.id, submissionId)))[0];
const evaluationsOf = (submissionId: string) => db.select().from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, submissionId));
const eventsOf = async (submissionId: string) =>
  (
    await db
      .select({ event: reviewJournalEntries.event, newValue: reviewJournalEntries.newValue })
      .from(reviewJournalEntries)
      .where(eq(reviewJournalEntries.submissionId, submissionId))
      .orderBy(asc(reviewJournalEntries.createdAt))
  ).filter((e) => e.event !== "copy_opened");

describe("a manual evaluation (REV-06)", { timeout: 120_000 }, () => {
  it("CA1: a refused copy, entered by hand: To review with an evaluation 'manual' and its rubric, logged; out of the relaunches", async () => {
    const copy = await unevaluatedCopy("en");
    const saved = await saveTeacherEvaluation(copy.teacher, form(copy, { levels: { ...empty, task: 3 }, generalComment: "Clear." }));
    expect(saved).toMatchObject({ status: "saved", changed: true, evaluation: { revision: 1, finalGrade: null } });
    // "To re-read" is never set on a first level chosen: there was none.
    if (saved.status === "saved") expect(Object.values(saved.evaluation.reread)).toEqual([false, false, false, false, false]);
    expect(await statusOf(copy.submissionId)).toMatchObject({ status: "to_review", started: expect.any(Date) });
    expect(await evaluationsOf(copy.submissionId)).toMatchObject([{ origin: "manual", proposalId: null, rubricVersion: "en-1", levelTask: 3, levelGrammar: null }]);

    const events = await eventsOf(copy.submissionId);
    expect(events.slice(0, 2)).toEqual([
      { event: "manual_started", newValue: { from: "evaluation_failed", cause: null } },
      { event: "evaluation_created", newValue: { origin: "manual", rubricVersion: "en-1" } },
    ]);
    expect(await listRelaunchable(copy.teacher, copy.assignmentId, { rubricLanguages: ["en"], costCapReached: false })).toEqual([]);

    // Saved again, completed, then validated and published as any copy (E8.1).
    expect(await saveTeacherEvaluation(copy.teacher, form(copy, { levels: ALL_THREE, generalComment: "Clear." }, 1))).toMatchObject({
      status: "saved", evaluation: { revision: 2, finalGrade: 15 },
    });
    expect(await validateTeacherEvaluation(copy.teacher, form(copy, { levels: ALL_THREE, generalComment: "Clear." }, 2), { publish: true })).toMatchObject({
      status: "decided", published: true,
    });
    expect((await eventsOf(copy.submissionId)).filter((e) => e.event === "validated")).toEqual([
      { event: "validated", newValue: { nature: "manual", revision: 2, finalGrade: 15 } },
    ]);
    expect((await statusOf(copy.submissionId)).status).toBe("published");
  });

  it("CA2: a French assignment without a validated French rubric: the same form, on the English rubric en-1 (Q6)", async () => {
    const copy = await unevaluatedCopy("fr");
    expect(await saveTeacherEvaluation(copy.teacher, form(copy, { levels: ALL_THREE }))).toMatchObject({ status: "saved", changed: true });
    expect(await evaluationsOf(copy.submissionId)).toMatchObject([{ origin: "manual", rubricVersion: "en-1" }]);
    expect((await eventsOf(copy.submissionId))[0]).toEqual({ event: "manual_started", newValue: { from: "not_assessable", cause: "rubric_unavailable" } });
    expect((await statusOf(copy.submissionId)).status).toBe("to_review");
  });

  it("validated directly from the failed copy: complete, it is entered then validated in one act; incomplete, refused level by level, nothing written", async () => {
    const incomplete = await unevaluatedCopy("en");
    expect(await validateTeacherEvaluation(incomplete.teacher, form(incomplete, { levels: { ...ALL_THREE, mechanics: null } }))).toEqual({
      status: "invalid", fieldErrors: { "level.mechanics": EVALUATION_MESSAGES.levelMissing },
    });
    expect(await statusOf(incomplete.submissionId)).toMatchObject({ status: "evaluation_failed", started: null });
    expect(await evaluationsOf(incomplete.submissionId)).toEqual([]);
    expect(await eventsOf(incomplete.submissionId)).toEqual([]);

    const complete = await unevaluatedCopy("en");
    expect(await validateTeacherEvaluation(complete.teacher, form(complete, { levels: ALL_THREE }))).toMatchObject({
      status: "decided", published: false, message: PUBLICATION_MESSAGES.validated,
    });
    const acts = (await eventsOf(complete.submissionId)).map((e) => e.event).filter((e) => e !== "evaluation_changed");
    expect(acts).toEqual(["manual_started", "evaluation_created", "validated"]);
  });

  it("nothing entered: nothing written, the copy stays failed and may still be retried", async () => {
    const copy = await unevaluatedCopy("en");
    expect(await saveTeacherEvaluation(copy.teacher, form(copy))).toMatchObject({ status: "saved", changed: false });
    expect(await statusOf(copy.submissionId)).toMatchObject({ status: "evaluation_failed", started: null });
    expect(await eventsOf(copy.submissionId)).toEqual([]);
  });

  it("a double click: one evaluation, the second save a conflict (NFR-FIA-01)", async () => {
    const copy = await unevaluatedCopy("en");
    const results = await Promise.all([
      saveTeacherEvaluation(copy.teacher, form(copy, { levels: ALL_THREE })),
      saveTeacherEvaluation(copy.teacher, form(copy, { levels: ALL_THREE })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["conflict", "saved"]);
    expect(await evaluationsOf(copy.submissionId)).toHaveLength(1);
    expect((await eventsOf(copy.submissionId)).filter((e) => e.event === "manual_started")).toHaveLength(1);
  });

  it("a manual evaluation in progress may leave a level empty again: only its validation needs all five", async () => {
    const copy = await unevaluatedCopy("en");
    await saveTeacherEvaluation(copy.teacher, form(copy, { levels: ALL_THREE }));

    expect(await saveTeacherEvaluation(copy.teacher, form(copy, { levels: { ...ALL_THREE, task: null } }, 1))).toMatchObject({ status: "saved" });
  });

  it("another teacher, the student: nothing entered", async () => {
    const copy = await unevaluatedCopy("en");
    const other = await createUser("teacher");
    for (const actor of [other, copy.student]) {
      expect(await saveTeacherEvaluation(actor, form(copy, { levels: ALL_THREE }))).toEqual({ status: "not_found", message: EVALUATION_MESSAGES.notFound });
    }
    expect(await statusOf(copy.submissionId)).toMatchObject({ status: "evaluation_failed", started: null });
  });
});
