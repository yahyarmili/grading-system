import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AI_MAX_ATTEMPTS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator } from "@/server/ai";
import { createAssignment, getStudentAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { abandonEvaluationRequest } from "@/server/data/evaluation/system";
import { listRelaunchable, startManualEvaluation, type EvaluationStartContext, type RelaunchConditions } from "@/server/data/evaluation/teacher";
import { acknowledgeNotice } from "@/server/data/notices/notices";


import { replaceText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { classMemberships, evaluationRuns, reviewJournalEntries, securityEvents, users } from "@/server/db/schema";
import { getCaptureSender } from "@/server/email";
import type { AiGuard } from "@/server/evaluation/budget";
import { evaluateSubmission, type EvaluationDeps } from "@/server/evaluation/evaluate";
import { REQUEST_MESSAGES, relaunchCopy, retryCopy } from "@/server/review/relaunch";
import { submitStudentText } from "@/server/submissions/submissions";
import { recordTriggers } from "./helpers/triggers";
import { getCopy, listAssignmentCopies, readTeacherNotice } from "./helpers/review";

// PRC-02 from the screen (E7.6): what the copy and the list read, and what
// "Retry" and "Relaunch" do through their service: the request on the
// version seen, logged with it; a replaced copy refused as such; one
// evaluation per request, even sent twice (R4). E6.6's open points, as
// decided in the plan of E7 (§1.11): a request that found no evaluation slot
// is dropped and logged, the copy says so; repeated unreachable-provider
// failures tell the administrators once. The steps run as plain functions,
// on the simulator; the functions of E6.3 themselves:
// tests/evaluation-relaunch.int.test.ts.

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher" | "admin"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `relaunch-${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A teacher's English assignment, and `n` students who each submitted one text. */
async function assignment(n: number) {
  const teacher = await createUser("teacher");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  const students: (Actor & { kind: "user" })[] = [];
  const refs: EvaluationRef[] = [];
  for (let i = 0; i < n; i++) {
    const student = await createUser("student");
    await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
    await acknowledgeNotice(student, STUDENT_NOTICE.version);
    const trigger = recordTriggers();
    await submitStudentText(student, { assignmentId: created.assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, trigger);
    students.push(student);
    refs.push(trigger.refs[0]);
  }
  return { teacher, students, refs, assignmentId: created.assignmentId };
}

const deps = (over: Partial<EvaluationDeps> = {}): EvaluationDeps => ({
  evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000, ...over,
});

/** The workflow's step for a ref, its origin and request included. */
const step = (ref: EvaluationRef, over: Partial<EvaluationDeps> = {}) =>
  evaluateSubmission(ref.submissionId, deps(over), {
    expectedVersion: ref.versionNumber, origin: ref.origin, request: ref.request, claimToken: randomUUID(),
  });

/** What the Server Action's after() would start. */
function recordStarts(): EvaluationStartContext & { refs: EvaluationRef[] } {
  const refs: EvaluationRef[] = [];
  return { refs, onStart: (ref) => void refs.push(ref) };
}

const seenOf = (ref: EvaluationRef) => ({ submissionId: ref.submissionId, versionNumber: ref.versionNumber });
const journal = (submissionId: string) =>
  db
    .select({ event: reviewJournalEntries.event, actorId: reviewJournalEntries.actorId, versionNumber: reviewJournalEntries.versionNumber, newValue: reviewJournalEntries.newValue })
    .from(reviewJournalEntries)
    .where(and(eq(reviewJournalEntries.submissionId, submissionId), sql`${reviewJournalEntries.event} <> 'copy_opened'`))
    .orderBy(reviewJournalEntries.createdAt);
const runCount = async (submissionId: string) => (await db.select().from(evaluationRuns).where(eq(evaluationRuns.submissionId, submissionId))).length;

const ENGLISH_ONLY: RelaunchConditions = { rubricLanguages: ["en"], costCapReached: false };
const capReached: AiGuard = async () => "cost_cap";
const lasting529 = () => getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);

beforeEach(() => {
  getSimulator().clear();
  getCaptureSender().clear();
});

describe("PRC-02 CA1, CA2 from the copy: Retry", () => {
  it("a lasting 529: the copy shows the failure; Retry asks, logs, and the next run reaches To review; the student sees being marked", { timeout: 60_000 }, async () => {
    const { teacher, students, refs, assignmentId } = await assignment(1);
    lasting529();
    expect(await step(refs[0])).toMatchObject({ status: "evaluation_failed", attempts: AI_MAX_ATTEMPTS });
    const failed = (await getCopy(teacher, assignmentId, students[0].userId))!;
    expect(failed).toMatchObject({ status: "evaluation_failed", lastError: "unavailable", request: null, proposal: null });
    expect((await getStudentAssignment(students[0], assignmentId))?.status).toBe("being_marked");

    const starts = recordStarts();
    expect(await retryCopy(teacher, seenOf(refs[0]), starts)).toEqual({ status: "requested" });
    expect(starts.refs).toEqual([{ ...seenOf(refs[0]), origin: "retry", request: expect.any(String) }]);
    expect(await journal(refs[0].submissionId)).toEqual([
      { event: "retry_requested", actorId: teacher.userId, versionNumber: 1, newValue: null },
    ]);
    expect((await getCopy(teacher, assignmentId, students[0].userId))?.request).toBe("pending");
    const [line] = (await listAssignmentCopies(teacher, assignmentId))!.rows;
    expect(line).toMatchObject({ status: "evaluation_failed", requested: true, submission: { id: refs[0].submissionId, versionNumber: 1 } });

    expect(await step(starts.refs[0])).toMatchObject({ status: "to_review" });
    const reviewed = (await getCopy(teacher, assignmentId, students[0].userId))!;
    expect(reviewed).toMatchObject({ status: "to_review", request: null, proposal: { versionNumber: 1 } });
    expect((await getStudentAssignment(students[0], assignmentId))?.status).toBe("being_marked");
  });

  it("R4: Retry sent twice at once, and once more: one evaluation; each request logged", { timeout: 60_000 }, async () => {
    const { teacher, refs } = await assignment(1);
    lasting529();
    await step(refs[0]);
    const starts = recordStarts();
    const answers = await Promise.all([retryCopy(teacher, seenOf(refs[0]), starts), retryCopy(teacher, seenOf(refs[0]), starts)]);
    answers.push(await retryCopy(teacher, seenOf(refs[0]), starts));
    expect(answers).toEqual([{ status: "requested" }, { status: "requested" }, { status: "requested" }]);
    // Every run started at once: only the last request is claimed.
    const outcomes = await Promise.all(starts.refs.map((ref) => step(ref)));
    expect(outcomes.filter((o) => o.status === "to_review")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "skipped")).toHaveLength(2);
    expect(await runCount(refs[0].submissionId)).toBe(2);
    expect((await journal(refs[0].submissionId)).map((e) => e.event)).toEqual(["retry_requested", "retry_requested", "retry_requested"]);
  });

  it("the student replaced the text meanwhile: refused as replaced, nothing asked, nothing logged", { timeout: 60_000 }, async () => {
    const { teacher, students, refs, assignmentId } = await assignment(1);
    lasting529();
    await step(refs[0]);
    expect((await replaceText(students[0], { assignmentId, requestId: randomUUID(), text: "My new text about my town." }))?.ok).toBe(true);
    const starts = recordStarts();
    expect(await retryCopy(teacher, seenOf(refs[0]), starts)).toEqual({ status: "replaced", message: REQUEST_MESSAGES.replaced });
    expect(starts.refs).toEqual([]);
    expect(await journal(refs[0].submissionId)).toEqual([]);
  });

  it("a refusal: the copy says the AI declined; Retry is allowed", { timeout: 60_000 }, async () => {
    const { teacher, students, refs, assignmentId } = await assignment(1);
    getSimulator().failNext({ kind: "refusal", category: null }, 1);
    expect(await step(refs[0])).toMatchObject({ status: "evaluation_failed", errors: ["refused"] });
    expect(await getCopy(teacher, assignmentId, students[0].userId)).toMatchObject({ status: "evaluation_failed", lastError: "refused" });
    expect(await retryCopy(teacher, seenOf(refs[0]), recordStarts())).toEqual({ status: "requested" });
  });

  it("a copy to review is never retried; another teacher's or the student's request finds nothing", { timeout: 60_000 }, async () => {
    const { teacher, students, refs } = await assignment(1);
    await step(refs[0]);
    expect(await retryCopy(teacher, seenOf(refs[0]), recordStarts())).toEqual({ status: "not_failed", message: REQUEST_MESSAGES.notFailed });
    const other = await createUser("teacher");
    expect(await retryCopy(other, seenOf(refs[0]), recordStarts())).toEqual({ status: "not_found", message: REQUEST_MESSAGES.notFound });
    expect(await relaunchCopy(other, seenOf(refs[0]), recordStarts(), async () => ENGLISH_ONLY)).toMatchObject({ status: "not_found" });
    expect(await retryCopy(students[0], seenOf(refs[0]), recordStarts())).toMatchObject({ status: "not_found" });
    expect(await db.select().from(securityEvents).where(eq(securityEvents.type, "access_denied"))).toHaveLength(1);
    expect(await journal(refs[0].submissionId)).toEqual([]);
  });
});

describe("PRC-02 CA3 from the list and the copy: Relaunch", () => {
  it("offered for the copies 'AI unavailable' not evaluated by hand, and them only, once the AI is back; logged; then To review", { timeout: 60_000 }, async () => {
    const { teacher, refs, assignmentId } = await assignment(3);
    for (const ref of refs) expect(await step(ref, { guard: capReached })).toMatchObject({ status: "not_assessable" });
    // Evaluated by hand: never offered. Still evaluated: the third, left as is.
    expect(await startManualEvaluation(teacher, seenOf(refs[1]))).toEqual({ ok: true });

    // The cap still reached: nothing offered, the relaunch refused.
    const capped: RelaunchConditions = { ...ENGLISH_ONLY, costCapReached: true };
    expect(await listRelaunchable(teacher, assignmentId, capped)).toEqual([]);
    expect(await relaunchCopy(teacher, seenOf(refs[0]), recordStarts(), async () => capped)).toEqual({
      status: "not_relaunchable", message: REQUEST_MESSAGES.notRelaunchable,
    });

    // The AI back: the two copies not evaluated by hand are offered.
    expect((await listRelaunchable(teacher, assignmentId, ENGLISH_ONLY)).map((c) => c.submissionId).sort()).toEqual(
      [refs[0].submissionId, refs[2].submissionId].sort(),
    );
    expect(await relaunchCopy(teacher, seenOf(refs[1]), recordStarts(), async () => ENGLISH_ONLY)).toMatchObject({ status: "not_relaunchable" });
    const starts = recordStarts();
    expect(await relaunchCopy(teacher, seenOf(refs[0]), starts, async () => ENGLISH_ONLY)).toEqual({ status: "requested" });
    expect(await journal(refs[0].submissionId)).toEqual([
      { event: "relaunch_requested", actorId: teacher.userId, versionNumber: 1, newValue: null },
    ]);
    const lines = (await listAssignmentCopies(teacher, assignmentId))!.rows;
    expect(lines.find((l) => l.submission?.id === refs[0].submissionId)).toMatchObject({ status: "not_assessable", requested: true });
    expect(await step(starts.refs[0])).toMatchObject({ status: "to_review" });
  });
});

describe("E6.6's open point: a request that found no evaluation slot (plan of E7 §1.11)", () => {
  it("is dropped, logged by the system; the copy says so; a newer request is never dropped by an older one", { timeout: 60_000 }, async () => {
    const { teacher, students, refs, assignmentId } = await assignment(1);
    lasting529();
    await step(refs[0]);
    const starts = recordStarts();
    await retryCopy(teacher, seenOf(refs[0]), starts);
    const [asked] = starts.refs;

    expect(await abandonEvaluationRequest(asked)).toBe(true);
    expect(await abandonEvaluationRequest(asked)).toBe(false);
    expect((await getCopy(teacher, assignmentId, students[0].userId))?.request).toBe("abandoned");
    expect(await journal(refs[0].submissionId)).toEqual([
      { event: "retry_requested", actorId: teacher.userId, versionNumber: 1, newValue: null },
      { event: "retry_abandoned", actorId: null, versionNumber: 1, newValue: { origin: "retry" } },
    ]);
    // Its run, late, claims nothing.
    expect(await step(asked)).toEqual({ status: "skipped" });

    // Asked again: waiting, whatever the older request's run does.
    await retryCopy(teacher, seenOf(refs[0]), starts);
    expect(await abandonEvaluationRequest(asked)).toBe(false);
    expect((await getCopy(teacher, assignmentId, students[0].userId))?.request).toBe("pending");
    expect(await step(starts.refs[1])).toMatchObject({ status: "to_review" });
    // Never for the system's own runs.
    expect(await abandonEvaluationRequest({ ...seenOf(refs[0]), origin: "auto" })).toBe(false);
  });
});

describe("E6.6's open point: the provider unreachable (EXP-02, plan of E7 §1.11)", () => {
  it("3 copies failed on an unreachable provider: the administrators are told once; 2 tell no one; nothing is stopped", { timeout: 90_000 }, async () => {
    await createUser("admin");
    const { refs } = await assignment(4);
    const told = () => getCaptureSender().captured().filter((m) => m.subject === "AI unreachable: evaluations failing");
    for (const ref of refs.slice(0, 2)) {
      lasting529();
      await step(ref);
    }
    expect(told()).toHaveLength(0);
    // A timeout counts too.
    getSimulator().failNext({ kind: "timeout" }, AI_MAX_ATTEMPTS);
    expect(await step(refs[2], { callTimeoutMs: 50 })).toMatchObject({ status: "evaluation_failed", errors: ["timeout", "timeout", "timeout"].slice(0, AI_MAX_ATTEMPTS) });
    expect(told()).toHaveLength(1);
    expect(await db.select().from(securityEvents).where(eq(securityEvents.type, "ai_provider_unreachable"))).toHaveLength(1);

    // Calls go on; a fourth failure within the window tells no one again.
    lasting529();
    expect(await step(refs[3])).toMatchObject({ status: "evaluation_failed", attempts: AI_MAX_ATTEMPTS });
    expect(told()).toHaveLength(1);
  });
});
