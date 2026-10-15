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
