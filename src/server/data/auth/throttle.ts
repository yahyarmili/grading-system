import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

// Attempt counters in the database (NFR-SEC-02). The key is a digest: no email
// or IP address in clear.

export type ThrottleScope = "sign_up_ip";
type AnyScope = ThrottleScope | LockScope;

function throttleKey(scope: AnyScope, value: string): string {
  return createHash("sha256").update(`${scope}:${value}`).digest("hex");
}

/**
 * Counts one attempt in a fixed window and says whether it is allowed.
 * Atomic: concurrent attempts each get their own count.
 */
export async function countAttempt(
  scope: ThrottleScope,
  value: string,
  limit: { max: number; windowSeconds: number },
): Promise<{ allowed: boolean }> {
  const key = throttleKey(scope, value);
  const window = sql`make_interval(secs => ${limit.windowSeconds})`;
  const { rows } = await db.execute<{ failures: number }>(sql`
    INSERT INTO auth_throttles (key, failures, window_started_at)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      failures = CASE WHEN auth_throttles.window_started_at + ${window} <= now()
        THEN 1 ELSE auth_throttles.failures + 1 END,
      window_started_at = CASE WHEN auth_throttles.window_started_at + ${window} <= now()
        THEN now() ELSE auth_throttles.window_started_at END
    RETURNING failures
  `);
  return { allowed: rows[0].failures <= limit.max };
}

export type LockScope = "sign_in_email";

/** True while the value is locked out (AUTH-02 CA3). */
export async function isLocked(scope: LockScope, value: string): Promise<boolean> {
  const { rows } = await db.execute<{ locked: boolean }>(sql`
    SELECT locked_until > now() AS locked FROM auth_throttles WHERE key = ${throttleKey(scope, value)}
  `);
  return rows[0]?.locked === true;
}

/**
 * Counts one failure within the window; the Nth failure locks the value for
 * lockSeconds and restarts the count. Returns whether this failure locked it.
 */
export async function recordFailure(
  scope: LockScope,
  value: string,
  limit: { max: number; windowSeconds: number; lockSeconds: number },
): Promise<{ lockedNow: boolean }> {
  const key = throttleKey(scope, value);
  const window = sql`make_interval(secs => ${limit.windowSeconds})`;
  const { rows } = await db.execute<{ failures: number }>(sql`
    INSERT INTO auth_throttles (key, failures, window_started_at)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      failures = CASE WHEN auth_throttles.window_started_at + ${window} <= now()
        THEN 1 ELSE auth_throttles.failures + 1 END,
      window_started_at = CASE WHEN auth_throttles.window_started_at + ${window} <= now()
        THEN now() ELSE auth_throttles.window_started_at END
    RETURNING failures
  `);
  if (rows[0].failures < limit.max) return { lockedNow: false };
  await db.execute(sql`
    UPDATE auth_throttles
    SET locked_until = now() + make_interval(secs => ${limit.lockSeconds}), failures = 0, window_started_at = now()
    WHERE key = ${key}
  `);
  return { lockedNow: true };
}

/** After a successful attempt: the count starts again from zero. */
export async function clearAttempts(scope: LockScope, value: string): Promise<void> {
  await db.execute(sql`DELETE FROM auth_throttles WHERE key = ${throttleKey(scope, value)}`);
}
