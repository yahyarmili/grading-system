import "server-only";
import { z } from "zod";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { disableClassInvite, renewClassInvite } from "@/server/data/classes/invites";
import { CLASS_MESSAGES } from "./classes";

// CLS-02, teacher side, without Next request APIs so integration tests can call it.

export type InviteActionResult = { ok: boolean; message: string };

const idSchema = z.uuid();

async function run(
  actor: Actor,
  rawId: unknown,
  action: (actor: Actor, classId: string) => Promise<boolean>,
  done: string,
): Promise<InviteActionResult> {
  const id = idSchema.safeParse(rawId);
  try {
    // Absent, another teacher's or malformed: one answer (AUTH-04 R3).
    if (!id.success || !(await action(actor, id.data))) return { ok: false, message: "This class was not found." };
    return { ok: true, message: done };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { ok: false, message: CLASS_MESSAGES.notAllowed };
  }
}

export const renewInvite = (actor: Actor, rawId: unknown) =>
  run(actor, rawId, renewClassInvite, "New link and code created. The previous ones no longer work; students already in the class stay.");

export const disableInvite = (actor: Actor, rawId: unknown) =>
  run(actor, rawId, disableClassInvite, "The link and code no longer work. Students already in the class stay.");
