import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { ACCESS_MATRIX, ACTIONS, COLUMNS, RESOURCES, type Action, type Column, type Resource } from "@/server/access/matrix";
import { authorize } from "@/server/access/policy";
import { ownedBy } from "@/server/data/access";
import { createAssignment, getTeacherAssignment, listStudentAssignments, updateAssignment } from "@/server/data/assignments/assignments";
import { createTeacherInvitation, listTeacherInvitations } from "@/server/data/auth/invitations";
import { createClass, getClass } from "@/server/data/classes/classes";
import { getClassInvite, renewClassInvite } from "@/server/data/classes/invites";
import { joinClass } from "@/server/data/classes/memberships";
import { listClassStudents, removeStudent } from "@/server/data/classes/roster";
import { db } from "@/server/db/client";
import { assignmentClasses, assignments, classes, classMemberships, users } from "@/server/db/schema";
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
type RealResource = { setup?: () => Promise<Fixture> } & Partial<Record<Action, Operation>>;

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
          ? receivedAssignment(actor, assignmentId)
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
  // The student's state of a received assignment; a teacher is refused (SUB-01 R3).
  ownSubmissionStatus: {
    setup: ownedAssignment,
    read: { run: async (actor, { assignmentId }) => (await receivedAssignment(actor, assignmentId))?.status ?? null },
  },
};

/** The fixture's assignment in the student's list; null when not received. */
async function receivedAssignment(actor: Actor, assignmentId: string) {
  return (await listStudentAssignments(actor)).find((a) => a.id === assignmentId) ?? null;
}

/** The owner's class with the concerned student, and an assignment sent to it. */
async function ownedAssignment(): Promise<Fixture> {
  const fixture = await ownedClass();
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
        const operation = real[action];
        if (!operation) continue;
        expect(await outcome(operation.run(people[column], fixture)), action).toBe(
          expected(resource, column, action, operation),
        );
      }
    });
  }
});
