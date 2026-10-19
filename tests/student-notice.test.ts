import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { STUDENT_NOTICE } from "@/lib/texts";

// NFR-DON-04: each reading of the notice is recorded with its version, so the
// text is frozen under its version: changing a word without raising the
// version would let students' older readings stand for a text they never read.

/** The digest of each published version's whole notice (version included). */
const PUBLISHED: Record<number, string> = {
  // E5.15, approved on 2026-10-19 (Anthropic).
  4: "49794fb3c3700ea53062eac6173aa7503518c793c6949ba753faf5230ea07860",
};

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("the student notice", () => {
  it("is frozen under its version: any change of its text needs a new version", () => {
    expect({ [STUDENT_NOTICE.version]: digest(STUDENT_NOTICE) }).toEqual({ [STUDENT_NOTICE.version]: PUBLISHED[STUDENT_NOTICE.version] });
  });
});
