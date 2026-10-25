import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import ts from "typescript";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { UNGUARDED_DATA_EXPORTS } from "@/server/access/inventory";
import { ACCESS_MATRIX, ACTIONS, COLUMNS, RESOURCES, type Action, type Column, type Resource } from "@/server/access/matrix";
import { authorize } from "@/server/access/policy";
import { ownedBy } from "@/server/data/access";
import {
  createAssignment,
  deleteAssignment,
  getStudentAssignment,
  getTeacherAssignment,
  listStudentAssignments,
  listTeacherAssignments,
  updateAssignment,
} from "@/server/data/assignments/assignments";
import {
  cancelTeacherInvitation,
  createTeacherInvitation,
  listTeacherInvitations,
  reissueTeacherInvitation,
} from "@/server/data/auth/invitations";
import { createClass, getClass, listClasses } from "@/server/data/classes/classes";
import { disableClassInvite, getClassInvite, renewClassInvite } from "@/server/data/classes/invites";
import { joinClass } from "@/server/data/classes/memberships";
import { listClassStudents, readmitStudent, removeStudent } from "@/server/data/classes/roster";
import { getCopy, getStudentIdentity, recordCopyOpened, saveEvaluation } from "@/server/data/review/copy";
import { listCopyJournal } from "@/server/data/review/journal";
import { publishEvaluation, validateEvaluation, withdrawPublication } from "@/server/data/review/publication";
import type { EvaluationChanges } from "@/lib/review";
import { listAssignmentCopies, recordListOpened } from "@/server/data/review/list";
import { acknowledgeNotice, getNoticeAcknowledgement } from "@/server/data/notices/notices";
import { getCurrentProposal } from "@/server/data/evaluation/proposals";
import {
  listRelaunchable,
  relaunchEvaluation,
  retryEvaluation,
  type EvaluationStartContext,
  type RelaunchConditions,
} from "@/server/data/evaluation/teacher";
import { getPublishedRubrics } from "@/server/data/rubric/rubric";
import { getPublishedResult } from "@/server/data/results/student";
import { addDraftPage, deleteDraftPage, getOwnDraft, readDraftPage, reorderDraftPages } from "@/server/data/submissions/drafts";
import { getPageImage } from "@/server/data/submissions/pages";
import { getOwnSubmission } from "@/server/data/submissions/student";
import { confirmImages, replaceText, submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import {
  assignmentClasses, assignments, classes, classMemberships, noticeAcknowledgements, submissions, teacherEvaluations, users,
} from "@/server/db/schema";
import { getReaderSimulator } from "@/server/ai";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { readPageWith } from "@/server/evaluation/read-page";
import { confirmStudentImages, readStudentPage, uploadDraftPage } from "@/server/submissions/images";
import { preparePage } from "@/server/submissions/page-image";
import sharp from "sharp";
import { STUDENT_NOTICE, TEACHER_NOTICE } from "@/lib/texts";
import { checkDataExports, dataSources, type SourceFile } from "./helpers/access-inventory";

// AUTH-04: every cell of the matrix (fonctionnalites.md §5.4) is replayed.
// Until the real resources exist (E2 onwards), a fictitious resource, test
// only and absent from the migrations, carries each row: its data functions
// are written like real ones (authorize, then ownership in the query). Real
// data functions are replayed against their row as soon as they exist.

const accessProbes = pgTable("access_probes", {
  id: uuid().primaryKey().defaultRandom(),
  studentId: uuid().notNull(),
  teacherId: uuid().notNull(),
  body: text().notNull(),
});

async function readProbe(actor: Actor, resource: Resource, id: string) {
  const grant = authorize(actor, resource, "read");
  const owner = ownedBy(grant, { student: accessProbes.studentId, teacher: accessProbes.teacherId });
  const [row] = await db
    .select({ id: accessProbes.id, body: accessProbes.body })
    .from(accessProbes)
    .where(and(eq(accessProbes.id, id), owner));
  return row ?? null;
}

async function writeProbe(actor: Actor, resource: Resource, id: string, body: string) {
  const grant = authorize(actor, resource, "write");
  const owner = ownedBy(grant, { student: accessProbes.studentId, teacher: accessProbes.teacherId });
  const [row] = await db
    .update(accessProbes)
    .set({ body })
    .where(and(eq(accessProbes.id, id), owner))
    .returning({ id: accessProbes.id });
  return row ?? null;
}

/** One person per column; the probe belongs to the concerned student and the owner teacher. */
const people = {
  concernedStudent: { kind: "user", userId: randomUUID(), role: "student" },
  otherStudent: { kind: "user", userId: randomUUID(), role: "student" },
  ownerTeacher: { kind: "user", userId: randomUUID(), role: "teacher" },
  otherTeacher: { kind: "user", userId: randomUUID(), role: "teacher" },
  admin: { kind: "user", userId: randomUUID(), role: "admin" },
  visitor: { kind: "visitor" },
} satisfies Record<Column, Actor>;

type Outcome = "found" | "absent" | "denied";

/** What the caller learns: the resource, nothing (as if missing), or a refusal. */
async function outcome(attempt: Promise<unknown>): Promise<Outcome> {
  try {
    return (await attempt) ? "found" : "absent";
  } catch (error) {
    if (error instanceof AccessDeniedError) return "denied";
    throw error;
  }
}

const ORIGINAL = "original";
let probeId: string;

const attempt = (action: Action, actor: Actor, resource: Resource, id: string) =>
  outcome(action === "read" ? readProbe(actor, resource, id) : writeProbe(actor, resource, id, "changed"));

const probeBody = async () =>
  (await db.select({ body: accessProbes.body }).from(accessProbes).where(eq(accessProbes.id, probeId)))[0].body;

beforeAll(async () => {
  // The test database is rebuilt from the migrations at each run: the probe never reaches them.
  await db.execute(sql`CREATE TABLE IF NOT EXISTS access_probes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    body text NOT NULL
  )`);
});

beforeEach(async () => {
  const [probe] = await db
    .insert(accessProbes)
    .values({ studentId: people.concernedStudent.userId, teacherId: people.ownerTeacher.userId, body: ORIGINAL })
    .returning({ id: accessProbes.id });
  probeId = probe.id;
});

const cellText = (cell: readonly Action[]) =>
  cell.length === 0 ? "—" : cell.map((a) => (a === "read" ? "L" : "É")).join(" ");

describe.each(RESOURCES)("%s", (resource) => {
  const row = ACCESS_MATRIX[resource];

  it.each(COLUMNS.map((column) => [column, cellText(row[column])] as const))(
    "%s (%s)",
    async (column) => {
      const actor = people[column];
      for (const action of ACTIONS) {
        const onProbe = await attempt(action, actor, resource, probeId);
        if ((row[column] as readonly Action[]).includes(action)) {
          expect(onProbe, `${action} should be allowed`).toBe("found");
        } else {
          // Negative test: refused, and the answer is the one for a resource
          // that does not exist (AUTH-04 R3); nothing is written.
          expect(onProbe, `${action} should be refused`).not.toBe("found");
          expect(await attempt(action, actor, resource, randomUUID())).toBe(onProbe);
          expect(await probeBody()).toBe(ORIGINAL);
        }
      }
    },
  );
});

describe("a missing resource and another person's resource get the same answer (AUTH-04 R3)", () => {
  it.each([
    ["CA2: another student's submission", "otherStudent", "submission"],
    ["CA3: another teacher's class", "otherTeacher", "class"],
    ["CA3: another teacher's copy", "otherTeacher", "aiProposal"],
  ] as const)("%s", async (_label, column, resource) => {
    const ownerCell = ACCESS_MATRIX[resource][column === "otherStudent" ? "concernedStudent" : "ownerTeacher"] as readonly Action[];
    const action = ownerCell.includes("read") ? "read" : "write";
    const onOther = await attempt(action, people[column], resource, probeId);
    expect(onOther).toBe("absent");
    expect(await attempt(action, people[column], resource, randomUUID())).toBe("absent");
  });
});


// Real data functions, replayed against their row. A resource whose data
// functions call authorize() must appear here (checked below).
// `setup` builds the resource of the concerned student and the owner teacher;
// an operation reaches it, or (`creates`) makes a new one for the actor.
type Fixture = Record<string, string>;
type Operation = { run: (actor: Actor, fixture: Fixture) => Promise<unknown>; creates?: boolean };
/** One operation per action, or several when the action has more than one entry point. */
type RealResource = { setup?: () => Promise<Fixture> } & Partial<Record<Action, Operation | Operation[]>>;

const isStudent = (actor: Actor) => actor.kind === "user" && actor.role === "student";

/**
 * A student's read of a submission is their own text (getOwnSubmission, E8.3);
 * the teachers' screens (`teacherRead`) stay refused to them by their ownership
 * filter (tests/student-result.int.test.ts).
 */
const orOwnText =
  (teacherRead: Operation["run"]): Operation["run"] =>
  (actor, fixture) =>
    isStudent(actor) ? getOwnSubmission(actor, fixture.submittedId) : teacherRead(actor, fixture);

const REAL: Partial<Record<Resource, RealResource>> = {
  teacherInvitation: {
    setup: openInvitation,
    read: { run: (actor) => listTeacherInvitations(actor) },
    write: [
      {
        run: (actor) => createTeacherInvitation(actor, { firstName: "Tara", lastName: "Quinn", email: "tara@example.test" }),
        creates: true,
      },
      // AUTH-03 CA3: a new link for the open invitation, then its cancellation.
      { run: (actor, { invitationId }) => reissueTeacherInvitation(actor, invitationId) },
      { run: (actor, { invitationId }) => cancelTeacherInvitation(actor, invitationId) },
    ],
  },
  class: {
    setup: ownedClass,
    read: [
      { run: (actor, { classId }) => getClass(actor, classId) },
      // CLS-04 CA1, CA3: the class in the actor's list (the teacher's own, the student's active ones).
      {
        run: async (actor, { classId }) =>
          ((await listClasses(actor)).classes as { id: string }[]).find((c) => c.id === classId) ?? null,
      },
    ],
    // Creating a class makes the actor's own; there is no "other" one to reach.
    write: { run: (actor) => createClass(actor, { name: "Grade 10 — A" }), creates: true },
  },
  classInvite: {
    setup: ownedClass,
    read: { run: (actor, { classId }) => getClassInvite(actor, classId) },
    write: [
      { run: (actor, { classId }) => renewClassInvite(actor, classId) },
      { run: (actor, { classId }) => disableClassInvite(actor, classId) },
    ],
  },
  classMembership: {
    // Joining makes the actor's own membership; an unknown code is refused, nothing joined.
    write: { run: (actor) => joinClass(actor, { code: "ZZZZ-9999" }), creates: true },
  },
  classRoster: {
    setup: ownedClass,
    read: { run: (actor, { classId }) => listClassStudents(actor, classId) },
    // Removing the concerned student, then readmitting them (CLS-04 R1, R2).
    write: [
      { run: (actor, { classId }) => removeStudent(actor, classId, people.concernedStudent.userId) },
      { run: (actor, { classId }) => readmitStudent(actor, classId, people.concernedStudent.userId) },
    ],
  },
  // Reading: the teacher's page, or the student's list of received assignments (SUB-01).
  // Editing the owner's assignment (ASG-03): another teacher's edit finds nothing.
  assignment: {
    setup: ownedAssignment,
    read: {
      run: (actor, { assignmentId }) =>
        actor.kind === "user" && actor.role === "student"
          ? getStudentAssignment(actor, assignmentId)
          : getTeacherAssignment(actor, assignmentId),
    },
    write: [
      { run: (actor, { assignmentId }) => updateAssignment(actor, assignmentId, { title: "Renamed", level: "B2" }) },
      // ASG-03 R2: deleted, without a submission; another teacher's delete finds nothing.
      { run: (actor, { assignmentId }) => deleteAssignment(actor, assignmentId) },
    ],
  },
  // Sending an assignment to the owner's class: the other teacher's request
  // is refused like a missing class, nothing created (ASG-01 R3).
  assignmentRecipients: {
    setup: ownedAssignment,
    // The teacher's page and list carry the recipient classes: the student is refused there.
    read: [
      { run: (actor, { assignmentId }) => getTeacherAssignment(actor, assignmentId) },
      // ASG-02 CA1: the assignment in the teacher's list.
      { run: async (actor, { assignmentId }) => (await listTeacherAssignments(actor)).find((a) => a.id === assignmentId) ?? null },
    ],
    write: { run: sendAssignment },
  },
  // The student's state of a received assignment, in the list and on its page; a teacher is refused (SUB-01 R3).
  ownSubmissionStatus: {
    setup: ownedAssignment,
    read: {
      run: async (actor, { assignmentId }) =>
        (await receivedAssignment(actor, assignmentId)) && (await getStudentAssignment(actor, assignmentId))?.status,
    },
  },
  // The student's own reading of the notice (NFR-DON-04): reading it makes it theirs.
  // Each role's own notice: the student's (E4), the teacher's (E7.7).
  noticeAcknowledgement: {
    setup: noticesOfOwners,
    read: { run: (actor) => getNoticeAcknowledgement(actor) },
    write: {
      run: (actor) => acknowledgeNotice(actor, actor.kind === "user" && actor.role === "teacher" ? TEACHER_NOTICE.version : STUDENT_NOTICE.version),
      creates: true,
    },
  },
  // Submitting to the owner's assignment (SUB-02), and replacing the submission
  // the concerned student already made to another (SUB-05): the student writes
  // their own; another student finds nothing; a teacher is refused. Never read
  // back by the student (A3). The owner teacher reads the copies offered for
  // a relaunch (PRC-02 R4, E6.3) and the list of REV-01 (E7.2).
  submission: {
    setup: async () => {
      const fixture = { ...(await ownedAssignment()), ...(await noticeRead()) };
      const { assignmentId: submittedId } = await ownedAssignment(fixture.classId);
      const first = await submitText(people.concernedStudent, {
        assignmentId: submittedId, contentVersion: 1, requestId: randomUUID(), text: "My first text.",
      });
      if (!first?.ok) throw new Error("Not submitted");
      await forceState(first.ref.submissionId, "not_assessable", "ai_unavailable");
      // E9, AC-12: a page of a version, served by the image route alone.
      const { assignmentId: imagesId } = await ownedAssignment(fixture.classId);
      const { versionPageId } = await confirmedPages(imagesId);
      return { ...fixture, submittedId, versionPageId };
    },
    // A student reads their own text back (SUB-01 R2, E8.3); each teacher's
    // screen is replayed for the teachers and the administrator.
    read: [
      { run: orOwnText(async (actor, { submittedId }) => (await listRelaunchable(actor, submittedId, AI_BACK)).length > 0 || null) },
      // REV-01 (E7.2): the list of the assignment's submissions, and its opening logged.
      { run: orOwnText((actor, { submittedId }) => listAssignmentCopies(actor, submittedId)) },
      { run: orOwnText((actor, { submittedId }) => recordListOpened(actor, submittedId)) },
      // REV-02 (E7.3): the copy of the concerned student, and its opening logged.
      { run: orOwnText((actor, { submittedId }) => getCopy(actor, submittedId, people.concernedStudent.userId)) },
      {
        run: orOwnText(async (actor, { submittedId }) => {
          const [{ id }] = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.assignmentId, submittedId));
          return recordCopyOpened(actor, id);
        }),
      },
      // E9, AC-12: a version's page, to its author and the owner teacher only (getPageImage, the route /api/pages/[pageId]).
      { run: (actor, { versionPageId }) => getPageImage(actor, versionPageId) },
    ],
    write: [
      {
        run: (actor, { assignmentId }) =>
          submitText(actor, { assignmentId, contentVersion: 1, requestId: randomUUID(), text: "My town is small." }),
      },
      {
        run: (actor, { submittedId }) =>
          replaceText(actor, { assignmentId: submittedId, requestId: randomUUID(), text: "My new text." }),
      },
    ],
  },
  // E9 (spec 0011, AC-12): the concerned student's pages before sending, two
  // in their draft; another student finds nothing, every other role is
  // refused: the teacher never sees a draft.
  draft: {
    setup: ownDraft,
    read: { run: (actor, { assignmentId }) => getOwnDraft(actor, assignmentId) },
    write: [
      { run: (actor, { pageId }) => readDraftPage(actor, pageId, readPageWith(pageId, { reader: getReaderSimulator() })) },
      { run: (actor, { draftId, pageId, secondPageId }) => reorderDraftPages(actor, draftId, [secondPageId, pageId]) },
      { run: (actor, { secondPageId }) => deleteDraftPage(actor, secondPageId) },
      { run: async (actor, { assignmentId }) => addDraftPage(actor, { assignmentId, uploadRequestId: randomUUID(), page: await blankPage() }) },
    ],
  },
  // E9: the student writes their transcription once, at confirmation, and
  // reads it back; the owner teacher reads it on the copy.
  transcription: {
    setup: async () => {
      const fixture = await ownDraft();
      // The other teacher read their notice: what they miss is the owner's copy (as noticeRead).
      await db.insert(noticeAcknowledgements).values({ userId: people.otherTeacher.userId, notice: "teacher_review", version: TEACHER_NOTICE.version });
      const { assignmentId: imagesId } = await ownedAssignment(fixture.classId);
      await confirmedPages(imagesId);
      return { ...fixture, imagesId };
    },
    read: {
      run: (actor, { imagesId }) =>
        isStudent(actor) ? getOwnSubmission(actor, imagesId) : getCopy(actor, imagesId, people.concernedStudent.userId),
    },
    write: {
      run: (actor, { assignmentId, draftId }) =>
        confirmImages(actor, { assignmentId, draftId, contentVersion: 1, requestId: randomUUID(), changes: [], mode: "unchecked" }),
    },
  },
  // PRC-02 (E6.3): the owner teacher retries a failed copy, relaunches one
  // offered, evaluates one by hand; another teacher finds nothing; a student
  // is refused. Reading the evaluation in progress comes with REV-02 (E7).
  unpublishedEvaluation: {
    setup: async () => {
      const fixture = { ...(await ownedAssignment()), ...(await noticeRead()) };
      const { assignmentId: secondId } = await ownedAssignment(fixture.classId);
      const { assignmentId: thirdId } = await ownedAssignment(fixture.classId);
      const ids: string[] = [];
      for (const assignmentId of [fixture.assignmentId, secondId, thirdId]) {
        const submitted = await submitText(people.concernedStudent, {
          assignmentId, contentVersion: 1, requestId: randomUUID(), text: "My town is small and quiet.",
        });
        if (!submitted?.ok) throw new Error("Not submitted");
        ids.push(submitted.ref.submissionId);
      }
      await forceState(ids[0], "evaluation_failed");
      await forceState(ids[1], "not_assessable", "ai_unavailable");
      // A copy to review, with the simulator's proposal: the one saveEvaluation writes.
      if ((await evaluateSubmission(ids[2])).status !== "to_review") throw new Error("Not evaluated");
      const [{ proposalId }] = await db
        .select({ proposalId: submissions.currentProposalId })
        .from(submissions)
        .where(eq(submissions.id, ids[2]));
      if (!proposalId) throw new Error("No proposal");
      return { ...fixture, failedId: ids[0], unavailableId: ids[1], toReviewId: ids[2], proposalId };
    },
    // REV-02 (E7.3): the copy carries the evaluation in progress.
    read: { run: (actor, { assignmentId }) => getCopy(actor, assignmentId, people.concernedStudent.userId) },
    write: [
      { run: (actor, { failedId }) => retryEvaluation(actor, { submissionId: failedId, versionNumber: 1 }, NO_START) },
      {
        run: (actor, { unavailableId }) =>
          relaunchEvaluation(actor, { submissionId: unavailableId, versionNumber: 1 }, AI_BACK, NO_START),
      },
      // REV-06 (E8.2): the owner enters the failed copy by hand: its first save starts the copy (transition 6)
      // and the evaluation, "manual", together; another teacher's copy is absent, nothing written for them.
      {
        run: async (actor, { failedId }) => {
          const result = await saveEvaluation(actor, { submissionId: failedId, versionNumber: 1, proposalId: null, revision: 0 }, SAVED_FORM);
          if (result && !(result.ok && result.changed && (await statusOf(failedId)) === "to_review")) {
            throw new Error(`Not entered by hand: ${JSON.stringify(result)}`);
          }
          return result;
        },
      },
      // REV-03 (E7.4): saving the form of the copy to review, as the page saw it: the owner's
      // evaluation is written (revision 1, through record.ts); another teacher's copy is absent,
      // and nothing is written for them.
      {
        run: async (actor, { toReviewId, proposalId }) => {
          const result = await saveEvaluation(actor, { submissionId: toReviewId, versionNumber: 1, proposalId, revision: 0 }, SAVED_FORM);
          const written = await db
            .select({ revision: teacherEvaluations.revision })
            .from(teacherEvaluations)
            .where(eq(teacherEvaluations.submissionId, toReviewId));
          if (result && !(result.ok && result.changed && result.evaluation.revision === 1 && written[0]?.revision === 1)) {
            throw new Error(`Not saved: ${JSON.stringify(result)}`);
          }
          if (!result && written.length > 0) throw new Error("Written for an actor who found nothing");
          return result;
        },
      },
      // REV-05, PUB-01 (E8.1): the owner validates the copy just saved, then publishes it.
      {
        run: async (actor, { toReviewId, proposalId }) => {
          const result = await validateEvaluation(actor, { submissionId: toReviewId, versionNumber: 1, proposalId, revision: 1 }, SAVED_FORM);
          if (result && !(result.ok && !result.already && (await statusOf(toReviewId)) === "validated")) {
            throw new Error(`Not validated: ${JSON.stringify(result)}`);
          }
          return result;
        },
      },
      {
        run: async (actor, { toReviewId, proposalId }) => {
          const result = await publishEvaluation(actor, { submissionId: toReviewId, versionNumber: 1, proposalId, revision: 1 });
          if (result && !(result.ok && !result.already && (await statusOf(toReviewId)) === "published")) {
            throw new Error(`Not published: ${JSON.stringify(result)}`);
          }
          return result;
        },
      },
    ],
  },
  // PUB-01 R2 (E8.1): the owner withdraws the publication of a published copy;
  // another teacher finds nothing; the student, who reads it (E8.3), cannot.
  // PUB-02 (E8.3): the concerned student reads their result, another finds
  // nothing; the owner teacher reads it on the copy.
  publishedEvaluation: {
    setup: async () => {
      const fixture = { ...(await ownedAssignment()), ...(await noticeRead()) };
      const { assignmentId: secondId } = await ownedAssignment(fixture.classId);
      const published: { submissionId: string; proposalId: string }[] = [];
      for (const assignmentId of [fixture.assignmentId, secondId]) {
        const submitted = await submitText(people.concernedStudent, {
          assignmentId, contentVersion: 1, requestId: randomUUID(), text: "My town is small and quiet.",
        });
        if (!submitted?.ok) throw new Error("Not submitted");
        const submissionId = submitted.ref.submissionId;
        if ((await evaluateSubmission(submissionId)).status !== "to_review") throw new Error("Not evaluated");
        const [{ proposalId }] = await db.select({ proposalId: submissions.currentProposalId }).from(submissions).where(eq(submissions.id, submissionId));
        const seen = { submissionId, versionNumber: 1, proposalId, revision: 1 };
        const validated = await validateEvaluation(people.ownerTeacher, { ...seen, revision: 0 }, SAVED_FORM);
        const done = await publishEvaluation(people.ownerTeacher, seen);
        if (!validated?.ok || !done?.ok) throw new Error("Not published");
        published.push({ submissionId, proposalId: proposalId! });
      }
      const [first, second] = published;
      return { ...fixture, ...first, secondId: second.submissionId, secondProposalId: second.proposalId };
    },
    read: {
      run: (actor, { assignmentId }) =>
        isStudent(actor) ? getPublishedResult(actor, assignmentId) : getCopy(actor, assignmentId, people.concernedStudent.userId),
    },
    write: [
      {
        run: async (actor, { submissionId, proposalId }) => {
          const result = await withdrawPublication(actor, { submissionId, versionNumber: 1, proposalId, revision: 1 });
          if (result && !(result.ok && !result.already && (await statusOf(submissionId)) === "validated")) {
            throw new Error(`Not withdrawn: ${JSON.stringify(result)}`);
          }
          return result;
        },
      },
      // REV-03 R5, Q8 (E8.1): changing the second published copy sends it back To review, the
      // publication gone; another teacher finds nothing, and it stays published for them.
      {
        run: async (actor, { secondId, secondProposalId }) => {
          const seen = { submissionId: secondId, versionNumber: 1, proposalId: secondProposalId, revision: 1 };
          const result = await saveEvaluation(actor, seen, { ...SAVED_FORM, generalComment: "Changed after publication." });
          const status = await statusOf(secondId);
          if (result && !(result.ok && result.changed && status === "to_review")) throw new Error(`Not sent back: ${JSON.stringify(result)}`);
          if (!result && status !== "published") throw new Error(`Changed for an actor who found nothing: ${status}`);
          return result;
        },
      },
    ],
  },
  // REV-04 R3 (E7.6, E7.7): the copy reads from the log whether the teacher's last
  // request was dropped; the corrector only.
  reviewLog: {
    setup: async () => {
      const fixture = { ...(await ownedAssignment()), ...(await noticeRead()) };
      const submitted = await submitText(people.concernedStudent, {
        assignmentId: fixture.assignmentId, contentVersion: 1, requestId: randomUUID(), text: "My town is small and quiet.",
      });
      if (!submitted?.ok) throw new Error("Not submitted");
      return { ...fixture, submissionId: submitted.ref.submissionId };
    },
    read: [
      { run: (actor, { assignmentId }) => getCopy(actor, assignmentId, people.concernedStudent.userId) },
      // REV-04 R3 (E7.7): the copy's history, by direct request.
      { run: (actor, { submissionId }) => listCopyJournal(actor, submissionId) },
    ],
  },
  // Invariant 9: the concerned student's name and email, for themself and
  // the teacher of their class (REV-02, E7.3); another person finds nothing.
  studentAccount: {
    setup: ownedClass,
    read: { run: (actor) => getStudentIdentity(actor, people.concernedStudent.userId) },
  },
  // EVL-01: every signed-in role reads the versions in force; a visitor is
  // refused. No write operation: none exists (CA1, tests/access-inventory.test.ts).
  rubric: {
    read: { run: (actor) => getPublishedRubrics(actor) },
  },
  // EVL-03: the proposal in force of the concerned student's submission,
  // evaluated by the simulator. Read by the owner teacher only; written by
  // the system alone, so no write operation (inventory.ts).
  aiProposal: {
    setup: async () => {
      const fixture = { ...(await ownedAssignment()), ...(await noticeRead()) };
      const submitted = await submitText(people.concernedStudent, {
        assignmentId: fixture.assignmentId, contentVersion: 1, requestId: randomUUID(), text: "My town is small and quiet.",
      });
      if (!submitted?.ok) throw new Error("Not submitted");
      const [{ id: submissionId }] = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.assignmentId, fixture.assignmentId));
      if ((await evaluateSubmission(submissionId)).status !== "to_review") throw new Error("Not evaluated");
      return { ...fixture, submissionId };
    },
    read: [
      { run: (actor, { submissionId }) => getCurrentProposal(actor, submissionId) },
      { run: (actor, { assignmentId }) => getCopy(actor, assignmentId, people.concernedStudent.userId) },
    ],
  },
};

