import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { ACCESS_MATRIX, ACTIONS, COLUMNS, RESOURCES, type Action, type Column, type Resource } from "@/server/access/matrix";
import { authorize } from "@/server/access/policy";
import { ownedBy } from "@/server/data/access";
import {
  createAssignment,
  getStudentAssignment,
  getTeacherAssignment,
  listStudentAssignments,
  updateAssignment,
} from "@/server/data/assignments/assignments";
import { createTeacherInvitation, listTeacherInvitations } from "@/server/data/auth/invitations";
import { createClass, getClass } from "@/server/data/classes/classes";
import { getClassInvite, renewClassInvite } from "@/server/data/classes/invites";
import { joinClass } from "@/server/data/classes/memberships";
import { listClassStudents, removeStudent } from "@/server/data/classes/roster";
import { getCopy, getStudentIdentity, recordCopyOpened, saveEvaluation } from "@/server/data/review/copy";
import { listCopyJournal } from "@/server/data/review/journal";
import type { EvaluationChanges } from "@/lib/review";
import { listAssignmentCopies, recordListOpened } from "@/server/data/review/list";
import { acknowledgeNotice, getNoticeAcknowledgement } from "@/server/data/notices/notices";
import { getCurrentProposal } from "@/server/data/evaluation/proposals";
import {
  listRelaunchable,
  relaunchEvaluation,
  retryEvaluation,
  startManualEvaluation,
  type EvaluationStartContext,
  type RelaunchConditions,
} from "@/server/data/evaluation/teacher";
import { getPublishedRubrics } from "@/server/data/rubric/rubric";
import { replaceText, submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import {
  assignmentClasses, assignments, classes, classMemberships, noticeAcknowledgements, submissions, users,
} from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { STUDENT_NOTICE, TEACHER_NOTICE } from "@/lib/texts";
import { checkDataExports, dataSources } from "./helpers/access-inventory";

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

const REAL: Partial<Record<Resource, RealResource>> = {
  teacherInvitation: {
    read: { run: (actor) => listTeacherInvitations(actor) },
    write: {
      run: (actor) => createTeacherInvitation(actor, { firstName: "Tara", lastName: "Quinn", email: "tara@example.test" }),
      creates: true,
    },
  },
  class: {
    setup: ownedClass,
    read: { run: (actor, { classId }) => getClass(actor, classId) },
    // Creating a class makes the actor's own; there is no "other" one to reach.
    write: { run: (actor) => createClass(actor, { name: "Grade 10 — A" }), creates: true },
  },
  classInvite: {
    setup: ownedClass,
    read: { run: (actor, { classId }) => getClassInvite(actor, classId) },
    write: { run: (actor, { classId }) => renewClassInvite(actor, classId) },
  },
  classMembership: {
    // Joining makes the actor's own membership; an unknown code is refused, nothing joined.
    write: { run: (actor) => joinClass(actor, { code: "ZZZZ-9999" }), creates: true },
  },
  classRoster: {
    setup: ownedClass,
    read: { run: (actor, { classId }) => listClassStudents(actor, classId) },
    write: { run: (actor, { classId }) => removeStudent(actor, classId, people.concernedStudent.userId) },
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
    write: { run: (actor, { assignmentId }) => updateAssignment(actor, assignmentId, { title: "Renamed", level: "B2" }) },
  },
  // Sending an assignment to the owner's class: the other teacher's request
  // is refused like a missing class, nothing created (ASG-01 R3).
  assignmentRecipients: {
    setup: ownedAssignment,
    // The teacher's page carries the recipient classes: the student is refused there.
    read: { run: (actor, { assignmentId }) => getTeacherAssignment(actor, assignmentId) },
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
      return { ...fixture, submittedId };
    },
    read: [
      { run: async (actor, { submittedId }) => (await listRelaunchable(actor, submittedId, AI_BACK)).length > 0 || null },
      // REV-01 (E7.2): the list of the assignment's submissions, and its opening logged.
      { run: (actor, { submittedId }) => listAssignmentCopies(actor, submittedId) },
      { run: (actor, { submittedId }) => recordListOpened(actor, submittedId) },
      // REV-02 (E7.3): the copy of the concerned student, and its opening logged.
      { run: (actor, { submittedId }) => getCopy(actor, submittedId, people.concernedStudent.userId) },
      {
        run: async (actor, { submittedId }) => {
          const [{ id }] = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.assignmentId, submittedId));
          return recordCopyOpened(actor, id);
        },
      },
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
  // PRC-02 (E6.3): the owner teacher retries a failed copy, relaunches one
  // offered, evaluates one by hand; another teacher finds nothing; a student
  // is refused. Reading the evaluation in progress comes with REV-02 (E7).
  unpublishedEvaluation: {
    setup: async () => {
      const fixture = { ...(await ownedAssignment()), ...(await noticeRead()) };
      const { assignmentId: secondId } = await ownedAssignment(fixture.classId);
      const ids: string[] = [];
      for (const assignmentId of [fixture.assignmentId, secondId]) {
        const submitted = await submitText(people.concernedStudent, {
          assignmentId, contentVersion: 1, requestId: randomUUID(), text: "My town is small and quiet.",
        });
        if (!submitted?.ok) throw new Error("Not submitted");
        ids.push(submitted.ref.submissionId);
      }
      await forceState(ids[0], "evaluation_failed");
      await forceState(ids[1], "not_assessable", "ai_unavailable");
      return { ...fixture, failedId: ids[0], unavailableId: ids[1] };
    },
    // REV-02 (E7.3): the copy carries the evaluation in progress.
    read: { run: (actor, { assignmentId }) => getCopy(actor, assignmentId, people.concernedStudent.userId) },
    write: [
      { run: (actor, { failedId }) => retryEvaluation(actor, { submissionId: failedId, versionNumber: 1 }, NO_START) },
      {
        run: (actor, { unavailableId }) =>
          relaunchEvaluation(actor, { submissionId: unavailableId, versionNumber: 1 }, AI_BACK, NO_START),
      },
      { run: (actor, { failedId }) => startManualEvaluation(actor, { submissionId: failedId, versionNumber: 1 }) },
      // REV-03 (E7.4): saving the form; the owner's copy is found (not open: no proposal), another's absent.
      { run: (actor, { failedId }) => saveEvaluation(actor, { submissionId: failedId, versionNumber: 1, proposalId: null, revision: 0 }, SAVED_FORM) },
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
  generalComment: "", nextSteps: [], grade: { fixed: false }, rereadDone: [],
};

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

describe("real data functions follow their row", () => {
  it("covers every resource the data layer authorizes", () => {
    const { resources } = checkDataExports(dataSources());
    expect([...resources].filter((r) => !(r in REAL))).toEqual([]);
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
    });
  }
});
