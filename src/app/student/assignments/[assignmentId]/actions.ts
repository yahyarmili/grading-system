"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/auth/session";
import { submitStudentText, type SubmitTextState } from "@/server/submissions/submissions";

// SUB-02: the student submits their own text; the data layer acts only on an
// assignment they received, whatever the form sends.

export async function submitTextAction(_previous: SubmitTextState, form: FormData): Promise<SubmitTextState> {
  const field = (name: string) => form.get(name) ?? undefined;
  const state = await submitStudentText(await getActor(), {
    assignmentId: field("assignmentId"),
    contentVersion: field("contentVersion"),
    requestId: field("requestId"),
    text: field("text"),
  });
  // The page shows the new state, or the task as changed by the teacher.
  if (state.status === "done" || (state.status === "error" && state.reason !== "notAllowed")) refresh();
  return state;
}
