import "server-only";
import { z } from "zod";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import {
  relaunchEvaluation,
  retryEvaluation,
  type EvaluationStartContext,
  type RelaunchConditions,
  type SeenVersion,
} from "@/server/data/evaluation/teacher";
import { relaunchConditions } from "@/server/evaluation/relaunch";

// PRC-02 from the screen (E7.6), without Next request APIs so integration
// tests can call it: the teacher's retry of a failed copy and relaunch of a
// copy offered by listRelaunchable, on the version they saw. The functions of
// E6.3 lock the copy, store the request and log it; `ctx` starts the
// evaluation once the request answered (after() in the Server Action).

export type RequestState =
  | { status: "requested" }
  | { status: "replaced" | "not_failed" | "not_relaunchable" | "not_found"; message: string };

export const REQUEST_MESSAGES = {
  replaced: "This submission was replaced by the student. The page has been reloaded. Nothing was requested.",
  notFailed: "This copy is no longer in failure. The page has been reloaded. Nothing was requested.",
  notRelaunchable: "This copy can no longer be relaunched. The page has been reloaded. Nothing was requested.",
  notFound: "This copy was not found. It may have been deleted.",
} as const;

const seenSchema = z.object({ submissionId: z.uuid(), versionNumber: z.int().min(1) });

const notFound: RequestState = { status: "not_found", message: REQUEST_MESSAGES.notFound };

async function guarded(actor: Actor, raw: unknown, request: (seen: SeenVersion) => Promise<RequestState>): Promise<RequestState> {
  const parsed = seenSchema.safeParse(raw);
  if (!parsed.success) return notFound;
  try {
    return await request(parsed.data);
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return notFound;
  }
}

/** Transition 6 (PRC-02 R3): "Retry" on a failed copy, a refused one included. */
export function retryCopy(actor: Actor, raw: unknown, ctx: EvaluationStartContext): Promise<RequestState> {
  return guarded(actor, raw, async (seen) => {
    const result = await retryEvaluation(actor, seen, ctx);
    if (!result) return notFound;
    if (result.ok) return { status: "requested" };
    return result.reason === "changed"
      ? { status: "replaced", message: REQUEST_MESSAGES.replaced }
      : { status: "not_failed", message: REQUEST_MESSAGES.notFailed };
  });
}

/**
 * Transition 7 (PRC-02 R4): "Relaunch" on a copy offered by listRelaunchable,
 * checked again under the copy's lock with the conditions read now.
 */
export function relaunchCopy(
  actor: Actor,
  raw: unknown,
  ctx: EvaluationStartContext,
  conditions: () => Promise<RelaunchConditions> = relaunchConditions,
): Promise<RequestState> {
  return guarded(actor, raw, async (seen) => {
    const result = await relaunchEvaluation(actor, seen, await conditions(), ctx);
    if (!result) return notFound;
    if (result.ok) return { status: "requested" };
    return result.reason === "changed"
      ? { status: "replaced", message: REQUEST_MESSAGES.replaced }
      : { status: "not_relaunchable", message: REQUEST_MESSAGES.notRelaunchable };
  });
}
