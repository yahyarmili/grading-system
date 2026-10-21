"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/auth/session";
import { acknowledgeNoticeReading, type AcknowledgeNoticeState } from "@/server/notices/notices";

/**
 * NFR-DON-04 (E7.7): the teacher read their notice; the page then shows the
 * copies it held back. The actor's role chooses the notice (teacher_review).
 */
export async function acknowledgeTeacherNoticeAction(
  _previous: AcknowledgeNoticeState,
  form: FormData,
): Promise<AcknowledgeNoticeState> {
  const state = await acknowledgeNoticeReading(await getActor(), { version: form.get("version") ?? undefined });
  if (state.status === "done" || (state.status === "error" && state.reason === "outdated")) refresh();
  return state;
}
