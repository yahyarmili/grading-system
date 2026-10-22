import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { covers, importRestrictionBlocks, IMPORT_RESTRICTIONS } from "../eslint.config.mjs";

// The import restrictions of eslint.config.mjs, as ESLint applies them: in a
// flat config the last block that sets a rule replaces it whole, so a block
// lifting one restriction could lift the others in silence. Fictitious files,
// linted in memory with the project's own config.

const SDK = `import Anthropic from "@anthropic-ai/sdk";\nexport const client = Anthropic;\n`;
const SDK_DEEP = `import type { Message } from "@anthropic-ai/sdk/resources/messages";\nexport type M = Message;\n`;
const DATABASE = `import { db } from "@/server/db/client";\nexport const database = db;\n`;
const SYSTEM = `import { readEvaluationInput } from "@/server/data/evaluation/system";\nexport const read = readEvaluationInput;\n`;
const SYSTEM_RELATIVE = `import { readEvaluationInput } from "../data/evaluation/system";\nexport const read = readEvaluationInput;\n`;

const WORKFLOW = `import { start } from "workflow/api";\nexport const begin = start;\n`;

const REVIEW = `import { teacherEvaluations } from "@/server/db/schema";\nexport const table = teacherEvaluations;\n`;
const REVIEW_LOG_RELATIVE = `import { reviewJournalEntries } from "../../db/schema";\nexport const table = reviewJournalEntries;\n`;
const REVIEW_MODULE = `import { teacherEvaluations as evaluations } from "@/server/db/schema/reviews";\nexport const table = evaluations;\n`;
const REVIEW_NAMESPACE = `import * as schema from "@/server/db/schema";\nexport const table = schema.teacherEvaluations;\n`;
const REVIEW_REEXPORT = `export { reviewJournalEntries } from "@/server/db/schema";\n`;
const OTHER_TABLE = `import { submissions } from "@/server/db/schema";\nexport const table = submissions;\n`;
const REVIEW_WRITER = "src/server/data/review/record.ts";

const eslint = new ESLint();

