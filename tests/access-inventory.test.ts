import { randomUUID } from "node:crypto";
import { getTableName, is } from "drizzle-orm";
import { pgTable, PgTable, text, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { ENTRY_POINTS, TABLES } from "@/server/access/inventory";
import { ACCESS_MATRIX, COLUMNS, RESOURCES } from "@/server/access/matrix";
import { authorize } from "@/server/access/policy";
import * as schema from "@/server/db/schema";
import {
  checkDataExports,
  checkEntryPoints,
  checkScripts,
  checkTables,
  dataSources,
  entrySources,
  GENERATED_ROUTES,
  scriptSources,
} from "./helpers/access-inventory";

// AUTH-04: nothing reaches data without its place in the access matrix
// (fonctionnalites.md §5.4). Each check runs on the real code, then on a
// fictitious resource to prove it fails when the entry is missing.

const tableNames = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => getTableName(table as PgTable));

describe("the matrix as data", () => {
  it("gives every row the six columns of §5.4", () => {
    for (const resource of RESOURCES) {
      expect(Object.keys(ACCESS_MATRIX[resource]).sort()).toEqual(["label", ...COLUMNS].sort());
    }
  });

  it("never grants another person more than the owner", () => {
    for (const resource of RESOURCES) {
      const row = ACCESS_MATRIX[resource];
      for (const [own, other] of [["concernedStudent", "otherStudent"], ["ownerTeacher", "otherTeacher"]] as const) {
        for (const action of row[other]) expect(row[own], `${resource}.${other}`).toContain(action);
      }
    }
  });

  it("grants nothing to a visitor: public flows sit outside the matrix", () => {
    for (const resource of RESOURCES) expect(ACCESS_MATRIX[resource].visitor).toEqual([]);
  });
});

describe("every table has its place in the matrix", () => {
  it("covers the real schema", () => {
    expect(checkTables(tableNames)).toEqual([]);
  });

  it("fails on a fictitious table added without an entry", () => {
    const probes = pgTable("access_probes", { id: uuid().primaryKey(), body: text() });
    expect(checkTables([...tableNames, getTableName(probes)])).toEqual([
      "table access_probes: no entry in TABLES (inventory.ts) nor row in the access matrix",
    ]);
  });

  it("fails on a table mapped to a resource without a matrix row", () => {
    const tables = { ...TABLES, access_probes: ["probe" as never] };
    expect(checkTables([...tableNames, "access_probes"], tables)).toEqual([
      'table access_probes: resource "probe" has no row in the access matrix',
    ]);
  });
});

describe("every server action and route handler has its place in the matrix", () => {
  const sources = entrySources();

  it("covers the real application", () => {
    expect(checkEntryPoints(sources)).toEqual([]);
  });

  it("covers the routes Workflows generates (E6.6): left out, they are reported", () => {
    const generated = sources.filter((file) => file.path.startsWith(`${GENERATED_ROUTES}/`));
    expect(generated.map((file) => file.path).sort()).toEqual([
      `${GENERATED_ROUTES}/v1/flow/route.js`,
      `${GENERATED_ROUTES}/v1/webhook/[token]/route.js`,
    ]);
    const entries = Object.fromEntries(Object.entries(ENTRY_POINTS).filter(([key]) => !key.startsWith(GENERATED_ROUTES)));
    expect(checkEntryPoints(sources, entries)).toEqual(
      expect.arrayContaining([
        `${GENERATED_ROUTES}/v1/flow/route.js#POST: server entry point without an entry in ENTRY_POINTS (inventory.ts)`,
        `${GENERATED_ROUTES}/v1/webhook/[token]/route.js#GET: server entry point without an entry in ENTRY_POINTS (inventory.ts)`,
      ]),
    );
  });

  const fictitious = [
    {
      path: "src/app/probes/actions.ts",
      text: `"use server";\nexport async function readProbeAction(id: string) { return id; }`,
    },
    {
      path: "src/app/probes/[id]/route.ts",
      text: `export async function GET() { return new Response(); }\nexport const dynamic = "force-dynamic";`,
    },
    {
      path: "src/app/probes/page.tsx",
      text: `export default function Page() { async function save() { "use server"; } return save; }`,
    },
  ];

  it("fails on a fictitious action, route or inline action left out", () => {
    expect(checkEntryPoints([...sources, ...fictitious])).toEqual([
      'src/app/probes/page.tsx: inline "use server"; declare server actions in a "use server" module',
      "src/app/probes/actions.ts#readProbeAction: server entry point without an entry in ENTRY_POINTS (inventory.ts)",
      "src/app/probes/[id]/route.ts#GET: server entry point without an entry in ENTRY_POINTS (inventory.ts)",
    ]);
  });

  it("fails on an action declared on a resource without a matrix row", () => {
    const entries = { ...ENTRY_POINTS, "src/app/probes/actions.ts#readProbeAction": { resource: "probe" as never, action: "read" as const } };
    expect(checkEntryPoints([...sources, fictitious[0]], entries)).toEqual([
      'src/app/probes/actions.ts#readProbeAction: resource "probe" has no row in the access matrix',
    ]);
  });
});