/** The cost cap not reached, English published: an "AI unavailable" copy without a budget error is offered. */
const AI_BACK: RelaunchConditions = { rubricLanguages: ["en"], costCapReached: false };
const NO_START: EvaluationStartContext = { onStart: () => {} };
const SAVED_FORM: EvaluationChanges = {
  levels: { task: 2, organization: 2, vocabulary: 2, grammar: 2, mechanics: 2 },
  remarks: { task: "", organization: "", vocabulary: "", grammar: "", mechanics: "" },
  // Never the simulator's comment: the save changes something, so it writes.
  generalComment: "Saved by the access matrix replay.", nextSteps: [], grade: { fixed: false }, rereadDone: [],
};

/** An open invitation of the administrator (AUTH-03), for its reissue and cancellation. */
async function openInvitation(): Promise<Fixture> {
  const created = await createTeacherInvitation(people.admin, { firstName: "Uma", lastName: "Reed", email: "uma@example.test" });
  if (!created.ok) throw new Error(`Not invited: ${created.reason}`);
  return { invitationId: created.invitation.invitationId };
}

/** The stored state of a submission: what an owner's act really changed. */
const statusOf = async (id: string) => (await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, id)))[0]?.status;

/** Puts a submission in a state the evaluation reaches, directly. */
const forceState = (id: string, status: "evaluation_failed" | "not_assessable", cause?: "ai_unavailable") =>
  db.update(submissions).set({ status, notAssessableCause: cause ?? null }).where(eq(submissions.id, id));

