"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getActor } from "@/server/auth/session";
import { triggerEvaluation } from "@/server/evaluation/trigger";
import {
  replaceStudentText,
  submitStudentText,
  type ReplaceTextState,
  type SubmissionContext,
  type SubmitTextState,
} from "@/server/submissions/submissions";
import { acknowledgeStudentNotice, type AcknowledgeNoticeState } from "@/server/notices/notices";

// SUB-02: the student submits their own text; the data layer acts only on an
// assignment they received, whatever the form sends.

/** PRC-01 R2: the evaluation starts after the response, once the transaction committed. */
const evaluateLater: SubmissionContext = { onReceived: (ref) => after(() => triggerEvaluation(ref)) };

export async function submitTextAction(_previous: SubmitTextState, form: FormData): Promise<SubmitTextState> {
  const field = (name: string) => form.get(name) ?? undefined;
  const state = await submitStudentText(await getActor(), {
    assignmentId: field("assignmentId"),
    contentVersion: field("contentVersion"),
    requestId: field("requestId"),
    text: field("text"),
  }, evaluateLater);
  // The page shows the new state, or the task as changed by the teacher.
  if (state.status === "done" || (state.status === "error" && state.reason !== "notAllowed")) refresh();
  return state;
}

/** NFR-DON-04: the student read the notice; the page then shows the text box. */
export async function acknowledgeNoticeAction(
  _previous: AcknowledgeNoticeState,
  form: FormData,
): Promise<AcknowledgeNoticeState> {
  const state = await acknowledgeStudentNotice(await getActor(), { version: form.get("version") ?? undefined });
  if (state.status === "done" || (state.status === "error" && state.reason === "outdated")) refresh();
  return state;
}

/** SUB-05: the student replaces their submission with a new text. */
export async function replaceTextAction(_previous: ReplaceTextState, form: FormData): Promise<ReplaceTextState> {
  const state = await replaceStudentText(await getActor(), {
    assignmentId: form.get("assignmentId") ?? undefined,
    requestId: form.get("requestId") ?? undefined,
    text: form.get("text") ?? undefined,
  }, evaluateLater);
  // The page shows the new date and what is left, or why it is closed.
  if (state.status === "done" || (state.status === "error" && state.reason !== "notAllowed")) refresh();
  return state;
}
