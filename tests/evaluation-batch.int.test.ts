import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { EVALUATION_STUCK_AFTER_MS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator, SimulatorEvaluator, type Evaluator, type SimulatedFault } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import { aiProposals, classMemberships, evaluationRuns, securityEvents, submissions, users } from "@/server/db/schema";
import { getCaptureSender } from "@/server/email";
import type { AiGuardState } from "@/server/evaluation/budget";
import { evaluateSubmission, type EvaluationDeps, type EvaluationOutcome } from "@/server/evaluation/evaluate";
import { orchestrate } from "@/server/evaluation/orchestrate";
import { evaluateStep } from "@/server/evaluation/steps";
import { sweepEvaluations } from "@/server/evaluation/sweep";
import { submitStudentText } from "@/server/submissions/submissions";
import { recordTriggers } from "./helpers/triggers";

// E6.2, PRC-01 R3, CA3 and CA4, EXP-02: the batch on the simulator. Many
// accounts submit at once; at most EVALUATION_CONCURRENCY evaluate together;
// a failure stays with its submission; a stopped process loses nothing and
// duplicates nothing; the cost cap and the circuit breaker stop the calls.
// The steps run as plain functions, the workflow's body through orchestrate()
// with a short real wait (Workflows itself runs in the E2E).

const BODY =
  "my town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park near the river. " +
  "My grandparents lives in the old part of the town, where the streets are narrow and the houses are white.";

let count = 0;
async function createUser(role: "student" | "teacher" | "admin"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

/**
 * One teacher's assignment, sent to a class of `size` students, each of whom
 * submits at once a text that begins with a marker of their own. The refs in
 * the order of the students, and each one's marker.
 */
async function batch(size: number) {
  const teacher = await createUser("teacher");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  const students = await Promise.all(
    Array.from({ length: size }, async () => {
      const student = await createUser("student");
      await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
      await acknowledgeNotice(student, STUDENT_NOTICE.version);
      return student;
    }),
  );
  const markers = students.map((_, i) => `MARKER${i}x${randomUUID().slice(0, 8)}`);
  const triggers = students.map(() => recordTriggers());
  await Promise.all(
    students.map((student, i) =>
      submitStudentText(
        student,
        { assignmentId: created.assignmentId, contentVersion: "1", requestId: randomUUID(), text: `${markers[i]} ${BODY}` },
        triggers[i],
      ),
    ),
  );
  const refs = triggers.map((t) => {
    if (t.refs.length !== 1) throw new Error("Not submitted once");
    return t.refs[0];
  });
  return { refs, markers };
}

const SLOTS = { concurrency: 10, stuckAfterMs: EVALUATION_STUCK_AFTER_MS };
const deps = (evaluator: Evaluator, over: Partial<EvaluationDeps> = {}): EvaluationDeps => ({
  evaluator, registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000, ...over,
});

/** The workflow's body around the step, waiting 50 ms instead of 15 s for a place. */
const run = (ref: EvaluationRef, step: (ref: EvaluationRef) => Promise<EvaluationOutcome> = evaluateStep) =>
  orchestrate(ref, { evaluate: step, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 50))) });

/** The step with an evaluator of the test's own: the same claim, places and guard as evaluateStep. */
const stepWith = (evaluator: Evaluator, over: Partial<EvaluationDeps> = {}) => (ref: EvaluationRef) =>
  evaluateSubmission(ref.submissionId, deps(evaluator, over), { expectedVersion: ref.versionNumber, slots: SLOTS });

/** A simulator per submission, with that submission's own faults: one failure never travels to another copy. */
function perSubmission(faults: Map<string, { fault: SimulatedFault; times: number }>): Evaluator {
  const simulators = new Map<string, SimulatorEvaluator>();
  return {
    provider: "simulator",
    model: "simulator",
    evaluate(request, context) {
      const id = context.subjectId ?? "";
      let simulator = simulators.get(id);
      if (!simulator) {
        simulator = new SimulatorEvaluator();
        const planned = faults.get(id);
        if (planned) simulator.failNext(planned.fault, planned.times);
        simulators.set(id, simulator);
      }
      return simulator.evaluate(request, context);
    },
  };
}

const states = async (ids: string[]) =>
  Object.fromEntries(
    (await db.select({ id: submissions.id, status: submissions.status, cause: submissions.notAssessableCause }).from(submissions).where(inArray(submissions.id, ids)))
      .map((row) => [row.id, row.cause ? `${row.status}/${row.cause}` : row.status]),
  );
const evaluatingCount = async () =>
  (await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.status, "evaluating"))).length;
