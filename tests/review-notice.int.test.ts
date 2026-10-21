import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { historyOf } from "@/lib/review-journal";
import { STUDENT_NOTICE, TEACHER_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { retryEvaluation } from "@/server/data/evaluation/teacher";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { getCopy, recordCopyOpened, saveEvaluation } from "@/server/data/review/copy";
import { listCopyJournal } from "@/server/data/review/journal";
import { listAssignmentCopies, recordListOpened } from "@/server/data/review/list";
import { submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { classMemberships, reviewJournalEntries, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { acknowledgeNoticeReading } from "@/server/notices/notices";
import { saveTeacherEvaluation } from "@/server/review/evaluation";

// NFR-DON-04, REV-04 R3 (E7.7): the teacher reads their notice before any
// copy: until then the server returns none (the list, the copy, its
// history) and writes nothing, whatever is asked directly. Then the
// corrector reads the history of their copy, newest first; another teacher
// and the student get nothing.

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher", firstName: string = role, lastName = `${count + 1}`): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `notice-${role}${n}@example.test`, emailVerified: true, name: `${firstName} ${lastName}`, firstName, lastName, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

/** A teacher who has not read their notice yet, and one student's copy To review, evaluated by the simulator. */
async function copyToReview() {
  const teacher = await createUser("teacher", "Sarah", "Bennett");
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
  const submitted = await submitText(student, { assignmentId: created.assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT });
  if (!submitted?.ok) throw new Error("Not submitted");
  getSimulator().clear();
  const outcome = await evaluateSubmission(
    submitted.ref.submissionId,
    { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
    { expectedVersion: 1, claimToken: randomUUID() },
  );
  if (outcome.status !== "to_review") throw new Error("Not to review");
  return { teacher, student, assignmentId: created.assignmentId, submissionId: submitted.ref.submissionId };
}

const journal = (submissionId: string) => db.select().from(reviewJournalEntries).where(eq(reviewJournalEntries.submissionId, submissionId));

describe("NFR-DON-04: the teacher notice before any copy", () => {
  it("until read, the server returns no copy and writes nothing, even asked directly; once read, the copies", { timeout: 60_000 }, async () => {
    const { teacher, student, assignmentId, submissionId } = await copyToReview();
    expect(await listAssignmentCopies(teacher, assignmentId)).toBe("notice_required");
    expect(await getCopy(teacher, assignmentId, student.userId)).toBe("notice_required");
    expect(await listCopyJournal(teacher, submissionId)).toBeNull();
    expect(await recordListOpened(teacher, assignmentId)).toBeNull();
    expect(await recordCopyOpened(teacher, submissionId)).toBeNull();
    const seen = { submissionId, versionNumber: 1, proposalId: null, revision: 0 };
    expect(await saveEvaluation(teacher, seen, {
      levels: { task: 4, organization: 2, vocabulary: 2, grammar: 2, mechanics: 2 },
      remarks: { task: "", organization: "", vocabulary: "", grammar: "", mechanics: "" },
      generalComment: "", nextSteps: [], grade: { fixed: false }, rereadDone: [],
    })).toEqual({ ok: false, reason: "notice_required" });
    expect(await retryEvaluation(teacher, seen, { onStart: () => {} })).toBeNull();
    expect(await journal(submissionId)).toEqual([]);
    expect(await db.select().from(reviewJournalEntries).where(eq(reviewJournalEntries.assignmentId, assignmentId))).toEqual([]);

    // Another teacher's copy stays absent, notice or not: nothing tells it exists.
    const other = await createUser("teacher");
    expect(await getCopy(other, assignmentId, student.userId)).toBeNull();
    expect(await listAssignmentCopies(other, assignmentId)).toBeNull();

    // Read: the version in force only, then the copies.
    expect(await acknowledgeNoticeReading(teacher, { version: String(TEACHER_NOTICE.version + 1) })).toMatchObject({ reason: "outdated" });
    expect(await getCopy(teacher, assignmentId, student.userId)).toBe("notice_required");
    expect(await acknowledgeNoticeReading(teacher, { version: String(TEACHER_NOTICE.version) })).toEqual({ status: "done" });
    expect(await getCopy(teacher, assignmentId, student.userId)).toMatchObject({ status: "to_review" });
    expect(await listAssignmentCopies(teacher, assignmentId)).toMatchObject({ rows: [{ studentId: student.userId }] });
  });
});

describe("REV-04 R3: the history of a copy", () => {
  it("the corrector reads it newest first, with author, date, old and new values; another teacher and the student get nothing", { timeout: 60_000 }, async () => {
    const { teacher, student, assignmentId, submissionId } = await copyToReview();
    await acknowledgeNotice(teacher, TEACHER_NOTICE.version);
    const opened = (await recordCopyOpened(teacher, submissionId))!;
    const copy = await getCopy(teacher, assignmentId, student.userId);
    if (!copy || copy === "notice_required" || !copy.proposal) throw new Error("No copy");
    const c = copy.proposal.criteria;
    const saved = await saveTeacherEvaluation(teacher, {
      seen: { submissionId, versionNumber: 1, proposalId: opened.proposalId, revision: 0 },
      levels: { task: c.task.level === 4 ? 3 : 4, organization: c.organization.level, vocabulary: c.vocabulary.level, grammar: c.grammar.level, mechanics: c.mechanics.level },
      remarks: {
        task: c.task.justification, organization: c.organization.justification, vocabulary: c.vocabulary.justification,
        grammar: c.grammar.justification, mechanics: c.mechanics.justification,
      },
      generalComment: "Good work.",
      nextSteps: copy.proposal.nextSteps.join("\n"),
      grade: { fixed: false },
      rereadDone: [],
    });
    expect(saved).toMatchObject({ status: "saved", changed: true });

    const entries = (await listCopyJournal(teacher, submissionId))!;
    expect(entries.map((e) => e.event)).toEqual(expect.arrayContaining(["copy_opened", "evaluation_created", "evaluation_changed"]));
    expect(entries.at(-1)).toMatchObject({ event: "copy_opened", author: { firstName: "Sarah", lastName: "Bennett" } });
    const [save, open] = historyOf(entries);
    expect(save).toMatchObject({ label: "Started their evaluation from the AI proposal", author: "Sarah Bennett" });
    expect(save.changes.map((ch) => ch.field)).toEqual(["level.task", "reread.task", "general_comment", "final_grade"]);
    expect(save.changes.find((ch) => ch.field === "general_comment")).toMatchObject({ before: copy.proposal.generalComment, after: "Good work." });
    expect(open).toMatchObject({ label: "Opened the copy" });

    const other = await createUser("teacher");
    await acknowledgeNotice(other, TEACHER_NOTICE.version);
    expect(await listCopyJournal(other, submissionId)).toBeNull();
    await expect(listCopyJournal(student, submissionId)).rejects.toThrow(AccessDeniedError);
    expect(await listCopyJournal(teacher, randomUUID())).toBeNull();
  });
});