/** The concerned student read the notice in force. */
/** The notices read: the concerned student's, and the owner teacher's (E7.7). */
async function noticesOfOwners(): Promise<Fixture> {
  await db.insert(noticeAcknowledgements).values([
    { userId: people.concernedStudent.userId, notice: "student_submission", version: STUDENT_NOTICE.version },
    { userId: people.ownerTeacher.userId, notice: "teacher_review", version: TEACHER_NOTICE.version },
  ]);
  return {};
}

/**
 * For the copies: the other teacher read their notice too, so that what
 * they miss is the owner's copy, not the notice (NFR-DON-04, E7.7).
 */
async function noticeRead(): Promise<Fixture> {
  await noticesOfOwners();
  await db.insert(noticeAcknowledgements).values({ userId: people.otherTeacher.userId, notice: "teacher_review", version: TEACHER_NOTICE.version });
  return {};
}

/** The fixture's assignment in the student's list; null when not received. */
async function receivedAssignment(actor: Actor, assignmentId: string) {
  return (await listStudentAssignments(actor)).find((a) => a.id === assignmentId) ?? null;
}

/** The owner's class with the concerned student (or the class given), and an assignment sent to it. */
async function ownedAssignment(classId?: string): Promise<Fixture> {
  const fixture = classId ? { classId } : await ownedClass();
  const [created] = await db
    .insert(assignments)
    .values({
      teacherId: people.ownerTeacher.userId, title: "Owned assignment", subject: "Subject",
      level: "B1", language: "en", deadline: new Date(Date.now() + 24 * 3600 * 1000),
    })
    .returning({ id: assignments.id });
  await db.insert(assignmentClasses).values({
    assignmentId: created.id, classId: fixture.classId, teacherId: people.ownerTeacher.userId,
  });
  return { ...fixture, assignmentId: created.id };
}

