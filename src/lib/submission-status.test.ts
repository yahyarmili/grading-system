import { describe, expect, it } from "vitest";
import { studentStatuses, submissionStatuses, toStudentStatus } from "./submission-status";

// SUB-01 R3: the student sees a closed list of three states, never a technical one.

describe("toStudentStatus", () => {
  it.each([
    ["to_submit", "to_submit"],
    ["received", "being_marked"],
    ["transcribing", "being_marked"],
    ["transcription_failed", "being_marked"],
    ["evaluating", "being_marked"],
    ["evaluation_failed", "being_marked"],
    ["not_assessable", "being_marked"],
    ["to_review", "being_marked"],
    ["validated", "being_marked"],
    ["published", "marked"],
  ] as const)("%s → %s", (internal, seen) => {
    expect(toStudentStatus(internal)).toBe(seen);
  });

  it("covers every internal state and gives only the closed list", () => {
    const seen = new Set(submissionStatuses.map(toStudentStatus));
    expect([...seen].every((s) => (studentStatuses as readonly string[]).includes(s))).toBe(true);
    expect(seen.size).toBe(studentStatuses.length);
  });
});
