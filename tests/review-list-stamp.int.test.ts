import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AI_MAX_ATTEMPTS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { removeStudent } from "@/server/data/classes/roster";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { recordListOpened } from "@/server/data/review/list";
import { replaceText, submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { classes, classMemberships, users } from "@/server/db/schema";
import { getCaptureSender } from "@/server/email";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { saveTeacherEvaluation } from "@/server/review/evaluation";
import { retryCopy } from "@/server/review/relaunch";
import { getCopy, listAssignmentCopies, readTeacherNotice } from "./helpers/review";

// C8a: the stamp read when the list is opened (recordListOpened, one value
// from the database, without the versions and proposals) equals the rendered
// list's (listAssignmentCopies) while nothing changed, so an opening never
// refreshes for nothing; and it changes with each change of a line: a
// student listed, a submission, its status, its proposal, the teacher's
// revision, a request, a refusal, a replacement, a class left, a name.

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `stamp-${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: `F${n}`, lastName: `L${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  else await acknowledgeNotice({ kind: "user", userId: user.id, role }, STUDENT_NOTICE.version);
  return { kind: "user", userId: user.id, role };
}

async function submit(student: Actor, assignmentId: string): Promise<EvaluationRef> {
  const done = await submitText(student, { assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT });
  if (!done?.ok) throw new Error("Not submitted");
  return done.ref;
}

/** The workflow's step for a ref, on the simulator. */
const step = (ref: EvaluationRef) =>
  evaluateSubmission(
    ref.submissionId,
    { evaluator: getSimulator(), registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
    { expectedVersion: ref.versionNumber, origin: ref.origin, request: ref.request, claimToken: randomUUID() },
  );

/** The whole form of a copy to review, the proposal's values, then the levels given. */
async function form(teacher: Actor, assignmentId: string, studentId: string, levels: Record<string, number> = {}) {
  const copy = (await getCopy(teacher, assignmentId, studentId))!;
  const c = copy.proposal!.criteria;
  const { submissionId, versionNumber, proposalId, revision } = copy.seen!;
  return {
    seen: { submissionId, versionNumber, proposalId, revision },
    levels: {
      task: c.task.level, organization: c.organization.level, vocabulary: c.vocabulary.level,
      grammar: c.grammar.level, mechanics: c.mechanics.level, ...levels,
    },
    remarks: {
      task: c.task.justification, organization: c.organization.justification, vocabulary: c.vocabulary.justification,
      grammar: c.grammar.justification, mechanics: c.mechanics.justification,
    },
    generalComment: copy.proposal!.generalComment,
    nextSteps: copy.proposal!.nextSteps.join("\n"),
    grade: { fixed: false },
    rereadDone: [],
  };
}
const otherLevel = (level: number) => (level === 4 ? 3 : level + 1);

beforeEach(() => {
  getSimulator().clear();
  getCaptureSender().clear();
});

describe("the stamp of the list (E7 plan §1.6, C8a)", { timeout: 180_000 }, () => {
  it("is the same rendered and opened while nothing changes, and changes with each change of a line", async () => {
    const teacher = await createUser("teacher");
    const [ada, ben, cyd, dan] = [await createUser("student"), await createUser("student"), await createUser("student"), await createUser("student")];
    const made = await createClass(teacher, { name: "Grade 9" });
    if (!made.ok) throw new Error("Class not created");
    const classId = made.classId;
    const created = await createAssignment(teacher, {
      title: "My town", subject: "Describe your town.", level: "B1", language: "en",
      deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [classId],
    });
    if (!created.ok) throw new Error("Assignment not created");
    const assignmentId = created.assignmentId;

    /** Both stamps, equal, now. */
    const stamp = async () => {
      const rendered = (await listAssignmentCopies(teacher, assignmentId))!.stamp;
      const opened = (await recordListOpened(teacher, assignmentId))!.stamp;
      expect(opened).toBe(rendered);
      return rendered;
    };
    let previous = await stamp();
    /** The stamp changed since the last step, and stays put while nothing else changes. */
    const changed = async (what: string) => {
      const now = await stamp();
      expect(now, what).not.toBe(previous);
      expect(await stamp(), `${what}, read again`).toBe(now);
      previous = now;
      return now;
    };

    // No line yet: the empty list's stamp, equal on both sides.
    expect(await stamp()).toBe(previous);

    // A student listed (joins a recipient class), then three more.
    await db.insert(classMemberships).values({ classId, studentId: ada.userId });
    await changed("a student listed");
    await db.insert(classMemberships).values([ben, cyd, dan].map((s) => ({ classId, studentId: s.userId })));
    await changed("three students listed");

    // A submission: status received, its version.
    const adaRef = await submit(ada, assignmentId);
    await changed("a submission");

    // Evaluated: status to_review, the proposal in force.
    expect((await step(adaRef)).status).toBe("to_review");
    await changed("a proposal");

    // The teacher's first save (revision 1), then a second (revision 2): only the revision differs.
    const first = await form(teacher, assignmentId, ada.userId);
    const firstSaved = await saveTeacherEvaluation(teacher, { ...first, levels: { ...first.levels, task: otherLevel(first.levels.task) } });
    expect(firstSaved.status).toBe("saved");
    await changed("the teacher's first save");
    const second = await form(teacher, assignmentId, ada.userId);
    expect(second.seen.revision).toBe(1);
    const secondSaved = await saveTeacherEvaluation(teacher, {
      ...second,
      levels: { ...second.levels, organization: otherLevel(second.levels.organization) },
    });
    expect(secondSaved.status).toBe("saved");
    await changed("the teacher's second save, the revision alone");

    // A failure (status evaluation_failed), a retry asked (the request), then a refusal:
    // after it, status, version, proposal and request are those before the retry; only `refused` differs.
    const benRef = await submit(ben, assignmentId);
    await changed("a second submission");
    getSimulator().failNext({ kind: "error", status: 529 }, AI_MAX_ATTEMPTS);
    expect((await step(benRef)).status).toBe("evaluation_failed");
    const failed = await changed("a failure");
    const starts: EvaluationRef[] = [];
    expect(await retryCopy(teacher, { submissionId: benRef.submissionId, versionNumber: 1 }, { onStart: (ref) => void starts.push(ref) })).toEqual({
      status: "requested",
    });
    await changed("a retry asked");
    getSimulator().failNext({ kind: "refusal", category: null });
    expect((await step(starts[0])).status).toBe("evaluation_failed");
    expect(await changed("a refusal")).not.toBe(failed);
    const benLine = (await listAssignmentCopies(teacher, assignmentId))!.rows.find((r) => r.studentId === ben.userId);
    expect(benLine).toMatchObject({ status: "evaluation_failed", refused: true, requested: false });

    // A replacement: same status (received), a new version.
    await submit(cyd, assignmentId);
    await changed("a third submission");
    expect((await replaceText(cyd, { assignmentId, requestId: randomUUID(), text: `${TEXT} Version 2.` }))?.ok).toBe(true);
    await changed("a replacement, the version alone");

    // A student with a submission leaves the class: listed still, marked removed.
    await removeStudent(teacher, classId, ben.userId);
    await changed("a class left");
    // A student without one leaves: no longer listed.
    await removeStudent(teacher, classId, dan.userId);
    await changed("a student no longer listed");

    // A name, a class's name.
    await db.update(users).set({ firstName: "Adaline" }).where(eq(users.id, ada.userId));
    await changed("a student's name");
    await db.update(classes).set({ name: "Grade 9 B" }).where(eq(classes.id, classId));
    await changed("a class's name");
  });

  it("is nothing for another teacher's list: absent, as before", async () => {
    const teacher = await createUser("teacher");
    const other = await createUser("teacher");
    const made = await createClass(teacher, { name: "C" });
    if (!made.ok) throw new Error("Class not created");
    const created = await createAssignment(teacher, {
      title: "My town", subject: "Describe your town.", level: "B1", language: "en",
      deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
    });
    if (!created.ok) throw new Error("Assignment not created");
    expect(await recordListOpened(other, created.assignmentId)).toBeNull();
    expect(await recordListOpened(other, randomUUID())).toBeNull();
    expect((await recordListOpened(teacher, created.assignmentId))?.stamp).toEqual(expect.any(String));
  });
});