/** Creates an assignment for the fixture's class; null when refused (as absent). */
async function sendAssignment(actor: Actor, { classId }: Fixture) {
  const result = await createAssignment(actor, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000), instructions: null, classIds: [classId],
  });
  return result.ok ? result : null;
}

/** A class of the owner teacher, with the concerned student as an active member. */
async function ownedClass(): Promise<Fixture> {
  const [owned] = await db
    .insert(classes)
    .values({
      teacherId: people.ownerTeacher.userId, name: "Owned class",
      inviteNonce: "n", inviteLinkDigest: "l", inviteCodeDigest: "c",
    })
    .returning({ id: classes.id });
  await db.insert(classMemberships).values({ classId: owned.id, studentId: people.concernedStudent.userId });
  return { classId: owned.id };
}

/** A blank photographed page, as the browser sends it. */
const blankJpeg = () => sharp({ create: { width: 600, height: 800, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();

/** The same page checked as the upload route checks it. */
const blankPage = async () => preparePage(await blankJpeg(), { formats: ["jpeg"] });

/** One page into the concerned student's draft for the assignment. */
async function uploadPage(assignmentId: string) {
  const uploaded = await uploadDraftPage(people.concernedStudent, assignmentId, { uploadRequestId: randomUUID() }, await blankJpeg());
  if (uploaded.status !== 200 || !("pageId" in uploaded.body)) throw new Error("Page not uploaded");
  return uploaded.body;
}

/** The concerned student's draft for an owned assignment: two pages, not read yet. */
async function ownDraft(): Promise<Fixture> {
  const fixture = { ...(await ownedAssignment()), ...(await noticesOfOwners()) };
  const first = await uploadPage(fixture.assignmentId);
  const second = await uploadPage(fixture.assignmentId);
  return { ...fixture, draftId: first.draftId, pageId: first.pageId, secondPageId: second.pageId };
}

/** The concerned student's page read and sent to the assignment (notice read already): the version's page. */
async function confirmedPages(assignmentId: string) {
  const { draftId, pageId } = await uploadPage(assignmentId);
  getReaderSimulator().clear();
  if ((await readStudentPage(people.concernedStudent, pageId, { reader: getReaderSimulator() })).status !== "read") throw new Error("Page not read");
  const confirmed = await confirmStudentImages(
    people.concernedStudent,
    { assignmentId, draftId, contentVersion: 1, requestId: randomUUID(), changes: [], mode: "checked" },
    { onReceived: () => {} },
  );
  if (confirmed.status !== "done") throw new Error("Pages not confirmed");
  return { versionPageId: pageId };
}

const OWN_COLUMN = { student: "concernedStudent", teacher: "ownerTeacher" } as const;

/**
 * What a real operation must give: found where the cell allows it; for
 * another person's resource, absent like a missing one (AUTH-04 R3), unless
 * the operation creates the actor's own; denied for a role without the action.
 */
function expected(resource: Resource, column: Column, action: Action, operation: Operation): Outcome {
  const allows = (c: Column) => (ACCESS_MATRIX[resource][c] as readonly Action[]).includes(action);
  if (allows(column)) return "found";
  const actor = people[column];
  if (actor.kind === "user" && (actor.role === "student" || actor.role === "teacher") && allows(OWN_COLUMN[actor.role])) {
    return operation.creates ? "found" : "absent";
  }
  return "denied";
}

const parse = (file: SourceFile) => ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const exported = (node: ts.Node) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/**
 * The data functions that call authorize(): every export of src/server/data/
 * taking an Actor first, except those UNGUARDED_DATA_EXPORTS lists with their
 * reason (tests/access-inventory.test.ts checks that the others do call it).
 */
function guardedDataExports(files: SourceFile[]): string[] {
  const keys: string[] = [];
  for (const file of files) {
    const source = parse(file);
    for (const statement of source.statements) {
      const functions: [string, ts.SignatureDeclarationBase][] = [];
      if (ts.isFunctionDeclaration(statement) && exported(statement) && statement.name) {
        functions.push([statement.name.text, statement]);
      } else if (ts.isVariableStatement(statement) && exported(statement)) {
        for (const d of statement.declarationList.declarations) {
          if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
            functions.push([d.name.getText(source), d.initializer]);
          }
        }
      }
      for (const [name, fn] of functions) {
        const key = `${file.path}#${name}`;
        if (fn.parameters[0]?.type?.getText(source) === "Actor" && !UNGUARDED_DATA_EXPORTS[key]) keys.push(key);
      }
    }
  }
  return keys;
}

/**
 * The functions REAL's operations call (setups left out: building a fixture
 * replays nothing), with those of the module's helpers they use,
 * transitively, and the imports of the module: local name by imported name,
 * per specifier. Read from the syntax tree, never from the text: a call
 * cited in a comment, or in a string, is no call.
 */
function realOperations(file: SourceFile): { called: Set<string>; imports: Map<string, Map<string, string>> } {
  const source = parse(file);
  const helpers = new Map<string, ts.Node>();
  const imports = new Map<string, Map<string, string>>();
  let real: ts.ObjectLiteralExpression | undefined;
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        const names = imports.get(statement.moduleSpecifier.text) ?? new Map<string, string>();
        for (const element of bindings.elements) names.set((element.propertyName ?? element.name).text, element.name.text);
        imports.set(statement.moduleSpecifier.text, names);
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      helpers.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) {
        const name = d.name.getText(source);
        if (name === "REAL" && d.initializer && ts.isObjectLiteralExpression(d.initializer)) real = d.initializer;
        else helpers.set(name, d);
      }
    }
  }
  if (!real) throw new Error("REAL not found");
  // Identifiers and direct calls (`name(…)`) of the scanned nodes: comments are trivia, outside the tree.
  const referenced = new Set<string>();
  const called = new Set<string>();
  const scan = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) referenced.add(node.text);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) called.add(node.expression.text);
    ts.forEachChild(node, scan);
  };
  for (const resource of real.properties) {
    if (!ts.isPropertyAssignment(resource) || !ts.isObjectLiteralExpression(resource.initializer)) continue;
    for (const property of resource.initializer.properties) {
      if (ts.isPropertyAssignment(property) && (ACTIONS as readonly string[]).includes(property.name.getText(source))) {
        scan(property.initializer);
      }
    }
  }
  const used = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, node] of helpers) {
      if (!used.has(name) && referenced.has(name)) {
        used.add(name);
        scan(node);
        grew = true;
      }
    }
  }
  return { called, imports };
}

