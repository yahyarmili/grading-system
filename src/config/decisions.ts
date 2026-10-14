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