/** The restricted imports ESLint reports for this text at this path. */
async function restricted(filePath: string, text: string): Promise<string[]> {
  const [result] = await eslint.lintText(text, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

describe("each import is allowed where the table says, refused everywhere else", () => {
  it.each([
    ["src/server/data/x.ts", SDK],
    ["src/app/x.ts", SDK],
    ["tests/x.ts", SDK],
    ["src/server/ai/x.ts", SDK_DEEP],
    ["scripts/x.ts", SDK],
  ])("refuses the SDK in %s", { timeout: 30_000 }, async (path, text) => {
    expect(await restricted(path, text)).toEqual([expect.stringContaining("Only src/server/ai/anthropic.ts imports")]);
  });

  it.each([["src/server/ai/anthropic.ts"], ["src/app/x.ts"], ["scripts/x.ts"]])(
    "refuses the database in %s",
    { timeout: 30_000 },
    async (path) => {
      expect(await restricted(path, DATABASE)).toEqual([expect.stringContaining("Go through the data access layer")]);
    },
  );

  it.each([
    ["src/app/x.ts", SYSTEM],
    ["src/server/data/x.ts", SYSTEM],
    ["src/server/ai/x.ts", SYSTEM_RELATIVE],
    ["scripts/x.ts", SYSTEM],
  ])("refuses the evaluation's system functions in %s", { timeout: 30_000 }, async (path, text) => {
    expect(await restricted(path, text)).toEqual([expect.stringContaining("Only the evaluation service")]);
  });

  it.each([["src/app/x.ts"], ["src/server/data/x.ts"], ["scripts/x.ts"]])(
    "refuses Workflows in %s",
    { timeout: 30_000 },
    async (path) => {
      expect(await restricted(path, WORKFLOW)).toEqual([expect.stringContaining("starts or defines workflows")]);
    },
  );

  // REV-03, REV-04 (E7): record.ts writes the review tables, their readers import them; any other
  // file is refused, whatever the form of the import (renamed, namespace, relative, re-export).
  it.each([
    ["src/server/data/x.ts", REVIEW],
    ["src/server/data/review/list.ts", REVIEW],
    ["src/server/data/evaluation/system.ts", REVIEW_LOG_RELATIVE],
    ["src/server/data/review/probe.ts", REVIEW_MODULE],
    ["src/server/data/x.ts", REVIEW_NAMESPACE],
    ["src/server/data/x.ts", REVIEW_REEXPORT],
  ])("refuses the review tables in %s", { timeout: 30_000 }, async (path, text) => {
    expect(await restricted(path, text)).toEqual([expect.stringContaining("Only src/server/data/review/record.ts writes")]);
  });

  it("refuses the review tables outside the data layer, with the database", { timeout: 30_000 }, async () => {
    expect((await restricted("src/app/x.ts", REVIEW)).sort()).toEqual([
      expect.stringContaining("Go through the data access layer"),
      expect.stringContaining("Only src/server/data/review/record.ts writes"),
    ]);
  });

  it.each([
    [REVIEW_WRITER, REVIEW],
    [REVIEW_WRITER, REVIEW_LOG_RELATIVE],
    // Nested in src/server/data/**: record.ts keeps what that glob lifts.
    [REVIEW_WRITER, DATABASE],
    ["src/server/data/review/copy.ts", REVIEW],
    ["src/server/data/review/journal.ts", REVIEW_LOG_RELATIVE],
    ["src/server/data/review/publication.ts", REVIEW],
    ["src/server/data/x.ts", OTHER_TABLE],
    ["src/server/db/schema/index.ts", REVIEW_REEXPORT],
    ["tests/x.ts", REVIEW_NAMESPACE],
  ])("lets the review tables or the database through in %s", { timeout: 30_000 }, async (path, text) => {
    expect(await restricted(path, text)).toEqual([]);
  });

  it("still refuses the SDK and the system functions in record.ts, nested in src/server/data/**", { timeout: 30_000 }, async () => {
    expect(await restricted(REVIEW_WRITER, SDK)).toEqual([expect.stringContaining("Only src/server/ai/anthropic.ts imports")]);
    expect(await restricted(REVIEW_WRITER, SYSTEM)).toEqual([expect.stringContaining("Only the evaluation service")]);
  });

  it.each([
    ["src/server/evaluation/x.ts", WORKFLOW],
    ["src/server/data/x.ts", DATABASE],
    ["src/server/db/x.ts", DATABASE],
    ["tests/x.ts", DATABASE],
    ["src/server/ai/anthropic.ts", SDK],
    ["src/server/ai/anthropic.ts", SDK_DEEP],
    ["src/server/evaluation/x.ts", SYSTEM],
    ["tests/x.ts", SYSTEM],
  ])("lets %s through", { timeout: 30_000 }, async (path, text) => {
    expect(await restricted(path, text)).toEqual([]);
  });

  it("still refuses the SDK in tests, allowed by two entries: one block per glob", { timeout: 30_000 }, async () => {
    expect(await restricted("tests/x.ts", SDK)).toEqual([expect.stringContaining("Only src/server/ai/anthropic.ts imports")]);
  });

  it("has directory globs or file paths only: two allowed globs matching one file are nested", () => {
    for (const glob of new Set(IMPORT_RESTRICTIONS.flatMap((r) => r.allowed))) {
      expect(glob, glob).toMatch(/^[^*?[\]{}!]+(\/\*\*)?$/);
    }
  });

  it("puts a narrower glob after the globs covering it, lifting what they lift too", () => {
    const restrictions = [
      { group: ["a"], message: "A", allowed: ["src/**"] },
      { group: ["b"], message: "B", allowed: ["src/x/y.ts"] },
      { group: ["c"], message: "C", allowed: ["tests/**"] },
    ];
    const blocks = importRestrictionBlocks(restrictions).map(({ files, rules }) => ({
      files,
      messages: (rules["no-restricted-imports"][1] as { patterns: { message: string }[] }).patterns.map((p) => p.message),
    }));
    // The last block matching src/x/y.ts lifts B (its own) and A (src/**'s); a block lifting B
    // alone, or placed before src/**'s, would refuse A there again.
    expect(blocks).toEqual([
      { files: ["**/*.{ts,tsx}"], messages: ["A", "B", "C"] },
      { files: ["src/**"], messages: ["B", "C"] },
      { files: ["tests/**"], messages: ["A", "B"] },
      { files: ["src/x/y.ts"], messages: ["C"] },
    ]);
    expect(covers("src/x/**", "src/x/y.ts")).toBe(true);
    expect(covers("src/x/**", "src/xy/z.ts")).toBe(false);
    expect(covers("src/x/y.ts", "src/x/y.ts")).toBe(true);
  });
});
