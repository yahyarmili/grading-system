import { GRADE_DECIMALS, GRADE_SCALE } from "@/config/provisional";

const format = new Intl.NumberFormat("en", { maximumFractionDigits: GRADE_DECIMALS });

/** "13.5 / 20" (scale is provisional, Q1). */
export function formatGrade(value: number): string {
  return `${format.format(value)} / ${GRADE_SCALE}`;
}
