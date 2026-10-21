import "server-only";
import { z } from "zod";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { acknowledgeNotice } from "@/server/data/notices/notices";

// NFR-DON-04, without Next request APIs so integration tests can call it.

export const NOTICE_MESSAGES = {
  notAllowed: "You are not allowed to do this.",
  outdated: "The notice has changed since you opened this page. Read the new version below.",
} as const;

export type AcknowledgeNoticeState =
  | { status: "idle" }
  | { status: "error"; reason: keyof typeof NOTICE_MESSAGES; message: string }
  | { status: "done" };

/** Records the reading of the version shown, of the actor's role's notice; an outdated page reads the new version first. */
export async function acknowledgeNoticeReading(actor: Actor, raw: { version?: unknown }): Promise<AcknowledgeNoticeState> {
  const version = z.coerce.number().int().safeParse(raw.version);
  try {
    if (version.success && (await acknowledgeNotice(actor, version.data))) return { status: "done" };
    return { status: "error", reason: "outdated", message: NOTICE_MESSAGES.outdated };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { status: "error", reason: "notAllowed", message: NOTICE_MESSAGES.notAllowed };
  }
}
