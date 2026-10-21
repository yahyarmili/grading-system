import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AI_MAX_ATTEMPTS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import type { EvaluationChanges } from "@/lib/review";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { getSimulator } from "@/server/ai";
import { createAssignment, getStudentAssignment, listTeacherAssignments } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { removeStudent } from "@/server/data/classes/roster";
import { getCurrentProposal } from "@/server/data/evaluation/proposals";
import { acknowledgeNotice, getNoticeAcknowledgement } from "@/server/data/notices/notices";
import { getCopy as getCopyOrNotice, getStudentIdentity, recordCopyOpened, saveEvaluation } from "@/server/data/review/copy";
import { listCopyJournal } from "@/server/data/review/journal";
import { listAssignmentCopies as listOrNotice, recordListOpened } from "@/server/data/review/list";
import { db } from "@/server/db/client";
import { aiProposals, assignments, classMemberships, reviewJournalEntries, teacherEvaluations, users } from "@/server/db/schema";
import { evaluateSubmission, type EvaluationDeps } from "@/server/evaluation/evaluate";
import { openCopy } from "@/server/review/copy";
import { saveTeacherEvaluation } from "@/server/review/evaluation";
import { relaunchCopy, retryCopy } from "@/server/review/relaunch";
import { REPLACEMENT_MESSAGES, replaceStudentText, submitStudentText } from "@/server/submissions/submissions";
import { getCopy, listAssignmentCopies, readTeacherNotice } from "./helpers/review";
import { noTrigger, recordTriggers } from "./helpers/triggers";

// E7.8: the replays of the step on real submissions, through the services the
// screens call (fonctionnalites.md §8.3): ASG-02 CA2 (the assignment leads to
// its list), SUB-04 CA3 ("late" in the teacher's list), SUB-05 CA3 (no
// replacement once the teacher changed the evaluation), CLS-04 CA3 and
// REV-01 CA4 (a removed student's submission), PRC-02 from the list. Then
// the matrix on a copy the teacher really changed: another teacher, the
// student and the administrator get nothing of the evaluation, the log, the
// proposal, the identity or the teacher's notice. The clicks themselves:
// e2e/e7-journey.spec.ts.

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher" | "admin", firstName: string = role, { notice = true } = {}): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `e7-${role}${n}@example.test`, emailVerified: true, name: `${firstName} ${n}`, firstName, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher" && notice) await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

const deps = (): EvaluationDeps => ({ evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 });

/** The workflow's step for a ref, as the run would call it. */
const step = (ref: EvaluationRef) =>
  evaluateSubmission(ref.submissionId, deps(), {
    expectedVersion: ref.versionNumber, origin: ref.origin, request: ref.request, claimToken: randomUUID(),
  });

/** A teacher, class C1, an assignment sent to it, and these students in C1 who read their notice. */
async function setup(names: string[]) {
  const teacher = await createUser("teacher");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  const students: Record<string, Actor & { kind: "user" }> = {};
  for (const name of names) {
    const student = await createUser("student", name);
    await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
    await acknowledgeNotice(student, STUDENT_NOTICE.version);
    students[name] = student;
  }
  return { teacher, students, classId: made.classId, assignmentId: created.assignmentId };
}

/** The student submits through the service; returns the run the action would start. */
async function submit(student: Actor, assignmentId: string) {
  const trigger = recordTriggers();
  const state = await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, trigger);
  if (state.status !== "done") throw new Error(JSON.stringify(state));
  return trigger.refs[0];
}

/** Submitted, then evaluated by the simulator: To review. */
async function toReview(student: Actor, assignmentId: string) {
  const ref = await submit(student, assignmentId);
  expect((await step(ref)).status).toBe("to_review");
  return ref;
}

/** What a line's button sends: the submission and the version the list shows. */
const seenOn = (line: { submission: { id: string; versionNumber: number } | null }) => ({ submissionId: line.submission!.id, versionNumber: line.submission!.versionNumber });

const lineOf = async (teacher: Actor, assignmentId: string, studentId: string) =>
  (await listAssignmentCopies(teacher, assignmentId))!.rows.find((r) => r.studentId === studentId);

