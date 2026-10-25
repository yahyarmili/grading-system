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
import {
  confirmStudentImages,
  deleteStudentPage,
  readStudentPage,
  reorderStudentPages,
  type ConfirmImagesState,
  type DraftEditState,
  type ReadPageState,
} from "@/server/submissions/images";
import { acknowledgeNoticeReading, type AcknowledgeNoticeState } from "@/server/notices/notices";
import { checkAssignmentFreshness } from "@/server/results/freshness";

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
  const state = await acknowledgeNoticeReading(await getActor(), { version: form.get("version") ?? undefined });
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

/** PUB-01 CA3, PUB-02 R2 (E8.7): the assignment shown again is checked first. A boolean only. */
export async function checkAssignmentFreshnessAction(assignmentId: string, token: string): Promise<boolean> {
  return checkAssignmentFreshness(await getActor(), { assignmentId, token });
}

/** SUB-03, TRX-01 (E9): one page of the student's draft read by the AI, for their check. */
export async function readPageAction(pageId: string): Promise<ReadPageState> {
  return readStudentPage(await getActor(), pageId);
}

/** SUB-03 CA3 (E9): the pages of the student's draft in the order they chose. */
export async function reorderPagesAction(draftId: string, pageIds: string[]): Promise<DraftEditState> {
  return reorderStudentPages(await getActor(), { draftId, pageIds });
}

/** SUB-03 (E9): a page out of the student's draft. */
export async function deletePageAction(pageId: string): Promise<DraftEditState> {
  return deleteStudentPage(await getActor(), pageId);
}

/**
 * SUB-03 CA1 (E9): the pages read and checked become the submission. The
 * changes are the student's word changes; the server rebuilds the text.
 * `mode` "unchecked" (AC-7): sent after a failed reading, without changes.
 */
export async function confirmImagesAction(input: {
  assignmentId: string;
  draftId: string;
  contentVersion: number;
  requestId: string;
  changes: { pageId: string; wordIndex: number; engineWord: string; studentWord: string }[];
  mode: "checked" | "unchecked";
}): Promise<ConfirmImagesState> {
  const state = await confirmStudentImages(await getActor(), input, evaluateLater);
  if (state.status === "done" || (state.status === "error" && state.reason !== "notAllowed")) refresh();
  return state;
}
