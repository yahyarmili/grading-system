import "server-only";
import { z } from "zod";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { createAssignment } from "@/server/data/assignments/assignments";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { ASSIGNMENT_ERRORS, createAssignmentSchema } from "./schemas";

// ASG-01, without Next request APIs so integration tests can call it.

export const ASSIGNMENT_MESSAGES = {
  notAllowed: "You are not allowed to do this.",
} as const;

export type AssignmentField = "title" | "subject" | "level" | "language" | "deadline" | "instructions" | "classIds";

/** What the teacher typed, given back after a refusal. */
export type AssignmentValues = {
  title: string;
  subject: string;
  level: string;
  language: string;
  deadline: string;
  instructions: string;
  classIds: string[];
};

export type CreateAssignmentState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Partial<Record<AssignmentField, string>>; values: AssignmentValues }
  | { status: "error"; message: string; values: AssignmentValues }
  | { status: "done"; assignmentId: string; title: string; deadline: string; classIds: string[] };

export type AssignmentInput = Partial<Record<Exclude<AssignmentField, "classIds">, unknown>> & { classIds?: unknown };

function typedValues(raw: AssignmentInput): AssignmentValues {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    title: text(raw.title),
    subject: text(raw.subject),
    level: text(raw.level),
    language: text(raw.language),
    deadline: text(raw.deadline),
    instructions: text(raw.instructions),
    classIds: Array.isArray(raw.classIds) ? raw.classIds.filter((id): id is string => typeof id === "string") : [],
  };
}

/** CA2: one message per field, and nothing created when any field is refused. */
export async function createTeacherAssignment(actor: Actor, raw: AssignmentInput): Promise<CreateAssignmentState> {
  const values = typedValues(raw);
  const parsed = createAssignmentSchema.safeParse(raw);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      status: "invalid",
      fieldErrors: Object.fromEntries(Object.entries(fieldErrors).map(([field, messages]) => [field, messages?.[0]])),
      values,
    };
  }
  try {
    const result = await createAssignment(actor, parsed.data);
    if (!result.ok) return { status: "invalid", fieldErrors: { classIds: ASSIGNMENT_ERRORS.classNotFound }, values };
    return {
      status: "done",
      assignmentId: result.assignmentId,
      title: parsed.data.title,
      deadline: parsed.data.deadline.toISOString(),
      classIds: parsed.data.classIds,
    };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    // A refused action is logged (NFR-DON-05), then answered without detail.
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { status: "error", message: ASSIGNMENT_MESSAGES.notAllowed, values };
  }
}
