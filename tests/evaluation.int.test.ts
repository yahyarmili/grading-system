import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { PROMPT_VERSION } from "@/server/ai/request";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { canTransition } from "@/lib/submission-status";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { SimulatorEvaluator, type Evaluator } from "@/server/ai";
import { createAnthropicEvaluator } from "@/server/ai/anthropic";
import { getCurrentProposal } from "@/server/data/evaluation/proposals";
import { replaceText, submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import {
  aiProposals,
  assignmentClasses,
  assignments,
  classes,
  classMemberships,
  evaluationRuns,
  noticeAcknowledgements,
  submissions,
  submissionVersions,
  users,
} from "@/server/db/schema";
import { evaluateAssignment, evaluateSubmission, type EvaluationDeps } from "@/server/evaluation/evaluate";
import { FR_TEST_RUBRIC } from "./fixtures/rubric-fr-test";

// EVL-03 CA1, CA2 (R3) and CA4, with the simulator: transitions 2 and 5, the
// bounded attempts, the proposal stored once and never changed, a replaced
// text that leaves the old evaluation kept and not current (SUB-05 R2).
// EVL-04 CA1 and CA2, EVL-01 CA4: the alerts, and the French guard.

// Both over SHORT_TEXT_MIN_WORDS: no "very short" alert unless a test wants one.
const TEXT =
  "My town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park near the river. " +
  "My grandparents lives in the old part of the town, where the streets are narrow and the houses are white.";
const NEW_TEXT =
  "My town has a river and an old bridge. On sunday we walk along the river with my grandparents. " +
  "There is also a small library where I borrow books every week, and a café where my father drinks his coffee with his friends. " +
  "In summer the town is full of tourists who take photos of the bridge and buy souvenirs in the little shops.";
const FRENCH_TEXT =
  "Ma ville est petite mais elle est très belle. Il y a un marché tous les vendredis et les gens sont gentils. " +
  "Le matin, je vais à l'école avec ma sœur, et le soir nous jouons au football dans le parc près de la rivière. " +
  "Mes grands-parents habitent dans la vieille ville, où les rues sont étroites et les maisons sont blanches.";

type World = { teacher: Actor; student: Actor; assignmentId: string; submissionId: string };

async function user(role: "student" | "teacher"): Promise<Actor> {
  const id = randomUUID();
  await db.insert(users).values({
    id, email: `${role}-${id}@example.test`, emailVerified: true, name: role, firstName: role, lastName: "User", role,
  });
  return { kind: "user", userId: id, role };
}

/** A teacher's assignment, sent to a class where a student who read the notice submitted `text`. */
async function world(text = TEXT, language: "en" | "fr" = "en"): Promise<World> {
  const teacher = await user("teacher");
  const student = await user("student");
  if (teacher.kind !== "user" || student.kind !== "user") throw new Error("unreachable");
  const [klass] = await db
    .insert(classes)
    .values({ teacherId: teacher.userId, name: "Class", inviteNonce: "n", inviteLinkDigest: randomUUID(), inviteCodeDigest: randomUUID() })
    .returning({ id: classes.id });
  await db.insert(classMemberships).values({ classId: klass.id, studentId: student.userId });
  await db.insert(noticeAcknowledgements).values({ userId: student.userId, notice: "student_submission", version: STUDENT_NOTICE.version });
  const [assignment] = await db
    .insert(assignments)
    .values({
      teacherId: teacher.userId, title: "My town", subject: "Describe your town.", level: "B1", language,
      deadline: new Date(Date.now() + 24 * 3600 * 1000),
    })
    .returning({ id: assignments.id });
  await db.insert(assignmentClasses).values({ assignmentId: assignment.id, classId: klass.id, teacherId: teacher.userId });
  const submitted = await submitText(student, { assignmentId: assignment.id, contentVersion: 1, requestId: randomUUID(), text });
  if (!submitted?.ok) throw new Error("Not submitted");
  const [row] = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.assignmentId, assignment.id));
  return { teacher, student, assignmentId: assignment.id, submissionId: row.id };
}

