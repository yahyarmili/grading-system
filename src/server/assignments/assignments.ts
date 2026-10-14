import "server-only";
import { z } from "zod";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import {
  createAssignment,
  deleteAssignment,
  getTeacherAssignment,
  updateAssignment,
  type AssignmentChanges,
} from "@/server/data/assignments/assignments";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { ASSIGNMENT_LOCKED_NOTICE, ASSIGNMENT_NOT_DELETED_NOTICE } from "@/lib/texts";
import {
  ASSIGNMENT_ERRORS,
  assignmentLabelsSchema,
  assignmentTaskSchema,
  createAssignmentSchema,
  isFutureDeadline,
} from "./schemas";

// ASG-01 and ASG-03, without Next request APIs so integration tests can call it.

export const ASSIGNMENT_MESSAGES = {
  notAllowed: "You are not allowed to do this.",
  notFound: "This assignment was not found. It may have been deleted.",
  locked: `${ASSIGNMENT_LOCKED_NOTICE} Nothing was saved.`,
  notDeleted: `${ASSIGNMENT_NOT_DELETED_NOTICE} Nothing was deleted.`,
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

/** A refused action is logged (NFR-DON-05), then answered without detail. */
const logDenied = (actor: Actor) =>
  recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });

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
    await logDenied(actor);
    return { status: "error", message: ASSIGNMENT_MESSAGES.notAllowed, values };
  }
}

/** Zod's errors, first message per field. */
const firstErrors = (errors: z.ZodError<Record<string, unknown>>[]) =>
  Object.fromEntries(
    errors.flatMap((error) =>
      Object.entries(z.flattenError(error).fieldErrors).map(([field, messages]) => [field, messages?.[0]]),
    ),
  ) as Partial<Record<AssignmentField, string>>;

export type EditAssignmentState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Partial<Record<AssignmentField, string>>; values: AssignmentValues }
  | { status: "error"; message: string; values: AssignmentValues }
  | { status: "done"; values: AssignmentValues };

const TASK_FIELDS = ["subject", "language", "deadline", "instructions"] as const;

/**
 * ASG-03 R1, R2: an edit. A form without the task fields (the assignment is
 * locked) changes the title and the level only; the data layer refuses a
 * change of the task once a submission exists, whatever the form sends.
 */
export async function editTeacherAssignment(
  actor: Actor,
  rawId: unknown,
  raw: Omit<AssignmentInput, "classIds">,
): Promise<EditAssignmentState> {
  const values = typedValues(raw);
  const id = z.uuid().safeParse(rawId);
  const hasTask = TASK_FIELDS.some((field) => raw[field] !== undefined);
  const labels = assignmentLabelsSchema.safeParse(raw);
  const task = hasTask ? assignmentTaskSchema.safeParse(raw) : undefined;
  try {
    const current = id.success ? await getTeacherAssignment(actor, id.data) : null;
    if (!id.success || !current) return { status: "error", message: ASSIGNMENT_MESSAGES.notFound, values };

    const failed = [labels, task].flatMap((result) => (result && !result.success ? [result.error] : []));
    const fieldErrors = firstErrors(failed);
    // [P] A changed deadline is in the future; one kept as it was may already be past.
    if (task?.success && task.data.deadline.toISOString() !== current.deadline && !isFutureDeadline(task.data.deadline)) {
      fieldErrors.deadline = ASSIGNMENT_ERRORS.deadlinePast;
    }
    if (!labels.success || Object.keys(fieldErrors).length > 0) return { status: "invalid", fieldErrors, values };

    const changes: AssignmentChanges = { ...labels.data, task: task?.success ? task.data : undefined };
    const result = await updateAssignment(actor, id.data, changes);
    if (!result) return { status: "error", message: ASSIGNMENT_MESSAGES.notFound, values };
    if (!result.ok) return { status: "error", message: ASSIGNMENT_MESSAGES.locked, values };
    return { status: "done", values };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await logDenied(actor);
    return { status: "error", message: ASSIGNMENT_MESSAGES.notAllowed, values };
  }
}

export type DeleteAssignmentResult = { ok: true } | { ok: false; message: string };

/** ASG-03 R2: deleted only while no submission exists. */
export async function deleteTeacherAssignment(actor: Actor, rawId: unknown): Promise<DeleteAssignmentResult> {
  const id = z.uuid().safeParse(rawId);
  try {
    const result = id.success ? await deleteAssignment(actor, id.data) : null;
    // Absent, another teacher's or malformed: one answer (AUTH-04 R3).
    if (!result) return { ok: false, message: ASSIGNMENT_MESSAGES.notFound };
    return result.ok ? { ok: true } : { ok: false, message: ASSIGNMENT_MESSAGES.notDeleted };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await logDenied(actor);
    return { ok: false, message: ASSIGNMENT_MESSAGES.notAllowed };
  }
}
