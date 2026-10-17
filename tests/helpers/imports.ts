import path from "node:path";
import ts from "typescript";
import type { SourceFile } from "./access-inventory";

// Static import checks: which file imports which module. Specifiers are
// resolved to a repository path without extension, trailing slash or
// "/index" ("src/server/ai"), or kept as they are for packages
// ("openai/resources").

/** A module this check cannot follow (computed specifier, createRequire). */
export const UNFOLLOWABLE = "<unfollowable import>";

const EXTENSION = /\.(m?[jt]sx?|c[jt]s)$/;

/** A specifier as a repository path without extension or "/index", or the package name as written. */
export function resolveSpecifier(from: string, specifier: string): string {
  let resolved: string;
  if (specifier.startsWith("@/")) resolved = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith(".")) resolved = path.posix.join(path.posix.dirname(from), specifier);
  else return specifier;
  return path.posix
    .normalize(resolved)
    .replace(/\/+$/, "")
    .replace(EXTENSION, "")
    .replace(/\/index$/, "");
}

/**
 * Every module a file imports: import and export declarations, import(),
 * require(), import x = require(), import types. A computed specifier or a
 * createRequire() is reported as UNFOLLOWABLE.
 */
export function importsOf(file: SourceFile): string[] {
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      found.push(ts.isStringLiteralLike(expression) ? expression.text : UNFOLLOWABLE);
    } else if (ts.isCallExpression(node)) {
      const [first] = node.arguments;
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if ((isImport || isRequire) && first) found.push(ts.isStringLiteralLike(first) ? first.text : UNFOLLOWABLE);
      // A require made by createRequire escapes the names above.
      if (ts.isIdentifier(node.expression) && node.expression.text === "createRequire") found.push(UNFOLLOWABLE);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      found.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found.map((specifier) => (specifier === UNFOLLOWABLE ? specifier : resolveSpecifier(file.path, specifier)));
}
