import "server-only";
import { z } from "zod";
import type { AssignmentLanguage } from "@/lib/assignment";
import { mayOfferRelaunch } from "@/lib/relaunch-offer";
import type { ReviewRow } from "@/lib/review-list";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { listRelaunchable } from "@/server/data/evaluation/teacher";
import { recordListOpened } from "@/server/data/review/list";
import { errorKind } from "@/server/evaluation/evaluate";
import { relaunchConditions } from "@/server/evaluation/relaunch";
import type { SweepResult } from "@/server/evaluation/sweep";

// REV-01 (E7.2), without Next request APIs so integration tests can call it:
// what opening an assignment's submissions does once the page is shown.

/**
 * The sweep, and how to run it after the response: after() in the Server
 * Action, a recorder in the tests. Shared by the list and the copy (copy.ts).
 */
export type SweepContext = {
  sweep: () => Promise<SweepResult>;
  later: (task: () => Promise<unknown>) => void;
};

/** refresh: the list changed since it was rendered (a page from the router's cache, a change meanwhile). */
export type ListOpenResult = { refresh: boolean };

const inputSchema = z.object({ assignmentId: z.uuid(), stamp: z.string().max(64) });

/**
 * E7 plan §1.7 ([D, 2026-10-20]: the Vercel cron does not run on the
 * preview): the evaluation sweep, run once the opening answered. Next
 * dispatches a client's Server Actions one at a time (guides/server-actions,
 * "Sequential dispatch on the client"): an opening that waited for the sweep
 * would hold back a "Retry" clicked meanwhile (C8c). Called once the
 * opening's answer is computed and its journal written; never throws: a
 * sweep that fails, or one that cannot even be scheduled (after() refusing
 * it), is logged by kind, never shown, and the opening answers all the same.
 */
export function sweepAfterResponse(context: SweepContext): void {
  try {
    context.later(() =>
      context.sweep().catch((error: unknown) => {
        console.error(`[evaluation] sweep failed: ${errorKind(error)}`);
      }),
    );
  } catch (error) {
    console.error(`[evaluation] sweep not scheduled: ${errorKind(error)}`);
  }
}

/**
 * On the teacher's own assignment only: the journal entry "list opened"
 * (REV-04) and the list's stamp, compared with the rendered one; then the
 * sweep, after the response. What the sweep changes on this list, a copy
 * received or evaluating, is shown by RefreshWhileEvaluating, mounted for
 * such a copy (C8c). Another teacher's or a missing assignment: nothing done.
 */
export async function openReviewList(actor: Actor, raw: unknown, context: SweepContext): Promise<ListOpenResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { refresh: false };
  const { assignmentId, stamp } = parsed.data;
  let result: ListOpenResult;
  try {
    const opened = await recordListOpened(actor, assignmentId);
    if (!opened) return { refresh: false };
    result = { refresh: opened.stamp !== stamp };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { refresh: false };
  }
  sweepAfterResponse(context);
  return result;
}

/**
 * The submissions the list offers to relaunch. relaunchConditions (the
 * month's runs) and listRelaunchable are read only when a line may be
 * offered (mayOfferRelaunch, C8b): two round trips spared at each render
 * otherwise, the refreshes while a copy is evaluated included; a French
 * assignment, whose copies wait for a rubric, no longer reads them at all.
 */
export async function relaunchableCopies(
  actor: Actor,
  assignmentId: string,
  language: AssignmentLanguage,
  rows: readonly ReviewRow[],
): Promise<string[]> {
  if (!rows.some((row) => mayOfferRelaunch(row, language))) return [];
  return (await listRelaunchable(actor, assignmentId, await relaunchConditions())).map((c) => c.submissionId);
}
