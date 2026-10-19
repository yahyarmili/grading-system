// DECIDED VALUES — decisions of the user, marked [D] in conception/.
// Change one only after a new decision, recorded first with T5.
// Values still open stay in provisional.ts.

const HOUR = 60 * 60;

/**
 * [D, 2026-10-14, Q7] Lifetime of a class link and code, in seconds, from the
 * link's creation; renewing creates a new link (CLS-02 R4). Disabling and
 * renewing stay available to the teacher.
 */
export const CLASS_INVITE_TTL = 1 * HOUR;

/**
 * [D, 2026-10-14, NFR-USA-02] The single time zone in which a deadline is
 * entered and shown, with its name, the same for students and teachers. The
 * other dates of the screens use it too. An IANA name, never a fixed offset:
 * Morocco's offset changes (Ramadan, and the tz database's later rules).
 */
export const DEADLINE_TIME_ZONE = "Africa/Casablanca";

/**
 * [D, 2026-10-15, NFR-TRT-02] Longest text a student submits, in characters
 * as displayed (grapheme clusters, countCharacters in src/lib/submission-text.ts),
 * the same count in the browser and on the server. A longer text is refused,
 * never cut (SUB-02 R1).
 */
export const SUBMISSION_TEXT_MAX_LENGTH = 4000;

/**
 * [D, 2026-10-15, Q3] Replacements of a submission, until the teacher's first
 * change or validation: 2 at most, so 3 versions (SUB-05 R3).
 */
export const SUBMISSION_MAX_REPLACEMENTS = 2;

/**
 * [D, 2026-10-15, Q1] The grade is out of 20: the sum of the five levels
 * (0 to 4 each), a whole number from 0 (all at 0) to 20 (all at 4). The
 * system calculates it, never the AI (EVL-01 R3): calculateGrade,
 * src/lib/grade.ts. The step of a grade the teacher types stays open
 * (GRADE_STEP, provisional.ts).
 */
export const GRADE_SCALE = 20;

/**
 * [D, 2026-10-19] The AI model: Anthropic's Claude Haiku 5.5, through
 * Anthropic's API directly. A fixed identifier, without a date or an alias;
 * not retired before 2027-10-07 (conception/annexe-ia-anthropic.md §1). The
 * model that answered is still recorded with each result. A new model is a
 * new decision (stack-technologique.md §3).
 */
export const AI_MODEL = "claude-haiku-5-5";

/**
 * [D, 2026-10-19] Where the model runs, sent with each request: the United
 * States, the only value the workspace allows (Console, 2026-10-19). Its
 * price is 1.1 times the global one.
 */
export const AI_INFERENCE_GEO = "us";
