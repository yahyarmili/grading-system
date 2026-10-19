import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import { SimulatorEvaluator, type Evaluator } from "@/server/ai";
import { claimForEvaluation } from "@/server/data/evaluation/system";
import { submitText } from "@/server/data/submissions/submissions";
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
  users,
} from "@/server/db/schema";
import { evaluateSubmission, releaseStuckSubmissions, type EvaluationDeps } from "@/server/evaluation/evaluate";

// PRC-02 R1: no submission stays evaluating. Found by the review of E5.9
// (T4): when the database refused the result twice, or the process stopped
// after the claim, the submission stayed evaluating for good. Here the
// database refuses recordEvaluation as many times as a test asks.

const refusals = vi.hoisted(() => ({ left: 0 }));
vi.mock("@/server/data/evaluation/system", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/data/evaluation/system")>();
  return {
    ...actual,
    recordEvaluation: async (...args: Parameters<typeof actual.recordEvaluation>) => {
      if (refusals.left > 0) {
        refusals.left--;
        throw new Error("simulated database failure");
      }
      return actual.recordEvaluation(...args);
    },
  };
});

const TEXT =
  "My town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park near the river. " +
  "My grandparents lives in the old part of the town, where the streets are narrow and the houses are white.";

async function user(role: "student" | "teacher") {
  const id = randomUUID();
  await db.insert(users).values({
    id, email: `${role}-${id}@example.test`, emailVerified: true, name: role, firstName: role, lastName: "User", role,
  });
  return { kind: "user" as const, userId: id, role };
}

/** A received text submission of a fictitious student. */
async function received(): Promise<string> {
  const teacher = await user("teacher");
  const student = await user("student");
  const [klass] = await db
    .insert(classes)
    .values({ teacherId: teacher.userId, name: "Class", inviteNonce: "n", inviteLinkDigest: randomUUID(), inviteCodeDigest: randomUUID() })
    .returning({ id: classes.id });
  await db.insert(classMemberships).values({ classId: klass.id, studentId: student.userId });
  await db.insert(noticeAcknowledgements).values({ userId: student.userId, notice: "student_submission", version: STUDENT_NOTICE.version });
  const [assignment] = await db
    .insert(assignments)
    .values({
      teacherId: teacher.userId, title: "My town", subject: "Describe your town.", level: "B1", language: "en",
      deadline: new Date(Date.now() + 24 * 3600 * 1000),
    })
    .returning({ id: assignments.id });
  await db.insert(assignmentClasses).values({ assignmentId: assignment.id, classId: klass.id, teacherId: teacher.userId });
  const submitted = await submitText(student, { assignmentId: assignment.id, contentVersion: 1, requestId: randomUUID(), text: TEXT });
  if (!submitted?.ok) throw new Error("Not submitted");
  const [row] = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.assignmentId, assignment.id));
  return row.id;
}

const deps = (evaluator: Evaluator): EvaluationDeps => ({ evaluator, registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 });
const statusOf = async (id: string) =>
  (await db.select({ status: submissions.status, currentProposalId: submissions.currentProposalId }).from(submissions).where(eq(submissions.id, id)))[0];
const runsOf = (id: string) => db.select().from(evaluationRuns).where(eq(evaluationRuns.submissionId, id));

describe("a result the database refuses", () => {
  it("records a failure once more when the database refused it once", async () => {
    const id = await received();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status: 500 }, 3);
    refusals.left = 1;
    expect(await evaluateSubmission(id, deps(simulator))).toMatchObject({ status: "evaluation_failed", attempts: 3 });
    expect(await runsOf(id)).toMatchObject([{ outcome: "failed", attemptErrors: ["unavailable", "unavailable", "unavailable"] }]);
  });

  it("releases a failure refused twice to evaluation failed, without a run, and still throws", async () => {
    const id = await received();
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status: 500 }, 3);
    refusals.left = 2;
    await expect(evaluateSubmission(id, deps(simulator))).rejects.toThrow("simulated database failure");
    expect(await statusOf(id)).toEqual({ status: "evaluation_failed", currentProposalId: null });
    expect(await runsOf(id)).toEqual([]);
  });

  it("releases a proposal refused twice the same way: nothing current, nothing half written", async () => {
    const id = await received();
    refusals.left = 2;
    await expect(evaluateSubmission(id, deps(new SimulatorEvaluator()))).rejects.toThrow("simulated database failure");
    expect(await statusOf(id)).toEqual({ status: "evaluation_failed", currentProposalId: null });
    expect(await runsOf(id)).toEqual([]);
    expect(await db.select().from(aiProposals).where(eq(aiProposals.submissionId, id))).toEqual([]);
  });
});

describe("releaseStuckSubmissions", () => {
  it("releases a submission left evaluating (a stopped process) once it is older than the bound, and only then", async () => {
    const id = await received();
    const other = await received();
    expect(await claimForEvaluation(id)).not.toBeNull();
    // Within the bound (EVALUATION_STUCK_AFTER_MS): an evaluation may still be running.
    expect(await releaseStuckSubmissions()).not.toContain(id);
    expect((await statusOf(id)).status).toBe("evaluating");
    // Past it (a bound of 0, compared on the database clock).
    expect(await releaseStuckSubmissions(0)).toContain(id);
    expect((await statusOf(id)).status).toBe("evaluation_failed");
    expect(await runsOf(id)).toEqual([]);
    // A received submission is not touched.
    expect((await statusOf(other)).status).toBe("received");
  });

  it("keeps a result that arrives after the release, not current, like a replaced text's", async () => {
    const id = await received();
    const simulator = new SimulatorEvaluator();
    const release = simulator.holdNext();
    const running = evaluateSubmission(id, deps(simulator));
    await vi.waitFor(async () => expect((await statusOf(id)).status).toBe("evaluating"), { timeout: 10_000 });
    expect(await releaseStuckSubmissions(0)).toContain(id);
    release();
    expect(await running).toMatchObject({ status: "stale" });
    expect(await statusOf(id)).toEqual({ status: "evaluation_failed", currentProposalId: null });
    expect(await runsOf(id)).toMatchObject([{ outcome: "proposed" }]);
  });
});
