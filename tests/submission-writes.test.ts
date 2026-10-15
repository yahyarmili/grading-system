import { describe, expect, it } from "vitest";
import { appSources, type SourceFile } from "./helpers/access-inventory";

// §5.5: a submission's status changes only through the transition table.
// Only transitions.ts may insert, update or delete a submission row.

const WRITER = "src/server/data/submissions/transitions.ts";
const WRITE = /\.(insert|update|delete)\(\s*submissions\s*\)|\b(insert\s+into|update|delete\s+from)\s+(\$\{\s*submissions\s*\}|"?submissions"?\b)/i;

function writersOf(files: SourceFile[]): string[] {
  return files.filter((file) => file.path !== WRITER && WRITE.test(file.text)).map((file) => file.path);
}

describe("the status of a submission has one writer", () => {
  it("is written only by transitions.ts", () => {
    expect(writersOf(appSources())).toEqual([]);
  });

  it("fails on a fictitious writer, query builder or SQL", () => {
    expect(
      writersOf([
        { path: "src/server/data/probes.ts", text: "await tx.update(submissions).set({ status: 'published' })" },
        { path: "src/server/data/raw.ts", text: "sql`update ${submissions} set status = 'published'`" },
        { path: "src/server/data/versions.ts", text: "await tx.insert(submissionVersions).values(v)" },
      ]),
    ).toEqual(["src/server/data/probes.ts", "src/server/data/raw.ts"]);
  });
});
