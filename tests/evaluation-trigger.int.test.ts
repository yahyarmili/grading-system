import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import { aiProposals, classMemberships, evaluationRuns, submissions, users } from "@/server/db/schema";
import { evaluateStep, releaseStep } from "@/server/evaluation/steps";
import { replaceStudentText, submitStudentText } from "@/server/submissions/submissions";
import { recordTriggers } from "./helpers/triggers";

// E6.1, PRC-01 CA1 and CA2, SUB-05 CA2 replayed: the trigger hands over the
// committed version only, and the workflow's step evaluates it once. The
// step is called as a plain function ("use step" does nothing without the
// workflow compiler), on the simulator; Workflows itself runs in the E2E.

const TEXT =
  "My town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park near the river.";
const NEW_TEXT =
  "My town has a river and an old bridge. On sunday we walk along the river with my grandparents. " +
  "There is also a small library where I borrow books every week, and a café where my father drinks his coffee.";

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

/** A teacher's assignment, sent to a class with a student who read the notice in force. */
async function setup() {
  const teacher = await createUser("teacher");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  const student = await createUser("student");
  await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  return { student, assignmentId: created.assignmentId };
}

const row = async (id: string) =>
  (await db
    .select({ status: submissions.status, currentVersion: submissions.currentVersion, currentProposalId: submissions.currentProposalId })
    .from(submissions)
    .where(eq(submissions.id, id)))[0];
const runsOf = (id: string) => db.select().from(evaluationRuns).where(eq(evaluationRuns.submissionId, id));
const proposalsOf = (id: string) => db.select().from(aiProposals).where(eq(aiProposals.submissionId, id));

beforeEach(() => getSimulator().clear());

describe("PRC-01 R2: the trigger, after the commit, for the active version", () => {
  it("a submission hands over its version 1 once; a refused one hands over nothing", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    const form = { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT };

    expect(await submitStudentText(student, { ...form, text: "  " }, triggers)).toMatchObject({ status: "invalid" });
    expect(await submitStudentText(student, { ...form, contentVersion: "2" }, triggers)).toMatchObject({ reason: "changed" });
    expect(triggers.refs).toEqual([]);

    expect(await submitStudentText(student, form, triggers)).toMatchObject({ status: "done" });
    const [stored] = await db.select({ id: submissions.id }).from(submissions);
    expect(triggers.refs).toEqual([{ submissionId: stored.id, versionNumber: 1 }]);
    // Committed before the hand-over: the version is already there to evaluate.
    expect(await row(stored.id)).toMatchObject({ status: "received", currentVersion: 1 });

    // Another form: refused, nothing more handed over.
    expect(await submitStudentText(student, { ...form, requestId: randomUUID() }, triggers)).toMatchObject({
      reason: "alreadySubmitted",
    });
    expect(triggers.refs).toHaveLength(1);
  });

  it("a replacement hands over the new version; a refused replacement nothing", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, triggers);
    expect(await replaceStudentText(student, { assignmentId, requestId: randomUUID(), text: NEW_TEXT }, triggers)).toMatchObject({
      status: "done",
    });
    expect(await replaceStudentText(student, { assignmentId, requestId: randomUUID(), text: "" }, triggers)).toMatchObject({
      status: "invalid",
    });
    expect(triggers.refs.map((ref) => ref.versionNumber)).toEqual([1, 2]);
  });
});

describe("PRC-01 CA1: a text goes received → evaluating → to_review without anyone acting", () => {
  it("the step evaluates the version handed over and points the submission to its proposal", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, triggers);
    const [ref] = triggers.refs;

    const outcome = await evaluateStep(ref, randomUUID());
    expect(outcome).toMatchObject({ status: "to_review", attempts: 1, errors: [] });
    const [proposal] = await proposalsOf(ref.submissionId);
    expect(await row(ref.submissionId)).toEqual({ status: "to_review", currentVersion: 1, currentProposalId: proposal.id });
    expect(getSimulator().captured()).toHaveLength(1);
  });

  it("the step's result and error carry no text (rule 4: Workflows keeps them a day)", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, triggers);
    expect(JSON.stringify(await evaluateStep(triggers.refs[0], randomUUID()))).not.toContain("beatiful");

    // A database error quotes the value it refused; the step throws its kind only.
    const marker = `not-a-uuid-${randomUUID()}`;
    const error = await evaluateStep({ submissionId: marker, versionNumber: 1 }, randomUUID()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("FatalError");
    expect((error as Error).message).not.toContain(marker);
  });
});

describe("PRC-01 CA2: a repeated trigger gives one evaluation and one current proposal", () => {
  it("two runs of the step at once: one evaluates, the other is skipped without a request", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    const form = { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT };
    await submitStudentText(student, form, triggers);
    // The same form sent again: the same answer, handed over once more.
    await submitStudentText(student, form, triggers);
    expect(triggers.refs).toHaveLength(2);
    expect(triggers.refs[1]).toEqual(triggers.refs[0]);

    const outcomes = await Promise.all(triggers.refs.map((ref) => evaluateStep(ref, randomUUID())));
    expect(outcomes.map((o) => o.status).sort()).toEqual(["skipped", "to_review"]);
    const submissionId = triggers.refs[0].submissionId;
    expect(await runsOf(submissionId)).toHaveLength(1);
    expect(await proposalsOf(submissionId)).toHaveLength(1);
    expect(getSimulator().captured()).toHaveLength(1);

    // Delivered once more later (a step is delivered at least once): still nothing.
    expect(await evaluateStep(triggers.refs[0], randomUUID())).toEqual({ status: "skipped" });
    expect(await runsOf(submissionId)).toHaveLength(1);
  });
});

