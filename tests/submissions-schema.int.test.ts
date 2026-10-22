import { randomUUID } from "node:crypto";
import { eq, lte, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { InvalidTransitionError, type StoredSubmissionStatus } from "@/lib/submission-status";
import { applyTransition, insertReceived } from "@/server/data/submissions/transitions";
import { db } from "@/server/db/client";
import { assignments, submissions, submissionVersions, users } from "@/server/db/schema";
import { giveCompleteEvaluation } from "./helpers/review";

// E4.1: the submission and its versions (SUB-02 R3, SUB-05 R1), and the one
// writer of their status (§5.5). The flows that use them come in E4.2 and E4.5.

let count = 0;
async function createUser(role: "student" | "teacher") {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return user.id;
}

async function fixture() {
  const teacherId = await createUser("teacher");
  const studentId = await createUser("student");
  const [assignment] = await db
    .insert(assignments)
    .values({
      teacherId, title: "My town", subject: "Describe your town.", level: "B1", language: "en",
      deadline: new Date(Date.now() + 24 * 3600 * 1000),
    })
    .returning({ id: assignments.id });
  return { teacherId, studentId, assignmentId: assignment.id };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const submission = (f: Fixture) => ({ ...f, late: false, contentVersion: 1 });
const insert = (f: Fixture) => db.transaction((tx) => insertReceived(tx, submission(f)));

async function submitted(f: Fixture) {
  const created = await insert(f);
  if (!created) throw new Error("Not inserted");
  return created.id;
}

/** Puts a submission in a state directly, as later stages will reach it. */
const setStatus = (id: string, status: StoredSubmissionStatus) =>
  db.update(submissions).set({ status, teacherStartedAt: sql`now()` }).where(eq(submissions.id, id));

const statusOf = async (id: string) =>
  (await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, id)))[0]?.status;

const version = (submissionId: string, values: Partial<typeof submissionVersions.$inferInsert> = {}) =>
  db.insert(submissionVersions).values({ submissionId, number: 1, mode: "text", text: "My town.", requestId: randomUUID(), ...values });

/** The Postgres constraint a failed statement broke. */
async function violated(statement: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await statement;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint ?? (error as { constraint?: string }).constraint;
  }
  return undefined;
}

