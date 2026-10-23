import { describe, expect, it } from "vitest";
import { GRADE_STEP } from "@/config/provisional";
import {
  applyChanges,
  calculatedGrade,
  diffEvaluation,
  emptyFields,
  fieldsFromProposal,
  finalGradeOf,
  fixedGradeProblem,
  gradeGap,
  isComplete,
  readTypedGrade,
  reconcileSaved,
  REVIEW_FIELD_MESSAGES,
  validationNature,
  type EvaluationChanges,
} from "@/lib/review";
import type { CriterionId, Level } from "@/lib/rubric";

// REV-03 R2, R3 (E7.1): the grade is the sum of the levels while not fixed;
// fixed, a value from 0 to 20 on GRADE_STEP, never recalculated, its gap
// signalled, and the calculated grade can come back. A level is a whole
// number from 0 to 4.

const levels = (task: number, organization = 2, vocabulary = 2, grammar = 2, mechanics = 2) =>
  ({ task, organization, vocabulary, grammar, mechanics }) as Record<CriterionId, Level>;

const proposal = fieldsFromProposal({
  criteria: {
    task: { level: 3, justification: "Answers the task." },
    organization: { level: 2, justification: "Paragraphs." },
    vocabulary: { level: 2, justification: "Simple words." },
    grammar: { level: 2, justification: "Some errors." },
    mechanics: { level: 1, justification: "Spelling." },
  },
  generalComment: "A clear text.",
  nextSteps: ["Check the spelling."],
  proposedGrade: 10,
});

/** The form as it starts: the proposal, unchanged. */
const form = (over: Partial<EvaluationChanges> = {}): EvaluationChanges => ({
  levels: { ...(proposal.levels as Record<CriterionId, Level>) },
  remarks: { ...proposal.remarks },
  generalComment: proposal.generalComment,
  nextSteps: [...proposal.nextSteps],
  grade: { fixed: false },
  rereadDone: [],
  ...over,
});

describe("the grade of the teacher's evaluation", () => {
  it("is the sum of the levels while not fixed, recalculated at each change", () => {
    expect(finalGradeOf(levels(4), { fixed: false })).toBe(12);
    expect(finalGradeOf(levels(0), { fixed: false })).toBe(8);
    const after = applyChanges(proposal, form({ levels: { ...form().levels, task: 4 } }));
    expect(after).toMatchObject({ finalGrade: 11, gradeFixed: false });
  });

  it("fixed, keeps the teacher's value, on the step, from 0 to 20", () => {
    expect(GRADE_STEP).toBe(0.5);
    expect(finalGradeOf(levels(4), { fixed: true, value: 13.5 })).toBe(13.5);
    expect(finalGradeOf(levels(4), { fixed: true, value: 0 })).toBe(0);
    expect(finalGradeOf(levels(4), { fixed: true, value: 20 })).toBe(20);
  });

  it("refuses a fixed grade off the step or out of the bounds", () => {
    expect(fixedGradeProblem(13.25)).toBe("step");
    expect(fixedGradeProblem(-0.5)).toBe("range");
    expect(fixedGradeProblem(20.5)).toBe("range");
    expect(fixedGradeProblem(Number.NaN)).toBe("range");
    expect(fixedGradeProblem(19.5)).toBeNull();
    expect(() => finalGradeOf(levels(4), { fixed: true, value: 13.25 })).toThrow(RangeError);
    expect(() => finalGradeOf(levels(4), { fixed: true, value: 21 })).toThrow(RangeError);
  });

  it("once fixed, a level change keeps the grade and the gap is signalled (CA2)", () => {
    const fixed = applyChanges(proposal, form({ grade: { fixed: true, value: 14 } }));
    expect(fixed).toMatchObject({ finalGrade: 14, gradeFixed: true });
    expect(gradeGap(fixed)).toBe(4);
    const levelChanged = applyChanges(fixed, form({ levels: { ...form().levels, task: 4 }, grade: { fixed: true, value: 14 } }));
    expect(levelChanged).toMatchObject({ finalGrade: 14, gradeFixed: true });
    expect(gradeGap(levelChanged)).toBe(3);
  });

  it("goes back to the calculated grade, then follows the levels again", () => {
    const fixed = applyChanges(proposal, form({ grade: { fixed: true, value: 14 } }));
    const back = applyChanges(fixed, form({ grade: { fixed: false } }));
    expect(back).toMatchObject({ finalGrade: 10, gradeFixed: false });
    expect(gradeGap(back)).toBe(0);
  });

  it("refuses a level out of 0 to 4, or not whole", () => {
    for (const level of [5, -1, 2.5, Number.NaN]) {
      expect(() => finalGradeOf(levels(level), { fixed: false }), String(level)).toThrow(RangeError);
      expect(() => applyChanges(proposal, form({ levels: levels(level) })), String(level)).toThrow(RangeError);
    }
  });
});