const deps = (evaluator: Evaluator, over: Partial<EvaluationDeps> = {}): EvaluationDeps => ({
  evaluator, registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000, ...over,
});

const submissionRow = async (id: string) =>
  (await db
    .select({
      status: submissions.status,
      currentVersion: submissions.currentVersion,
      currentProposalId: submissions.currentProposalId,
      notAssessableCause: submissions.notAssessableCause,
    })
    .from(submissions)
    .where(eq(submissions.id, id)))[0];

const runsOf = (id: string) =>
  db.select().from(evaluationRuns).where(eq(evaluationRuns.submissionId, id)).orderBy(evaluationRuns.createdAt);
const proposalsOf = (id: string) =>
  db.select().from(aiProposals).where(eq(aiProposals.submissionId, id)).orderBy(aiProposals.createdAt);

/** The database's own error behind a refused query (Drizzle wraps it): its message and constraint. */
async function databaseError(query: PromiseLike<unknown>): Promise<{ message: string; constraint?: string }> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { message: string; constraint?: string } }).cause;
    if (cause) return { message: cause.message, constraint: cause.constraint };
    throw error;
  }
  throw new Error("The query was not refused");
}

const replace = (w: World, text = NEW_TEXT) => replaceText(w.student, { assignmentId: w.assignmentId, requestId: randomUUID(), text });

describe("EVL-03 CA1: received → evaluating → to_review, with a complete proposal", () => {
  it("stores the proposal, points the submission to it and records the run", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.setLevels({ task: 4, organization: 3, vocabulary: 2, grammar: 1, mechanics: 0 });
    // Held during the call: the submission is seen evaluating.
    const release = simulator.holdNext();
    const evaluation = evaluateSubmission(w.submissionId, deps(simulator));
    await vi.waitFor(() => expect(simulator.captured()).toHaveLength(1), { timeout: 10_000 });
    expect((await submissionRow(w.submissionId)).status).toBe("evaluating");
    release();
    expect(await evaluation).toMatchObject({ status: "to_review", attempts: 1, errors: [] });

    const [proposal] = await proposalsOf(w.submissionId);
    expect(await submissionRow(w.submissionId)).toEqual({
      status: "to_review", currentVersion: 1, currentProposalId: proposal.id, notAssessableCause: null,
    });
    expect(proposal).toMatchObject({
      versionNumber: 1, levelTask: 4, levelOrganization: 3, levelVocabulary: 2, levelGrammar: 1, levelMechanics: 0,
      proposedGrade: 10, alerts: [],
    });
    const [run] = await runsOf(w.submissionId);
    expect(run).toMatchObject({
      id: proposal.runId, outcome: "proposed", provider: "simulator", modelRequested: "simulator", modelAnswered: "simulator",
      providerAnswered: null, promptVersion: PROMPT_VERSION, rubricVersion: "en-1", attempts: 1, attemptErrors: [],
      notAssessableCause: null,
    });
    expect(run.durationMs).toBeGreaterThanOrEqual(0);

    // The owner teacher reads it, levels, remarks and grade; nothing else.
    const read = await getCurrentProposal(w.teacher, w.submissionId);
    expect(read).toMatchObject({ versionNumber: 1, proposedGrade: 10, alerts: [], nextSteps: [expect.any(String)] });
    expect(Object.keys(read!).sort()).toEqual(["alerts", "criteria", "generalComment", "nextSteps", "proposedGrade", "versionNumber"]);
    expect(read!.criteria.task).toEqual({ level: 4, justification: expect.any(String), quotes: [expect.stringContaining("My town")] });
  });

  it("stores the model's flags as alerts", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    const evaluator: Evaluator = {
      provider: "simulator",
      model: "simulator",
      evaluate: async (request, context) => {
        const response = await simulator.evaluate(request, context);
        const answer = JSON.parse(response.content);
        answer.flags = { other_language: false, off_topic: true, addressed_to_marker: true };
        return { ...response, content: JSON.stringify(answer) };
      },
    };
    expect((await evaluateSubmission(w.submissionId, deps(evaluator))).status).toBe("to_review");
    expect((await proposalsOf(w.submissionId))[0].alerts).toEqual(["off_topic", "addressed_to_marker"]);
  });

  it("skips a submission that is not received, and evaluates an assignment one submission after the other", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    expect(await evaluateAssignment(w.assignmentId, deps(simulator))).toEqual([
      { submissionId: w.submissionId, outcome: expect.objectContaining({ status: "to_review" }) },
    ]);
    expect(await evaluateSubmission(w.submissionId, deps(simulator))).toEqual({ status: "skipped" });
    expect(await evaluateAssignment(w.assignmentId, deps(simulator))).toEqual([]);
    expect(simulator.captured()).toHaveLength(1);
  });
});

