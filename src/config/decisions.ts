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
 * [D, 2026-10-17] The AI model, chosen by the user among OpenRouter's free
 * models: never the openrouter/free router, which draws a model at random
 * (NFR-QUA-02). The ":free" identifier carries no date (its canonical slug
 * was xingchen-agi/xing4.0-29b-a4b-20261015 on 2026-10-17): OpenRouter may
 * move it, so the model that answered is recorded with each result. A new
 * model is a new decision (stack-technologique.md §3).
 */
export const AI_MODEL = "xingchen-agi/xing4.0-29b-a4b:free";

/**
 * [D, 2026-10-17] OpenRouter's routing, sent with each request (provider
 * selection): only endpoints that support every parameter sent, the answer
 * schema included (require_parameters), and only endpoints OpenRouter lists
 * as keeping nothing (zdr). The rule: zdr when the model has such an
 * endpoint, otherwise data_collection: "deny", whose effect on retention is
 * not verified. Fallbacks are left to OpenRouter, among these endpoints only.
 */
export const AI_ROUTING = Object.freeze({ require_parameters: true, zdr: true } as const);
