import "server-only";
import { CLASS_JOIN_LOCKOUT, CLASS_JOIN_MAX_FAILURES } from "@/config/provisional";
import { isLocked, recordFailure } from "@/server/data/auth/throttle";
import { findClassByInvite } from "@/server/data/classes/invites";
import { LINK_TOKEN_PATTERN, normalizeCode } from "./invite-codes";

// CLS-02 R3, CA4: entries of a class code or link are limited per student.
// Unknown, malformed, disabled, renewed or expired: one refusal, which never
// says whether a class exists (CA3). Joining itself (CLS-03, E2.3) calls this
// first, and counts a refusal of its own (removed student) with countFailure.

export type InviteAttempt = { outcome: "found"; classId: string } | { outcome: "refused" } | { outcome: "locked" };

const LIMIT = { max: CLASS_JOIN_MAX_FAILURES, windowSeconds: CLASS_JOIN_LOCKOUT, lockSeconds: CLASS_JOIN_LOCKOUT };

/** One failed entry for this student. */
export async function countFailure(userId: string): Promise<void> {
  await recordFailure("class_join_user", userId, LIMIT);
}

/**
 * Checks a typed code or a link token for this student. A success does not
 * reset the count: otherwise entering the code of one's own class would
 * clear it between guesses.
 */
export async function tryInvite(userId: string, raw: { code: unknown } | { linkToken: unknown }): Promise<InviteAttempt> {
  // Checked first: during a lockout even a valid code is refused (CA4).
  if (await isLocked("class_join_user", userId)) return { outcome: "locked" };

  let classId: string | null = null;
  if ("code" in raw) {
    const code = typeof raw.code === "string" ? normalizeCode(raw.code) : null;
    if (code) classId = await findClassByInvite({ code });
  } else if (typeof raw.linkToken === "string" && LINK_TOKEN_PATTERN.test(raw.linkToken)) {
    classId = await findClassByInvite({ linkToken: raw.linkToken });
  }
  if (classId) return { outcome: "found", classId };
  await countFailure(userId);
  return { outcome: "refused" };
}
