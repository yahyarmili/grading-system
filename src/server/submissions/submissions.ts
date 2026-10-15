import "server-only";
import { z } from "zod";
import { checkSubmissionText, normalizeLineEndings, SUBMISSION_TEXT_ERRORS } from "@/lib/submission-text";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { submitText } from "@/server/data/submissions/submissions";

// SUB-02, without Next request APIs so integration tests can call it.

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
 * in force is read before the first submission.
 */
export async function submitStudentText(actor: Actor, raw: SubmitTextInput): Promise<SubmitTextState> {
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
    return { status: "done", submittedAt: result.submittedAt, late: result.late };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return refused("notAllowed");
  }
}
