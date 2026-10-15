import { getTableName, is } from "drizzle-orm";
import { pgTable, PgTable, text, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ENTRY_POINTS, TABLES } from "@/server/access/inventory";
import { ACCESS_MATRIX, COLUMNS, RESOURCES } from "@/server/access/matrix";
import * as schema from "@/server/db/schema";
import {
  appSources,
  checkDataExports,
  checkEntryPoints,
  checkTables,
  dataSources,
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
  const sources = appSources();

  it("covers the real application", () => {
    expect(checkEntryPoints(sources)).toEqual([]);
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
      "assignment", "assignmentRecipients", "class", "classInvite", "classMembership", "classRoster",
      "noticeAcknowledgement", "ownSubmissionStatus", "submission", "teacherInvitation",
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
        `export async function readRubric(actor: Actor) { authorize(actor, "rubric", "read"); }`,
      ].join("\n"),
    };
    const { problems, resources } = checkDataExports([...dataSources(), probe]);
    expect(problems).toEqual([
      'src/server/data/probes.ts#readProbe: takes an Actor but never calls authorize(actor, "<resource>", "<action>")',
      "src/server/data/probes.ts#listProbes: exported without an Actor; list it with its reason in UNGUARDED_DATA_EXPORTS",
      'src/server/data/probes.ts#writeProbe: resource "probe" has no row in the access matrix',
      "src/server/data/probes.ts#eraseProbe: authorize() must receive the actor parameter and literal resource and action",
    ]);
    expect(resources.has("rubric")).toBe(true);
  });
});
