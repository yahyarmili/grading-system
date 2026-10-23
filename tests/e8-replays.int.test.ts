import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AI_MAX_ATTEMPTS } from "@/config/provisional";
import { proposalAlertLabels, proposalAlerts, type EvaluationRef } from "@/lib/evaluation";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { studentStatusLabels, type StudentStatus } from "@/lib/submission-status";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { getSimulator } from "@/server/ai";
import { createAssignment, getStudentAssignment, listStudentAssignments } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { removeStudent } from "@/server/data/classes/roster";
import { getCurrentProposal } from "@/server/data/evaluation/proposals";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { getCopy as getCopyOrNotice, recordCopyOpened } from "@/server/data/review/copy";
import { listCopyJournal } from "@/server/data/review/journal";
import { getPublishedResult } from "@/server/data/results/student";
import { getOwnSubmission } from "@/server/data/submissions/student";
import { db } from "@/server/db/client";
import { classMemberships, reviewJournalEntries, submissions, users } from "@/server/db/schema";
import { evaluateSubmission, type EvaluationDeps } from "@/server/evaluation/evaluate";
import { saveTeacherEvaluation } from "@/server/review/evaluation";
import {
  PUBLICATION_MESSAGES,
  publishTeacherEvaluation,
  validateTeacherEvaluation,
  withdrawTeacherPublication,
} from "@/server/review/publication";
import { REPLACEMENT_MESSAGES, replaceStudentText, SUBMISSION_MESSAGES, submitStudentText } from "@/server/submissions/submissions";
import { enterByHand, getCopy, MANUAL_FORM, readTeacherNotice } from "./helpers/review";
import { noTrigger, recordTriggers } from "./helpers/triggers";

// E8.5: the replays of the step on real copies, through the services the
// screens call (fonctionnalites.md §8.3), always read from the student's
// side: SUB-01 CA2 ("Marked, result available" for a published copy only),
// SUB-05 CA3 (no replacement once validated), EVL-04 CA3 (no alert in any
// view of the student), REV-03 R5 with REV-05 CA2 (a validated or published
// evaluation changed goes back To review, and the student loses the result
// until it is published again), REV-04 CA2 and CA3 (opening then validation
// in the log; log and proposal out of the student's reach once published),
// CLS-04 CA3 and SUB-01 CA3 (a removed student reads their published
// result, and can submit nothing new). Everything the student receives, by
// markers: tests/student-leak.int.test.ts. The cells of §5.4, published
// evaluation included: tests/access-matrix.int.test.ts.

