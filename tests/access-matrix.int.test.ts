import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { ACCESS_MATRIX, ACTIONS, COLUMNS, RESOURCES, type Action, type Column, type Resource } from "@/server/access/matrix";
import { authorize } from "@/server/access/policy";
import { ownedBy } from "@/server/data/access";
import { createTeacherInvitation, listTeacherInvitations } from "@/server/data/auth/invitations";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
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
const REAL: Partial<Record<Resource, Record<Action, (actor: Actor) => Promise<unknown>>>> = {
  teacherInvitation: {
    read: (actor) => listTeacherInvitations(actor),
    write: (actor) => createTeacherInvitation(actor, { firstName: "Tara", lastName: "Quinn", email: "tara@example.test" }),
  },
};

describe("real data functions follow their row", () => {
  it("covers every resource the data layer authorizes", () => {
    const { resources } = checkDataExports(dataSources());
    expect([...resources].filter((r) => !(r in REAL))).toEqual([]);
  });

  for (const [resource, operations] of Object.entries(REAL) as [Resource, Record<Action, (actor: Actor) => Promise<unknown>>][]) {
    it.each(COLUMNS)(`${resource}: %s`, async (column) => {
      const actor = people[column];
      if (actor.kind === "user") {
        await db.insert(users).values({
          id: actor.userId, email: `${column.toLowerCase()}@example.test`, emailVerified: true,
          name: column, firstName: column, lastName: "User", role: actor.role,
        });
      }
      for (const action of ACTIONS) {
        const run = operations[action](actor);
        if ((ACCESS_MATRIX[resource][column] as readonly Action[]).includes(action)) await expect(run).resolves.toBeDefined();
        else await expect(run).rejects.toBeInstanceOf(AccessDeniedError);
      }
    });
  }
});