const runsOf = (id: string) => db.select().from(evaluationRuns).where(eq(evaluationRuns.submissionId, id));
const FINAL = new Set(["to_review", "evaluation_failed", "not_assessable"]);

/** The process stopped long ago: every submission was claimed or received more than EVALUATION_STUCK_AFTER_MS and TRIGGER_GRACE_MS ago. */
const age = (ids: string[]) =>
  db.update(submissions).set({ updatedAt: sql`now() - interval '11 minutes'` }).where(inArray(submissions.id, ids));

beforeEach(() => {
  getSimulator().clear();
  getCaptureSender().clear();
});

describe("PRC-01 CA3: a batch submitted at once by many accounts", () => {
  it("every proposal quotes its own copy only, and every submission reaches a final state", { timeout: 180_000 }, async () => {
    const { refs, markers } = await batch(24);
    const outcomes = await Promise.all(refs.map((ref) => run(ref)));
    expect(outcomes.every((o) => o.status === "to_review")).toBe(true);

    const proposals = await db
      .select({ submissionId: aiProposals.submissionId, quotes: sql<string[]>`${aiProposals.quotesTask} || ${aiProposals.quotesOrganization} || ${aiProposals.quotesVocabulary} || ${aiProposals.quotesGrammar} || ${aiProposals.quotesMechanics}` })
      .from(aiProposals);
    expect(proposals).toHaveLength(refs.length);
    for (const [i, ref] of refs.entries()) {
      const own = proposals.filter((p) => p.submissionId === ref.submissionId);
      expect(own).toHaveLength(1);
      for (const quote of own[0].quotes) {
        expect(quote).toContain(markers[i]);
        for (const [j, other] of markers.entries()) if (j !== i) expect(quote).not.toContain(other);
      }
      // The proposal is current and the run is the version's.
      const [row] = await db.select({ status: submissions.status, current: submissions.currentProposalId }).from(submissions).where(eq(submissions.id, ref.submissionId));
      expect(row).toMatchObject({ status: "to_review", current: expect.any(String) });
      expect(await runsOf(ref.submissionId)).toHaveLength(1);
    }
  });
});

describe("PRC-01 R3: EVALUATION_CONCURRENCY at once, the others wait their turn", () => {
  it("12 at once: 10 evaluate, 2 are busy and change nothing; once freed, they are evaluated", { timeout: 120_000 }, async () => {
    const { refs } = await batch(12);
    const releases = refs.map(() => getSimulator().holdNext());
    const pending = refs.map((ref) => evaluateStep(ref));
    await expect.poll(evaluatingCount, { timeout: 60_000 }).toBe(10);

    // The two refused a place answered at once, and stay received.
    const answered: number[] = [];
    pending.forEach((p, i) => void p.then(() => answered.push(i)));
    await expect.poll(() => answered.length, { timeout: 30_000 }).toBe(2);
    const busy = answered.map((i) => refs[i]);
    for (const i of answered) expect(await pending[i]).toEqual({ status: "busy" });
    expect(Object.values(await states(busy.map((r) => r.submissionId)))).toEqual(["received", "received"]);
    expect(await evaluatingCount()).toBe(10);
    expect(answered).toHaveLength(2);

    for (const release of releases) release();
    await Promise.all(pending);
    for (const ref of busy) expect(await run(ref)).toMatchObject({ status: "to_review" });
    expect(new Set(Object.values(await states(refs.map((r) => r.submissionId))))).toEqual(new Set(["to_review"]));
    expect(await db.select().from(evaluationRuns)).toHaveLength(12);
  });

  it("a submission stuck evaluating holds no place", { timeout: 60_000 }, async () => {
    const { refs } = await batch(2);
    const one = { concurrency: 1, stuckAfterMs: EVALUATION_STUCK_AFTER_MS };
    const step = (ref: EvaluationRef) =>
      evaluateSubmission(ref.submissionId, deps(getSimulator(), { callTimeoutMs: 60_000 }), { expectedVersion: ref.versionNumber, slots: one });
    const release = getSimulator().holdNext();
    const first = step(refs[0]);
    await expect.poll(evaluatingCount, { timeout: 30_000 }).toBe(1);
    expect(await step(refs[1])).toEqual({ status: "busy" });

    await age([refs[0].submissionId]);
    expect(await step(refs[1])).toMatchObject({ status: "to_review" });
    release();
    await first;
  });
});

