import { describe, expect, it } from "vitest";
import { appSources, type SourceFile } from "./helpers/access-inventory";

// EVL-03 R2: evaluation runs and AI proposals are added by the system alone,
// in one file, and never changed or removed by the code (a trigger refuses it
// in the database too, 0011).

const WRITER = "src/server/data/evaluation/system.ts";
const TABLES = String.raw`(evaluationRuns|aiProposals|evaluation_runs|ai_proposals)`;
const INSERT = new RegExp(String.raw`\.insert\(\s*${TABLES}\s*\)|\binsert\s+into\s+(\$\{\s*${TABLES}\s*\}|"?${TABLES}"?\b)`, "i");
const CHANGE = new RegExp(
  String.raw`\.(update|delete)\(\s*${TABLES}\s*\)|\b(update|delete\s+from)\s+(\$\{\s*${TABLES}\s*\}|"?${TABLES}"?\b)`,
  "i",
);

function problemsOf(files: SourceFile[]): string[] {
  return files.flatMap((file) => [
    ...(file.path !== WRITER && INSERT.test(file.text) ? [`${file.path}: adds an evaluation row`] : []),
    ...(CHANGE.test(file.text) ? [`${file.path}: changes or removes an evaluation row`] : []),
  ]);
}

describe("evaluation rows have one writer and never change", () => {
  // Parses every file of src/: slow on the Windows bind mount.
  it("are added only by system.ts, and changed by no file", { timeout: 30_000 }, () => {
    expect(problemsOf(appSources())).toEqual([]);
  });

  it("fails on a fictitious writer, change or removal", () => {
    expect(
      problemsOf([
        { path: "src/server/data/probe.ts", text: "await tx.insert(aiProposals).values(p)" },
        { path: WRITER, text: "await tx.update(evaluationRuns).set({ attempts: 1 })" },
        { path: "src/server/data/raw.ts", text: "sql`delete from ${aiProposals}`" },
        { path: "src/server/data/plain.ts", text: "sql`insert into evaluation_runs values (1)`" },
        { path: "src/server/data/reader.ts", text: "await db.select().from(aiProposals)" },
      ]),
    ).toEqual([
      "src/server/data/probe.ts: adds an evaluation row",
      `${WRITER}: changes or removes an evaluation row`,
      "src/server/data/raw.ts: changes or removes an evaluation row",
      "src/server/data/plain.ts: adds an evaluation row",
    ]);
  });
});
