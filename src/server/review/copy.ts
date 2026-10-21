import "server-only";
import { z } from "zod";
import { submissionStatuses } from "@/lib/submission-status";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { recordCopyOpened } from "@/server/data/review/copy";

// REV-02 (E7.3), without Next request APIs so integration tests can call it:
// what opening a copy does once the page is shown.

/** refresh: the copy changed since it was rendered (a replacement, a new proposal, another tab's save). */
export type CopyOpenResult = { refresh: boolean };

const seenSchema = z.object({
  submissionId: z.uuid(),
  versionNumber: z.int().min(1),
  proposalId: z.uuid().nullable(),
  revision: z.int().min(0),
  status: z.enum(submissionStatuses),
});

/** Logs "copy opened" on the teacher's own copy, and compares it with what the page saw. */
export async function openCopy(actor: Actor, raw: unknown): Promise<CopyOpenResult> {
  const parsed = seenSchema.safeParse(raw);
  if (!parsed.success) return { refresh: false };
  const seen = parsed.data;
  try {
    const now = await recordCopyOpened(actor, seen.submissionId);
    if (!now) return { refresh: false };
    return {
      refresh:
        now.versionNumber !== seen.versionNumber ||
        now.proposalId !== seen.proposalId ||
        now.revision !== seen.revision ||
        now.status !== seen.status,
    };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { refresh: false };
  }
}
