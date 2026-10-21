"use server";

import { after } from "next/server";
import type { EvaluationRef } from "@/lib/evaluation";
import { getActor } from "@/server/auth/session";
import { startEvaluation } from "@/server/evaluation/trigger";
import { sweepEvaluations } from "@/server/evaluation/sweep";
import { openReviewList, type ListOpenResult } from "@/server/review/list";
import { relaunchCopy, retryCopy, type RequestState } from "@/server/review/relaunch";

// REV-01: called by the list once shown (ReviewListOpened), never while
// rendering, so a prefetch neither logs nor sweeps (E7 plan §1.6).

export async function recordListOpenedAction(assignmentId: string, stamp: string): Promise<ListOpenResult> {
  return openReviewList(await getActor(), { assignmentId, stamp }, {
    sweep: () => sweepEvaluations(startEvaluation),
    later: (task) => after(task),
  });
}

/** The evaluation starts once the teacher has their answer (PRC-02, E7.6). */
const startAfterResponse = { onStart: (ref: EvaluationRef) => after(() => startEvaluation(ref)) };

/** PRC-02 R3: "Retry" on a failed copy, the version the teacher saw. Used by the list and the copy. */
export async function retryEvaluationAction(seen: { submissionId: string; versionNumber: number }): Promise<RequestState> {
  return retryCopy(await getActor(), seen, startAfterResponse);
}

/** PRC-02 R4: "Relaunch" on a copy listRelaunchable offers. Used by the list and the copy. */
export async function relaunchEvaluationAction(seen: { submissionId: string; versionNumber: number }): Promise<RequestState> {
  return relaunchCopy(await getActor(), seen, startAfterResponse);
}