describe("PRC-01 CA4: a failing submission never stops the others", () => {
  it("a lasting 529, a passing 529, a refusal and a budget error each stay with their copy", { timeout: 120_000 }, async () => {
    const { refs } = await batch(8);
    const [lasting, passing, refusal, budget] = refs.map((r) => r.submissionId);
    const evaluator = perSubmission(
      new Map([
        [lasting, { fault: { kind: "error", status: 529 }, times: 3 }],
        [passing, { fault: { kind: "error", status: 529 }, times: 1 }],
        [refusal, { fault: { kind: "refusal", category: "general_harms" }, times: 3 }],
        [budget, { fault: { kind: "error", status: 402 }, times: 3 }],
      ]),
    );
    const outcomes = await Promise.all(refs.map((ref) => run(ref, stepWith(evaluator))));
    expect(outcomes.slice(0, 4)).toMatchObject([
      { status: "evaluation_failed", attempts: 3, errors: ["unavailable", "unavailable", "unavailable"] },
      { status: "to_review", attempts: 2, errors: ["unavailable"] },
      { status: "evaluation_failed", attempts: 1, errors: ["refused"] },
      { status: "not_assessable", attempts: 1, errors: ["budget"] },
    ]);
    for (const outcome of outcomes.slice(4)) expect(outcome).toMatchObject({ status: "to_review", attempts: 1 });
    const final = await states(refs.map((r) => r.submissionId));
    expect(final[budget]).toBe("not_assessable/ai_unavailable");
    expect(Object.values(final).every((s) => FINAL.has(s.split("/")[0]))).toBe(true);
  });

  it("a process stopped mid-batch, then the sweep: no submission lost, none evaluated twice", { timeout: 120_000 }, async () => {
    const { refs } = await batch(6);
    const ids = refs.map((r) => r.submissionId);
    // Three were being evaluated when the process stopped; three were never started (the start failed).
    const releases = refs.slice(0, 3).map(() => getSimulator().holdNext());
    const abandoned = refs.slice(0, 3).map((ref) => evaluateStep(ref));
    await expect.poll(evaluatingCount, { timeout: 30_000 }).toBe(3);
    await age(ids);

    const started: EvaluationRef[] = [];
    const swept = await sweepEvaluations(async (ref) => void started.push(ref));
    expect(swept.released.sort()).toEqual(ids.slice(0, 3).sort());
    expect(started).toEqual(expect.arrayContaining(refs.slice(3)));
    expect(started).toHaveLength(3);
    for (const ref of started) expect(await run(ref)).toMatchObject({ status: "to_review" });

    // The stopped evaluations' answers arrive at last: kept, never current.
    for (const release of releases) release();
    expect((await Promise.all(abandoned)).map((o) => o.status)).toEqual(["stale", "stale", "stale"]);

    const final = await states(ids);
    expect(ids.map((id) => final[id])).toEqual([
      "evaluation_failed", "evaluation_failed", "evaluation_failed", "to_review", "to_review", "to_review",
    ]);
    for (const id of ids) expect(await runsOf(id)).toHaveLength(1);
    const current = await db.select({ id: submissions.id, proposal: submissions.currentProposalId }).from(submissions).where(inArray(submissions.id, ids));
    expect(current.filter((c) => c.proposal !== null)).toHaveLength(3);
    // A second sweep, a step delivered again: nothing more.
    expect(await sweepEvaluations(async (ref) => void started.push(ref))).toEqual({ released: [], restarted: [] });
    expect(await evaluateStep(refs[0])).toEqual({ status: "skipped" });
    expect(await db.select().from(evaluationRuns)).toHaveLength(6);
  });
});

