import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { readEvaluationMeasures } from "@/server/data/evaluation/measures";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import { classMemberships, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { buildReport, formatReport } from "@/server/evaluation/report";
import { submitStudentText } from "@/server/submissions/submissions";
import { recordTriggers } from "./helpers/triggers";

// EXP-01 (E6.4): the report reads the runs and the copies, and nothing that
// names a student or quotes a text.

async function createUser(role: "student" | "teacher", name: string): Promise<Actor & { kind: "user" }> {
  const [user] = await db
    .insert(users)
    .values({ email: `${name.toLowerCase()}@example.test`, emailVerified: true, name, firstName: name, lastName: "Zarrouk", role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

describe("the evaluation report (EXP-01)", () => {
  it("gives the figures of an assignment without identity or content", { timeout: 60_000 }, async () => {
    const teacher = await createUser("teacher", "Teacherine");
    const made = await createClass(teacher, { name: "Class Omega" });
    if (!made.ok) throw new Error("Class not created");
    const created = await createAssignment(teacher, {
      title: "Title Sigma", subject: "Subject Kappa.", level: "B1", language: "en",
      deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
    });
    if (!created.ok) throw new Error("Assignment not created");
    const before = new Date((await db.execute<{ now: string }>(sql`select now() as now`)).rows[0].now);

    const refs = [];
    for (const name of ["Studentia", "Pupilla"]) {
      const student = await createUser("student", name);
      await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
      await acknowledgeNotice(student, STUDENT_NOTICE.version);
      const trigger = recordTriggers();
      await submitStudentText(
        student,
        { assignmentId: created.assignmentId, contentVersion: "1", requestId: randomUUID(), text: `MARKERTEXT ${name} writes about the town and its market every friday.` },
        trigger,
      );
      refs.push(trigger.refs[0]);
    }
    getSimulator().clear();
    getSimulator().failNext({ kind: "error", status: 529 }, 3);
    const deps = { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 };
    for (const ref of refs) await evaluateSubmission(ref.submissionId, deps);

    const measures = await readEvaluationMeasures({ assignmentId: created.assignmentId });
    expect(measures.runs).toHaveLength(2);
    expect(measures.runs.every((r) => r.sinceVersionMs >= 0)).toBe(true);
    const [report] = buildReport(measures.runs, measures.copies);
    expect(report).toMatchObject({
      assignmentId: created.assignmentId, copies: 2, runs: 2,
      states: { evaluation_failed: 1, to_review: 1 }, attempts: { 1: 1, 3: 1 }, failureRate: { runs: 0.5, copies: 0.5 },
    });

    const text = formatReport([report], "Heading.");
    expect(text).toContain(created.assignmentId);
    for (const hidden of ["MARKERTEXT", "Studentia", "Pupilla", "Zarrouk", "@example.test", "Title Sigma", "Subject Kappa", "Class Omega", ...refs.map((r) => r.submissionId)]) {
      expect(text).not.toContain(hidden);
    }
    // `since` keeps the runs from that instant; none before.
    expect((await readEvaluationMeasures({ since: new Date(Date.now() + 3_600_000) })).runs).toEqual([]);
    expect((await readEvaluationMeasures({ since: before })).runs).toHaveLength(2);
  });
});