describe("EVL-03 CA2 and R3: a non-conform answer is never stored; attempts are bounded", () => {
  it("fails after three refused answers, each code kept, without a proposal", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "invalid_output", variant: "not_json" });
    simulator.failNext({ kind: "invalid_output", variant: "level_out_of_range" });
    simulator.failNext({ kind: "missing_quote" });
    const sleep = vi.fn(async () => {});
    expect(await evaluateSubmission(w.submissionId, deps(simulator, { sleep }))).toMatchObject({
      status: "evaluation_failed", attempts: 3, errors: ["not_json", "schema", "quote_not_found"],
    });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(await proposalsOf(w.submissionId)).toEqual([]);
    expect(await submissionRow(w.submissionId)).toMatchObject({ status: "evaluation_failed", currentProposalId: null });
    const [run] = await runsOf(w.submissionId);
    expect(run).toMatchObject({ outcome: "failed", attempts: 3, attemptErrors: ["not_json", "schema", "quote_not_found"] });
    expect(simulator.captured()).toHaveLength(3);
  });

  it.each([
    ["missing_criterion"], ["non_integer_level"], ["empty_justification"],
  ] as const)("refuses %s as schema", async (variant) => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "invalid_output", variant });
    expect(await evaluateSubmission(w.submissionId, deps(simulator))).toMatchObject({
      status: "to_review", attempts: 2, errors: ["schema"],
    });
    expect(await proposalsOf(w.submissionId)).toHaveLength(1);
  });

  it("retries a timeout and succeeds on the second attempt", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "timeout" });
    expect(await evaluateSubmission(w.submissionId, deps(simulator, { callTimeoutMs: 100 }))).toMatchObject({
      status: "to_review", attempts: 2, errors: ["timeout"],
    });
  });

  it("stops at once on a refused access (401), and waits as asked after a rate limit", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status: 401 });
    expect(await evaluateSubmission(w.submissionId, deps(simulator))).toMatchObject({
      status: "evaluation_failed", attempts: 1, errors: ["configuration"],
    });

    const other = await world();
    simulator.clear();
    simulator.failNext({ kind: "error", status: 429, retryAfterMs: 3_000 });
    simulator.failNext({ kind: "error", status: 429, retryAfterMs: 999_000 });
    const sleep = vi.fn(async () => {});
    // E6: a wait longer than AI_RETRY_MAX_WAIT_MS stops the attempts, never calls again too early.
    expect(await evaluateSubmission(other.submissionId, deps(simulator, { sleep }))).toMatchObject({
      status: "evaluation_failed", attempts: 2, errors: ["rate_limited", "rate_limited"],
    });
    expect(sleep.mock.calls).toEqual([[3_000]]);
    expect(simulator.captured()).toHaveLength(2);
  });

  it("waits a Retry-After of AI_RETRY_MAX_WAIT_MS exactly, then calls again", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status: 429, retryAfterMs: 30_000 });
    const sleep = vi.fn(async () => {});
    expect(await evaluateSubmission(w.submissionId, deps(simulator, { sleep }))).toMatchObject({
      status: "to_review", attempts: 2, errors: ["rate_limited"],
    });
    expect(sleep.mock.calls).toEqual([[30_000]]);
  });

  it("stops at once on a refusal (E5.12): one attempt, refused, its billed usage kept; the teacher may still ask again", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "refusal", category: "general_harms" }, 3);
    const sleep = vi.fn(async () => {});
    expect(await evaluateSubmission(w.submissionId, deps(simulator, { sleep }))).toMatchObject({
      status: "evaluation_failed", attempts: 1, errors: ["refused"],
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(simulator.captured()).toHaveLength(1);
    expect(await proposalsOf(w.submissionId)).toEqual([]);
    const [run] = await runsOf(w.submissionId);
    expect(run).toMatchObject({
      outcome: "failed", attempts: 1, attemptErrors: ["refused"], promptTokens: 1000, completionTokens: 10, totalTokens: 1010,
    });
    expect(await submissionRow(w.submissionId)).toMatchObject({ status: "evaluation_failed" });
    // Never retried automatically, but the manual retry (transition 6) stays open.
    expect(canTransition(6, "evaluation_failed", "evaluating")).toBe(true);
  });

  it("stops at once on an answer cut at max_tokens (E6): truncated, its billed usage kept, never retried", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "max_tokens" });
    expect(await evaluateSubmission(w.submissionId, deps(simulator))).toMatchObject({
      status: "evaluation_failed", attempts: 1, errors: ["truncated"],
    });
    expect(simulator.captured()).toHaveLength(1);
    const [run] = await runsOf(w.submissionId);
    expect(run).toMatchObject({ outcome: "failed", attemptErrors: ["truncated"], completionTokens: 4000 });
  });

  it.each([
    ["an overload (529), retried", { kind: "error", status: 529 }, "to_review", 2, "unavailable"],
    ["a billing error (402)", { kind: "error", status: 402 }, "not_assessable", 1, "budget"],
    ["the Console's spending limit", { kind: "spend_limit" }, "not_assessable", 1, "budget"],
  ] as const)("handles %s", async (_label, fault, status, attempts, error) => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext(fault, attempts === 2 ? 1 : 3);
    expect(await evaluateSubmission(w.submissionId, deps(simulator))).toMatchObject({ status, attempts, errors: [error] });
    expect(simulator.captured()).toHaveLength(attempts);
  });

  it("makes a budget error \"AI unavailable\" [P]: a failed run, the submission not assessable, no proposal (E6)", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status: 402 });
    await evaluateSubmission(w.submissionId, deps(simulator));
    expect(await submissionRow(w.submissionId)).toMatchObject({ status: "not_assessable", notAssessableCause: "ai_unavailable", currentProposalId: null });
    expect(await runsOf(w.submissionId)).toMatchObject([{ outcome: "failed", attempts: 1, attemptErrors: ["budget"], notAssessableCause: null }]);
    expect(await proposalsOf(w.submissionId)).toEqual([]);
  });

  it("ends on internal when the security log fails: nothing is sent, the submission is not left evaluating", async () => {
    const w = await world();
    const fetcher = vi.fn(async () => new Response("{}"));
    const adapter = createAnthropicEvaluator({
      apiKey: "test-key", env: {}, fetcher,
      journal: async () => {
        throw new Error("log down");
      },
    });
    expect(await evaluateSubmission(w.submissionId, deps(adapter))).toMatchObject({
      status: "evaluation_failed", attempts: 1, errors: ["internal"],
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await runsOf(w.submissionId))[0]).toMatchObject({ outcome: "failed", provider: "anthropic", attemptErrors: ["internal"] });
  });
});

