import "server-only";
import { z } from "zod";
import { SWEEP_ON_OPEN_MAX_MS } from "@/config/provisional";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { getTeacherAssignment } from "@/server/data/assignments/assignments";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { recordListOpened } from "@/server/data/review/list";
import { errorKind } from "@/server/evaluation/evaluate";
import type { SweepResult } from "@/server/evaluation/sweep";

// REV-01 (E7.2), without Next request APIs so integration tests can call it:
// what opening an assignment's submissions does once the page is shown.

/** The sweep, and how to finish it after the response: after() in the Server Action, a recorder in the tests. */
export type ListOpenContext = {
  sweep: () => Promise<SweepResult>;
  later: (task: Promise<unknown>) => void;
};

/** refresh: the list changed since it was rendered (a sweep, a page from the router's cache). */
export type ListOpenResult = { refresh: boolean };

const inputSchema = z.object({ assignmentId: z.uuid(), stamp: z.string().max(64) });

/**
 * E7 plan §1.7: on the teacher's own assignment only, the evaluation sweep
 * ([D, 2026-10-20]: the Vercel cron does not run on the preview), awaited
 * SWEEP_ON_OPEN_MAX_MS at most, then finished after the response; a failure
 * is logged by kind, never shown. Then the journal entry "list opened"
 * (REV-04). Another teacher's or a missing assignment: nothing done.
 */
export async function openReviewList(actor: Actor, raw: unknown, context: ListOpenContext): Promise<ListOpenResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { refresh: false };
  const { assignmentId, stamp } = parsed.data;
  try {
    if (!(await getTeacherAssignment(actor, assignmentId))) return { refresh: false };

    const sweeping = context.sweep().catch((error: unknown) => {
      console.error(`[evaluation] sweep failed: ${errorKind(error)}`);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = await Promise.race([
      sweeping.then(() => false),
      new Promise<true>((resolve) => {
        timer = setTimeout(() => resolve(true), SWEEP_ON_OPEN_MAX_MS);
      }),
    ]);
    clearTimeout(timer);
    if (late) context.later(sweeping);

    const opened = await recordListOpened(actor, assignmentId);
    return { refresh: opened !== null && opened.stamp !== stamp };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { refresh: false };
  }
}
