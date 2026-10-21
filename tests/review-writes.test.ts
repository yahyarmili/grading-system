import { describe, expect, it } from "vitest";
import { appSources, type SourceFile } from "./helpers/access-inventory";

// REV-03, REV-04 (E7): the teacher's evaluation and the review log are
// written by one file, which writes an evaluation only with the log entries
// of its changes; no file deletes them (the database refuses it too, 0017,
// and refuses at commit a revision without its entry).

const WRITER = "src/server/data/review/record.ts";
const TABLES = String.raw`(teacherEvaluations|reviewJournalEntries|teacher_evaluations|review_journal_entries)`;
const WRITE = new RegExp(
  String.raw`\.(insert|update)\(\s*${TABLES}\s*\)|\b(insert\s+into|update)\s+(\$\{\s*${TABLES}\s*\}|"?${TABLES}"?\b)`,
  "i",
);
const DELETE = new RegExp(String.raw`\.delete\(\s*${TABLES}\s*\)|\bdelete\s+from\s+(\$\{\s*${TABLES}\s*\}|"?${TABLES}"?\b)`, "i");

function problemsOf(files: SourceFile[]): string[] {
  return files.flatMap((file) => [
    ...(file.path !== WRITER && WRITE.test(file.text) ? [`${file.path}: writes a review row`] : []),
    ...(DELETE.test(file.text) ? [`${file.path}: deletes a review row`] : []),
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
        { path: WRITER, text: "await tx.delete(reviewJournalEntries)" },
        { path: "src/server/data/review/reader.ts", text: "await db.select().from(teacherEvaluations)" },
      ]),
    ).toEqual([
      "src/server/data/review/probe.ts: writes a review row",
      "src/server/data/raw.ts: writes a review row",
      "src/server/data/plain.ts: writes a review row",
      `${WRITER}: deletes a review row`,
    ]);
  });
});
