import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import { DRAFT_READS_MAX, STUDENT_DAILY_READS_MAX } from "@/config/provisional";
import { STUDENT_NOTICE } from "@/lib/texts";
import { instantToWallTime, wallTimeToInstant } from "@/lib/time-zone";
import type { Actor } from "@/server/access/actor";
import { SimulatorReader } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { readAiGuardCounts } from "@/server/data/evaluation/system";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import { classMemberships, readingRuns, submissionDrafts, users } from "@/server/db/schema";
import { createAiGuard } from "@/server/evaluation/budget";
import { readStudentPage, uploadDraftPage } from "@/server/submissions/images";
import { readTeacherNotice } from "./helpers/review";

// E9 (spec 0011): the read caps of the student's check (AC-8), counted on
// reading_runs by draft and by student over the day in DEADLINE_TIME_ZONE,
// and the readings counted by the AI guard with the evaluations (AC-16):
// their tokens toward the monthly cost cap, their access failures toward
// the breaker. The past reads are written straight into reading_runs (one
// insert, not 30 reads); the read under test goes through readStudentPage.

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `caps-${role}${n}-${randomUUID().slice(0, 6)}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A student with one page in the draft of an assignment they received. */
async function studentWithPage() {
  const teacher = await createUser("teacher");
  const student = await createUser("student");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  return { student, ...(await upload(student, created.assignmentId)), assignmentId: created.assignmentId };
}

async function upload(student: Actor, assignmentId: string) {
  const jpeg = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 250, g: 250, b: 250 } } }).jpeg().toBuffer();
  const uploaded = await uploadDraftPage(student, assignmentId, { uploadRequestId: randomUUID(), replacesPageId: "" }, jpeg);
  if (uploaded.status !== 200 || !("pageId" in uploaded.body)) throw new Error(`Page not uploaded: ${uploaded.status}`);
  return { draftId: uploaded.body.draftId, pageId: uploaded.body.pageId };
}

type Run = Partial<typeof readingRuns.$inferInsert>;

/** `n` reading runs already recorded; an interactive read of a draft unless told otherwise. */
const pastReads = (n: number, run: Run) =>
  db.insert(readingRuns).values(
    Array.from({ length: n }, () => ({
      outcome: "read" as const, provider: "simulator" as const, modelRequested: "claude-haiku-5-5", promptVersion: "transcription-1",
      attempts: 1, attemptErrors: [], durationMs: 1, ...run,
    })),
  );

/** A run that failed on its only attempt with this error. */
const failed = (error: "configuration" | "rejected" | "unavailable"): Run => ({ outcome: "failed", attempts: 1, attemptErrors: [error] });

/** The start of today in DEADLINE_TIME_ZONE, as Node's tzdata gives it. */
function localMidnight(): Date {
  const day = instantToWallTime(new Date(), DEADLINE_TIME_ZONE).slice(0, 10);
  return wallTimeToInstant(`${day}T00:00`, DEADLINE_TIME_ZONE)!;
}

describe("AC-8: the read caps of the student's check", { timeout: 60_000 }, () => {
  it(`${DRAFT_READS_MAX} reads of this draft: the next read is refused with the draft cap, nothing sent`, async () => {
    const { student, draftId, pageId } = await studentWithPage();
    await pastReads(DRAFT_READS_MAX, { draftId, studentId: student.userId });
    const reader = new SimulatorReader();

    expect(await readStudentPage(student, pageId, { reader })).toMatchObject({ status: "error", reason: "draftCap" });
    expect(reader.captured()).toHaveLength(0);
    expect(await db.select().from(readingRuns).where(eq(readingRuns.draftId, draftId))).toHaveLength(DRAFT_READS_MAX);
  });

  it(`${DRAFT_READS_MAX - 1} reads of this draft: one more is allowed, and recorded`, async () => {
    const { student, draftId, pageId } = await studentWithPage();
    await pastReads(DRAFT_READS_MAX - 1, { draftId, studentId: student.userId });
    const reader = new SimulatorReader();

    expect(await readStudentPage(student, pageId, { reader })).toMatchObject({ status: "read" });
    expect(reader.captured()).toHaveLength(1);
    expect(await db.select().from(readingRuns).where(eq(readingRuns.draftId, draftId))).toHaveLength(DRAFT_READS_MAX);
  });

  it(`${STUDENT_DAILY_READS_MAX} reads today over drafts since deleted: a new draft is still capped for the day`, async () => {
    const { student, assignmentId, draftId } = await studentWithPage();
    // Earlier drafts of the day, each under its own cap, then gone: their runs stay.
    const perDraft = DRAFT_READS_MAX - 1;
    for (let left = STUDENT_DAILY_READS_MAX; left > 0; left -= perDraft) await pastReads(Math.min(perDraft, left), { draftId: randomUUID(), studentId: student.userId });
    await db.delete(submissionDrafts).where(eq(submissionDrafts.id, draftId));
    const fresh = await upload(student, assignmentId);
    expect(fresh.draftId).not.toBe(draftId);
    const reader = new SimulatorReader();

    expect(await readStudentPage(student, fresh.pageId, { reader })).toMatchObject({ status: "error", reason: "dailyCap" });
    expect(reader.captured()).toHaveLength(0);
  });

  it("counts the student's own interactive reads only: neither a classmate's nor the pipeline's", async () => {
    const { student, pageId } = await studentWithPage();
    const classmate = await createUser("student");
    await pastReads(STUDENT_DAILY_READS_MAX, { draftId: randomUUID(), studentId: classmate.userId });
    // A pipeline read carries the submission, not a draft.
    await pastReads(STUDENT_DAILY_READS_MAX, { submissionId: randomUUID(), studentId: student.userId });

    expect(await readStudentPage(student, pageId, { reader: new SimulatorReader() })).toMatchObject({ status: "read" });
  });

  it("the day starts at midnight in DEADLINE_TIME_ZONE: yesterday's reads no longer count, today's do", async () => {
    const midnight = localMidnight();
    const { student, pageId } = await studentWithPage();
    const at = (instant: Date) => sql`${instant.toISOString()}::timestamptz`;
    await pastReads(STUDENT_DAILY_READS_MAX, { draftId: randomUUID(), studentId: student.userId, createdAt: at(new Date(midnight.getTime() - 1_000)) as unknown as Date });

    expect(await readStudentPage(student, pageId, { reader: new SimulatorReader() })).toMatchObject({ status: "read" });

    // Counter case: the same reads at midnight, today: capped.
    const other = await studentWithPage();
    await pastReads(STUDENT_DAILY_READS_MAX, { draftId: randomUUID(), studentId: other.student.userId, createdAt: at(midnight) as unknown as Date });
    expect(await readStudentPage(other.student, other.pageId, { reader: new SimulatorReader() })).toMatchObject({ status: "error", reason: "dailyCap" });
  });

  it("a read with the AI guard closed sends nothing and records no run", async () => {
    const { student, draftId, pageId } = await studentWithPage();
    const reader = new SimulatorReader();

    expect(await readStudentPage(student, pageId, { reader, guard: async () => "cost_cap" })).toMatchObject({ status: "error", reason: "closed" });
    expect(reader.captured()).toHaveLength(0);
    expect(await db.select().from(readingRuns).where(eq(readingRuns.draftId, draftId))).toHaveLength(0);
  });
});

describe("AC-16: the readings in the AI guard", { timeout: 60_000 }, () => {
  const WINDOW = 3_600_000;

  it("sums the month's Anthropic reading tokens, interactive and by the pipeline; the simulator's and last month's never", async () => {
    const studentId = randomUUID();
    await pastReads(1, { draftId: randomUUID(), studentId, provider: "anthropic", promptTokens: 1_000, completionTokens: 200 });
    await pastReads(1, { submissionId: randomUUID(), provider: "anthropic", promptTokens: 3_000, completionTokens: 400 });
    await pastReads(1, { draftId: randomUUID(), studentId, provider: "simulator", promptTokens: 90_000_000, completionTokens: 90_000_000 });
    await pastReads(1, {
      draftId: randomUUID(), studentId, provider: "anthropic", promptTokens: 90_000_000, completionTokens: 0,
      createdAt: sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' - interval '1 second'` as unknown as Date,
    });

    expect(await readAiGuardCounts("anthropic", WINDOW)).toMatchObject({ promptTokens: 4_000, completionTokens: 600 });
  });

  it("interactive reads alone reach the cost cap: the guard closes for the next evaluation", async () => {
    // 1M prompt tokens at 0.10 USD per million (prices.ts): about 0.10 USD.
    const open = createAiGuard({ capUsd: 0.05, breakerFailures: 3, breakerWindowMs: WINDOW });
    expect(await open("simulator")).toBe("open");
    await pastReads(1, { draftId: randomUUID(), studentId: randomUUID(), provider: "anthropic", promptTokens: 1_000_000, completionTokens: 0 });

    expect(await open("simulator")).toBe("cost_cap");
  });

  it("three drafts failed on configuration open the breaker; one subject counts once", async () => {
    const guard = createAiGuard({ capUsd: 1_000, breakerFailures: 3, breakerWindowMs: WINDOW });
    const studentId = randomUUID();
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    await pastReads(3, { draftId: a, studentId, ...failed("configuration") });
    await pastReads(1, { draftId: b, studentId, ...failed("rejected") });
    // An unreachable provider is no access error.
    await pastReads(1, { draftId: c, studentId, ...failed("unavailable") });

    expect((await readAiGuardCounts("simulator", WINDOW)).breakerFailures).toBe(2);
    expect(await guard("simulator")).toBe("open");

    await pastReads(1, { submissionId: randomUUID(), ...failed("configuration") });
    expect((await readAiGuardCounts("simulator", WINDOW)).breakerFailures).toBe(3);
    expect(await guard("simulator")).toBe("breaker");
  });

  it("a failure outside the window, or of another provider, never counts toward the breaker", async () => {
    const studentId = randomUUID();
    await pastReads(1, { draftId: randomUUID(), studentId, ...failed("configuration"), createdAt: sql`now() - interval '2 hours'` as unknown as Date });
    await pastReads(1, { draftId: randomUUID(), studentId, provider: "anthropic", ...failed("configuration") });

    expect((await readAiGuardCounts("simulator", WINDOW)).breakerFailures).toBe(0);
  });
});
