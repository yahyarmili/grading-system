import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

// Attempt counters in the database (NFR-SEC-02). The key is a digest: no email
// or IP address in clear.

export type ThrottleScope = "sign_up_ip";

function throttleKey(scope: ThrottleScope, value: string): string {
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