/** Guarded data functions no operation of REAL calls, imported from their module. */
function missingFromReal(files: SourceFile[], self: SourceFile): string[] {
  const { called, imports } = realOperations(self);
  return guardedDataExports(files).filter((key) => {
    const [path, name] = key.split("#");
    const local = imports.get(`@/${path.replace(/^src\//, "").replace(/\.tsx?$/, "")}`)?.get(name);
    return !local || !called.has(local);
  });
}

const SELF: SourceFile = {
  path: "tests/access-matrix.int.test.ts",
  text: readFileSync(fileURLToPath(import.meta.url), "utf8"),
};

describe("real data functions follow their row", () => {
  it("covers every resource the data layer authorizes", () => {
    const { resources } = checkDataExports(dataSources());
    expect([...resources].filter((r) => !(r in REAL))).toEqual([]);
  });

  it("replays every data function that authorizes, UNGUARDED_DATA_EXPORTS aside", () => {
    const sources = dataSources();
    expect(guardedDataExports(sources)).toContain("src/server/data/review/copy.ts#saveEvaluation");
    expect(missingFromReal(sources, SELF)).toEqual([]);
  });

  it("would see a data function left out of REAL, or called only to build a fixture", () => {
    const probe = {
      path: "src/server/data/probes.ts",
      text: `export async function readProbe(actor: Actor, id: string) { authorize(actor, "submission", "read"); return id; }`,
    };
    expect(missingFromReal([...dataSources(), probe], SELF)).toEqual(["src/server/data/probes.ts#readProbe"]);
    // submitText is also called by setups; left out of the operations, it is reported.
    const withoutSubmit = { ...SELF, text: SELF.text.replace(/submitText\(actor,/g, "submitTextProbe(actor,") };
    expect(missingFromReal(dataSources(), withoutSubmit)).toEqual(["src/server/data/submissions/submissions.ts#submitText"]);
    // Cited in a comment inside REAL, never called: still reported (a text search counted it).
    const citedOnly = { ...SELF, text: SELF.text.replace(/submitText\(actor,/g, "/* submitText(actor, */ submitTextProbe(actor,") };
    expect(citedOnly.text).toContain("/* submitText(actor, */");
    expect(missingFromReal(dataSources(), citedOnly)).toEqual(["src/server/data/submissions/submissions.ts#submitText"]);
  });

  beforeEach(async () => {
    await db.insert(users).values(
      COLUMNS.flatMap((column) => {
        const actor = people[column];
        return actor.kind === "user"
          ? [{
              id: actor.userId, email: `${column.toLowerCase()}@example.test`, emailVerified: true,
              name: column, firstName: column, lastName: "User", role: actor.role,
            }]
          : [];
      }),
    );
  });

  for (const [resource, real] of Object.entries(REAL) as [Resource, RealResource][]) {
    it.each(COLUMNS)(`${resource}: %s`, async (column) => {
      const fixture = (await real.setup?.()) ?? {};
      for (const action of ACTIONS) {
        for (const [i, operation] of [real[action] ?? []].flat().entries()) {
          expect(await outcome(operation.run(people[column], fixture)), `${action} #${i + 1}`).toBe(
            expected(resource, column, action, operation),
          );
        }
      }
      // A setup that evaluates and publishes copies takes most of the default 15 s on Neon.
    }, 60_000);
  }
});
