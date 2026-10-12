import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { ENTRY_POINTS, TABLES, UNGUARDED_DATA_EXPORTS } from "@/server/access/inventory";
import { ACCESS_MATRIX, ACTIONS } from "@/server/access/matrix";

// Static checks behind AUTH-04: every table, server entry point and data
// function has its place in the access matrix. Each check takes source files
// and returns problems, so tests can also feed it a fictitious resource.

export type SourceFile = { path: string; text: string };

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Source files under a directory, with posix paths relative to the repository. */
export function readSources(directory: string, accept: (file: string) => boolean): SourceFile[] {
  return readdirSync(path.join(ROOT, directory), { recursive: true, encoding: "utf8" })
    .map((file) => path.posix.join(directory, file.split(path.sep).join("/")))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file) && accept(file))
    .map((file) => ({ path: file, text: readFileSync(path.join(ROOT, file), "utf8") }));
}

type Exported = { name: string; fn?: ts.FunctionLikeDeclaration };

function parse(file: SourceFile) {
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

const isExported = (node: ts.Node) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** Exported values (types left out), with the function behind each one when there is one. */
function exportsOf(source: ts.SourceFile): Exported[] {
  const found: Exported[] = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
      found.push({ name: statement.name?.text ?? "default", fn: statement });
    } else if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        const fn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : undefined;
        found.push({ name: declaration.name.getText(source), fn });
      }
    } else if (ts.isClassDeclaration(statement) && isExported(statement)) {
      found.push({ name: statement.name?.text ?? "default" });
    } else if (ts.isExportAssignment(statement)) {
      found.push({ name: "default" });
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      const clause = statement.exportClause;
      if (!clause) found.push({ name: "*" });
      else if (ts.isNamedExports(clause)) {
        for (const element of clause.elements) if (!element.isTypeOnly) found.push({ name: element.name.text });
      } else found.push({ name: clause.name.text });
    }
  }
  return found;
}

const isDirective = (statement: ts.Statement, text: string) =>
  ts.isExpressionStatement(statement) &&
  ts.isStringLiteral(statement.expression) &&
  statement.expression.text === text;

/** "use server" placed inside a function: an inline server action, which escapes the inventory. */
function hasInlineServerAction(source: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isBlock(node) && node.parent && ts.isFunctionLike(node.parent)) {
      if (node.statements.some((s) => isDirective(s, "use server"))) found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/** Server actions ("use server" modules) and route handlers, keyed "<file>#<export>". */
export function findEntryPoints(files: SourceFile[]): { keys: string[]; problems: string[] } {
  const keys: string[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const source = parse(file);
    if (hasInlineServerAction(source)) {
      problems.push(`${file.path}: inline "use server"; declare server actions in a "use server" module`);
    }
    const isActionModule = source.statements.some((s) => isDirective(s, "use server"));
    const isRoute = /(^|\/)route\.tsx?$/.test(file.path);
    if (!isActionModule && !isRoute) continue;
    for (const { name } of exportsOf(source)) {
      if (isRoute && !isActionModule && !HTTP_METHODS.has(name)) continue;
      keys.push(`${file.path}#${name}`);
    }
  }
  return { keys, problems };
}

/** Entry points missing from ENTRY_POINTS, entries that no longer exist, and unknown matrix cells. */
export function checkEntryPoints(files: SourceFile[], entries: typeof ENTRY_POINTS = ENTRY_POINTS): string[] {
  const { keys, problems } = findEntryPoints(files);
  for (const key of keys) {
    const entry = entries[key];
    if (!entry) problems.push(`${key}: server entry point without an entry in ENTRY_POINTS (inventory.ts)`);
    else if ("resource" in entry && !(entry.resource in ACCESS_MATRIX)) {
      problems.push(`${key}: resource "${entry.resource}" has no row in the access matrix`);
    }
  }
  for (const key of Object.keys(entries)) {
    if (!keys.includes(key)) problems.push(`${key}: listed in ENTRY_POINTS but no longer exists`);
  }
  return problems;
}

/** Tables missing from TABLES, entries that no longer exist, and unknown resources. */
export function checkTables(tableNames: string[], tables: typeof TABLES = TABLES): string[] {
  const problems: string[] = [];
  for (const name of tableNames) {
    const entry = tables[name];
    if (!entry) problems.push(`table ${name}: no entry in TABLES (inventory.ts) nor row in the access matrix`);
    else if (Array.isArray(entry)) {
      for (const resource of entry) {
        if (!(resource in ACCESS_MATRIX)) problems.push(`table ${name}: resource "${resource}" has no row in the access matrix`);
      }
    }
  }
  for (const name of Object.keys(tables)) {
    if (!tableNames.includes(name)) problems.push(`table ${name}: listed in TABLES but no longer exists`);
  }
  return problems;
}

type AuthorizeCall = { resource: string; action: string };

/** authorize(<actor parameter>, "<resource>", "<action>") calls in a function body. */
function authorizeCalls(fn: ts.FunctionLikeDeclaration, actorName: string): (AuthorizeCall | null)[] {
  const calls: (AuthorizeCall | null)[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "authorize") {
      const [actor, resource, action] = node.arguments;
      calls.push(
        actor && ts.isIdentifier(actor) && actor.text === actorName &&
          resource && ts.isStringLiteral(resource) && action && ts.isStringLiteral(action)
          ? { resource: resource.text, action: action.text }
          : null,
      );
    }
    ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return calls;
}

/**
 * Each export of the data layer that takes an Actor first calls authorize()
 * with that actor and a literal resource and action of the matrix; any other
 * export is listed, with its reason, in UNGUARDED_DATA_EXPORTS.
 */
export function checkDataExports(
  files: SourceFile[],
  unguarded: typeof UNGUARDED_DATA_EXPORTS = UNGUARDED_DATA_EXPORTS,
): { problems: string[]; resources: Set<string> } {
  const problems: string[] = [];
  const resources = new Set<string>();
  const seen: string[] = [];
  for (const file of files) {
    const source = parse(file);
    for (const { name, fn } of exportsOf(source)) {
      const key = `${file.path}#${name}`;
      seen.push(key);
      const first = fn?.parameters[0];
      const takesActor = first?.type?.getText(source) === "Actor";
      const calls = takesActor && fn ? authorizeCalls(fn, first.name.getText(source)) : [];
      if (calls.length === 0) {
        if (!unguarded[key]) {
          problems.push(
            takesActor
              ? `${key}: takes an Actor but never calls authorize(actor, "<resource>", "<action>")`
              : `${key}: exported without an Actor; list it with its reason in UNGUARDED_DATA_EXPORTS`,
          );
        }
        continue;
      }
      if (unguarded[key]) problems.push(`${key}: calls authorize() but is listed in UNGUARDED_DATA_EXPORTS`);
      for (const call of calls) {
        if (!call) problems.push(`${key}: authorize() must receive the actor parameter and literal resource and action`);
        else if (!(call.resource in ACCESS_MATRIX)) problems.push(`${key}: resource "${call.resource}" has no row in the access matrix`);
        else if (!(ACTIONS as readonly string[]).includes(call.action)) problems.push(`${key}: unknown action "${call.action}"`);
        else resources.add(call.resource);
      }
    }
  }
  for (const key of Object.keys(unguarded)) {
    if (!seen.includes(key)) problems.push(`${key}: listed in UNGUARDED_DATA_EXPORTS but no longer exists`);
  }
  return { problems, resources };
}

export const appSources = () => readSources("src", () => true);
export const dataSources = () => readSources("src/server/data", () => true);
