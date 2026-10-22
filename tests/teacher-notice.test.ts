import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TEACHER_NOTICE } from "@/lib/texts";

// NFR-DON-04 (E7.7): each teacher's reading of the notice is recorded with
// its version, so the text is frozen under its version, like the student
// notice (tests/student-notice.test.ts).

/** The digest of each published version's whole notice (version included). */
const PUBLISHED: Record<number, string> = {
  // E7.7, 2026-10-21 [P].
  1: "8e8891648ec177079ecca362fb378e611c20163ff0bab4a03f48ec7a0ad6229c",
  // E8.1, 2026-10-22 [P]: validations, publications, withdrawals, manual evaluations; how long the log is kept.
  2: "7c91906ac325556e7a2a2c5989c6d4cc2eb147e53e447e69e77db60959fbc7c0",
};

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("the teacher notice", () => {
  it("is frozen under its version: any change of its text needs a new version", () => {
    expect({ [TEACHER_NOTICE.version]: digest(TEACHER_NOTICE) }).toEqual({ [TEACHER_NOTICE.version]: PUBLISHED[TEACHER_NOTICE.version] });
  });
});
