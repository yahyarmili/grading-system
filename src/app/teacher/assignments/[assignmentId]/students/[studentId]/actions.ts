"use server";

import { after } from "next/server";
import { getActor } from "@/server/auth/session";
import type { CopySeen } from "@/server/data/review/copy";
import { sweepEvaluations } from "@/server/evaluation/sweep";
import { startEvaluation } from "@/server/evaluation/trigger";
import { openCopy, type CopyOpenResult } from "@/server/review/copy";
import { saveTeacherEvaluation, type SaveEvaluationState } from "@/server/review/evaluation";

// REV-02: recordCopyOpenedAction is called by the copy once shown (CopyOpened), never while rendering,
// so a prefetch neither logs nor sweeps (E7 plan §1.6).

/** [D, 2026-10-20]: opening a copy sweeps too, once the opening answered (after()): no other action waits for it. */
export async function recordCopyOpenedAction(seen: CopySeen): Promise<CopyOpenResult> {
  return openCopy(await getActor(), seen, { sweep: () => sweepEvaluations(startEvaluation), later: (task) => after(task) });
}

/**
 * REV-03: saves the whole form. Nothing is revalidated: the form keeps what
 * the server saved; a page shown again checks its revision (CopyOpened).
 */
export async function saveEvaluationAction(_previous: SaveEvaluationState, input: unknown): Promise<SaveEvaluationState> {
  return saveTeacherEvaluation(await getActor(), input);
}
