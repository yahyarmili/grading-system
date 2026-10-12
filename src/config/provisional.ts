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

// ---------------------------------------------------------------------------
// Authentication (E1). PROVISIONAL: to be defined at step 5 (NFR-SEC-02, NFR-SEC-03).
// Durations in seconds. "Better Auth default" values copy the library's default;
// "[P] arbitrary" values have no source and must be confirmed.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** [PROVISIONAL] Session lifetime (Better Auth default). */
export const SESSION_EXPIRES_IN = 7 * DAY;

/** [PROVISIONAL] A session in use is extended once per this interval (Better Auth default). */
export const SESSION_UPDATE_AGE = 1 * DAY;

/** [PROVISIONAL] Lifetime of an email confirmation link (Better Auth default). */
export const EMAIL_VERIFICATION_TTL = 1 * HOUR;

/** [PROVISIONAL] Lifetime of a password reset link (Better Auth default). */
export const PASSWORD_RESET_TTL = 1 * HOUR;

/** [PROVISIONAL, [P] arbitrary] Lifetime of a teacher invitation link. */
export const TEACHER_INVITATION_TTL = 7 * DAY;

/** [PROVISIONAL, [P] arbitrary] N: failed sign-ins for one email before the lockout. */
export const SIGN_IN_MAX_FAILURES = 5;

/** [PROVISIONAL, [P] arbitrary] D: lockout after N failures, even with the right password. */
export const SIGN_IN_LOCKOUT = 15 * MINUTE;

/** [PROVISIONAL, [P] arbitrary] Reset or confirmation link requests per email and window (AUTH-05 R3). */
export const LINK_REQUEST_MAX = 3;
export const LINK_REQUEST_WINDOW = 1 * HOUR;

/** [PROVISIONAL, [P] arbitrary] Sign-ups per IP address and window (NFR-SEC-02). */
export const SIGN_UP_MAX_PER_IP = 10;
export const SIGN_UP_WINDOW = 1 * HOUR;

/** [PROVISIONAL] Password length bounds (Better Auth defaults). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