describe("EVL-03 CA4: a proposal never changes; a new evaluation is a new run", () => {
  it("keeps the first evaluation intact and not current after a replacement and a new evaluation", { timeout: 60_000 }, async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    expect((await evaluateSubmission(w.submissionId, deps(simulator))).status).toBe("to_review");
    const [firstRun] = await runsOf(w.submissionId);
    const [firstProposal] = await proposalsOf(w.submissionId);

    // Transition 11 empties the pointer in the same statement.
    expect(await replace(w)).toMatchObject({ ok: true });
    expect(await submissionRow(w.submissionId)).toMatchObject({ status: "received", currentVersion: 2, currentProposalId: null });
    expect(await getCurrentProposal(w.teacher, w.submissionId)).toBeNull();

    simulator.setLevels(3);
    expect((await evaluateSubmission(w.submissionId, deps(simulator))).status).toBe("to_review");
    const runs = await runsOf(w.submissionId);
    const proposals = await proposalsOf(w.submissionId);
    expect(runs).toHaveLength(2);
    expect(proposals).toHaveLength(2);
    expect(runs[0]).toEqual(firstRun);
    expect(proposals[0]).toEqual(firstProposal);
    expect(proposals[1]).toMatchObject({ versionNumber: 2, proposedGrade: 15 });
    expect((await submissionRow(w.submissionId)).currentProposalId).toBe(proposals[1].id);
    expect((await getCurrentProposal(w.teacher, w.submissionId))?.versionNumber).toBe(2);
    // The text sent the second time is the new one.
    expect(JSON.parse(simulator.captured()[1].request.user).student_text).toBe(NEW_TEXT);
  });

  it("refuses any change or removal of a run or a proposal, and any change of an evaluated text", { timeout: 60_000 }, async () => {
    const w = await world();
    await evaluateSubmission(w.submissionId, deps(new SimulatorEvaluator()));
    for (const change of [
      db.update(aiProposals).set({ levelTask: 4, proposedGrade: 12 }),
      db.delete(aiProposals),
      db.update(evaluationRuns).set({ attempts: 2 }),
      db.delete(evaluationRuns),
      db.update(submissionVersions).set({ text: "Rewritten." }),
    ]) {
      expect(await databaseError(change)).toMatchObject({ message: expect.stringMatching(/never change/) });
    }
    expect((await proposalsOf(w.submissionId))[0].levelTask).toBe(2);
  });

  it("refuses a pointer to another submission's or another version's proposal, or in a state without one", { timeout: 60_000 }, async () => {
    const w = await world();
    const other = await world();
    const simulator = new SimulatorEvaluator();
    await evaluateSubmission(w.submissionId, deps(simulator));
    await evaluateSubmission(other.submissionId, deps(simulator));
    const [own] = await proposalsOf(w.submissionId);
    const [foreign] = await proposalsOf(other.submissionId);
    const point = (id: string, set: Partial<typeof submissions.$inferInsert>) =>
      db.update(submissions).set(set).where(eq(submissions.id, id));

    const fk = { constraint: "submissions_current_proposal_fk" };
    const state = { constraint: "submissions_current_proposal_status" };
    expect(await databaseError(point(w.submissionId, { currentProposalId: foreign.id }))).toMatchObject(fk);
    // A newer version with the old proposal still pointed: refused.
    await db.insert(submissionVersions).values({ submissionId: w.submissionId, number: 2, mode: "text", text: NEW_TEXT, requestId: randomUUID() });
    expect(await databaseError(point(w.submissionId, { currentVersion: 2 }))).toMatchObject(fk);
    expect(await databaseError(point(w.submissionId, { status: "received" }))).toMatchObject(state);
    expect(await databaseError(point(w.submissionId, { status: "evaluation_failed" }))).toMatchObject(state);
    expect(await submissionRow(w.submissionId)).toMatchObject({ status: "to_review", currentVersion: 1, currentProposalId: own.id });
  });
});

