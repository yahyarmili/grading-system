import "server-only";
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
