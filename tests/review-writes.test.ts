import { describe, expect, it } from "vitest";
import { IMPORT_RESTRICTIONS } from "../eslint.config.mjs";
import { appSources, type SourceFile } from "./helpers/access-inventory";

// REV-03, REV-04 (E7): the teacher's evaluation and the review log are
// written by one file, which writes an evaluation only with the log entries
// of its changes; no file deletes them (the database refuses it too, 0017,
// and refuses at commit a revision without its entry). The tables themselves
// are importable only by the writer and their readers (eslint.config.mjs,
// tests/eslint-restrictions.test.ts); this test reads the text of every file,
// readers included, for writes by Drizzle or raw SQL. Its limits: a table
// name built at run time ("teacher_" + "evaluations") escapes it.

const WRITER = "src/server/data/review/record.ts";
const TABLES = String.raw`(teacherEvaluations|reviewJournalEntries|teacher_evaluations|review_journal_entries)`;
/** A table in SQL: interpolated, or named, quoted or not, qualified by its schema or not. */
const SQL_TABLE = String.raw`(\$\{\s*${TABLES}\s*\}|("?public"?\s*\.\s*)?"?${TABLES}"?\b)`;
const WRITE = new RegExp(String.raw`\.(insert|update)\(\s*${TABLES}\s*\)|\b(insert\s+into|merge\s+into|update)\s+${SQL_TABLE}`, "i");
const DELETE = new RegExp(String.raw`\.delete\(\s*${TABLES}\s*\)|\b(delete\s+from|truncate(\s+table)?)\s+${SQL_TABLE}`, "i");
/** A table reached around its import: by a name in SQL built by Drizzle, or through the client's schema. */
const DYNAMIC = new RegExp(String.raw`\b(sql\.(identifier|raw)|getTableConfig)\(\s*[^)]*${TABLES}|\bfullSchema\b`);

function problemsOf(files: SourceFile[]): string[] {
  return files.flatMap((file) => [
    ...(file.path !== WRITER && WRITE.test(file.text) ? [`${file.path}: writes a review row`] : []),
    ...(DELETE.test(file.text) ? [`${file.path}: deletes a review row`] : []),
    ...(file.path !== WRITER && DYNAMIC.test(file.text) ? [`${file.path}: reaches a review table around its import`] : []),
  ]);
}

describe("the teacher's evaluation and the review log have one writer", () => {
  // Parses every file of src/: slow on the Windows bind mount.
  it("are written only by record.ts, and deleted by no file", { timeout: 30_000 }, () => {
    expect(problemsOf(appSources())).toEqual([]);
  });

  it("fails on a fictitious writer, raw SQL or removal", () => {
    expect(
      problemsOf([
        { path: "src/server/data/review/probe.ts", text: "await tx.update(teacherEvaluations).set({ levelTask: 4 })" },
        { path: "src/server/data/raw.ts", text: "sql`insert into ${reviewJournalEntries} values (1)`" },
        { path: "src/server/data/plain.ts", text: "sql`update teacher_evaluations set level_task = 4`" },
        { path: "src/server/data/qualified.ts", text: 'sql`update "public"."teacher_evaluations" set level_task = 4`' },
        { path: WRITER, text: "await tx.delete(reviewJournalEntries)" },
        { path: "src/server/data/truncate.ts", text: "sql`truncate table review_journal_entries`" },
        { path: "src/server/data/identifier.ts", text: 'sql`insert into ${sql.identifier("teacher_evaluations")} values (1)`' },
        { path: "src/server/data/full.ts", text: "await db.insert(db._.fullSchema.teacherEvaluations).values(row)" },
        { path: "src/server/data/review/reader.ts", text: "await db.select().from(teacherEvaluations)" },
      ]),
    ).toEqual([
      "src/server/data/review/probe.ts: writes a review row",
      "src/server/data/raw.ts: writes a review row",
      "src/server/data/plain.ts: writes a review row",
      "src/server/data/qualified.ts: writes a review row",
      `${WRITER}: deletes a review row`,
      "src/server/data/truncate.ts: deletes a review row",
      "src/server/data/identifier.ts: reaches a review table around its import",
      "src/server/data/full.ts: reaches a review table around its import",
    ]);
  });

  it("names the same writer as the import restriction of the tables", () => {
    const restriction = IMPORT_RESTRICTIONS.find((r) => "importNames" in r && r.importNames?.includes("teacherEvaluations"));
    expect(restriction && "importNames" in restriction ? restriction.importNames : null).toEqual(["teacherEvaluations", "reviewJournalEntries"]);
    expect(restriction?.allowed).toContain(WRITER);
  });
});

// E8 plan §1 (0019): the evaluation's triggers read the submission row under a
// share lock; the code holds its FOR UPDATE first, so they wait for nothing.
// So every call of writeEvaluation stands in the function that locks the copy
// (editLocked, after lockCopy), and nowhere else.
const LOCKED_WRITER = "src/server/data/review/copy.ts";

function unlockedWrites(files: SourceFile[]): string[] {
  return files.flatMap((file) => {
    if (file.path === WRITER || !/\bwriteEvaluation\(/.test(file.text)) return [];
    const locked = file.path === LOCKED_WRITER && /\.for\("update"\)/.test(file.text);
    return locked ? [] : [`${file.path}: writes an evaluation outside the locked copy`];
  });
}

describe("an evaluation is written on a locked copy only", () => {
  it("writeEvaluation is called by copy.ts alone, which locks the row", { timeout: 30_000 }, () => {
    expect(unlockedWrites(appSources())).toEqual([]);
  });

  it("fails on a call elsewhere, or in copy.ts without the lock", () => {
    expect(
      unlockedWrites([
        { path: "src/server/data/review/probe.ts", text: "await writeEvaluation(tx, write)" },
        { path: LOCKED_WRITER, text: "await writeEvaluation(tx, write)" },
      ]),
    ).toEqual([
      "src/server/data/review/probe.ts: writes an evaluation outside the locked copy",
      `${LOCKED_WRITER}: writes an evaluation outside the locked copy`,
    ]);
  });
});