describe("SUB-05 R2: a result on a version no longer active is kept, not current", () => {
  it("keeps the proposal of a text replaced during the call, and leaves the new text received", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    const release = simulator.holdNext();
    const evaluation = evaluateSubmission(w.submissionId, deps(simulator));
    await vi.waitFor(() => expect(simulator.captured()).toHaveLength(1), { timeout: 10_000 });
    expect(await replace(w)).toMatchObject({ ok: true });
    release();
    expect(await evaluation).toMatchObject({ status: "stale", attempts: 1 });

    expect(await submissionRow(w.submissionId)).toEqual({
      status: "received", currentVersion: 2, currentProposalId: null, notAssessableCause: null,
    });
    const [run] = await runsOf(w.submissionId);
    expect(run).toMatchObject({ outcome: "proposed", versionNumber: 1 });
    expect(await proposalsOf(w.submissionId)).toEqual([expect.objectContaining({ runId: run.id, versionNumber: 1 })]);
    expect(await getCurrentProposal(w.teacher, w.submissionId)).toBeNull();
  });

  it("stops on superseded before a new attempt: the replaced text is not sent again", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "invalid_output", variant: "not_json" });
    const sleep = async () => {
      await replace(w);
    };
    expect(await evaluateSubmission(w.submissionId, deps(simulator, { sleep }))).toMatchObject({
      status: "stale", attempts: 2, errors: ["not_json", "superseded"],
    });
    expect(simulator.captured()).toHaveLength(1);
    expect(await submissionRow(w.submissionId)).toMatchObject({ status: "received", currentVersion: 2 });
    expect(await proposalsOf(w.submissionId)).toEqual([]);
  });
});

