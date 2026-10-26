import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AI_BREAKER_WINDOW_MS } from "@/config/provisional";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { readAiStatus } from "@/server/data/evaluation/measures";
import { readAiGuardCounts } from "@/server/data/evaluation/system";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import { classMemberships, evaluationRuns, readingRuns, securityEvents, users } from "@/server/db/schema";
import { costCapReached } from "@/server/evaluation/budget";
import { monthCostUsd, readMonthCostUsd } from "@/server/evaluation/month-cost";
import { formatStatus } from "@/server/evaluation/status";
import { uploadDraftPage } from "@/server/submissions/images";
import { submitStudentText } from "@/server/submissions/submissions";
import { readTeacherNotice } from "./helpers/review";
import { recordTriggers } from "./helpers/triggers";

// Spec 0012, AC-11 (and AC-3, AC-4 as ai:status reads them): the runs and the
// request lines of a window, the duplicates counted over all time, the month
// cost as the cap compares it. The rows are written straight into the tables;
// the window starts just before them, so the older run stays out of it.

async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const [user] = await db
    .insert(users)
    .values({ email: `status-${role}-${randomUUID().slice(0, 6)}@example.test`, emailVerified: true, name: `Statusia ${role}`, firstName: "Statusia", lastName: "Qadiri", role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A student's text submission (version 1) and one page in their draft of a second assignment. */
async function seed() {
  const teacher = await createUser("teacher");
  const student = await createUser("student");
  const made = await createClass(teacher, { name: "Class Statusia" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  const assignment = async () => {
    const created = await createAssignment(teacher, {
      title: "Title Statusia", subject: "Subject Statusia.", level: "B1", language: "en",
      deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
    });
    if (!created.ok) throw new Error("Assignment not created");
    return created.assignmentId;
  };
  const trigger = recordTriggers();
  await submitStudentText(
    student,
    { assignmentId: await assignment(), contentVersion: "1", requestId: randomUUID(), text: "STATUSMARKER my town has a market every friday and the people are kind." },
    trigger,
  );
  const jpeg = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 250, g: 250, b: 250 } } }).jpeg().toBuffer();
  const uploaded = await uploadDraftPage(student, await assignment(), { uploadRequestId: randomUUID(), replacesPageId: "" }, jpeg);
  if (uploaded.status !== 200 || !("pageId" in uploaded.body)) throw new Error(`Page not uploaded: ${uploaded.status}`);
  return { student, submissionId: trigger.refs[0].submissionId, pageId: uploaded.body.pageId, draftId: uploaded.body.draftId };
}

const evaluationRun = (submissionId: string, createdAt?: ReturnType<typeof sql>) => ({
  submissionId, versionNumber: 1, outcome: "proposed" as const, provider: "anthropic" as const,
  modelRequested: "claude-haiku-5-5", modelAnswered: "claude-haiku-5-5", promptVersion: "evaluation-2", rubricVersion: "en-1",
  attempts: 1, attemptErrors: [], durationMs: 1, promptTokens: 1000, completionTokens: 100, totalTokens: 1100,
  ...(createdAt ? { createdAt } : {}),
});
const readingRun = { outcome: "read" as const, provider: "anthropic" as const, modelRequested: "claude-haiku-5-5", modelAnswered: "claude-haiku-5-5", promptVersion: "transcription-1", attempts: 1, attemptErrors: [], durationMs: 1 };

describe("ai:status (spec 0012, AC-11)", { timeout: 60_000 }, () => {
  it("lists the window's runs and requests by identifier, counts a duplicate over all time, and shows no identity or content", async () => {
    const { student, submissionId, pageId, draftId } = await seed();
    // A run older than the window: the duplicate still counts 2.
    await db.insert(evaluationRuns).values(evaluationRun(submissionId, sql`now() - interval '2 days'`));
    const since = new Date((await db.execute<{ now: string }>(sql`select now() - interval '1 second' as now`)).rows[0].now);
    await db.insert(evaluationRuns).values(evaluationRun(submissionId));
    await db.insert(readingRuns).values({ ...readingRun, draftId, studentId: student.userId, pageId });
    await db.insert(readingRuns).values({ ...readingRun, submissionId, pageId: null });
    // One insert each: a statement's rows share its now(), and the groups are sorted by their first line.
    for (const subjectId of [submissionId, submissionId, pageId, null]) {
      await db.insert(securityEvents).values({ type: "ai_request_sent", subjectId, actorUserId: subjectId ? student.userId : null });
    }

    const status = await readAiStatus({ since });
    expect(status.windowStart.toISOString()).toBe(since.toISOString());
    expect(status.runs.map((r) => [r.kind, r.submissionId, r.draftId, r.pageId, r.versionNumber])).toEqual([
      ["evaluation", submissionId, null, null, 1],
      ["reading", null, draftId, pageId, null],
      ["reading", submissionId, null, null, null],
    ]);
    expect(status.runs[0]).toMatchObject({ provider: "anthropic", modelAnswered: "claude-haiku-5-5", outcome: "proposed", attempts: 1 });
    expect(status.runsLeftOut).toBe(0);
    expect(status.evaluationsPerVersion).toEqual([{ submissionId, versionNumber: 1, runs: 2 }]);
    expect(status.readingsPerPage).toEqual([{ submissionId, pageId: null, runs: 1 }]);
    expect(status.requests).toEqual([
      { subjectId: submissionId, label: "submission", readingSubmissionId: null, readingDraftId: null, requests: 2 },
      { subjectId: pageId, label: "page", readingSubmissionId: null, readingDraftId: draftId, requests: 1 },
      { subjectId: null, label: "none", readingSubmissionId: null, readingDraftId: null, requests: 1 },
    ]);

    const text = formatStatus(status, { now: new Date(), monthCostUsd: 0.01, capUsd: 5, requestsToday: 4, dailyLimit: 200 });
    expect(text).toContain(submissionId);
    for (const hidden of ["STATUSMARKER", "Statusia", "Qadiri", "@example.test", student.userId]) expect(text).not.toContain(hidden);

    // The line cap reports what it left out.
    expect(await readAiStatus({ since, limit: 1 })).toMatchObject({ runs: [{ kind: "evaluation" }], runsLeftOut: 2 });
  });

  it("without --since, the window starts 24 hours ago on the database clock", async () => {
    const now = new Date((await db.execute<{ now: string }>(sql`select now() as now`)).rows[0].now);
    const { windowStart } = await readAiStatus();
    expect(Math.abs(now.getTime() - 86_400_000 - windowStart.getTime())).toBeLessThan(60_000);
  });

  it("prints the month cost the cost cap compares (AC-4)", async () => {
    // A reading of this month by Anthropic (reading_runs has no foreign key to the submission).
    await db.insert(readingRuns).values({ ...readingRun, submissionId: randomUUID(), promptTokens: 2000, completionTokens: 300 });
    const cost = await readMonthCostUsd();
    expect(cost).toBe(monthCostUsd(await readAiGuardCounts("anthropic", AI_BREAKER_WINDOW_MS)));
    expect(cost).toBeGreaterThan(0);
    const settings = { breakerFailures: 3, breakerWindowMs: AI_BREAKER_WINDOW_MS };
    expect(await costCapReached({ ...settings, capUsd: cost })).toBe(true);
    expect(await costCapReached({ ...settings, capUsd: cost + 0.01 })).toBe(false);
  });
});