/** The form as the copy page sends it, from what getCopy gave, with one level changed. */
async function changeLevel(teacher: Actor, assignmentId: string, studentId: string) {
  const copy = (await getCopy(teacher, assignmentId, studentId))!;
  const c = copy.proposal!.criteria;
  return saveTeacherEvaluation(teacher, {
    seen: copy.seen,
    levels: { task: c.task.level === 4 ? 3 : 4, organization: c.organization.level, vocabulary: c.vocabulary.level, grammar: c.grammar.level, mechanics: c.mechanics.level },
    remarks: {
      task: c.task.justification, organization: c.organization.justification, vocabulary: c.vocabulary.justification,
      grammar: c.grammar.justification, mechanics: c.mechanics.justification,
    },
    generalComment: copy.proposal!.generalComment,
    nextSteps: copy.proposal!.nextSteps.join("\n"),
    grade: { fixed: false },
    rereadDone: [],
  });
}

beforeEach(() => getSimulator().clear());

describe("ASG-02 CA2: the assignment leads to the list of its submissions", () => {
  it("the assignments list counts them; the list of that assignment has one line per student", { timeout: 60_000 }, async () => {
    const { teacher, students, assignmentId } = await setup(["Lina", "Omar"]);
    await toReview(students.Lina, assignmentId);
    const item = (await listTeacherAssignments(teacher)).find((a) => a.id === assignmentId);
    expect(item).toMatchObject({ submissions: 1, toReview: 1 });
    const { rows } = (await listAssignmentCopies(teacher, assignmentId))!;
    expect(rows.map((r) => [r.firstName, r.status]).sort()).toEqual([["Lina", "to_review"], ["Omar", "to_submit"]]);
  });
});

describe("SUB-04 CA3: lateness in the teacher's list", () => {
  it("submitted after the deadline: marked late in the list; on time: not; both reach To review alike", { timeout: 60_000 }, async () => {
    const { teacher, students, assignmentId } = await setup(["Lina", "Omar"]);
    await toReview(students.Lina, assignmentId);
    await db.update(assignments).set({ deadline: new Date(Date.now() - 864e5) }).where(eq(assignments.id, assignmentId));
    await toReview(students.Omar, assignmentId);
    expect(await lineOf(teacher, assignmentId, students.Lina.userId)).toMatchObject({ late: false, status: "to_review" });
    expect(await lineOf(teacher, assignmentId, students.Omar.userId)).toMatchObject({ late: true, status: "to_review" });
    // Same text, same simulator: the same proposed grade, late or not (no late field in the request: tests/evaluation-leak.int.test.ts).
    const [a, b] = await Promise.all([students.Lina, students.Omar].map((s) => lineOf(teacher, assignmentId, s.userId)));
    expect(a!.proposedGrade).toBe(b!.proposedGrade);
  });
});

describe("SUB-05 CA3: no replacement once the teacher changed the evaluation", () => {
  it("replaceable while only opened; refused with its message after a change; the student still sees being marked", { timeout: 60_000 }, async () => {
    const { teacher, students, assignmentId } = await setup(["Lina"]);
    const first = await toReview(students.Lina, assignmentId);
    // Opened only: nothing changed, still replaceable.
    expect(await recordCopyOpened(teacher, first.submissionId)).not.toBeNull();
    const replaced = await replaceStudentText(students.Lina, { assignmentId, requestId: randomUUID(), text: `${TEXT} Version 2.` }, recordTriggers());
    expect(replaced.status).toBe("done");
    expect((await step({ ...first, versionNumber: 2 })).status).toBe("to_review");

    expect(await changeLevel(teacher, assignmentId, students.Lina.userId)).toMatchObject({ status: "saved", changed: true });
    const refused = await replaceStudentText(students.Lina, { assignmentId, requestId: randomUUID(), text: `${TEXT} Version 3.` }, noTrigger);
    expect(refused).toMatchObject({ status: "error", message: REPLACEMENT_MESSAGES.teacherStarted });
    const copy = (await getCopy(teacher, assignmentId, students.Lina.userId))!;
    expect(copy.version!.number).toBe(2);
    expect(copy.evaluation).not.toBeNull();
    expect((await getStudentAssignment(students.Lina, assignmentId))?.status).toBe("being_marked");
  });
});

