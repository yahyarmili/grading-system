import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AI_MAX_ATTEMPTS } from "@/config/provisional";
import type { AssignmentLanguage } from "@/lib/assignment";
import type { EvaluationRef } from "@/lib/evaluation";
import { RUBRIC_VERSIONS, type RubricVersion } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { getSimulator } from "@/server/ai";
import { createAssignment, getStudentAssignment, listStudentAssignments } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import {
  listRelaunchable,
  relaunchEvaluation,
  retryEvaluation,
  startManualEvaluation,
  type EvaluationStartContext,
  type RelaunchConditions,
  type SeenVersion,
} from "@/server/data/evaluation/teacher";
import { stillEvaluating } from "@/server/data/evaluation/system";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { replaceText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { aiProposals, classMemberships, evaluationRuns, reviewJournalEntries, submissions, users } from "@/server/db/schema";
import type { AiGuard } from "@/server/evaluation/budget";
import { evaluateSubmission, type EvaluationDeps } from "@/server/evaluation/evaluate";
import { relaunchConditions } from "@/server/evaluation/relaunch";
import { evaluateStep, releaseStep } from "@/server/evaluation/steps";
import { sweepEvaluations } from "@/server/evaluation/sweep";
import { submitStudentText } from "@/server/submissions/submissions";
import { FR_TEST_RUBRIC } from "./fixtures/rubric-fr-test";
import { recordTriggers } from "./helpers/triggers";
import { readTeacherNotice } from "./helpers/review";

// E6.3, PRC-02: after the attempts, "evaluation failed"; the owner teacher
// retries it (transition 6), relaunches a copy "not assessable" once its
// cause disappeared (7), or evaluates it by hand; never the system by
// itself. The student sees "Submitted, being marked" whatever happened
// (CA4, SUB-01 CA2). The steps run as plain functions, on the simulator.

const TEXT = {
  en: "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.",
  fr: "Ma ville est petite mais elle est belle. Il y a un marché le vendredi et les gens sont gentils.",
};

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

/** A teacher's assignment in `language`, and `texts.length` students who each submitted one text. */
async function assignment(language: AssignmentLanguage, texts: string[]) {
  const teacher = await createUser("teacher");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language,
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  const students: (Actor & { kind: "user" })[] = [];
  const refs: EvaluationRef[] = [];
  for (const text of texts) {
    const student = await createUser("student");
    await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
    await acknowledgeNotice(student, STUDENT_NOTICE.version);
    const trigger = recordTriggers();
    await submitStudentText(student, { assignmentId: created.assignmentId, contentVersion: "1", requestId: randomUUID(), text }, trigger);
    if (trigger.refs.length !== 1) throw new Error("Not submitted once");
    students.push(student);
    refs.push(trigger.refs[0]);
  }
  return { teacher, students, refs, assignmentId: created.assignmentId };
}

const deps = (over: Partial<EvaluationDeps> = {}): EvaluationDeps => ({
  evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000, ...over,
});

/** The workflow's step for a ref, its origin included, with the test's dependencies. */
const step = (ref: EvaluationRef, over: Partial<EvaluationDeps> = {}) =>
  evaluateSubmission(ref.submissionId, deps(over), {
    expectedVersion: ref.versionNumber, origin: ref.origin, request: ref.request, claimToken: randomUUID(),
  });

/** Records the versions the teacher's requests hand over, as the Server Action's after() would start them. */
function recordStarts(): EvaluationStartContext & { refs: EvaluationRef[] } {
  const refs: EvaluationRef[] = [];
  return { refs, onStart: (ref) => void refs.push(ref) };
}

const row = async (id: string) =>
  (await db
    .select({
      status: submissions.status,
      cause: submissions.notAssessableCause,
      current: submissions.currentProposalId,
      started: submissions.teacherStartedAt,
    })
    .from(submissions)
    .where(eq(submissions.id, id)))[0];
const runsOf = (id: string) => db.select().from(evaluationRuns).where(eq(evaluationRuns.submissionId, id));

const ENGLISH_ONLY: RelaunchConditions = { rubricLanguages: ["en"], costCapReached: false };
const WITH_FRENCH: readonly RubricVersion[] = [...RUBRIC_VERSIONS, FR_TEST_RUBRIC];
const capReached: AiGuard = async () => "cost_cap";

beforeEach(() => {
  getSimulator().clear();
});

describe("PRC-02 CA1: a repeated technical failure", () => {
  it("a lasting 529: after AI_MAX_ATTEMPTS attempts, evaluation failed, the run kept; the student sees being marked", async () => {
    const { refs, students, assignmentId } = await assignment("en", [TEXT.en]);
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    expect(await step(refs[0])).toMatchObject({
      status: "evaluation_failed", attempts: AI_MAX_ATTEMPTS, errors: Array(AI_MAX_ATTEMPTS).fill("unavailable"),
    });
    expect(await row(refs[0].submissionId)).toMatchObject({ status: "evaluation_failed", current: null });
    expect(await runsOf(refs[0].submissionId)).toMatchObject([{ outcome: "failed", attempts: AI_MAX_ATTEMPTS }]);
    expect((await getStudentAssignment(students[0], assignmentId))?.status).toBe("being_marked");
  });
});

describe("PRC-02 CA2: the teacher's retry (transition 6)", () => {
  it("hands the version over once; the workflow's step takes it to To review, its proposal current", async () => {
    const { teacher, refs } = await assignment("en", [TEXT.en]);
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    await step(refs[0]);

    const starts = recordStarts();
    expect(await retryEvaluation(teacher, refs[0], starts)).toEqual({ ok: true });
    expect(starts.refs).toEqual([{ ...refs[0], origin: "retry", request: expect.any(String) }]);
    // Through the step itself: the origin and the request travel with the ref, the run's token claims it.
    expect(await evaluateStep(starts.refs[0], randomUUID())).toMatchObject({ status: "to_review", attempts: 1 });
    const after = await row(refs[0].submissionId);
    expect(after).toMatchObject({ status: "to_review", current: expect.any(String) });
    expect((await runsOf(refs[0].submissionId)).map((r) => r.outcome).sort()).toEqual(["failed", "proposed"]);
  });

  it("a refusal may be retried by the teacher, though never automatically", async () => {
    const { teacher, refs } = await assignment("en", [TEXT.en]);
    getSimulator().failNext({ kind: "refusal", category: null }, 1);
    expect(await step(refs[0])).toMatchObject({ status: "evaluation_failed", attempts: 1, errors: ["refused"] });
    const starts = recordStarts();
    expect(await retryEvaluation(teacher, refs[0], starts)).toEqual({ ok: true });
    expect(await step(starts.refs[0])).toMatchObject({ status: "to_review" });
  });

  it("two retries at once: one evaluation, one proposal", async () => {
    const { teacher, refs } = await assignment("en", [TEXT.en]);
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    await step(refs[0]);
    const starts = recordStarts();
    await retryEvaluation(teacher, refs[0], starts);
    await retryEvaluation(teacher, refs[0], starts);
    const outcomes = await Promise.all(starts.refs.map((ref) => step(ref)));
    expect(outcomes.map((o) => o.status).sort()).toEqual(["skipped", "to_review"]);
    expect(await db.select().from(aiProposals).where(eq(aiProposals.submissionId, refs[0].submissionId))).toHaveLength(1);
  });

  it("E6.6: two retries, the run that claims fails back to evaluation_failed: still one evaluation, whatever the order", { timeout: 60_000 }, async () => {
    const { teacher, refs } = await assignment("en", [TEXT.en, TEXT.en]);
    // One copy per order: the first request's run gets a place first, then the second's; and the other way round.
    const orders = [[0, 1], [1, 0]] as const;
    for (const [i, ref] of refs.entries()) {
      const [first, second] = orders[i];
      getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
      await step(ref);
      getSimulator().clear();
      // Clicked twice while every place was taken: two runs wait for the same copy.
      const starts = recordStarts();
      await retryEvaluation(teacher, ref, starts);
      await retryEvaluation(teacher, ref, starts);
      expect(new Set(starts.refs.map((r) => r.request)).size).toBe(2);
      // The run that claims fails again (a lasting 529), back to evaluation_failed; then the other one gets its place.
      getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
      const outcomes = [await step(starts.refs[first]), await step(starts.refs[second])];
      expect(outcomes.map((o) => o.status).sort()).toEqual(["evaluation_failed", "skipped"]);
      expect(getSimulator().captured()).toHaveLength(AI_MAX_ATTEMPTS);
      expect(await runsOf(ref.submissionId)).toHaveLength(2);
      // Delivered again, either one claims nothing: its request was taken or replaced.
      for (const r of starts.refs) expect(await step(r)).toEqual({ status: "skipped" });
      expect((await row(ref.submissionId)).status).toBe("evaluation_failed");
    }
  });

  it("E6.6: a step without the stored request (forged, or from an earlier request) claims nothing", async () => {
    const { teacher, refs } = await assignment("en", [TEXT.en]);
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    await step(refs[0]);
    getSimulator().clear();
    expect(await step({ ...refs[0], origin: "retry" })).toEqual({ status: "skipped" });
    expect(await step({ ...refs[0], origin: "retry", request: randomUUID() })).toEqual({ status: "skipped" });
    const starts = recordStarts();
    await retryEvaluation(teacher, refs[0], starts);
    expect(await step({ ...starts.refs[0], request: randomUUID() })).toEqual({ status: "skipped" });
    expect(getSimulator().captured()).toEqual([]);
    expect(await step(starts.refs[0])).toMatchObject({ status: "to_review" });
  });

  it("E6.6: the ref handed over carries the identifiers, the origin and the request, nothing else of the request", async () => {
    const { teacher, refs } = await assignment("en", [TEXT.en]);
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    await step(refs[0]);
    const starts = recordStarts();
    // What a form of E7 could pass along with the version seen.
    const seen = { ...refs[0], text: TEXT.en, studentName: "student 1" } as SeenVersion;
    expect(await retryEvaluation(teacher, seen, starts)).toEqual({ ok: true });
    expect(Object.keys(starts.refs[0]).sort()).toEqual(["origin", "request", "submissionId", "versionNumber"]);
    expect(JSON.stringify(starts.refs[0])).not.toContain("beatiful");
  });

  it("E6.6: a released run's late answer while another run of the same version evaluates: kept, not current (the claim's token)", { timeout: 60_000 }, async () => {
    const { teacher, refs } = await assignment("en", [TEXT.en]);
    const [ref] = refs;
    const tokenA = randomUUID();
    const holdA = getSimulator().holdNext();
    const runA = evaluateStep(ref, tokenA);
    await expect.poll(async () => (await row(ref.submissionId)).status, { timeout: 30_000 }).toBe("evaluating");
    // A is given up (its step failed, or the sweep released it): evaluation_failed; the teacher retries.
    expect(await releaseStep(ref, tokenA)).toBe(true);
    const starts = recordStarts();
    expect(await retryEvaluation(teacher, ref, starts)).toEqual({ ok: true });
    const tokenB = randomUUID();
    const holdB = getSimulator().holdNext();
    const runB = evaluateStep(starts.refs[0], tokenB);
    await expect.poll(async () => (await db.select({ token: submissions.claimToken }).from(submissions).where(eq(submissions.id, ref.submissionId)))[0].token, { timeout: 30_000 }).toBe(tokenB);

    // Same submission, same version, evaluating: only the token tells A from B.
    expect(await stillEvaluating({ submissionId: ref.submissionId, versionNumber: ref.versionNumber, claimToken: tokenA })).toBe(false);
    expect(await stillEvaluating({ submissionId: ref.submissionId, versionNumber: ref.versionNumber, claimToken: tokenB })).toBe(true);
    holdA();
    expect(await runA).toMatchObject({ status: "stale" });
    expect(await row(ref.submissionId)).toMatchObject({ status: "evaluating", current: null });
    holdB();
    expect(await runB).toMatchObject({ status: "to_review" });

    const proposals = await db.select({ id: aiProposals.id, runId: aiProposals.runId }).from(aiProposals).where(eq(aiProposals.submissionId, ref.submissionId));
    expect(proposals).toHaveLength(2);
    const [last] = await db.select({ id: evaluationRuns.id }).from(evaluationRuns).where(eq(evaluationRuns.submissionId, ref.submissionId)).orderBy(desc(evaluationRuns.createdAt)).limit(1);
    const current = (await row(ref.submissionId)).current;
    expect(proposals.find((p) => p.id === current)?.runId).toBe(last.id);
  });

  it("refused for a copy to review (R3), a version replaced since, another teacher's copy, a student", async () => {
    const { teacher, students, refs, assignmentId } = await assignment("en", [TEXT.en, TEXT.en]);
    const starts = recordStarts();
    // To review: never evaluated again (Q4).
    await step(refs[0]);
    expect(await retryEvaluation(teacher, refs[0], starts)).toEqual({ ok: false, reason: "not_failed" });
    // Failed, then replaced and failed again: the teacher saw version 1.
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    await step(refs[1]);
    const replaced = await replaceText(students[1], { assignmentId, requestId: randomUUID(), text: `${TEXT.en} Again.` });
    if (!replaced?.ok) throw new Error("Not replaced");
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    await step(replaced.ref);
    expect(await retryEvaluation(teacher, refs[1], starts)).toEqual({ ok: false, reason: "changed" });
    // A step for a version no longer active claims nothing.
    expect(await step({ ...refs[1], origin: "retry" })).toEqual({ status: "skipped" });

    expect(await retryEvaluation(await createUser("teacher"), replaced.ref, starts)).toBeNull();
    await expect(retryEvaluation(students[1], replaced.ref, starts)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(starts.refs).toEqual([]);
    expect((await row(refs[1].submissionId)).status).toBe("evaluation_failed");
  });

  it("the provider down during a batch: no copy lost, those touched failed; retried, they reach To review", { timeout: 120_000 }, async () => {
    const { teacher, refs } = await assignment("en", Array(5).fill(TEXT.en));
    const down = refs.slice(0, 3);
    for (const ref of down) {
      getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
      expect(await step(ref)).toMatchObject({ status: "evaluation_failed" });
    }
    for (const ref of refs.slice(3)) expect(await step(ref)).toMatchObject({ status: "to_review" });

    const starts = recordStarts();
    for (const ref of down) expect(await retryEvaluation(teacher, ref, starts)).toEqual({ ok: true });
    for (const ref of starts.refs) expect(await step(ref)).toMatchObject({ status: "to_review" });
    const all = await db
      .select({ status: submissions.status })
      .from(submissions)
      .where(inArray(submissions.id, refs.map((r) => r.submissionId)));
    expect(all.map((r) => r.status)).toEqual(Array(5).fill("to_review"));
    expect(await db.select().from(aiProposals)).toHaveLength(5);
  });
});

describe("PRC-02 CA3, R4: a relaunch offered when the cause disappears, for those copies only (transition 7)", () => {
  it("French published: offered for the copies 'rubric unavailable', never one evaluated by hand nor one without content", { timeout: 60_000 }, async () => {
    const { teacher, refs, assignmentId } = await assignment("fr", [TEXT.fr, TEXT.fr, "1234 5678 !!!"]);
    const [waiting, byHand, empty] = refs;
    for (const ref of refs) await step(ref);
    expect((await row(waiting.submissionId)).cause).toBe("rubric_unavailable");
    expect((await row(empty.submissionId)).cause).toBe("no_content");

    // French not published yet: nothing offered.
    expect(await relaunchConditions()).toEqual({ rubricLanguages: ["en"], costCapReached: false });
    expect(await listRelaunchable(teacher, assignmentId, await relaunchConditions())).toEqual([]);
    expect(await startManualEvaluation(teacher, byHand)).toEqual({ ok: true });

    const french = await relaunchConditions(WITH_FRENCH);
    expect(french.rubricLanguages).toEqual(["en", "fr"]);
    expect(await listRelaunchable(teacher, assignmentId, french)).toEqual([
      { submissionId: waiting.submissionId, versionNumber: 1, cause: "rubric_unavailable" },
    ]);
    expect(await listRelaunchable(await createUser("teacher"), assignmentId, french)).toEqual([]);

    const starts = recordStarts();
    expect(await relaunchEvaluation(teacher, byHand, french, starts)).toEqual({ ok: false, reason: "not_relaunchable" });
    expect(await relaunchEvaluation(teacher, empty, french, starts)).toEqual({ ok: false, reason: "not_relaunchable" });
    expect(await relaunchEvaluation(teacher, waiting, ENGLISH_ONLY, starts)).toEqual({ ok: false, reason: "not_relaunchable" });
    expect(await relaunchEvaluation(teacher, waiting, french, starts)).toEqual({ ok: true });
    expect(starts.refs).toEqual([{ ...waiting, origin: "relaunch", request: expect.any(String) }]);

    expect(await step(starts.refs[0], { registry: WITH_FRENCH })).toMatchObject({ status: "to_review", attempts: 1 });
    expect(await row(waiting.submissionId)).toMatchObject({ status: "to_review", cause: null, current: expect.any(String) });
    expect(await listRelaunchable(teacher, assignmentId, french)).toEqual([]);
  });

  it("E6.6: two relaunches, the first run not assessable again: the other claims nothing", async () => {
    const { teacher, refs } = await assignment("fr", [TEXT.fr]);
    await step(refs[0]);
    const french = await relaunchConditions(WITH_FRENCH);
    const starts = recordStarts();
    expect(await relaunchEvaluation(teacher, refs[0], french, starts)).toEqual({ ok: true });
    expect(await relaunchEvaluation(teacher, refs[0], french, starts)).toEqual({ ok: true });
    // French withdrawn before the runs: each would become not assessable again, with a run of its own.
    expect((await Promise.all(starts.refs.map((ref) => step(ref)))).map((o) => o.status).sort()).toEqual(["not_assessable", "skipped"]);
    for (const ref of starts.refs) expect(await step(ref, { registry: WITH_FRENCH })).toEqual({ status: "skipped" });
    expect(await runsOf(refs[0].submissionId)).toHaveLength(2);
  });

  it("the claim itself refuses a relaunch of a copy without content or evaluated by hand", async () => {
    const { teacher, refs } = await assignment("fr", [TEXT.fr, "1234 5678 !!!"]);
    for (const ref of refs) await step(ref);
    await startManualEvaluation(teacher, refs[0]);
    for (const ref of refs) expect(await step({ ...ref, origin: "relaunch" }, { registry: WITH_FRENCH })).toEqual({ status: "skipped" });
  });

  it("relaunched while the cause is still there: not assessable again, no proposal, no loop", async () => {
    const { teacher, refs } = await assignment("fr", [TEXT.fr]);
    await step(refs[0]);
    const starts = recordStarts();
    // Offered on the teacher's screen, then French withdrawn before the step ran.
    await relaunchEvaluation(teacher, refs[0], await relaunchConditions(WITH_FRENCH), starts);
    expect(await step(starts.refs[0])).toMatchObject({ status: "not_assessable", attempts: 0 });
    expect((await row(refs[0].submissionId)).cause).toBe("rubric_unavailable");
    expect(getSimulator().captured()).toEqual([]);
  });

  it("the cost cap: 'AI unavailable' offered once the cap is lifted", async () => {
    const { teacher, refs, assignmentId } = await assignment("en", [TEXT.en]);
    expect(await step(refs[0], { guard: capReached })).toMatchObject({ status: "not_assessable", attempts: 0 });
    expect(await row(refs[0].submissionId)).toMatchObject({ status: "not_assessable", cause: "ai_unavailable" });

    // The conditions read the cap: reached with a cap of 0 USD, not with the real one on a test database.
    const reached = await relaunchConditions(RUBRIC_VERSIONS, { capUsd: 0, breakerFailures: 3, breakerWindowMs: 3_600_000 });
    expect(reached.costCapReached).toBe(true);
    expect(await listRelaunchable(teacher, assignmentId, reached)).toEqual([]);
    const lifted = await relaunchConditions();
    expect(await listRelaunchable(teacher, assignmentId, lifted)).toEqual([
      { submissionId: refs[0].submissionId, versionNumber: 1, cause: "ai_unavailable" },
    ]);

    const starts = recordStarts();
    expect(await relaunchEvaluation(teacher, refs[0], reached, starts)).toEqual({ ok: false, reason: "not_relaunchable" });
    expect(await relaunchEvaluation(teacher, refs[0], lifted, starts)).toEqual({ ok: true });
    expect(await step(starts.refs[0])).toMatchObject({ status: "to_review" });
  });

  it("the provider's budget: offered once the provider evaluated a copy again (credit renewed, limit raised)", async () => {
    const { teacher, refs, assignmentId } = await assignment("en", [TEXT.en, TEXT.en]);
    getSimulator().failNext({ kind: "error", status: 402 }, 1);
    expect(await step(refs[0])).toMatchObject({ status: "not_assessable", attempts: 1, errors: ["budget"] });
    expect(await listRelaunchable(teacher, assignmentId, ENGLISH_ONLY)).toEqual([]);
    const starts = recordStarts();
    expect(await relaunchEvaluation(teacher, refs[0], ENGLISH_ONLY, starts)).toEqual({ ok: false, reason: "not_relaunchable" });

    // The next submission, evaluated automatically, shows the provider takes calls again.
    expect(await step(refs[1])).toMatchObject({ status: "to_review" });
    expect(await listRelaunchable(teacher, assignmentId, ENGLISH_ONLY)).toEqual([
      { submissionId: refs[0].submissionId, versionNumber: 1, cause: "ai_unavailable" },
    ]);
  });

  it("never automatically: the sweep and the triggers leave failed and not assessable copies alone", async () => {
    const { refs } = await assignment("fr", [TEXT.fr, TEXT.fr]);
    const [failed, waiting] = refs;
    // French published for the first one only, so that it reaches the AI, and fails.
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    await step(failed, { registry: WITH_FRENCH });
    await step(waiting);
    expect((await row(failed.submissionId)).status).toBe("evaluation_failed");
    expect((await row(waiting.submissionId)).cause).toBe("rubric_unavailable");
    await db.update(submissions).set({ updatedAt: sql`now() - interval '1 day'` });

    const started: EvaluationRef[] = [];
    expect(await sweepEvaluations(async (ref) => void started.push(ref))).toEqual({ released: [], restarted: [] });
    expect(started).toEqual([]);
    expect((await row(failed.submissionId)).status).toBe("evaluation_failed");
    expect((await row(waiting.submissionId)).status).toBe("not_assessable");
  });
});

describe("manual evaluation (REV-06, transitions 6 and 7 to to_review)", () => {
  it("leaves a failure for To review without a proposal, records the teacher's first act, closes the replacement", { timeout: 60_000 }, async () => {
    const { teacher, students, refs, assignmentId } = await assignment("en", [TEXT.en, TEXT.en]);
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    await step(refs[0]);
    await step(refs[1]);
    expect(await startManualEvaluation(teacher, refs[0])).toEqual({ ok: true });
    expect(await row(refs[0].submissionId)).toMatchObject({ status: "to_review", current: null, started: expect.any(Date) });
    // REV-04: the teacher's act is logged in its transaction, by its author, without a revision (no entry before the fix).
    const manualStarted = (submissionId: string) =>
      db
        .select({ actorId: reviewJournalEntries.actorId, versionNumber: reviewJournalEntries.versionNumber, revision: reviewJournalEntries.evaluationRevision })
        .from(reviewJournalEntries)
        .where(and(eq(reviewJournalEntries.submissionId, submissionId), eq(reviewJournalEntries.event, "manual_started")));
    const logged = [{ actorId: teacher.userId, versionNumber: 1, revision: null }];
    expect(await manualStarted(refs[0].submissionId)).toEqual(logged);
    expect(await replaceText(students[0], { assignmentId, requestId: randomUUID(), text: TEXT.en })).toEqual({
      ok: false, reason: "teacher_started",
    });
    const starts = recordStarts();
    expect(await retryEvaluation(teacher, refs[0], starts)).toEqual({ ok: false, reason: "not_failed" });
    // A copy to review with its proposal is not evaluated by hand from here (E8 has its own form).
    expect(await startManualEvaluation(teacher, refs[1])).toEqual({ ok: false, reason: "not_open" });
    expect(await startManualEvaluation(teacher, { ...refs[0], versionNumber: 2 })).toEqual({ ok: false, reason: "changed" });
    expect(await startManualEvaluation(await createUser("teacher"), refs[0])).toBeNull();
    await expect(startManualEvaluation(students[0], refs[0])).rejects.toBeInstanceOf(AccessDeniedError);
    // The refused calls log nothing: still the one entry, none for the copy to review.
    expect(await manualStarted(refs[0].submissionId)).toEqual(logged);
    expect(await manualStarted(refs[1].submissionId)).toEqual([]);
  });
});

describe("PRC-02 CA4, SUB-01 CA2: whatever the failure, the student sees 'Submitted, being marked'", () => {
  const states = [
    ["evaluating", { status: "evaluating", claimToken: "test-claim" }],
    ["evaluation failed", { status: "evaluation_failed" }],
    ["not assessable, no content", { status: "not_assessable", notAssessableCause: "no_content" }],
    ["not assessable, rubric unavailable", { status: "not_assessable", notAssessableCause: "rubric_unavailable" }],
    ["not assessable, AI unavailable", { status: "not_assessable", notAssessableCause: "ai_unavailable" }],
    ["to review", { status: "to_review" }],
  ] as const;

  it.each(states)("%s", async (_, state) => {
    const { students, refs, assignmentId } = await assignment("en", [TEXT.en]);
    await db.update(submissions).set(state).where(eq(submissions.id, refs[0].submissionId));
    const detail = await getStudentAssignment(students[0], assignmentId);
    const [listed] = await listStudentAssignments(students[0]);
    expect(detail?.status).toBe("being_marked");
    expect(listed.status).toBe("being_marked");
    // Nothing technical travels with it: no internal state, no cause.
    for (const shown of [JSON.stringify(detail), JSON.stringify(listed)]) {
      expect(shown).not.toMatch(/evaluat|fail|assessable|unavailable|no_content|to_review/i);
    }
  });
});
