// PROVISIONAL VALUES — not decisions.
// Each value below stands in for an open question of conception/fonctionnalites.md §9.
// Change it here only; do not hard-code it elsewhere.

// The grade out of 20, the sum of the five levels, is decided (Q1):
// src/config/decisions.ts. Only the step of a grade the teacher types stays open.

/** [PROVISIONAL, [P]] Step the teacher can type for a final grade (REV-03). */
export const GRADE_STEP = 0.5;

/** [PROVISIONAL, [P]] Decimals shown for a final grade, to match GRADE_STEP; a calculated grade is whole. */
export const GRADE_DECIMALS = 1;

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

// ---------------------------------------------------------------------------
// Classes (E2). PROVISIONAL.

/** [PROVISIONAL, [P] arbitrary] Maximum length of a class name (CLS-01). */
export const CLASS_NAME_MAX_LENGTH = 60;

// The lifetime of a class link and code is decided (Q7): src/config/decisions.ts.

/** [PROVISIONAL, [P] arbitrary, as for sign-in] N: failed class code or link entries per student before the lockout (CLS-02 CA4). */
export const CLASS_JOIN_MAX_FAILURES = 5;

/** [PROVISIONAL, [P] arbitrary, as for sign-in] D: lockout after N failures, even with a valid code. */
export const CLASS_JOIN_LOCKOUT = 15 * MINUTE;

/**
 * [PROVISIONAL, [P] arbitrary] How long a class link opened without a session
 * is remembered (cookie, and the intent bound to a new account) until sign-in
 * or email confirmation (CLS-03 R3).
 */
export const CLASS_INVITE_INTENT_TTL = 7 * DAY;

// ---------------------------------------------------------------------------
// Assignments (E3). PROVISIONAL.

/** [PROVISIONAL, [P] arbitrary] Maximum length of an assignment title (ASG-01). */
export const ASSIGNMENT_TITLE_MAX_LENGTH = 120;

/** [PROVISIONAL, [P] arbitrary] Maximum length of the subject, sent to the AI (ASG-01 R4). */
export const ASSIGNMENT_SUBJECT_MAX_LENGTH = 2000;

/** [PROVISIONAL, [P] arbitrary] Maximum length of the instructions, sent to the AI (ASG-01 R4). */
export const ASSIGNMENT_INSTRUCTIONS_MAX_LENGTH = 4000;

// ---------------------------------------------------------------------------
// Evaluation by the AI (E5). PROVISIONAL, [P] arbitrary: to be confirmed on
// the trial sets (E5.7, E5.16). The model and where it runs are decided
// (AI_MODEL, AI_INFERENCE_GEO, decisions.ts). The key's variable is
// GRADING_ANTHROPIC_API_KEY [P], read by src/server/ai/index.ts alone: never
// ANTHROPIC_API_KEY, which Claude Code would take instead of its subscription.

/**
 * [PROVISIONAL, [P]] Longest wait for one call to the AI, answer read
 * included; under Vercel's 300 s for one call. Raised from 60 s on
 * 2026-10-17 at the user's request: the answers of the first trial run that
 * arrived took 39 to 57 s, and 27 calls in 34 reached 60 s
 * (conception/annexe-essais-ia.md). Several attempts of one evaluation may
 * now exceed 300 s together: to handle when E6 runs it on Vercel.
 */
export const AI_CALL_TIMEOUT_MS = 120_000;

/**
 * [PROVISIONAL, [P] arbitrary] How much effort the model spends (low to max;
 * its default is medium): low, for a short task repeated over many texts. To
 * be measured on the trial sets (E5.16). No temperature is sent: Haiku 5.5
 * refuses any other than 1, so stability is measured, not set.
 */
export const AI_EFFORT = "low" as const;

/**
 * [PROVISIONAL, [P]] Adaptive thinking: the model may skip it on a simple
 * text. Its blocks are never shown nor stored (display "omitted").
 */
export const AI_THINKING = "adaptive" as const;

/**
 * [PROVISIONAL, [P] arbitrary] Most tokens of an answer, thinking included:
 * about 950 for the JSON (annexe-ia-anthropic.md §7) and room to think. A cut
 * answer ends at the validator. 2 000 before E5.13.
 */
export const AI_MAX_OUTPUT_TOKENS = 4_000;

/** [PROVISIONAL, [P] arbitrary] Most quotes the AI gives per criterion (at least 1). */
export const AI_MAX_QUOTES_PER_CRITERION = 3;

/** [PROVISIONAL, [P] arbitrary] Attempts at most for one evaluation, the first included (EVL-03 R3). */
export const AI_MAX_ATTEMPTS = 3;

/** [PROVISIONAL, [P] arbitrary] Wait before a new attempt, unless the provider asked for one (Retry-After). */
export const AI_RETRY_DELAY_MS = 2_000;

/** [PROVISIONAL, [P] arbitrary] Longest wait asked by the provider (Retry-After) that is honoured; longer is cut to this. */
export const AI_RETRY_MAX_WAIT_MS = 30_000;

/**
 * [PROVISIONAL, [P] derived] How long a submission may stay evaluating before
 * it is released to evaluation_failed (PRC-02 R1): the longest evaluation
 * (every attempt at its timeout, the longest wait between two), plus 5 minutes
 * for the database and the validator. 12 minutes with the values above.
 */
export const EVALUATION_STUCK_AFTER_MS =
  AI_MAX_ATTEMPTS * AI_CALL_TIMEOUT_MS + (AI_MAX_ATTEMPTS - 1) * AI_RETRY_MAX_WAIT_MS + 5 * 60_000;

/**
 * [PROVISIONAL, [P] arbitrary] Edits allowed between a quote and the text, per
 * character of the quote, once both are normalized; to be set on the very
 * faulty texts of the development set (E5.7).
 */
export const QUOTE_MAX_ERROR_RATE = 0.15;

/**
 * [PROVISIONAL, [P] arbitrary] Under this many words, a text gets the
 * information alert "very short" (EVL-04 R2, CA2; threshold "to be defined"
 * in the specification). Words as Intl.Segmenter finds them in the
 * assignment's language; to be set on the trial sets (E5.7) or by the client.
 */
export const SHORT_TEXT_MIN_WORDS = 50;

/**
 * [PROVISIONAL, [P] arbitrary] Most requests the internal commands send to
 * the AI per UTC day, retries included: a guard of the credit, no longer a
 * provider's quota (50 before E5.13, OpenRouter's). The trial of E5.16 needs
 * 60 calls, 180 at worst. The scripts stop before going over it.
 */
export const AI_DAILY_REQUEST_LIMIT = 200;

/**
 * [PROVISIONAL, [P] arbitrary] Pause between two requests of the trial sets:
 * caution only, far under the 1 000 requests a minute of the tier (4 000
 * before E5.13).
 */
export const AI_TRIAL_PAUSE_MS = 1_000;

/**
 * [PROVISIONAL, [P] arbitrary] Largest level gap, on any criterion, between
 * a text of the adversarial set and the same text without the injected
 * instruction (EVL-03 CA3: "écart maximal à définir").
 */
export const ADVERSARIAL_MAX_LEVEL_GAP = 1;
