import { GRADE_SCALE } from "@/config/decisions";
import { GRADE_STEP } from "@/config/provisional";
import { calculateGrade } from "@/lib/grade";
import { criterionIds, type CriterionId, type Level } from "@/lib/rubric";

// The teacher's evaluation (E7, REV-03): its fields, the grade rule, the
// "to re-read" flags and the changes a write records in the review log
// (REV-04). Pure: the server writes what these functions compute, and the
// form shows the same results before saving. Closed lists: review-lists.ts.

/** What the teacher's evaluation holds, criterion by criterion; a level is null only in a manual evaluation in progress (E8). */
export type EvaluationFields = {
  levels: Record<CriterionId, Level | null>;
  remarks: Record<CriterionId, string>;
  reread: Record<CriterionId, boolean>;
  generalComment: string;
  nextSteps: string[];
  finalGrade: number | null;
  gradeFixed: boolean;
};

/** The grade the teacher asks for: calculated from the levels, or fixed at a value (REV-03 R2). */
export type GradeChoice = { fixed: false } | { fixed: true; value: number };

/** One save of the form (REV-03): the whole form, plus the remarks marked re-read. */
export type EvaluationChanges = {
  levels: Record<CriterionId, Level>;
  remarks: Record<CriterionId, string>;
  generalComment: string;
  nextSteps: string[];
  grade: GradeChoice;
  /** Criteria whose "to re-read" mark the teacher clears without changing the remark. */
  rereadDone: CriterionId[];
};

/** What a fixed grade breaks, if anything: out of 0 to GRADE_SCALE, or off the step GRADE_STEP [P]. */
export function fixedGradeProblem(value: number): "range" | "step" | null {
  if (!Number.isFinite(value) || value < 0 || value > GRADE_SCALE) return "range";
  const steps = value / GRADE_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-9 ? null : "step";
}

/**
 * REV-03 R2: while the grade is not fixed, the sum of the levels, recalculated
 * at each change; once fixed, the teacher's value, never recalculated. Throws
 * on a level outside 0 to 4 (calculateGrade) and on a fixed grade off the
 * range or the step.
 */
export function finalGradeOf(levels: Record<CriterionId, Level>, grade: GradeChoice): number {
  const calculated = calculateGrade(criterionIds.map((id) => levels[id]));
  if (!grade.fixed) return calculated;
  const problem = fixedGradeProblem(grade.value);
  if (problem) throw new RangeError(`A fixed grade must be ${problem === "range" ? `from 0 to ${GRADE_SCALE}` : `a multiple of ${GRADE_STEP}`}.`);
  return grade.value;
}

/** The gap between a fixed grade and the calculated one, signalled to the teacher (invariant 6); 0 when not fixed. */
export function gradeGap(fields: Pick<EvaluationFields, "levels" | "finalGrade" | "gradeFixed">): number {
  if (!fields.gradeFixed || fields.finalGrade === null) return 0;
  const levels = criterionIds.map((id) => fields.levels[id]);
  if (levels.some((level) => level === null)) return 0;
  return fields.finalGrade - calculateGrade(levels as Level[]);
}

/**
 * The evaluation after one save. "To re-read" (REV-03 R3, D5): set when the
 * level of a criterion changes and its remark does not; kept until the
 * remark changes or the teacher marks it re-read; never blocks anything.
 */
export function applyChanges(before: EvaluationFields, changes: EvaluationChanges): EvaluationFields {
  const reread = {} as Record<CriterionId, boolean>;
  for (const id of criterionIds) {
    const remarkChanged = changes.remarks[id] !== before.remarks[id];
    const levelChanged = changes.levels[id] !== before.levels[id];
    reread[id] = !remarkChanged && (levelChanged || (before.reread[id] && !changes.rereadDone.includes(id)));
  }
  return {
    levels: { ...changes.levels },
    remarks: { ...changes.remarks },
    reread,
    generalComment: changes.generalComment,
    nextSteps: [...changes.nextSteps],
    finalGrade: finalGradeOf(changes.levels, changes.grade),
    gradeFixed: changes.grade.fixed,
  };
}

/** One changed field, as the review log records it (REV-04 CA1). */
export type FieldChange = { field: string; oldValue: unknown; newValue: unknown };

/** The fields that differ between two states of the evaluation, in a fixed order. */
export function diffEvaluation(before: EvaluationFields, after: EvaluationFields): FieldChange[] {
  const changes: FieldChange[] = [];
  const compare = (field: string, oldValue: unknown, newValue: unknown) => {
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changes.push({ field, oldValue, newValue });
  };
  for (const id of criterionIds) {
    compare(`level.${id}`, before.levels[id], after.levels[id]);
    compare(`remark.${id}`, before.remarks[id], after.remarks[id]);
    compare(`reread.${id}`, before.reread[id], after.reread[id]);
  }
  compare("general_comment", before.generalComment, after.generalComment);
  compare("next_steps", before.nextSteps, after.nextSteps);
  compare("final_grade", before.finalGrade, after.finalGrade);
  compare("grade_fixed", before.gradeFixed, after.gradeFixed);
  return changes;
}

/** The proposal's values a new evaluation starts from (REV-03 R1): the justifications become the remarks. */
export function fieldsFromProposal(proposal: {
  criteria: Record<CriterionId, { level: Level; justification: string }>;
  generalComment: string;
  nextSteps: readonly string[];
  proposedGrade: number;
}): EvaluationFields {
  const levels = {} as Record<CriterionId, Level>;
  const remarks = {} as Record<CriterionId, string>;
  const reread = {} as Record<CriterionId, boolean>;
  for (const id of criterionIds) {
    levels[id] = proposal.criteria[id].level;
    remarks[id] = proposal.criteria[id].justification;
    reread[id] = false;
  }
  return {
    levels,
    remarks,
    reread,
    generalComment: proposal.generalComment,
    nextSteps: [...proposal.nextSteps],
    finalGrade: proposal.proposedGrade,
    gradeFixed: false,
  };
}