describe("the remark to re-read (REV-03 R3)", () => {
  const raised = applyChanges(proposal, form({ levels: { ...form().levels, task: 4 } }));

  it("is raised when the level changes and its remark does not; on that criterion only", () => {
    expect(raised.reread).toEqual({ task: true, organization: false, vocabulary: false, grammar: false, mechanics: false });
  });

  it("stays on the next saves, until the remark changes", () => {
    expect(applyChanges(raised, form({ levels: raised.levels as Record<CriterionId, Level> })).reread.task).toBe(true);
    const rewritten = applyChanges(raised, form({ levels: raised.levels as Record<CriterionId, Level>, remarks: { ...form().remarks, task: "Fully answers." } }));
    expect(rewritten.reread.task).toBe(false);
  });

  it("is cleared when marked re-read, without any text (D5)", () => {
    expect(applyChanges(raised, form({ levels: raised.levels as Record<CriterionId, Level>, rereadDone: ["task"] })).reread.task).toBe(false);
  });

  it("is not raised when the level and the remark change together", () => {
    const both = applyChanges(proposal, form({ levels: { ...form().levels, task: 4 }, remarks: { ...form().remarks, task: "Excellent." } }));
    expect(both.reread.task).toBe(false);
  });
});

describe("the changes a save records (REV-04 CA1)", () => {
  it("lists each changed field with its old and new value; nothing when unchanged", () => {
    expect(diffEvaluation(proposal, applyChanges(proposal, form()))).toEqual([]);
    expect(diffEvaluation(proposal, applyChanges(proposal, form({ levels: { ...form().levels, task: 4 } })))).toEqual([
      { field: "level.task", oldValue: 3, newValue: 4 },
      { field: "reread.task", oldValue: false, newValue: true },
      { field: "final_grade", oldValue: 10, newValue: 11 },
    ]);
    expect(diffEvaluation(proposal, applyChanges(proposal, form({ grade: { fixed: true, value: 12.5 } })))).toEqual([
      { field: "final_grade", oldValue: 10, newValue: 12.5 },
      { field: "grade_fixed", oldValue: false, newValue: true },
    ]);
  });
});

describe("a grade as typed in the form (REV-03 R2)", () => {
  it("reads a comma or a point, and refuses empty, out of range or off the step with its message", () => {
    expect(readTypedGrade("13,5")).toEqual({ value: 13.5 });
    expect(readTypedGrade(" 20 ")).toEqual({ value: 20 });
    expect(readTypedGrade(0)).toEqual({ value: 0 });
    expect(readTypedGrade("")).toEqual({ error: REVIEW_FIELD_MESSAGES.gradeMissing });
    expect(readTypedGrade("twelve")).toEqual({ error: REVIEW_FIELD_MESSAGES.gradeRange });
    expect(readTypedGrade("20.5")).toEqual({ error: REVIEW_FIELD_MESSAGES.gradeRange });
    expect(readTypedGrade("12.3")).toEqual({ error: REVIEW_FIELD_MESSAGES.gradeStep });
  });
});

