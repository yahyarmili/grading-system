import { GRADE_SCALE } from "@/config/decisions";
import { GRADE_DECIMALS } from "@/config/provisional";
import { criterionIds, levels, type Level } from "@/lib/rubric";

const format = new Intl.NumberFormat("en", { maximumFractionDigits: GRADE_DECIMALS });

/** "13.5 / 20". */
export function formatGrade(value: number): string {
  return `${formatGradeValue(value)} / ${GRADE_SCALE}`;
}

/** "13.5", for tables whose column header carries the scale. */
export function formatGradeValue(value: number): string {
  return format.format(value);
}

/**
 * Grade calculated by the system from the five levels, one per criterion in
 * rubric order, never by the AI (EVL-01 R3). Q1 [D]: their sum, out of
 * GRADE_SCALE. Anything but five whole levels from 0 to 4 throws: a grade is
 * never calculated from an incomplete or out-of-range set.
 */
export function calculateGrade(levelsByCriterion: readonly Level[]): number {
  let sum = 0;
  // By index: a hole in the array is refused too (every and reduce skip holes).
  for (let i = 0; i < Math.max(levelsByCriterion.length, criterionIds.length); i++) {
    const level: unknown = levelsByCriterion[i];
    if (i >= criterionIds.length || !(levels as readonly unknown[]).includes(level)) {
      throw new RangeError(`A grade needs ${criterionIds.length} whole levels from ${levels[0]} to ${levels.at(-1)}.`);
    }
    sum += level as Level;
  }
  return sum;
}