describe("every data function goes through authorize()", () => {
  it("covers the real data layer", () => {
    const { problems, resources } = checkDataExports(dataSources());
    expect(problems).toEqual([]);
    expect([...resources].sort()).toEqual([
      "aiProposal", "assignment", "assignmentRecipients", "class", "classInvite", "classMembership", "classRoster",
      "noticeAcknowledgement", "ownSubmissionStatus", "rubric", "studentAccount", "submission", "teacherInvitation", "unpublishedEvaluation",
    ]);
  });

  it("fails on fictitious data functions that skip or misuse it", () => {
    const probe = {
      path: "src/server/data/probes.ts",
      text: [
        `export async function readProbe(actor: Actor, id: string) { return db.select().from(probes); }`,
        `export async function listProbes() { return db.select().from(probes); }`,
        `export async function writeProbe(actor: Actor) { authorize(actor, "probe", "write"); }`,
        `export async function eraseProbe(actor: Actor, other: Actor) { authorize(other, "rubric", "read"); }`,
        // A resource no real data function reads yet: only the probe can bring it in.
        `export async function readLog(actor: Actor) { authorize(actor, "reviewLog", "read"); }`,
      ].join("\n"),
    };
    const { problems, resources } = checkDataExports([...dataSources(), probe]);
    expect(problems).toEqual([
      'src/server/data/probes.ts#readProbe: takes an Actor but never calls authorize(actor, "<resource>", "<action>")',
      "src/server/data/probes.ts#listProbes: exported without an Actor; list it with its reason in UNGUARDED_DATA_EXPORTS",
      'src/server/data/probes.ts#writeProbe: resource "probe" has no row in the access matrix',
      "src/server/data/probes.ts#eraseProbe: authorize() must receive the actor parameter and literal resource and action",
    ]);
    expect(resources.has("reviewLog")).toBe(true);
    expect(checkDataExports(dataSources()).resources.has("reviewLog")).toBe(false);
  });
});

describe("the rubric is read-only: no write path exists (EVL-01 CA1)", () => {
  const actors: Actor[] = [
    { kind: "user", userId: randomUUID(), role: "student" },
    { kind: "user", userId: randomUUID(), role: "teacher" },
    { kind: "user", userId: randomUUID(), role: "admin" },
    { kind: "visitor" },
  ];

  it("grants writing to no column of the matrix, and authorize() refuses it to every role", () => {
    for (const column of COLUMNS) expect(ACCESS_MATRIX.rubric[column], column).not.toContain("write");
    for (const actor of actors) expect(() => authorize(actor, "rubric", "write")).toThrow(AccessDeniedError);
  });

  it("is held by no table, written by no server action or route, authorized for writing by no data function", () => {
    for (const [table, entry] of Object.entries(TABLES)) {
      if (Array.isArray(entry)) expect(entry, table).not.toContain("rubric");
    }
    for (const [key, entry] of Object.entries(ENTRY_POINTS)) {
      if ("resource" in entry) expect(`${entry.resource}.${entry.action}`, key).not.toBe("rubric.write");
    }
    const { cells } = checkDataExports(dataSources());
    expect(cells.has("rubric.read")).toBe(true);
    expect(cells.has("rubric.write")).toBe(false);
  });

  it("would see a data function that writes it", () => {
    const probe = {
      path: "src/server/data/rubric/probe.ts",
      text: `export async function editRubric(actor: Actor) { authorize(actor, "rubric", "write"); }`,
    };
    expect(checkDataExports([...dataSources(), probe]).cells.has("rubric.write")).toBe(true);
  });
});

describe("every script has its place and its reason (E5.7)", () => {
  const scripts = scriptSources();

  it("covers the real scripts/", () => {
    expect(scripts.length).toBeGreaterThan(0);
    expect(checkScripts(scripts)).toEqual([]);
  });

  it("fails on a script added without an entry, and on a stale entry", () => {
    const probe = { path: "scripts/probe.ts", text: "console.log(1);" };
    expect(checkScripts([...scripts, probe])).toEqual(["scripts/probe.ts: script without an entry in SCRIPTS (inventory.ts)"]);
    expect(checkScripts(scripts.filter((file) => file.path !== "scripts/evaluate.ts"))).toEqual([
      "scripts/evaluate.ts: listed in SCRIPTS but no longer exists",
    ]);
  });
});
