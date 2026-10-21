"use server";

import { getActor } from "@/server/auth/session";
import type { CopySeen } from "@/server/data/review/copy";
import { openCopy, type CopyOpenResult } from "@/server/review/copy";
import { saveTeacherEvaluation, type SaveEvaluationState } from "@/server/review/evaluation";

// REV-02: recordCopyOpenedAction is called by the copy once shown (CopyOpened), never while rendering,
// so a prefetch logs nothing (E7 plan §1.6).

export async function recordCopyOpenedAction(seen: CopySeen): Promise<CopyOpenResult> {
  return openCopy(await getActor(), seen);
}

/**
 * REV-03: saves the whole form. Nothing is revalidated: the form keeps what
 * the server saved; a page shown again checks its revision (CopyOpened).
 */
export async function saveEvaluationAction(_previous: SaveEvaluationState, input: unknown): Promise<SaveEvaluationState> {
  return saveTeacherEvaluation(await getActor(), input);
}
