"use server";

import { after } from "next/server";
import { getActor } from "@/server/auth/session";
import { startEvaluation } from "@/server/evaluation/trigger";
import { sweepEvaluations } from "@/server/evaluation/sweep";
import { openReviewList, type ListOpenResult } from "@/server/review/list";

// REV-01: called by the list once shown (ReviewListOpened), never while
// rendering, so a prefetch neither logs nor sweeps (E7 plan §1.6).

export async function recordListOpenedAction(assignmentId: string, stamp: string): Promise<ListOpenResult> {
  return openReviewList(await getActor(), { assignmentId, stamp }, {
    sweep: () => sweepEvaluations(startEvaluation),
    later: (task) => after(task),
  });
}