/** Under SHORT_TEXT_MIN_WORDS: the proposal carries the "very short" alert. */
const TEXT = "My town is small but it is beatiful. There is a market every friday.";

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `e8-${role}${n}-${randomUUID().slice(0, 6)}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

const deps = (): EvaluationDeps => ({ evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 });

/** The workflow's step for a ref, as the run would call it. */
const step = (ref: EvaluationRef, more: Partial<EvaluationDeps> = {}) =>
  evaluateSubmission(ref.submissionId, { ...deps(), ...more }, {
    expectedVersion: ref.versionNumber, origin: ref.origin, request: ref.request, claimToken: randomUUID(),
  });

/** A teacher, class C1, an assignment sent to it, and `n` students of C1 who read their notice. */
async function setup(n = 1) {
  const teacher = await createUser("teacher");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  const students: (Actor & { kind: "user" })[] = [];
  for (let i = 0; i < n; i++) {
    const student = await createUser("student");
    await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
    await acknowledgeNotice(student, STUDENT_NOTICE.version);
    students.push(student);
  }
  return { teacher, students, classId: made.classId, assignmentId: created.assignmentId };
}

/** The student submits through the service (Received); returns the run the action would start. */
async function submit(student: Actor, assignmentId: string) {
  const trigger = recordTriggers();
  const state = await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, trigger);
  if (state.status !== "done") throw new Error(JSON.stringify(state));
  return trigger.refs[0];
}

/** The form as the copy page sends it: the proposal as it stands, unless `changed`; the page's seen. */
async function pageForm(teacher: Actor, assignmentId: string, studentId: string, { changed = false } = {}) {
  const copy = (await getCopy(teacher, assignmentId, studentId))!;
  const c = copy.proposal!.criteria;
  return {
    seen: copy.seen!,
    levels: { task: changed ? (c.task.level === 4 ? 3 : 4) : c.task.level, organization: c.organization.level, vocabulary: c.vocabulary.level, grammar: c.grammar.level, mechanics: c.mechanics.level },
    remarks: {
      task: c.task.justification, organization: c.organization.justification, vocabulary: c.vocabulary.justification,
      grammar: c.grammar.justification, mechanics: c.mechanics.justification,
    },
    generalComment: copy.proposal!.generalComment,
    nextSteps: copy.proposal!.nextSteps.join("\n"),
    grade: { fixed: false },
    rereadDone: [],
  };
}

const seenOf = async (teacher: Actor, assignmentId: string, studentId: string) => (await getCopy(teacher, assignmentId, studentId))!.seen!;

const statusOf = async (submissionId: string) =>
  (await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, submissionId)))[0].status;

/** The state the student reads, in their list and on the assignment's page: the same, with its label. */
async function studentSees(student: Actor, assignmentId: string): Promise<StudentStatus> {
  const listed = (await listStudentAssignments(student)).find((a) => a.id === assignmentId);
  const detail = await getStudentAssignment(student, assignmentId);
  expect(listed?.status).toBe(detail?.status);
  return detail!.status;
}

beforeEach(() => getSimulator().clear());

describe("SUB-01 CA2: “Marked, result available” for a published copy only", () => {
  it("every state a copy goes through reads “Submitted, being marked”, Published alone “Marked”, and the result follows", { timeout: 180_000 }, async () => {
    const { teacher, students: [lina, omar, sami, nora], assignmentId } = await setup(4);
    expect(studentStatusLabels).toMatchObject({ being_marked: "Submitted, being marked", marked: "Marked, result available" });
    const seenStates = new Map<string, StudentStatus>();
    const record = async (state: string, student: Actor, submissionId: string) => {
      expect(await statusOf(submissionId), state).toBe(state);
      seenStates.set(state, await studentSees(student, assignmentId));
      // The result exists for a published copy only, the same null otherwise.
      expect(await getPublishedResult(student, assignmentId) !== null, state).toBe(state === "published");
    };

    // Received, then Evaluating (held by the simulator), then To review.
    const ref = await submit(lina, assignmentId);
    await record("received", lina, ref.submissionId);
    const release = getSimulator().holdNext();
    const running = step(ref);
    for (let i = 0; i < 100 && (await statusOf(ref.submissionId)) !== "evaluating"; i++) await new Promise((r) => setTimeout(r, 50));
    await record("evaluating", lina, ref.submissionId);
    release();
    expect((await running).status).toBe("to_review");
    await record("to_review", lina, ref.submissionId);

    // Validated, Published, withdrawn (Validated again), published again then changed (To review).
    expect(await validateTeacherEvaluation(teacher, await pageForm(teacher, assignmentId, lina.userId))).toMatchObject({ status: "decided" });
    await record("validated", lina, ref.submissionId);
    expect((await publishTeacherEvaluation(teacher, await seenOf(teacher, assignmentId, lina.userId))).status).toBe("done");
    await record("published", lina, ref.submissionId);
    expect((await withdrawTeacherPublication(teacher, await seenOf(teacher, assignmentId, lina.userId))).status).toBe("done");
    await record("validated", lina, ref.submissionId);

    // Evaluation failed (the AI unavailable at every attempt; then a refusal), not assessable (AI unavailable).
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    const failed = await submit(omar, assignmentId);
    expect((await step(failed)).status).toBe("evaluation_failed");
    await record("evaluation_failed", omar, failed.submissionId);
    getSimulator().failNext({ kind: "refusal", category: "cyber" });
    const refused = await submit(sami, assignmentId);
    expect((await step(refused)).status).toBe("evaluation_failed");
    expect(await studentSees(sami, assignmentId)).toBe("being_marked");
    const unavailable = await submit(nora, assignmentId);
    expect((await step(unavailable, { guard: async () => "cost_cap" })).status).toBe("not_assessable");
    await record("not_assessable", nora, unavailable.submissionId);

    // Entered by hand, validated, published: Marked, as any other.
    expect(await enterByHand(teacher, { submissionId: failed.submissionId, versionNumber: 1 })).toMatchObject({ ok: true });
    expect(await studentSees(omar, assignmentId)).toBe("being_marked");
    const manual = (await getCopy(teacher, assignmentId, omar.userId))!;
    const manualForm = { ...MANUAL_FORM, nextSteps: MANUAL_FORM.nextSteps.join("\n"), seen: manual.seen! };
    expect(await validateTeacherEvaluation(teacher, manualForm, { publish: true })).toMatchObject({ published: true });
    expect(await studentSees(omar, assignmentId)).toBe("marked");

    expect(Object.fromEntries(seenStates)).toEqual({
      received: "being_marked", evaluating: "being_marked", to_review: "being_marked", validated: "being_marked",
      published: "marked", evaluation_failed: "being_marked", not_assessable: "being_marked",
    });
  });
});

describe("SUB-05 CA3: no replacement once the copy is validated", () => {
  it("validated without a change: refused with its message, then published and withdrawn: still refused; the copy and its version unchanged", { timeout: 120_000 }, async () => {
    const { teacher, students: [lina], assignmentId } = await setup();
    const ref = await submit(lina, assignmentId);
    expect((await step(ref)).status).toBe("to_review");
    expect((await getStudentAssignment(lina, assignmentId))?.canReplace).toBe(true);

    // Validated as proposed: no change, yet the teacher acted (Q3: first change or validation).
    expect(await validateTeacherEvaluation(teacher, await pageForm(teacher, assignmentId, lina.userId))).toMatchObject({ status: "decided" });
    const replace = () => replaceStudentText(lina, { assignmentId, requestId: randomUUID(), text: `${TEXT} Version 2.` }, noTrigger);
    expect((await getStudentAssignment(lina, assignmentId))?.canReplace).toBe(false);
    expect(await replace()).toEqual({ status: "error", reason: "teacherStarted", message: REPLACEMENT_MESSAGES.teacherStarted });

    expect((await publishTeacherEvaluation(teacher, await seenOf(teacher, assignmentId, lina.userId))).status).toBe("done");
    expect(await replace()).toMatchObject({ reason: "teacherStarted" });
    expect((await withdrawTeacherPublication(teacher, await seenOf(teacher, assignmentId, lina.userId))).status).toBe("done");
    expect(await replace()).toMatchObject({ reason: "teacherStarted" });

    expect((await getCopy(teacher, assignmentId, lina.userId))!.version!.number).toBe(1);
    expect((await getOwnSubmission(lina, assignmentId))?.text).toBe(TEXT);
  });
});

describe("EVL-04 CA3: no alert in any view of the student", () => {
  it("a copy with the four alerts, To review, Validated, Published: none of their codes or labels reaches the student", { timeout: 120_000 }, async () => {
    const { teacher, students: [lina], assignmentId } = await setup();
    getSimulator().setTexts({
      justification: "Simulated justification", comment: "Simulated comment.", nextStep: "Simulated step.",
      flags: { other_language: true, off_topic: true, addressed_to_marker: true },
    });
    const ref = await submit(lina, assignmentId);
    expect((await step(ref)).status).toBe("to_review");
    // The teacher has them, all four.
    expect([...(await getCurrentProposal(teacher, ref.submissionId))!.alerts].sort()).toEqual([...proposalAlerts].sort());

    const alertWords = [...proposalAlerts, ...Object.values(proposalAlertLabels)];
    const views = async () =>
      JSON.stringify([
        await listStudentAssignments(lina),
        await getStudentAssignment(lina, assignmentId),
        await getOwnSubmission(lina, assignmentId),
        await getPublishedResult(lina, assignmentId),
      ]);
    const expectNoAlert = async (when: string) => {
      const seen = await views();
      for (const word of alertWords) expect(seen, `${word} (${when})`).not.toContain(word);
    };
    await expectNoAlert("to review");
    expect(await validateTeacherEvaluation(teacher, await pageForm(teacher, assignmentId, lina.userId))).toMatchObject({ status: "decided" });
    await expectNoAlert("validated");
    expect((await publishTeacherEvaluation(teacher, await seenOf(teacher, assignmentId, lina.userId))).status).toBe("done");
    expect(await getPublishedResult(lina, assignmentId)).not.toBeNull();
    await expectNoAlert("published");
  });
});

describe("REV-03 R5 with REV-05 CA2: a validated or published evaluation changed goes back To review", () => {
  it("validated then changed: To review; published then changed: To review, the result gone until validated and published again", { timeout: 180_000 }, async () => {
    const { teacher, students: [lina], assignmentId } = await setup();
    const ref = await submit(lina, assignmentId);
    expect((await step(ref)).status).toBe("to_review");

    // Validated, then changed: back To review, the student still sees being marked.
    expect(await validateTeacherEvaluation(teacher, await pageForm(teacher, assignmentId, lina.userId))).toMatchObject({ status: "decided" });
    expect(await saveTeacherEvaluation(teacher, await pageForm(teacher, assignmentId, lina.userId, { changed: true }))).toMatchObject({ status: "saved", changed: true });
    expect(await statusOf(ref.submissionId)).toBe("to_review");
    expect(await studentSees(lina, assignmentId)).toBe("being_marked");

    // Validated and published, the change kept: the student reads it.
    const changed = () => pageForm(teacher, assignmentId, lina.userId, { changed: true });
    expect(await validateTeacherEvaluation(teacher, await changed(), { publish: true })).toMatchObject({ published: true });
    expect((await getPublishedResult(lina, assignmentId))!.criteria.find((c) => c.id === "task")!.level).toBe(4);

    // Published, then the comment changed: back To review, the result is gone (Q8).
    const comment = "A new general comment.";
    expect(await saveTeacherEvaluation(teacher, { ...(await changed()), generalComment: comment })).toMatchObject({ status: "saved", changed: true });
    expect(await statusOf(ref.submissionId)).toBe("to_review");
    expect(await getPublishedResult(lina, assignmentId)).toBeNull();
    expect(await studentSees(lina, assignmentId)).toBe("being_marked");

    // Republication is explicit: publishing a copy To review is refused, validating alone shows nothing; published, the new version.
    expect(await publishTeacherEvaluation(teacher, await seenOf(teacher, assignmentId, lina.userId))).toEqual({
      status: "refused", message: PUBLICATION_MESSAGES.notValidated,
    });
    expect(await getPublishedResult(lina, assignmentId)).toBeNull();
    expect(await validateTeacherEvaluation(teacher, { ...(await changed()), generalComment: comment })).toMatchObject({ status: "decided" });
    expect(await getPublishedResult(lina, assignmentId)).toBeNull();
    expect((await publishTeacherEvaluation(teacher, await seenOf(teacher, assignmentId, lina.userId))).status).toBe("done");
    expect((await getPublishedResult(lina, assignmentId))?.generalComment).toBe(comment);

    const events = await db
      .select({ event: reviewJournalEntries.event })
      .from(reviewJournalEntries)
      .where(eq(reviewJournalEntries.submissionId, ref.submissionId))
      .orderBy(asc(reviewJournalEntries.createdAt));
    expect(events.map((e) => e.event).filter((e) => e === "sent_back_to_review")).toHaveLength(2);
  });

  it("a failed copy without an evaluation: validation and publication refused; nothing reaches the student", { timeout: 120_000 }, async () => {
    const { teacher, students: [lina], assignmentId } = await setup();
    getSimulator().failNext({ kind: "refusal", category: null });
    const ref = await submit(lina, assignmentId);
    expect((await step(ref)).status).toBe("evaluation_failed");
    const seen = await seenOf(teacher, assignmentId, lina.userId);
    const empty = {
      seen,
      levels: { task: null, organization: null, vocabulary: null, grammar: null, mechanics: null },
      remarks: { task: "", organization: "", vocabulary: "", grammar: "", mechanics: "" },
      generalComment: "", nextSteps: "", grade: { fixed: false }, rereadDone: [],
    };
    expect(await validateTeacherEvaluation(teacher, empty, { publish: true })).toMatchObject({ status: "invalid" });
    expect(await publishTeacherEvaluation(teacher, { ...seen, revision: 1 })).toEqual({ status: "refused", message: PUBLICATION_MESSAGES.notValidated });
    expect(await statusOf(ref.submissionId)).toBe("evaluation_failed");
    expect(await studentSees(lina, assignmentId)).toBe("being_marked");
    expect(await getPublishedResult(lina, assignmentId)).toBeNull();
  });
});

describe("REV-04 CA2 and CA3: the log of a validated copy, out of the student's reach once published", () => {
  it("opened then validated: both in the log, dated, in order; published: the student reaches neither the log nor the proposal", { timeout: 120_000 }, async () => {
    const { teacher, students: [lina, omar], assignmentId } = await setup(2);
    getSimulator().setTexts({ justification: "PROPOSAL-why", comment: "PROPOSAL-comment", nextStep: "PROPOSAL-step" });
    const ref = await submit(lina, assignmentId);
    expect((await step(ref)).status).toBe("to_review");

    // CA2: the opening, then the validation, each dated by the database.
    expect(await recordCopyOpened(teacher, ref.submissionId)).not.toBeNull();
    const form = await pageForm(teacher, assignmentId, lina.userId);
    const remarks = Object.fromEntries(Object.keys(form.remarks).map((id) => [id, `Teacher remark on ${id}.`])) as typeof form.remarks;
    expect(await validateTeacherEvaluation(teacher, { ...form, remarks, generalComment: "Teacher comment.", nextSteps: "Teacher step." })).toMatchObject({ status: "decided" });
    const log = await db
      .select({ event: reviewJournalEntries.event, actorId: reviewJournalEntries.actorId, at: reviewJournalEntries.createdAt })
      .from(reviewJournalEntries)
      .where(eq(reviewJournalEntries.submissionId, ref.submissionId))
      .orderBy(asc(reviewJournalEntries.createdAt));
    const opened = log.findIndex((e) => e.event === "copy_opened");
    const validated = log.findIndex((e) => e.event === "validated");
    expect(opened).toBeGreaterThanOrEqual(0);
    expect(validated).toBeGreaterThan(opened);
    for (const entry of [log[opened], log[validated]]) expect(entry).toMatchObject({ actorId: teacher.userId, at: expect.any(Date) });
    expect(log[validated].at.getTime()).toBeGreaterThanOrEqual(log[opened].at.getTime());
    // The teacher reads them on the copy's history.
    expect((await listCopyJournal(teacher, ref.submissionId))!.length).toBeGreaterThan(0);

    // CA3: published, the student (and a classmate) reach neither the log nor the proposal, nor the teacher's copy.
    expect((await publishTeacherEvaluation(teacher, await seenOf(teacher, assignmentId, lina.userId))).status).toBe("done");
    for (const student of [lina, omar]) {
      await expect(listCopyJournal(student, ref.submissionId)).rejects.toThrow(AccessDeniedError);
      await expect(getCurrentProposal(student, ref.submissionId)).rejects.toThrow(AccessDeniedError);
      await expect(getCopyOrNotice(student, assignmentId, lina.userId)).rejects.toThrow(AccessDeniedError);
    }
    // What the student does read: the teacher's version, no proposal text, no log word.
    const result = JSON.stringify(await getPublishedResult(lina, assignmentId));
    expect(result).toContain("Teacher remark on task.");
    expect(result).not.toContain("PROPOSAL-");
    expect(result).not.toMatch(/copy_opened|validated|published|journal|revision/i);
    expect(await getPublishedResult(omar, assignmentId)).toBeNull();
  });
});

describe("CLS-04 CA3, SUB-01 CA3: a removed student reads their published result, and submits nothing new", () => {
  it("removed with a submission: the assignment stays, Marked once published, the result read; no replacement, no submission to a new assignment", { timeout: 180_000 }, async () => {
    const { teacher, students: [lina, omar], classId, assignmentId } = await setup(2);
    const ref = await submit(lina, assignmentId);
    expect((await step(ref)).status).toBe("to_review");
    expect(await removeStudent(teacher, classId, lina.userId)).toBe(true);
    expect(await removeStudent(teacher, classId, omar.userId)).toBe(true);

    // Removed before publication: the assignment stays, read only, being marked.
    const detail = (await getStudentAssignment(lina, assignmentId))!;
    expect(detail).toMatchObject({ status: "being_marked", canSubmit: false, canReplace: false });
    expect(await replaceStudentText(lina, { assignmentId, requestId: randomUUID(), text: `${TEXT} Version 2.` }, noTrigger)).toEqual({
      status: "error", reason: "unavailable", message: REPLACEMENT_MESSAGES.unavailable,
    });
    // Removed without a submission: the assignment is gone, and so is the way to submit.
    expect(await getStudentAssignment(omar, assignmentId)).toBeNull();
    expect(await submitStudentText(omar, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, noTrigger)).toEqual({
      status: "error", reason: "unavailable", message: SUBMISSION_MESSAGES.unavailable,
    });

    // The teacher, still the corrector, validates and publishes: the removed student reads the result.
    expect(await validateTeacherEvaluation(teacher, await pageForm(teacher, assignmentId, lina.userId), { publish: true })).toMatchObject({ published: true });
    expect(await studentSees(lina, assignmentId)).toBe("marked");
    expect(await getPublishedResult(lina, assignmentId)).toMatchObject({ assignmentId, title: "My town" });
    expect((await getOwnSubmission(lina, assignmentId))?.text).toBe(TEXT);
    expect(await getStudentAssignment(lina, assignmentId)).toMatchObject({ canSubmit: false, canReplace: false });

    // A new assignment of the class: not received, not submittable.
    const next = await createAssignment(teacher, {
      title: "My school", subject: "Describe your school.", level: "B1", language: "en",
      deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [classId],
    });
    if (!next.ok) throw new Error("Assignment not created");
    expect((await listStudentAssignments(lina)).map((a) => a.id)).toEqual([assignmentId]);
    expect(await submitStudentText(lina, { assignmentId: next.assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, noTrigger)).toMatchObject({
      status: "error", reason: "unavailable",
    });

    // Withdrawn: the removed student loses it like any other.
    expect((await withdrawTeacherPublication(teacher, await seenOf(teacher, assignmentId, lina.userId))).status).toBe("done");
    expect(await getPublishedResult(lina, assignmentId)).toBeNull();
    expect(await studentSees(lina, assignmentId)).toBe("being_marked");
  });
});
