import "server-only";
import { z } from "zod";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { readmitStudent, removeStudent } from "@/server/data/classes/roster";
import { CLASS_MESSAGES } from "./classes";
import type { InviteActionResult } from "./invites";

// CLS-04, teacher side, without Next request APIs so integration tests can call it.

export type RosterActionResult = InviteActionResult;

const idSchema = z.uuid();

async function run(
  actor: Actor,
  rawClassId: unknown,
  rawStudentId: unknown,
  action: (actor: Actor, classId: string, studentId: string) => Promise<boolean>,
  done: string,
): Promise<RosterActionResult> {
  const classId = idSchema.safeParse(rawClassId);
  const studentId = idSchema.safeParse(rawStudentId);
  try {
    // Absent, another teacher's or malformed: one answer (AUTH-04 R3).
    if (!classId.success || !studentId.success || !(await action(actor, classId.data, studentId.data))) {
      return { ok: false, message: "This student was not found in this class." };
    }
    return { ok: true, message: done };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { ok: false, message: CLASS_MESSAGES.notAllowed };
  }
}

export const removeClassStudent = (actor: Actor, rawClassId: unknown, rawStudentId: unknown) =>
  run(actor, rawClassId, rawStudentId, removeStudent, "Student removed. They can't join again with the link or code; you can readmit them from Removed students.");

export const readmitClassStudent = (actor: Actor, rawClassId: unknown, rawStudentId: unknown) =>
  run(actor, rawClassId, rawStudentId, readmitStudent, "Student readmitted. They are a member of the class again.");
