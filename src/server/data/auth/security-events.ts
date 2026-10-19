import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { securityEvents } from "@/server/db/schema";

type SecurityEventType = (typeof securityEvents.$inferInsert)["type"];
type Executor = Pick<typeof db, "insert">;

/** NFR-DON-05: identifiers only, never an email, a secret or content. */
export async function recordSecurityEvent(
  type: SecurityEventType,
  ids: { actorUserId?: string | null; subjectId?: string | null } = {},
  executor: Executor = db,
): Promise<void> {
  await executor.insert(securityEvents).values({
    type,
    actorUserId: ids.actorUserId ?? null,
    subjectId: ids.subjectId ?? null,
  });
}

/**
 * Requests sent to the AI since 00:00 UTC, as the security log counts them
 * (one ai_request_sent per HTTP request, retries included), for the daily
 * guard of the commands (AI_DAILY_REQUEST_LIMIT). Counts rows, reads none. Only what this
 * database logged: another database or key is not seen.
 */
export async function countAiRequestsToday(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(securityEvents)
    .where(and(eq(securityEvents.type, "ai_request_sent"), sql`${securityEvents.createdAt} >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'`));
  return row.count;
}
