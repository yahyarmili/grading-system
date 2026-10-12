// PROVISIONAL VALUES — not decisions.
// Each value below stands in for an open question of conception/fonctionnalites.md §9.
// Change it here only; do not hard-code it elsewhere.

/** [Q1 open] Grade format: out of 20 (recommendation, not decided). */
export const GRADE_SCALE = 20;

/** [Q1 open] Grades are shown with at most one decimal. */
export const GRADE_DECIMALS = 1;

// [Q1 open] Conversion of the five levels into a grade: weighted share of the
// maximum, on GRADE_SCALE (out of 20, the plain sum of the levels).
// Implemented in calculateGrade, src/lib/grade.ts.

/** [Q1 open] Step the teacher can type for a final grade. */
export const GRADE_STEP = 0.5;