describe("one submission per student and assignment (SUB-05 R1)", () => {
  it("inserts the first one as received, dated by the database", async () => {
    const f = await fixture();
    const created = await insert(f);
    const [row] = await db.select().from(submissions);
    expect(row).toMatchObject({ id: created?.id, status: "received", currentVersion: 1, teacherStartedAt: null, late: false });
    const [{ inPast }] = await db
      .select({ inPast: sql<boolean>`${submissions.submittedAt} <= now()` })
      .from(submissions);
    expect(inPast).toBe(true);
  });

  it("refuses a second one for the pair, even when both race", async () => {
    const f = await fixture();
    const results = await Promise.all([insert(f), insert(f)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await insert(f)).toBeNull();
    expect(await db.select().from(submissions)).toHaveLength(1);
  });

  it("keeps one per student: another student submits for the same assignment", async () => {
    const f = await fixture();
    await submitted(f);
    expect(await insert({ ...f, studentId: await createUser("student") })).not.toBeNull();
  });

  it("ties the submission to the assignment's own teacher (invariant 3)", async () => {
    const f = await fixture();
    const other = await createUser("teacher");
    expect(await violated(insert({ ...f, teacherId: other }))).toBe("submissions_assignment_fk");
  });

  it("keeps the assignment from being deleted once it has one", async () => {
    const f = await fixture();
    await submitted(f);
    expect(await violated(db.delete(assignments).where(eq(assignments.id, f.assignmentId)))).toBe(
      "submissions_assignment_fk",
    );
  });
});

describe("a version is text OR images (SUB-02 R3)", () => {
  it("stores the text exactly as given", async () => {
    const id = await submitted(await fixture());
    const text = "i  has went to the beach , it were grate !\r\nl’été — café 🇲🇦\n\n";
    await version(id, { text });
    const [row] = await db.select({ text: submissionVersions.text }).from(submissionVersions);
    expect(row.text).toBe(text);
  });

  it.each([
    ["a text version without text", { mode: "text", text: null }, "submission_versions_text_iff_mode"],
    ["an images version with text", { mode: "images", text: "My town." }, "submission_versions_text_iff_mode"],
    ["an empty text", { text: "" }, "submission_versions_text_not_empty"],
    ["number 0", { number: 0 }, "submission_versions_number_positive"],
  ] as const)("refuses %s", async (_, values, constraint) => {
    const id = await submitted(await fixture());
    expect(await violated(version(id, values))).toBe(constraint);
  });

  it("accepts an images version without text: its pages come in E9", async () => {
    const id = await submitted(await fixture());
    await version(id, { mode: "images", text: null });
    expect(await db.select().from(submissionVersions)).toHaveLength(1);
  });

  it("numbers versions once and takes a request once", async () => {
    const id = await submitted(await fixture());
    const requestId = randomUUID();
    await version(id, { requestId });
    expect(await violated(version(id, { number: 1 }))).toBe("submission_versions_submission_number_unique");
    expect(await violated(version(id, { number: 2, requestId }))).toBe("submission_versions_submission_request_unique");
  });
});

describe("applyTransition: the one status writer (§5.5)", () => {
  it("applies a move of the table and its extra fields", async () => {
    const id = await submitted(await fixture());
    const replaced = await db.transaction((tx) =>
      applyTransition(tx, id, 11, "received", { set: { currentVersion: sql`${submissions.currentVersion} + 1` } }),
    );
    expect(replaced).toEqual({ id, status: "received", currentVersion: 2 });
    expect(await db.transaction((tx) => applyTransition(tx, id, 2, "evaluating", { set: { claimToken: "test-claim" } }))).toMatchObject({
      status: "evaluating",
    });
    // Leaving evaluating empties the claim token, as leaving not_assessable empties its cause.
    expect(await db.transaction((tx) => applyTransition(tx, id, 5, "evaluation_failed"))).toMatchObject({ status: "evaluation_failed" });
    expect((await db.select({ token: submissions.claimToken }).from(submissions).where(eq(submissions.id, id)))[0].token).toBeNull();
  });

  it("refuses a move from a state outside the table, and changes nothing", async () => {
    const id = await submitted(await fixture());
    // 9 is validated → published: a received submission cannot be published.
    expect(await db.transaction((tx) => applyTransition(tx, id, 9, "published"))).toBeNull();
    expect(await statusOf(id)).toBe("received");
  });

  it("refuses when the caller's guard is not met", async () => {
    const id = await submitted(await fixture());
    const result = await db.transaction((tx) =>
      applyTransition(tx, id, 11, "received", { where: lte(submissions.currentVersion, 0) }),
    );
    expect(result).toBeNull();
  });

  it("throws on a move the table does not have: a bug, not a refusal", async () => {
    const id = await submitted(await fixture());
    await expect(db.transaction((tx) => applyTransition(tx, id, 8, "published"))).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    // Transition 1 is the insertion (insertReceived).
    await expect(db.transaction((tx) => applyTransition(tx, id, 1, "received"))).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it("publishes only from validated", async () => {
    const id = await submitted(await fixture());
    await setStatus(id, "to_review");
    expect(await db.transaction((tx) => applyTransition(tx, id, 9, "published"))).toBeNull();
    // 0019: Validated needs the teacher's complete evaluation.
    await giveCompleteEvaluation(id);
    await setStatus(id, "validated");
    expect(await db.transaction((tx) => applyTransition(tx, id, 9, "published"))).toMatchObject({ status: "published" });
  });

  it("lets the first of two racing writers win", async () => {
    const id = await submitted(await fixture());
    await giveCompleteEvaluation(id);
    await setStatus(id, "validated");
    const results = await Promise.all([
      db.transaction((tx) => applyTransition(tx, id, 9, "published")),
      db.transaction((tx) => applyTransition(tx, id, 9, "published")),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("cannot validate without the teacher's first act recorded", async () => {
    const id = await submitted(await fixture());
    await db.update(submissions).set({ status: "to_review" }).where(eq(submissions.id, id));
    expect(await violated(db.transaction((tx) => applyTransition(tx, id, 8, "validated")))).toBe(
      "submissions_validated_started",
    );
    // The first act: the teacher's evaluation (0018: it sets teacher_started_at; 0019: Validated needs it).
    await giveCompleteEvaluation(id);
    const validated = await db.transaction((tx) =>
      applyTransition(tx, id, 8, "validated", { set: { teacherStartedAt: sql`coalesce(${submissions.teacherStartedAt}, now())` } }),
    );
    expect(validated).toMatchObject({ status: "validated" });
  });
});
