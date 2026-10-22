import { randomUUID } from "node:crypto";
import { getTableName, is } from "drizzle-orm";
import { pgTable, PgTable, text, uuid } from "drizzle-orm/pg-core";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { ENTRY_POINTS, SWEEP_SYSTEM_CALLS, TABLES, UNGUARDED_DATA_EXPORTS } from "@/server/access/inventory";
import { ACCESS_MATRIX, COLUMNS, RESOURCES } from "@/server/access/matrix";
import { authorize } from "@/server/access/policy";
import * as schema from "@/server/db/schema";
import {
  appSources,
  checkDataExports,
  checkEntryPoints,
  checkScripts,
  checkTables,
  dataSources,
  entrySources,
  GENERATED_ROUTES,
  scriptSources,
  type SourceFile,
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

const isTopDirective = (source: ts.SourceFile, text: string) =>
  source.statements.some((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === text);

const isExportedStatement = (node: ts.Statement) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** Names a function or variable statement declares at the top of a module. */
function declaredNames(statement: ts.Statement): string[] {
  if (ts.isFunctionDeclaration(statement)) return statement.name ? [statement.name.text] : [];
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map((d) => d.name.getText());
  return [];
}

/**
 * Exports of "use server" modules that run the evaluation sweep: their text
 * calls sweepEvaluations, directly or through a declaration of the module
 * (a context object, a helper) that does.
 */
function sweepingActions(files: SourceFile[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (!isTopDirective(source, "use server")) continue;
    const statements = source.statements.filter((s) => ts.isFunctionDeclaration(s) || ts.isVariableStatement(s));
    const sweeps = (text: string, names: string[]) => names.some((name) => new RegExp(String.raw`\b${name}\b`).test(text));
    const helpers = statements
      .filter((s) => !isExportedStatement(s) && sweeps(s.getText(source), ["sweepEvaluations"]))
      .flatMap(declaredNames);
    for (const statement of statements.filter(isExportedStatement)) {
      if (!sweeps(statement.getText(source), ["sweepEvaluations", ...helpers])) continue;
      for (const name of declaredNames(statement)) found.push(`${file.path}#${name}`);
    }
  }
  return found;
}

/**
 * What an entry point declares beyond its cell: cells of the matrix, system
 * calls listed with their reason; and the evaluation sweep, declared by the
 * actions that run it and by them only.
 */
function checkBeyondCell(files: SourceFile[], entries: typeof ENTRY_POINTS = ENTRY_POINTS): string[] {
  const problems: string[] = [];
  const sweeping = sweepingActions(files);
  for (const [key, entry] of Object.entries(entries)) {
    if (!("resource" in entry)) continue;
    for (const cell of entry.also ?? []) {
      if (!(cell.resource in ACCESS_MATRIX)) problems.push(`${key}: resource "${cell.resource}" has no row in the access matrix`);
    }
    for (const call of entry.systemCalls ?? []) {
      if (!UNGUARDED_DATA_EXPORTS[call]) problems.push(`${key}: system call ${call} is not listed in UNGUARDED_DATA_EXPORTS`);
    }
    const declaresSweep = SWEEP_SYSTEM_CALLS.every((call) => entry.systemCalls?.includes(call));
    if (declaresSweep && !sweeping.includes(key)) problems.push(`${key}: declares the evaluation sweep but does not run it`);
  }
  for (const key of sweeping) {
    const entry = entries[key];
    if (!entry || !("resource" in entry) || !SWEEP_SYSTEM_CALLS.every((call) => entry.systemCalls?.includes(call))) {
      problems.push(`${key}: runs the evaluation sweep without declaring SWEEP_SYSTEM_CALLS in ENTRY_POINTS`);
    }
  }
  return problems;
}

describe("what an entry point does beyond its cell is declared (E7)", () => {
  const sources = appSources();

  it("covers the real application: the list and the copy declare the sweep they run", { timeout: 30_000 }, () => {
    expect(checkBeyondCell(sources)).toEqual([]);
    expect(sweepingActions(sources).sort()).toEqual([
      "src/app/teacher/assignments/[assignmentId]/actions.ts#recordListOpenedAction",
      "src/app/teacher/assignments/[assignmentId]/students/[studentId]/actions.ts#recordCopyOpenedAction",
    ]);
  });

  it("fails on a sweep left undeclared, a sweep declared but not run, an unknown cell or system call", { timeout: 30_000 }, () => {
    const probe = {
      path: "src/app/probes/actions.ts",
      text: [
        `"use server";`,
        `const context = { sweep: () => sweepEvaluations(startEvaluation) };`,
        `export async function openProbeAction(id: string) { return openProbe(id, context); }`,
        `export async function readProbeAction(id: string) { return readProbe(id); }`,
      ].join("\n"),
    };
    const entries = {
      ...ENTRY_POINTS,
      "src/app/probes/actions.ts#openProbeAction": { resource: "submission" as const, action: "read" as const },
      "src/app/probes/actions.ts#readProbeAction": {
        resource: "submission" as const,
        action: "read" as const,
        also: [{ resource: "probe" as never, action: "read" as const }],
        systemCalls: [...SWEEP_SYSTEM_CALLS, "src/server/data/probes.ts#sweepProbes"],
      },
    };
    expect(checkBeyondCell([...sources, probe], entries)).toEqual([
      'src/app/probes/actions.ts#readProbeAction: resource "probe" has no row in the access matrix',
      "src/app/probes/actions.ts#readProbeAction: system call src/server/data/probes.ts#sweepProbes is not listed in UNGUARDED_DATA_EXPORTS",
      "src/app/probes/actions.ts#readProbeAction: declares the evaluation sweep but does not run it",
      "src/app/probes/actions.ts#openProbeAction: runs the evaluation sweep without declaring SWEEP_SYSTEM_CALLS in ENTRY_POINTS",
    ]);
  });
});

describe("every data function goes through authorize()", () => {
  it("covers the real data layer", () => {
    const { problems, resources } = checkDataExports(dataSources());
    expect(problems).toEqual([]);
    expect([...resources].sort()).toEqual([
      "aiProposal", "assignment", "assignmentRecipients", "class", "classInvite", "classMembership", "classRoster",
      "noticeAcknowledgement", "ownSubmissionStatus", "reviewLog", "rubric", "studentAccount", "submission", "teacherInvitation", "unpublishedEvaluation",
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
        `export async function readPublished(actor: Actor) { authorize(actor, "publishedEvaluation", "read"); }`,
      ].join("\n"),
    };
    const { problems, resources } = checkDataExports([...dataSources(), probe]);
    expect(problems).toEqual([
      'src/server/data/probes.ts#readProbe: takes an Actor but never calls authorize(actor, "<resource>", "<action>")',
      "src/server/data/probes.ts#listProbes: exported without an Actor; list it with its reason in UNGUARDED_DATA_EXPORTS",
      'src/server/data/probes.ts#writeProbe: resource "probe" has no row in the access matrix',
      "src/server/data/probes.ts#eraseProbe: authorize() must receive the actor parameter and literal resource and action",
    ]);
    expect(resources.has("publishedEvaluation")).toBe(true);
    expect(checkDataExports(dataSources()).resources.has("publishedEvaluation")).toBe(false);
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
