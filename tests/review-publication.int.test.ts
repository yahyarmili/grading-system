import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { recordCopyOpened, type SeenEvaluation } from "@/server/data/review/copy";
import { publishEvaluation, withdrawPublication } from "@/server/data/review/publication";
import { replaceText, submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { aiProposals, classMemberships, reviewJournalEntries, submissions, teacherEvaluations, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { EVALUATION_MESSAGES, saveTeacherEvaluation } from "@/server/review/evaluation";
import {
  PUBLICATION_MESSAGES,
  publishTeacherEvaluation,
  validateTeacherEvaluation,
  withdrawTeacherPublication,
} from "@/server/review/publication";
import { getCopy, readTeacherNotice } from "./helpers/review";

// REV-05, PUB-01, REV-03 R5 (E8.1): the teacher validates, publishes and
// withdraws a copy, each act its own transaction and log entry (author,
// date); the shortcut chains two acts and keeps the copy Validated when the
// second fails; a change of a Validated or Published copy sends it back To
// review (Q8). Every refusal holds for a direct call, whatever the screen
// offered; the database refuses the rest (0019).

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher" | "admin"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `publish-${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A submitted copy, evaluated by the simulator (To review), or refused by the AI (Evaluation failed). */
async function evaluatedCopy({ refused = false } = {}) {
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
  const submitted = await submitText(student, { assignmentId: created.assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT });
  if (!submitted?.ok) throw new Error("Not submitted");
  const submissionId = submitted.ref.submissionId;
  getSimulator().clear();
  if (refused) getSimulator().failNext({ kind: "refusal", category: null }, 1);
  const outcome = await evaluateSubmission(
    submissionId,
    { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
    { expectedVersion: 1, claimToken: randomUUID() },
  );
  if (outcome.status !== (refused ? "evaluation_failed" : "to_review")) throw new Error(`Unexpected: ${outcome.status}`);
  const copy = (await getCopy(teacher, created.assignmentId, student.userId))!;
  const { versionNumber, proposalId, revision } = copy.seen!;
  const seen: SeenEvaluation = { submissionId, versionNumber, proposalId, revision };
  return { teacher, student, assignmentId: created.assignmentId, studentId: student.userId, submissionId, proposal: copy.proposal, seen };
}
type Copy = Awaited<ReturnType<typeof evaluatedCopy>>;

/** The form as the page sends it: the proposal's values, then `over`. */
const form = (copy: Copy, over: Record<string, unknown> = {}, seen: Partial<SeenEvaluation> = {}) => {
  const c = copy.proposal!.criteria;
  return {
    seen: { ...copy.seen, ...seen },
    levels: { task: c.task.level, organization: c.organization.level, vocabulary: c.vocabulary.level, grammar: c.grammar.level, mechanics: c.mechanics.level },
    remarks: {
      task: c.task.justification, organization: c.organization.justification, vocabulary: c.vocabulary.justification,
      grammar: c.grammar.justification, mechanics: c.mechanics.justification,
    },
    generalComment: copy.proposal!.generalComment,
    nextSteps: copy.proposal!.nextSteps.join("\n"),
    grade: { fixed: false },
    rereadDone: [],
    ...over,
  };
};

const statusOf = async (submissionId: string) =>
  (await db.select({ status: submissions.status, startedAt: submissions.teacherStartedAt }).from(submissions).where(eq(submissions.id, submissionId)))[0];
const revisionOf = async (submissionId: string) =>
  (await db.select({ revision: teacherEvaluations.revision }).from(teacherEvaluations).where(eq(teacherEvaluations.submissionId, submissionId)))[0]?.revision ?? 0;
/** The log's acts, oldest first; evaluation_changed entries by field. */
const acts = (submissionId: string) =>
  db
    .select({
      event: reviewJournalEntries.event, actorId: reviewJournalEntries.actorId, newValue: reviewJournalEntries.newValue,
      field: reviewJournalEntries.field, createdAt: reviewJournalEntries.createdAt,
    })
    .from(reviewJournalEntries)
    .where(eq(reviewJournalEntries.submissionId, submissionId))
    .orderBy(asc(reviewJournalEntries.createdAt), asc(reviewJournalEntries.id));
const eventsOf = async (submissionId: string) => (await acts(submissionId)).map((a) => a.event);
const decision = (copy: Copy, revision: number) => ({ ...copy.seen, revision });

describe("validating a copy (REV-05)", { timeout: 120_000 }, () => {
  it("REV-04 CA2, CA1: opened then validated without changes: both in the log with author and date; Validated; the evaluation created from the proposal", async () => {
    const copy = await evaluatedCopy();
    await recordCopyOpened(copy.teacher, copy.submissionId);
    const proposal = (await db.select().from(aiProposals).where(eq(aiProposals.submissionId, copy.submissionId)))[0];

    const state = await validateTeacherEvaluation(copy.teacher, form(copy));
    expect(state).toMatchObject({ status: "decided", published: false, message: PUBLICATION_MESSAGES.validated, evaluation: { revision: 1 } });
    expect(await statusOf(copy.submissionId)).toMatchObject({ status: "validated", startedAt: expect.any(Date) });

    const log = await acts(copy.submissionId);
    expect(log.map((a) => a.event)).toEqual(["copy_opened", "evaluation_created", "validated"]);
    const validated = log.at(-1)!;
    expect(validated).toMatchObject({ actorId: copy.teacher.userId, newValue: { nature: "unchanged", revision: 1, finalGrade: copy.proposal!.proposedGrade } });
    expect(validated.createdAt.getTime()).toBeGreaterThanOrEqual(log[0].createdAt.getTime());
    // Invariant 5: the proposal is never written.
    expect((await db.select().from(aiProposals).where(eq(aiProposals.submissionId, copy.submissionId)))[0]).toEqual(proposal);
  });

  it("REV-05 R2: 'after changes' when the result differs from the proposal; a change undone counts as none", async () => {
    const changed = await evaluatedCopy();
    expect(await validateTeacherEvaluation(changed.teacher, form(changed, { generalComment: "Well organised." }))).toMatchObject({ status: "decided" });
    expect((await acts(changed.submissionId)).at(-1)?.newValue).toMatchObject({ nature: "changed", revision: 1 });

    const undone = await evaluatedCopy();
    expect((await saveTeacherEvaluation(undone.teacher, form(undone, { generalComment: "Changed." }))).status).toBe("saved");
    const back = await validateTeacherEvaluation(undone.teacher, form(undone, {}, { revision: 1 }));
    expect(back).toMatchObject({ status: "decided", evaluation: { revision: 2 } });
    expect((await acts(undone.submissionId)).at(-1)?.newValue).toMatchObject({ nature: "unchanged", revision: 2 });
  });

  it("repeated, it validates once: one 'validated' entry", async () => {
    const copy = await evaluatedCopy();
    expect(await validateTeacherEvaluation(copy.teacher, form(copy))).toMatchObject({ status: "decided" });
    expect(await validateTeacherEvaluation(copy.teacher, form(copy, {}, { revision: 1 }))).toMatchObject({
      status: "decided", message: PUBLICATION_MESSAGES.alreadyValidated,
    });
    expect((await eventsOf(copy.submissionId)).filter((e) => e === "validated")).toHaveLength(1);
  });

  it("REV-05 CA2: a failed copy without an evaluation cannot be validated, by a direct request either; nothing written (E8.2: one entered by hand, complete, can)", async () => {
    const copy = await evaluatedCopy({ refused: true });
    const forged = {
      seen: copy.seen,
      levels: { task: null, organization: null, vocabulary: null, grammar: null, mechanics: null },
      remarks: { task: "", organization: "", vocabulary: "", grammar: "", mechanics: "" },
      generalComment: "", nextSteps: "", grade: { fixed: false }, rereadDone: [],
    };
    expect(await validateTeacherEvaluation(copy.teacher, forged)).toMatchObject({ status: "invalid", fieldErrors: { "level.task": EVALUATION_MESSAGES.levelMissing } });
    expect(await statusOf(copy.submissionId)).toMatchObject({ status: "evaluation_failed", startedAt: null });
    expect(await eventsOf(copy.submissionId)).toEqual([]);
  });

  it("SUB-05 CA3: once validated, the student can no longer replace the text", async () => {
    const copy = await evaluatedCopy();
    expect(await validateTeacherEvaluation(copy.teacher, form(copy))).toMatchObject({ status: "decided" });
    expect(await replaceText(copy.student, { assignmentId: copy.assignmentId, requestId: randomUUID(), text: "A new text." })).toEqual({
      ok: false, reason: "teacher_started",
    });
  });

  it("the student, another teacher and an administrator validate nothing", async () => {
    const copy = await evaluatedCopy();
    const other = await createUser("teacher");
    const admin = await createUser("admin");
    for (const actor of [copy.student, other, admin]) {
      expect(await validateTeacherEvaluation(actor, form(copy))).toEqual({ status: "not_found", message: PUBLICATION_MESSAGES.notFound });
    }
    expect(await statusOf(copy.submissionId)).toMatchObject({ status: "to_review", startedAt: null });
  });
});

describe("publishing and withdrawing (PUB-01)", { timeout: 120_000 }, () => {
  it("CA1: a copy To review cannot be published, by the service or the data function; nothing written", async () => {
    const copy = await evaluatedCopy();
    expect((await saveTeacherEvaluation(copy.teacher, form(copy, { generalComment: "Saved, not validated." }))).status).toBe("saved");
    expect(await publishTeacherEvaluation(copy.teacher, decision(copy, 1))).toEqual({ status: "refused", message: PUBLICATION_MESSAGES.notValidated });
    expect(await publishEvaluation(copy.teacher, decision(copy, 1))).toEqual({ ok: false, reason: "not_validated" });
    expect((await statusOf(copy.submissionId)).status).toBe("to_review");
    expect(await eventsOf(copy.submissionId)).not.toContain("published");
  });

  it("R2: published once, however often asked; withdrawn back to Validated, once", async () => {
    const copy = await evaluatedCopy();
    await validateTeacherEvaluation(copy.teacher, form(copy));
    expect(await publishTeacherEvaluation(copy.teacher, decision(copy, 1))).toEqual({ status: "done", message: PUBLICATION_MESSAGES.published });
    expect(await publishTeacherEvaluation(copy.teacher, decision(copy, 1))).toEqual({ status: "done", message: PUBLICATION_MESSAGES.alreadyPublished });
    expect((await statusOf(copy.submissionId)).status).toBe("published");

    expect(await withdrawTeacherPublication(copy.teacher, decision(copy, 1))).toEqual({ status: "done", message: PUBLICATION_MESSAGES.withdrawn });
    expect(await withdrawTeacherPublication(copy.teacher, decision(copy, 1))).toEqual({ status: "done", message: PUBLICATION_MESSAGES.alreadyWithdrawn });
    expect((await statusOf(copy.submissionId)).status).toBe("validated");

    const log = await acts(copy.submissionId);
    expect(log.map((a) => a.event)).toEqual(["evaluation_created", "validated", "published", "unpublished"]);
    expect(log.slice(-2).every((a) => a.actorId === copy.teacher.userId)).toBe(true);
  });

  it("two publications at once: one publishes, the other finds it published (NFR-FIA-01)", async () => {
    const copy = await evaluatedCopy();
    await validateTeacherEvaluation(copy.teacher, form(copy));
    const results = await Promise.all([publishEvaluation(copy.teacher, decision(copy, 1)), publishEvaluation(copy.teacher, decision(copy, 1))]);
    expect(results.map((r) => r && r.ok && r.already).sort()).toEqual([false, true]);
    expect((await eventsOf(copy.submissionId)).filter((e) => e === "published")).toHaveLength(1);
  });

  it("the evaluation shown must be the one stored: a publication from an older revision is refused ('changed')", async () => {
    const copy = await evaluatedCopy();
    await validateTeacherEvaluation(copy.teacher, form(copy, { generalComment: "First." }));
    expect(await publishEvaluation(copy.teacher, decision(copy, 0))).toEqual({ ok: false, reason: "changed" });
  });

  it("the student and another teacher neither publish nor withdraw; the student's attempt is refused like a missing copy", async () => {
    const copy = await evaluatedCopy();
    await validateTeacherEvaluation(copy.teacher, form(copy));
    const other = await createUser("teacher");
    expect(await publishEvaluation(other, decision(copy, 1))).toBeNull();
    expect(await publishTeacherEvaluation(copy.student, decision(copy, 1))).toEqual({ status: "refused", message: PUBLICATION_MESSAGES.notFound });
    await publishEvaluation(copy.teacher, decision(copy, 1));
    expect(await withdrawPublication(other, decision(copy, 1))).toBeNull();
    expect(await withdrawTeacherPublication(copy.student, decision(copy, 1))).toEqual({ status: "refused", message: PUBLICATION_MESSAGES.notFound });
    expect((await statusOf(copy.submissionId)).status).toBe("published");
  });
});

describe("the shortcut 'Validate and publish' (D6, PUB-01 CA2)", { timeout: 120_000 }, () => {
  it("two acts, two log entries", async () => {
    const copy = await evaluatedCopy();
    expect(await validateTeacherEvaluation(copy.teacher, form(copy), { publish: true })).toMatchObject({
      status: "decided", published: true, message: PUBLICATION_MESSAGES.validatedAndPublished,
    });
    expect(await eventsOf(copy.submissionId)).toEqual(["evaluation_created", "validated", "published"]);
    expect((await statusOf(copy.submissionId)).status).toBe("published");
  });

  it("R3: the second act throws: the copy stays Validated, the teacher is told; one entry only", async () => {
    const copy = await evaluatedCopy();
    const state = await validateTeacherEvaluation(copy.teacher, form(copy), { publish: true }, {
      publish: async () => {
        throw new Error("boom");
      },
    });
    expect(state).toMatchObject({ status: "publish_failed", validated: true, message: PUBLICATION_MESSAGES.failed, evaluation: { revision: 1 } });
    expect((await statusOf(copy.submissionId)).status).toBe("validated");
    expect(await eventsOf(copy.submissionId)).toEqual(["evaluation_created", "validated"]);

    // E8.7 (review m3): the teacher tries again, the form on the revision it adopted: published once, validated once.
    expect(await validateTeacherEvaluation(copy.teacher, form(copy, {}, { revision: 1 }), { publish: true })).toMatchObject({
      status: "decided", published: true, message: PUBLICATION_MESSAGES.validatedAndPublished, evaluation: { revision: 1 },
    });
    expect((await statusOf(copy.submissionId)).status).toBe("published");
    expect(await eventsOf(copy.submissionId)).toEqual(["evaluation_created", "validated", "published"]);
  });

  it("R3: another tab changed the copy between the two acts: back To review, the publication refused, said", async () => {
    const copy = await evaluatedCopy();
    const state = await validateTeacherEvaluation(copy.teacher, form(copy), { publish: true }, {
      publish: async (actor, seen) => {
        // Another tab saves a change of the copy just validated (Q8), then the publication runs.
        expect((await saveTeacherEvaluation(actor, form(copy, { generalComment: "Changed elsewhere." }, { revision: 1 }))).status).toBe("saved");
        return publishEvaluation(actor, seen);
      },
    });
    // E8.7 (review m2): said as not Validated any more.
    expect(state).toMatchObject({ status: "publish_failed", validated: false, message: PUBLICATION_MESSAGES.sentBackMeanwhile });
    expect((await statusOf(copy.submissionId)).status).toBe("to_review");
    expect(await eventsOf(copy.submissionId)).toEqual(["evaluation_created", "validated", "sent_back_to_review", "evaluation_changed"]);
  });
});

describe("a change of a Validated or Published copy (REV-03 R5, Q8)", { timeout: 120_000 }, () => {
  it("Validated, changed: To review again, logged 'sent back' before the change; validated again, it is a second validation", async () => {
    const copy = await evaluatedCopy();
    await validateTeacherEvaluation(copy.teacher, form(copy));
    expect(await saveTeacherEvaluation(copy.teacher, form(copy, { generalComment: "One more remark." }, { revision: 1 }))).toMatchObject({
      status: "saved", sentBack: true, evaluation: { revision: 2 },
    });
    expect((await statusOf(copy.submissionId)).status).toBe("to_review");
    const log = await acts(copy.submissionId);
    expect(log.map((a) => a.event)).toEqual(["evaluation_created", "validated", "sent_back_to_review", "evaluation_changed"]);
    expect(log[2].newValue).toEqual({ from: "validated" });

    expect(await validateTeacherEvaluation(copy.teacher, form(copy, { generalComment: "One more remark." }, { revision: 2 }))).toMatchObject({
      status: "decided", published: false,
    });
    expect((await acts(copy.submissionId)).at(-1)?.newValue).toMatchObject({ nature: "changed", revision: 2 });
  });

  it("Published, changed: it leaves the student's view (To review); saved without a change, it stays published", async () => {
    const copy = await evaluatedCopy();
    await validateTeacherEvaluation(copy.teacher, form(copy), { publish: true });
    expect(await saveTeacherEvaluation(copy.teacher, form(copy, {}, { revision: 1 }))).toMatchObject({ status: "saved", changed: false, sentBack: false });
    expect((await statusOf(copy.submissionId)).status).toBe("published");

    expect(await saveTeacherEvaluation(copy.teacher, form(copy, { generalComment: "Corrected." }, { revision: 1 }))).toMatchObject({
      status: "saved", sentBack: true,
    });
    expect((await statusOf(copy.submissionId)).status).toBe("to_review");
    // E8.7 (review R2): withdrawn by the change, then sent back, in this order.
    const log = await acts(copy.submissionId);
    expect(log.map((a) => a.event)).toEqual(["evaluation_created", "validated", "published", "unpublished", "sent_back_to_review", "evaluation_changed"]);
    expect(log[3].newValue).toEqual({ revision: 1, cause: "change" });
    expect(log[4].newValue).toEqual({ from: "published" });
    // Republished explicitly only: validate, then publish (Q8).
    expect(await publishEvaluation(copy.teacher, decision(copy, 2))).toEqual({ ok: false, reason: "not_validated" });
  });
});

/** The message of a refused statement (a trigger's, or a constraint's). */
async function refusal(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { message: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  throw new Error("The query was not refused");
}

describe("what the database refuses (0019)", { timeout: 120_000 }, () => {
  it("an evaluation changed while its copy is Validated or Published, outside transition 10", async () => {
    const copy = await evaluatedCopy();
    await validateTeacherEvaluation(copy.teacher, form(copy));
    const forge = () => db.execute(sql`update teacher_evaluations set general_comment = 'Forged.', revision = 2 where submission_id = ${copy.submissionId}`);
    expect(await refusal(forge())).toMatch(/only while its submission is to review/);
    await publishEvaluation(copy.teacher, decision(copy, 1));
    expect(await refusal(forge())).toMatch(/only while its submission is to review/);
    expect(await revisionOf(copy.submissionId)).toBe(1);
  });

  it("REV-05 CA2: a copy Validated or Published without a complete evaluation, by raw SQL", async () => {
    const copy = await evaluatedCopy();
    for (const status of ["validated", "published"]) {
      const forge = db.execute(sql`update submissions set status = ${status}, teacher_started_at = now() where id = ${copy.submissionId}`);
      expect(await refusal(forge)).toMatch(/needs a complete teacher evaluation/);
    }
    expect(await statusOf(copy.submissionId)).toMatchObject({ status: "to_review", startedAt: null });
  });
});