describe("concurrency", () => {
  it("gives one evaluation for two commands at once", async () => {
    const w = await world();
    const simulator = new SimulatorEvaluator();
    const outcomes = await Promise.all([
      evaluateSubmission(w.submissionId, deps(simulator)),
      evaluateSubmission(w.submissionId, deps(simulator)),
    ]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(["skipped", "to_review"]);
    expect(await runsOf(w.submissionId)).toHaveLength(1);
  });

  it("never loses a submission when a claim and a replacement meet", { timeout: 90_000 }, async () => {
    for (let i = 0; i < 3; i++) {
      const w = await world();
      const simulator = new SimulatorEvaluator();
      const [outcome, replaced] = await Promise.all([evaluateSubmission(w.submissionId, deps(simulator)), replace(w)]);
      expect(replaced).toMatchObject({ ok: true });
      const row = await submissionRow(w.submissionId);
      const runs = await runsOf(w.submissionId);
      expect(row.currentVersion).toBe(2);
      expect(["to_review", "stale"]).toContain(outcome.status);
      if (outcome.status === "to_review") {
        // The replacement came first: version 2 was evaluated.
        expect(runs.map((r) => r.versionNumber)).toEqual([2]);
        expect(row.status).toBe("to_review");
      } else {
        // The claim came first: version 1's evaluation is kept, not current; version 2 waits.
        expect(runs.map((r) => r.versionNumber)).toEqual([1]);
        expect(row).toMatchObject({ status: "received", currentProposalId: null });
      }
    }
  });
});

describe("E4 retested with the evaluation", () => {
  it("empties the cause when a not-assessable submission is replaced", async () => {
    const w = await world();
    await db
      .update(submissions)
      .set({ status: "not_assessable", notAssessableCause: "no_content" })
      .where(eq(submissions.id, w.submissionId));
    expect(await replace(w)).toMatchObject({ ok: true });
    expect(await submissionRow(w.submissionId)).toMatchObject({ status: "received", notAssessableCause: null });
    // The cause goes with the state, both ways (check constraint).
    await expect(
      db.update(submissions).set({ status: "not_assessable" }).where(eq(submissions.id, w.submissionId)),
    ).rejects.toThrow();
    await expect(
      db.update(submissions).set({ notAssessableCause: "no_content" }).where(eq(submissions.id, w.submissionId)),
    ).rejects.toThrow();
  });

});

/** A blocking alert: not assessable with its cause, one run without request or version, no proposal, no retry. */
async function expectNotAssessable(w: World, simulator: SimulatorEvaluator, cause: "no_content" | "rubric_unavailable") {
  expect(await evaluateSubmission(w.submissionId, deps(simulator))).toEqual({
    status: "not_assessable", attempts: 0, durationMs: expect.any(Number), errors: [],
  });
  expect(simulator.captured()).toEqual([]);
  expect(await submissionRow(w.submissionId)).toEqual({
    status: "not_assessable", currentVersion: 1, currentProposalId: null, notAssessableCause: cause,
  });
  const runs = await runsOf(w.submissionId);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({
    outcome: "not_assessable", notAssessableCause: cause, provider: "simulator", attempts: 0, attemptErrors: [],
    modelRequested: null, modelAnswered: null, promptVersion: null, rubricVersion: null,
  });
  expect(await proposalsOf(w.submissionId)).toEqual([]);
  // No retry in a loop: a second command leaves it as it is.
  expect(await evaluateSubmission(w.submissionId, deps(simulator))).toEqual({ status: "skipped" });
  expect(await runsOf(w.submissionId)).toHaveLength(1);
}

describe("EVL-04 CA1: a text without content is not assessable, without any request", () => {
  it("gives no_content to « 12345 !!! », with no proposal and no grade", async () => {
    await expectNotAssessable(await world("12345 !!!"), new SimulatorEvaluator(), "no_content");
  });

  it("gives no_content, not rubric_unavailable, to a French text without content: no rubric version", async () => {
    await expectNotAssessable(await world("12345 !!!", "fr"), new SimulatorEvaluator(), "no_content");
  });
});

describe("EVL-01 CA4: no AI proposal for a French assignment while the French rubric is not validated", () => {
  it("makes a French submission not assessable (rubric_unavailable), without any request", async () => {
    await expectNotAssessable(await world(FRENCH_TEXT, "fr"), new SimulatorEvaluator(), "rubric_unavailable");
  });

  it("evaluates it in French with a French rubric (test only, injected): the guard is the rubric's absence", async () => {
    const w = await world(FRENCH_TEXT, "fr");
    const simulator = new SimulatorEvaluator();
    expect(await evaluateSubmission(w.submissionId, deps(simulator, { registry: [...RUBRIC_VERSIONS, FR_TEST_RUBRIC] }))).toMatchObject({
      status: "to_review", attempts: 1,
    });
    const [{ request }] = simulator.captured();
    expect(request.system).toContain("in French");
    expect(request.system).toContain("Réalisation de la tâche (test)");
    expect(request.system).not.toContain("Task Achievement");
    expect(JSON.parse(request.user)).toMatchObject({ language: "fr", student_text: FRENCH_TEXT });
    expect((await runsOf(w.submissionId))[0]).toMatchObject({ outcome: "proposed", rubricVersion: "fr-test" });
    const [proposal] = await proposalsOf(w.submissionId);
    expect(proposal).toMatchObject({ alerts: [], generalComment: "Commentaire général simulé." });
    expect(await submissionRow(w.submissionId)).toMatchObject({ status: "to_review", currentProposalId: proposal.id });
  });
});

describe("EVL-04 CA2: a very short text gets the alert, and its proposal", () => {
  it("stores very_short with the proposal, before the model's flags", async () => {
    const w = await world("My town is small. I like it.");
    const simulator = new SimulatorEvaluator();
    const evaluator: Evaluator = {
      provider: "simulator",
      model: "simulator",
      evaluate: async (request, context) => {
        const response = await simulator.evaluate(request, context);
        const answer = JSON.parse(response.content);
        answer.flags = { other_language: true, off_topic: false, addressed_to_marker: false };
        return { ...response, content: JSON.stringify(answer) };
      },
    };
    expect(await evaluateSubmission(w.submissionId, deps(evaluator))).toMatchObject({ status: "to_review", attempts: 1 });
    const [proposal] = await proposalsOf(w.submissionId);
    expect(proposal).toMatchObject({ alerts: ["very_short", "other_language"], proposedGrade: 10 });
    expect(await submissionRow(w.submissionId)).toMatchObject({ status: "to_review", currentProposalId: proposal.id });
    // Read by the owner teacher with the proposal (the student never reads it: matrix, CA3 replayed in E8).
    expect((await getCurrentProposal(w.teacher, w.submissionId))?.alerts).toEqual(["very_short", "other_language"]);
  });
});
