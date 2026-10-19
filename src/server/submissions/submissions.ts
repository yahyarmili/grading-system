import "server-only";
import { z } from "zod";
import { checkSubmissionText, normalizeLineEndings, SUBMISSION_TEXT_ERRORS } from "@/lib/submission-text";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { SUBMISSION_MAX_REPLACEMENTS } from "@/config/decisions";
import type { EvaluationRef } from "@/lib/evaluation";
import { replaceText, submitText } from "@/server/data/submissions/submissions";

// SUB-02, without Next request APIs so integration tests can call it.

/**
 * PRC-01 R2: what to do with the version to evaluate, once its transaction
 * committed. The Server Action starts the evaluation after the response
 * (after()); the tests record it. Required: no caller forgets the trigger.
 */
export type SubmissionContext = { onReceived: (ref: EvaluationRef) => void };

export const SUBMISSION_MESSAGES = {
  notAllowed: "You are not allowed to do this.",
  unavailable: "You can't submit for this assignment. You may no longer be in the class it was sent to.",
  changed:
    "Your teacher changed this assignment while you were writing. Read it again, then submit. Your text is still here.",
  alreadySubmitted: "You have already submitted this assignment. Nothing new was saved.",
  noticeNotRead: "Read the notice about your data before your first submission. Your text was not submitted.",
} as const;

export type SubmitTextInput = { assignmentId?: unknown; contentVersion?: unknown; requestId?: unknown; text?: unknown };

export type SubmitTextState =
  | { status: "idle" }
  | { status: "invalid"; error: string }
  | {
      status: "error";
      reason: "changed" | "alreadySubmitted" | "noticeNotRead" | "unavailable" | "notAllowed";
      message: string;
    }
  | { status: "done"; submittedAt: string; late: boolean };

const fieldsSchema = z.object({
  assignmentId: z.uuid(),
  contentVersion: z.coerce.number().int().positive(),
  requestId: z.uuid(),
});

const refused = (reason: Exclude<SubmitTextState, { status: "idle" | "invalid" | "done" }>["reason"]) =>
  ({ status: "error", reason, message: SUBMISSION_MESSAGES[reason] }) as const;

/**
 * CA1: the text is stored as written (line endings aside) and the date comes
 * back. CA2: empty, white space only or too long: refused, nothing stored.
 * CA3: unconfirmed, removed or not a member: refused. NFR-DON-04: the notice
 * in force is read before the first submission. Submitted (or the same
 * request again): the version is handed to `ctx.onReceived`, never before
 * the commit; the student's answer does not wait for the evaluation.
 */
export async function submitStudentText(actor: Actor, raw: SubmitTextInput, ctx: SubmissionContext): Promise<SubmitTextState> {
  const text = normalizeLineEndings(typeof raw.text === "string" ? raw.text : "");
  const problem = checkSubmissionText(text);
  if (problem) return { status: "invalid", error: SUBMISSION_TEXT_ERRORS[problem] };
  const fields = fieldsSchema.safeParse(raw);
  if (!fields.success) return refused("unavailable");

  try {
    const result = await submitText(actor, { ...fields.data, text });
    if (!result) return refused("unavailable");
    if (!result.ok) {
      const reasons = { changed: "changed", already_submitted: "alreadySubmitted", notice_not_read: "noticeNotRead" } as const;
      return refused(reasons[result.reason]);
    }
    ctx.onReceived(result.ref);
    return { status: "done", submittedAt: result.submittedAt, late: result.late };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return refused("notAllowed");
  }
}

// SUB-05: replacing the submission.

export const REPLACEMENT_MESSAGES = {
  notAllowed: SUBMISSION_MESSAGES.notAllowed,
  unavailable: "You can't replace this submission. You may no longer be in the class it was sent to.",
  teacherStarted:
    "Your teacher has started marking your submission: it can no longer be replaced. Your new text was not saved.",
  limitReached: `You have already replaced this submission ${SUBMISSION_MAX_REPLACEMENTS} times, the most allowed. Your new text was not saved.`,
} as const;

export type ReplaceTextState =
  | { status: "idle" }
  | { status: "invalid"; error: string }
  | { status: "error"; reason: keyof typeof REPLACEMENT_MESSAGES; message: string }
  | { status: "done"; replacedAt: string; replacementsLeft: number };

const replaceFields = z.object({ assignmentId: z.uuid(), requestId: z.uuid() });

const notReplaced = (reason: keyof typeof REPLACEMENT_MESSAGES) =>
  ({ status: "error", reason, message: REPLACEMENT_MESSAGES[reason] }) as const;

/**
 * CA1: a new active version, the previous one kept and dated; the third
 * replacement refused. CA3: refused once the teacher changed or validated.
 * The text is checked as for a first submission (SUB-02). Replaced: the new
 * version is handed to `ctx.onReceived` (SUB-05 R2: evaluated again).
 */
export async function replaceStudentText(
  actor: Actor,
  raw: Omit<SubmitTextInput, "contentVersion">,
  ctx: SubmissionContext,
): Promise<ReplaceTextState> {
  const text = normalizeLineEndings(typeof raw.text === "string" ? raw.text : "");
  const problem = checkSubmissionText(text);
  if (problem) return { status: "invalid", error: SUBMISSION_TEXT_ERRORS[problem] };
  const fields = replaceFields.safeParse(raw);
  if (!fields.success) return notReplaced("unavailable");

  try {
    const result = await replaceText(actor, { ...fields.data, text });
    if (!result) return notReplaced("unavailable");
    if (!result.ok) return notReplaced(result.reason === "teacher_started" ? "teacherStarted" : "limitReached");
    ctx.onReceived(result.ref);
    return { status: "done", replacedAt: result.replacedAt, replacementsLeft: result.replacementsLeft };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return notReplaced("notAllowed");
  }
}