describe("CLS-04 CA3, REV-01 CA4: a removed student's submission stays with their corrector", () => {
  it("removed with a submission: listed and marked removed, the copy opened and changed; removed without one: absent", { timeout: 60_000 }, async () => {
    const { teacher, students, classId, assignmentId } = await setup(["Lina", "Omar"]);
    await toReview(students.Lina, assignmentId);
    expect(await removeStudent(teacher, classId, students.Lina.userId)).toBe(true);
    expect(await removeStudent(teacher, classId, students.Omar.userId)).toBe(true);

    const { rows } = (await listAssignmentCopies(teacher, assignmentId))!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ studentId: students.Lina.userId, status: "to_review", classes: [{ id: classId, name: "C1", removed: true }] });
    expect(await getStudentIdentity(teacher, students.Lina.userId)).toMatchObject({ firstName: "Lina" });
    expect(await getCopy(teacher, assignmentId, students.Omar.userId)).toBeNull();
    expect(await changeLevel(teacher, assignmentId, students.Lina.userId)).toMatchObject({ status: "saved", changed: true });
    expect(await lineOf(teacher, assignmentId, students.Lina.userId)).toMatchObject({ teacherGrade: expect.any(Number) });
  });
});

describe("PRC-02 from the list", () => {
  it("a failed copy retried from its line reaches To review; a refusal is marked, retried from the copy; an unavailable one relaunched", { timeout: 90_000 }, async () => {
    const { teacher, students, assignmentId } = await setup(["Lina", "Omar", "Sami"]);
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    const failed = await submit(students.Lina, assignmentId);
    expect((await step(failed)).status).toBe("evaluation_failed");
    getSimulator().failNext({ kind: "refusal", category: null });
    const refused = await submit(students.Omar, assignmentId);
    expect((await step(refused)).status).toBe("evaluation_failed");

    const line = (await lineOf(teacher, assignmentId, students.Lina.userId))!;
    expect(line).toMatchObject({ status: "evaluation_failed", refused: false, requested: false });
    expect(await lineOf(teacher, assignmentId, students.Omar.userId)).toMatchObject({ status: "evaluation_failed", refused: true });

    // The line's Retry: on the version the list shows.
    const starts: EvaluationRef[] = [];
    expect(await retryCopy(teacher, seenOn(line), { onStart: (ref) => void starts.push(ref) })).toEqual({ status: "requested" });
    expect(await lineOf(teacher, assignmentId, students.Lina.userId)).toMatchObject({ requested: true });
    expect(starts).toHaveLength(1);
    expect((await step(starts[0])).status).toBe("to_review");
    expect(await lineOf(teacher, assignmentId, students.Lina.userId)).toMatchObject({ status: "to_review", requested: false, refused: false });

    // "AI unavailable": the line's Relaunch, once the AI is back.
    const unavailable = await submit(students.Sami, assignmentId);
    expect((await evaluateSubmission(unavailable.submissionId, { ...deps(), guard: async () => "cost_cap" }, {
      expectedVersion: 1, claimToken: randomUUID(),
    })).status).toBe("not_assessable");
    const relaunchLine = (await lineOf(teacher, assignmentId, students.Sami.userId))!;
    expect(relaunchLine).toMatchObject({ status: "not_assessable", cause: "ai_unavailable" });
    const relaunched: EvaluationRef[] = [];
    expect(await relaunchCopy(teacher, seenOn(relaunchLine), { onStart: (ref) => void relaunched.push(ref) }, async () => ({ rubricLanguages: ["en"], costCapReached: false }))).toEqual({ status: "requested" });
    expect((await step(relaunched[0])).status).toBe("to_review");

    for (const s of [students.Lina, students.Omar, students.Sami]) {
      expect((await getStudentAssignment(s, assignmentId))?.status).toBe("being_marked");
    }
    const events = await db.select({ event: reviewJournalEntries.event }).from(reviewJournalEntries).where(eq(reviewJournalEntries.assignmentId, assignmentId));
    expect(events.map((e) => e.event).sort()).toEqual(["relaunch_requested", "retry_requested"]);
  });
});