describe("SUB-05 CA2 replayed: a replacement evaluates again; the old result, late, is not current", () => {
  it("replaced during the evaluation: the old run is kept, stale; the new version reaches to_review", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, triggers);
    const release = getSimulator().holdNext();
    const first = evaluateStep(triggers.refs[0], randomUUID());
    // Wait until the call is under way: the submission is evaluating version 1.
    await expect.poll(async () => (await row(triggers.refs[0].submissionId)).status, { timeout: 30_000 }).toBe("evaluating");

    await replaceStudentText(student, { assignmentId, requestId: randomUUID(), text: NEW_TEXT }, triggers);
    const [, second] = triggers.refs;
    expect(second.versionNumber).toBe(2);
    release();
    expect(await first).toMatchObject({ status: "stale" });
    expect(await row(second.submissionId)).toMatchObject({ status: "received", currentVersion: 2, currentProposalId: null });

    expect(await evaluateStep(second, randomUUID())).toMatchObject({ status: "to_review" });
    const proposals = await proposalsOf(second.submissionId);
    expect(proposals.map((p) => p.versionNumber).sort()).toEqual([1, 2]);
    const current = proposals.find((p) => p.versionNumber === 2);
    expect(await row(second.submissionId)).toMatchObject({ status: "to_review", currentProposalId: current?.id });
  });

  it("the old version's trigger, arriving after the replacement, evaluates nothing", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, triggers);
    await replaceStudentText(student, { assignmentId, requestId: randomUUID(), text: NEW_TEXT }, triggers);
    const [old, current] = triggers.refs;

    expect(await evaluateStep(old, randomUUID())).toEqual({ status: "skipped" });
    expect(getSimulator().captured()).toHaveLength(0);
    expect(await row(current.submissionId)).toMatchObject({ status: "received", currentVersion: 2 });
    expect(await evaluateStep(current, randomUUID())).toMatchObject({ status: "to_review" });
    expect((await runsOf(current.submissionId)).map((r) => r.versionNumber)).toEqual([2]);
  });
});

describe("releaseStep (E6.2): a run frees its own claim, never another run's", () => {
  const tokenOf = async (id: string) =>
    (await db.select({ token: submissions.claimToken }).from(submissions).where(eq(submissions.id, id)))[0].token;

  it("a second run whose step failed releases nothing: the first one's evaluation goes on and is current", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, triggers);
    const [ref] = triggers.refs;
    const release = getSimulator().holdNext();
    const runA = "wrun_A";
    const first = evaluateStep(ref, runA);
    await expect.poll(async () => (await row(ref.submissionId)).status, { timeout: 30_000 }).toBe("evaluating");
    expect(await tokenOf(ref.submissionId)).toBe(runA);

    // Run B, triggered again for the same version, failed in its step: its release changes nothing.
    expect(await releaseStep(ref, "wrun_B")).toBe(false);
    expect(await row(ref.submissionId)).toMatchObject({ status: "evaluating" });

    release();
    expect(await first).toMatchObject({ status: "to_review" });
    const [proposal] = await proposalsOf(ref.submissionId);
    expect(await row(ref.submissionId)).toEqual({ status: "to_review", currentVersion: 1, currentProposalId: proposal.id });
    expect(await tokenOf(ref.submissionId)).toBeNull();
  });

  it("the run whose step failed frees its claim; its answer, if it comes, is kept and never current", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, triggers);
    const [ref] = triggers.refs;
    const release = getSimulator().holdNext();
    const first = evaluateStep(ref, "wrun_A");
    await expect.poll(async () => (await row(ref.submissionId)).status, { timeout: 30_000 }).toBe("evaluating");

    expect(await releaseStep(ref, "wrun_A")).toBe(true);
    expect(await row(ref.submissionId)).toMatchObject({ status: "evaluation_failed", currentProposalId: null });
    expect(await tokenOf(ref.submissionId)).toBeNull();
    // Delivered again (at least once): nothing more.
    expect(await releaseStep(ref, "wrun_A")).toBe(false);

    release();
    expect(await first).toMatchObject({ status: "stale" });
    expect(await row(ref.submissionId)).toMatchObject({ status: "evaluation_failed", currentProposalId: null });
    expect(await runsOf(ref.submissionId)).toHaveLength(1);
  });

  it("the database keeps a token exactly while evaluating", async () => {
    const { student, assignmentId } = await setup();
    const triggers = recordTriggers();
    await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: TEXT }, triggers);
    const id = triggers.refs[0].submissionId;
    await expect(db.update(submissions).set({ status: "evaluating" }).where(eq(submissions.id, id))).rejects.toThrow();
    await expect(db.update(submissions).set({ claimToken: "wrun_X" }).where(eq(submissions.id, id))).rejects.toThrow();
  });
});