describe("EXP-02: the monthly cost cap", () => {
  it("reached: the next submissions become \"AI unavailable\" without any call; the administrator is told once", { timeout: 60_000 }, async () => {
    const admin = await createUser("admin");
    const { refs } = await batch(3);
    // This month's Anthropic runs already cost 50 M prompt tokens × 0.10 $/MTok × 1.1 = 5.50 $, over the 5 $ cap.
    await db.insert(evaluationRuns).values({
      submissionId: refs[0].submissionId, versionNumber: 1, outcome: "failed", provider: "anthropic",
      modelRequested: "claude-haiku-5-5", promptVersion: "evaluation-2", rubricVersion: "en-1",
      attempts: 1, attemptErrors: ["unavailable"], durationMs: 1, promptTokens: 50_000_000, completionTokens: 0, totalTokens: 50_000_000,
    });

    const outcomes = await Promise.all(refs.map((ref) => run(ref)));
    expect(outcomes).toEqual(refs.map(() => expect.objectContaining({ status: "not_assessable", attempts: 0, errors: [] })));
    expect(getSimulator().captured()).toEqual([]);
    expect(new Set(Object.values(await states(refs.map((r) => r.submissionId))))).toEqual(new Set(["not_assessable/ai_unavailable"]));
    const [run1] = (await runsOf(refs[1].submissionId));
    expect(run1).toMatchObject({ outcome: "not_assessable", notAssessableCause: "ai_unavailable", attempts: 0, modelRequested: null });

    const alerts = getCaptureSender().captured().filter((m) => m.kind === "ai_alert");
    expect(alerts).toHaveLength(1);
    const [adminRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, admin.userId));
    expect(alerts[0]).toMatchObject({ to: adminRow.email, subject: "AI stopped: monthly cost cap reached" });
    expect(alerts[0].text).not.toMatch(/MARKER/);
    expect(await db.select().from(securityEvents).where(eq(securityEvents.type, "ai_cost_cap_reached"))).toHaveLength(1);
  });

  it("reached after a call: no further attempt, \"AI unavailable\"", async () => {
    const { refs } = await batch(1);
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status: 529 });
    const answers: AiGuardState[] = ["open", "cost_cap"];
    const outcome = await stepWith(simulator, { guard: async () => answers.shift() ?? "open" })(refs[0]);
    expect(outcome).toMatchObject({ status: "not_assessable", attempts: 1, errors: ["unavailable"] });
    expect(simulator.captured()).toHaveLength(1);
    expect(await states([refs[0].submissionId])).toEqual({ [refs[0].submissionId]: "not_assessable/ai_unavailable" });
  });

  it("not reached: the simulator's runs and last month's never count", async () => {
    const { refs } = await batch(2);
    await db.insert(evaluationRuns).values([
      {
        submissionId: refs[0].submissionId, versionNumber: 1, outcome: "failed", provider: "simulator",
        modelRequested: "simulator", promptVersion: "evaluation-2", rubricVersion: "en-1",
        attempts: 1, attemptErrors: ["unavailable"], durationMs: 1, promptTokens: 90_000_000, completionTokens: 0, totalTokens: 90_000_000,
      },
      {
        submissionId: refs[0].submissionId, versionNumber: 1, outcome: "failed", provider: "anthropic",
        modelRequested: "claude-haiku-5-5", promptVersion: "evaluation-2", rubricVersion: "en-1",
        attempts: 1, attemptErrors: ["unavailable"], durationMs: 1, promptTokens: 90_000_000, completionTokens: 0, totalTokens: 90_000_000,
        createdAt: sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' - interval '1 second'`,
      },
    ]);
    expect(await run(refs[1])).toMatchObject({ status: "to_review" });
  });
});

describe("the circuit breaker [P]", () => {
  it("3 submissions failed on access within the window: the next ones end evaluation_failed without a call", { timeout: 60_000 }, async () => {
    await createUser("admin");
    const { refs } = await batch(5);
    getSimulator().failNext({ kind: "error", status: 401 }, 3);
    for (const ref of refs.slice(0, 3)) expect(await run(ref)).toMatchObject({ status: "evaluation_failed", attempts: 1, errors: ["configuration"] });
    expect(getSimulator().captured()).toHaveLength(3);

    for (const ref of refs.slice(3)) expect(await run(ref)).toEqual({ status: "evaluation_failed", attempts: 0, durationMs: expect.any(Number), errors: [] });
    expect(getSimulator().captured()).toHaveLength(3);
    for (const ref of refs.slice(3)) expect(await runsOf(ref.submissionId)).toEqual([]);
    expect(getCaptureSender().captured().filter((m) => m.subject === "AI stopped: repeated access errors")).toHaveLength(1);
    expect(await db.select().from(securityEvents).where(eq(securityEvents.type, "ai_breaker_tripped"))).toHaveLength(1);
  });

  it("budget, refusals and overloads never open it", { timeout: 60_000 }, async () => {
    const { refs } = await batch(4);
    getSimulator().failNext({ kind: "error", status: 402 }, 1);
    getSimulator().failNext({ kind: "refusal", category: null }, 1);
    getSimulator().failNext({ kind: "max_tokens" }, 1);
    for (const ref of refs.slice(0, 3)) await run(ref);
    expect(await run(refs[3])).toMatchObject({ status: "to_review", attempts: 1 });
  });
});

describe("the sweep leaves alone what is not late", () => {
  it("a received text within its grace, an evaluation under way", { timeout: 60_000 }, async () => {
    const { refs } = await batch(2);
    const release = getSimulator().holdNext();
    const pending = evaluateStep(refs[0]);
    await expect.poll(evaluatingCount, { timeout: 30_000 }).toBe(1);
    expect(await sweepEvaluations(async () => {})).toEqual({ released: [], restarted: [] });
    release();
    expect(await pending).toMatchObject({ status: "to_review" });
    expect(await states([refs[1].submissionId])).toEqual({ [refs[1].submissionId]: "received" });
  });
});
