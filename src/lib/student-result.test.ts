import { describe, expect, it } from "vitest";
import { toStudentResult, type StudentResultRow } from "./student-result";

// PUB-02 (E8 plan §4): the closed list of what the student reads of a result.

const ROW: StudentResultRow = {
  assignmentId: "a1",
  title: "My town",
  language: "en",
  origin: "proposal",
  rubricVersion: "en-1",
  finalGrade: 13,
  levels: { task: 3, organization: 3, vocabulary: 3, grammar: 2, mechanics: 2 },
  remarks: { task: "t", organization: "o", vocabulary: "v", grammar: "g", mechanics: "m" },
  generalComment: "Clear.",
  nextSteps: ["Check the plurals."],
};

/** Every key, nested ones by their path. */
const keys = (value: unknown, path = ""): string[] => {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => {
    const key = Array.isArray(value) ? `${path}[]` : path ? `${path}.${k}` : k;
    return [key, ...keys(v, key)];
  });
};

describe("toStudentResult", () => {
  it("keeps the closed list of keys, whatever the row carries beside", () => {
    const row = { ...ROW, proposalId: "p", rereadTask: true, gradeFixed: true, justificationTask: "AI", alerts: ["very_short"] };
    expect([...new Set(keys(toStudentResult(row)))].sort()).toEqual(
      [
        "aiAssisted", "assignmentId", "criteria", "criteria[]", "criteria[].id", "criteria[].level", "criteria[].remark",
        "finalGrade", "generalComment", "gradeAdjusted", "language", "nextSteps", "nextSteps[]", "rubricVersion", "title",
      ].sort(),
    );
  });

  it("says the grade adjusted when it differs from the sum of the levels (Q5): 15 against 13", () => {
    expect(toStudentResult(ROW).gradeAdjusted).toBe(false);
    expect(toStudentResult({ ...ROW, finalGrade: 15 })).toMatchObject({ finalGrade: 15, gradeAdjusted: true });
  });

  it("mentions the AI for an evaluation from a proposal only", () => {
    expect(toStudentResult(ROW).aiAssisted).toBe(true);
    expect(toStudentResult({ ...ROW, origin: "manual" }).aiAssisted).toBe(false);
  });

  it("refuses an incomplete evaluation: a published one never is (0019)", () => {
    expect(() => toStudentResult({ ...ROW, levels: { ...ROW.levels, grammar: null } })).toThrow();
    expect(() => toStudentResult({ ...ROW, finalGrade: null })).toThrow();
  });
});