describe("the matrix on a copy the teacher changed (§5.4): the corrector only", () => {
  it("another teacher, the student and the administrator get nothing: evaluation, log, proposal, identity, notice; nothing is written", { timeout: 90_000 }, async () => {
    const { teacher, students, assignmentId } = await setup(["Lina"]);
    const ref = await toReview(students.Lina, assignmentId);
    expect(await recordCopyOpened(teacher, ref.submissionId)).not.toBeNull();
    expect(await changeLevel(teacher, assignmentId, students.Lina.userId)).toMatchObject({ status: "saved" });
    const copy = (await getCopy(teacher, assignmentId, students.Lina.userId))!;
    expect(copy.evaluation).not.toBeNull();
    expect((await listCopyJournal(teacher, ref.submissionId))!.length).toBeGreaterThan(0);

    const other = await createUser("teacher");
    const admin = await createUser("admin");
    const student = students.Lina;
    const stored = async () => ({
      evaluations: await db.select().from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, ref.submissionId)),
      log: await db.select().from(reviewJournalEntries).where(eq(reviewJournalEntries.submissionId, ref.submissionId)),
      proposals: await db.select().from(aiProposals).where(eq(aiProposals.submissionId, ref.submissionId)),
    });
    const before = await stored();
    const seen = copy.seen!;
    const changes: EvaluationChanges = {
      levels: { task: 0, organization: 0, vocabulary: 0, grammar: 0, mechanics: 0 },
      remarks: { task: "", organization: "", vocabulary: "", grammar: "", mechanics: "" },
      generalComment: "Changed by someone else.", nextSteps: [], grade: { fixed: false }, rereadDone: [],
    };
    // As the form posts it: next steps one per line.
    const form = { ...changes, seen, nextSteps: "" };

    // Another teacher: absent, as a missing copy (AUTH-04 R3).
    expect(await getCopyOrNotice(other, assignmentId, student.userId)).toBeNull();
    expect(await listOrNotice(other, assignmentId)).toBeNull();
    expect(await listCopyJournal(other, ref.submissionId)).toBeNull();
    expect(await getCurrentProposal(other, ref.submissionId)).toBeNull();
    expect(await getStudentIdentity(other, student.userId)).toBeNull();
    expect(await recordCopyOpened(other, ref.submissionId)).toBeNull();
    expect(await recordListOpened(other, assignmentId)).toBeNull();
    expect(await saveEvaluation(other, seen, changes)).toBeNull();
    expect(await saveTeacherEvaluation(other, form)).toMatchObject({ status: "not_found" });
    expect(await openCopy(other, seen)).toEqual({ refresh: false });
    // Notice readings: each teacher their own; the owner's is not another's.
    expect(await getNoticeAcknowledgement(other)).not.toBeNull();
    expect(await getNoticeAcknowledgement(await createUser("teacher", "teacher", { notice: false }))).toBeNull();
    await expect(getNoticeAcknowledgement(admin)).rejects.toThrow(AccessDeniedError);

    // The student and the administrator: refused (no such right), by every data function.
    for (const actor of [student, admin]) {
      await expect(getCopyOrNotice(actor, assignmentId, student.userId)).rejects.toThrow(AccessDeniedError);
      await expect(listOrNotice(actor, assignmentId)).rejects.toThrow(AccessDeniedError);
      await expect(listCopyJournal(actor, ref.submissionId)).rejects.toThrow(AccessDeniedError);
      await expect(getCurrentProposal(actor, ref.submissionId)).rejects.toThrow(AccessDeniedError);
      await expect(saveEvaluation(actor, seen, changes)).rejects.toThrow(AccessDeniedError);
      // Through the services the Server Actions call: the answer for a missing copy.
      expect(await saveTeacherEvaluation(actor, form)).toMatchObject({ status: "not_found" });
      expect(await retryCopy(actor, seen, { onStart: () => { throw new Error("started"); } })).toMatchObject({ status: "not_found" });
      expect(await relaunchCopy(actor, seen, { onStart: () => { throw new Error("started"); } })).toMatchObject({ status: "not_found" });
      expect(await openCopy(actor, seen)).toEqual({ refresh: false });
    }
    // Identity: the administrator has no right to it; the student reads their own only (invariant 9).
    await expect(getStudentIdentity(admin, student.userId)).rejects.toThrow(AccessDeniedError);
    // The student's own view: no grade, no level, no remark.
    expect(JSON.stringify(await getStudentAssignment(student, assignmentId))).not.toMatch(/grade|level|remark|proposal|Changed/i);

    expect(await stored()).toEqual(before);
  });
});
