import "server-only";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { createClass } from "@/server/data/classes/classes";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { createClassSchema } from "./schemas";

// CLS-01, without Next request APIs so integration tests can call it.

export const CLASS_MESSAGES = {
  nameTaken: "You already have a class with this name. Choose another name.",
  notAllowed: "You are not allowed to do this.",
} as const;

export type CreateClassState =
  | { status: "idle" }
  | { status: "invalid"; error: string; name: string }
  | { status: "error"; message: string }
  | { status: "done"; classId: string; name: string };

export async function createTeacherClass(actor: Actor, raw: { name: unknown }): Promise<CreateClassState> {
  const typed = typeof raw.name === "string" ? raw.name : "";
  const parsed = createClassSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "invalid", error: parsed.error.issues[0]?.message ?? "Enter a class name.", name: typed };
  }
  try {
    const result = await createClass(actor, parsed.data);
    if (!result.ok) return { status: "invalid", error: CLASS_MESSAGES.nameTaken, name: typed };
    return { status: "done", classId: result.classId, name: parsed.data.name };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    // A refused action is logged (NFR-DON-05), then answered without detail.
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { status: "error", message: CLASS_MESSAGES.notAllowed };
  }
}
