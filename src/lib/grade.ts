import { GRADE_DECIMALS, GRADE_SCALE } from "@/config/provisional";
import { MAX_LEVEL, rubric, type Level } from "@/lib/rubric";

const format = new Intl.NumberFormat("en", { maximumFractionDigits: GRADE_DECIMALS });
const factor = 10 ** GRADE_DECIMALS;

/** "13.5 / 20" (scale is provisional, Q1). */
export function formatGrade(value: number): string {
  return `${formatGradeValue(value)} / ${GRADE_SCALE}`;
}

/** "13.5", for tables whose column header carries the scale. */
export function formatGradeValue(value: number): string {
  return format.format(value);
}

/**
 * Grade calculated by the system from the five levels, never by the AI
 * (EVL-01 R3). Provisional rule (Q1): weighted share of the maximum, on GRADE_SCALE.
 */
export function calculateGrade(levelsByCriterion: readonly Level[]): number {
  const weighted = rubric.reduce(
    (sum, criterion, i) => sum + (levelsByCriterion[i] / MAX_LEVEL) * criterion.weight,
    0,
  );
  return Math.round((weighted / 100) * GRADE_SCALE * factor) / factor;
}