describe("the evaluation a fresh rendering brings to an open form (REV-03 CA4)", () => {
  it("ignores an older or equal revision, takes a newer one into a clean form, and asks before replacing typed changes", () => {
    expect(reconcileSaved(2, 1, false)).toBe("keep");
    expect(reconcileSaved(2, 2, true)).toBe("keep");
    expect(reconcileSaved(1, 2, false)).toBe("adopt");
    expect(reconcileSaved(0, 3, true)).toBe("conflict");
  });
});

describe("what a validation needs and is logged as (REV-05 R2, E8.1)", () => {
  it("needs the five levels and a grade", () => {
    const evaluation = applyChanges(proposal, form());
    expect(isComplete(evaluation)).toBe(true);
    expect(isComplete({ ...evaluation, levels: { ...evaluation.levels, grammar: null } })).toBe(false);
    expect(isComplete({ ...evaluation, finalGrade: null })).toBe(false);
  });

  it("'unchanged' when the result equals the proposal, a change undone included; 'to re-read' marks aside", () => {
    expect(validationNature(proposal, applyChanges(proposal, form()))).toBe("unchanged");
    const changed = applyChanges(proposal, form({ levels: levels(4, 2, 2, 2, 1) }));
    const undone = applyChanges(changed, form());
    expect(validationNature(proposal, undone)).toBe("unchanged");
    expect(validationNature(proposal, { ...proposal, reread: { ...proposal.reread, task: true } })).toBe("unchanged");
  });

  it("'changed' as soon as a level, a remark, the comment, a step or the grade differs", () => {
    expect(validationNature(proposal, applyChanges(proposal, form({ levels: levels(4, 2, 2, 2, 1) })))).toBe("changed");
    expect(validationNature(proposal, applyChanges(proposal, form({ remarks: { ...proposal.remarks, grammar: "Fewer errors." } })))).toBe("changed");
    expect(validationNature(proposal, applyChanges(proposal, form({ generalComment: "Clear and lively." })))).toBe("changed");
    expect(validationNature(proposal, applyChanges(proposal, form({ nextSteps: [] })))).toBe("changed");
    expect(validationNature(proposal, applyChanges(proposal, form({ grade: { fixed: true, value: 10 } })))).toBe("changed");
  });

  it("'manual' without a proposal (REV-06)", () => {
    expect(validationNature(null, applyChanges(proposal, form()))).toBe("manual");
  });
});

describe("a manual evaluation in progress (REV-06, E8.2)", () => {
  const manual = (levels: Partial<Record<CriterionId, Level | null>>): EvaluationChanges => ({
    levels: { task: null, organization: null, vocabulary: null, grammar: null, mechanics: null, ...levels },
    remarks: { ...emptyFields().remarks },
    generalComment: "",
    nextSteps: [],
    grade: { fixed: false },
    rereadDone: [],
  });

  it("starts from nothing: no level, no remark, no grade", () => {
    expect(emptyFields()).toMatchObject({ finalGrade: null, gradeFixed: false, generalComment: "", nextSteps: [] });
    expect(Object.values(emptyFields().levels)).toEqual([null, null, null, null, null]);
  });

  it("has no grade while a level is missing, unless the teacher fixes one", () => {
    expect(calculatedGrade(manual({ task: 3 }).levels)).toBeNull();
    expect(applyChanges(emptyFields(), manual({ task: 3 })).finalGrade).toBeNull();
    expect(applyChanges(emptyFields(), { ...manual({ task: 3 }), grade: { fixed: true, value: 12 } }).finalGrade).toBe(12);
    expect(applyChanges(emptyFields(), manual({ task: 3, organization: 3, vocabulary: 3, grammar: 3, mechanics: 3 })).finalGrade).toBe(15);
  });

  it("never marks a first level 'to re-read': no remark was written for another one", () => {
    const first = applyChanges(emptyFields(), manual({ task: 3 }));
    expect(first.reread.task).toBe(false);
    // Once chosen, a change of level does mark it, as for any evaluation.
    expect(applyChanges(first, manual({ task: 4 })).reread.task).toBe(true);
  });
});
