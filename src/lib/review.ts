import { GRADE_SCALE } from "@/config/decisions";
import { GRADE_STEP, REVIEW_TEXT_MAX_LENGTH } from "@/config/provisional";
import { calculateGrade } from "@/lib/grade";
import { criterionIds, levels as LEVELS, type CriterionId, type Level } from "@/lib/rubric";

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

/**
 * One save of the form (REV-03): the whole form, plus the remarks marked
 * re-read. A level may be null in a manual evaluation in progress only
 * (REV-06); the server refuses it for an evaluation from a proposal.
 */
export type EvaluationChanges = {
  levels: Record<CriterionId, Level | null>;
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
 * range or the step. Not fixed with a level missing (a manual evaluation
 * in progress, REV-06): no grade yet, null.
 */
export function finalGradeOf(levels: Record<CriterionId, Level | null>, grade: GradeChoice): number | null {
  if (grade.fixed) {
    const problem = fixedGradeProblem(grade.value);
    if (problem) throw new RangeError(`A fixed grade must be ${problem === "range" ? `from 0 to ${GRADE_SCALE}` : `a multiple of ${GRADE_STEP}`}.`);
    return grade.value;
  }
  return calculatedGrade(levels);
}

/** The sum of the levels, or null while one is missing (a manual evaluation in progress). */
export function calculatedGrade(levels: Record<CriterionId, Level | null>): number | null {
  const chosen = criterionIds.map((id) => levels[id]);
  return chosen.some((level) => level === null) ? null : calculateGrade(chosen as Level[]);
}

/** Where a manual evaluation starts (REV-06): nothing chosen, nothing written. */
export function emptyFields(): EvaluationFields {
  const levels = {} as Record<CriterionId, Level | null>;
  const remarks = {} as Record<CriterionId, string>;
  const reread = {} as Record<CriterionId, boolean>;
  for (const id of criterionIds) {
    levels[id] = null;
    remarks[id] = "";
    reread[id] = false;
  }
  return { levels, remarks, reread, generalComment: "", nextSteps: [], finalGrade: null, gradeFixed: false };
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
 * A first level chosen (none before: a manual evaluation, REV-06) changes
 * no remark's meaning: no mark.
 */
export function applyChanges(before: EvaluationFields, changes: EvaluationChanges): EvaluationFields {
  const reread = {} as Record<CriterionId, boolean>;
  for (const id of criterionIds) {
    const remarkChanged = changes.remarks[id] !== before.remarks[id];
    const levelChanged = before.levels[id] !== null && changes.levels[id] !== before.levels[id];
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

/** REV-05 R2 [P]: a validation needs the five levels and a grade. */
export function isComplete(fields: Pick<EvaluationFields, "levels" | "finalGrade">): boolean {
  return criterionIds.every((id) => fields.levels[id] !== null) && fields.finalGrade !== null;
}

/**
 * What a validation is logged as (REV-05 R2, E8 plan §1): "unchanged" when
 * the result equals the proposal it started from, "changed" otherwise, by
 * content (a change undone counts as none); "manual" without a proposal
 * (REV-06). The "to re-read" marks are not part of the result: ignored.
 */
export type ValidationNature = "unchanged" | "changed" | "manual";

export function validationNature(proposal: EvaluationFields | null, evaluation: EvaluationFields): ValidationNature {
  if (!proposal) return "manual";
  return diffEvaluation(proposal, evaluation).some((change) => !change.field.startsWith("reread.")) ? "changed" : "unchanged";
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

/** The message of each refused field, the same on the form and from the server (REV-03). */
export const REVIEW_FIELD_MESSAGES = {
  level: `Choose a level from ${LEVELS[0]} to ${LEVELS.at(-1)}.`,
  // REV-05 R2, REV-06: a validation needs every level.
  levelMissing: "Choose a level for this criterion.",
  tooLong: `Keep it under ${REVIEW_TEXT_MAX_LENGTH} characters.`,
  gradeMissing: "Enter a grade, or use the calculated grade.",
  gradeRange: `Enter a grade between 0 and ${GRADE_SCALE}.`,
  gradeStep: `Use steps of ${GRADE_STEP}.`,
} as const;

/** A grade as typed ("13,5" or "13.5"): its value, or the message that refuses it. */
export function readTypedGrade(typed: string | number): { value: number } | { error: string } {
  const text = typeof typed === "string" ? typed.trim().replace(",", ".") : typed;
  if (text === "") return { error: REVIEW_FIELD_MESSAGES.gradeMissing };
  const value = Number(text);
  const problem = fixedGradeProblem(value);
  if (problem) return { error: problem === "range" ? REVIEW_FIELD_MESSAGES.gradeRange : REVIEW_FIELD_MESSAGES.gradeStep };
  return { value };
}

/**
 * What an open form does with the evaluation a fresh rendering of the page
 * brings (a refresh after a save, another tab's save): revisions only grow
 * (0017), so an older or equal one is a late answer, ignored; a newer one
 * replaces a clean form, and never a form with changes typed (REV-03 CA4):
 * the teacher chooses, as in a conflict.
 */
export function reconcileSaved(savedRevision: number, incomingRevision: number, dirty: boolean): "keep" | "adopt" | "conflict" {
  if (incomingRevision <= savedRevision) return "keep";
  return dirty ? "conflict" : "adopt";
}
