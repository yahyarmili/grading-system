"use server";

import { after } from "next/server";
import { getActor } from "@/server/auth/session";
import type { CopySeen } from "@/server/data/review/copy";
import { sweepEvaluations } from "@/server/evaluation/sweep";
import { startEvaluation } from "@/server/evaluation/trigger";
import { openCopy, type CopyOpenResult } from "@/server/review/copy";
import { saveTeacherEvaluation, type SaveEvaluationState } from "@/server/review/evaluation";
import {
  publishTeacherEvaluation,
  validateTeacherEvaluation,
  withdrawTeacherPublication,
  type DecisionState,
  type PublicationState,
} from "@/server/review/publication";

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
export async function saveEvaluationAction(_previous: unknown, input: unknown): Promise<SaveEvaluationState> {
  return saveTeacherEvaluation(await getActor(), input);
}

/** REV-05 (E8.1): validates the copy with the whole form on screen; the student still sees nothing (R1). */
export async function validateEvaluationAction(_previous: unknown, input: unknown): Promise<DecisionState> {
  return validateTeacherEvaluation(await getActor(), input);
}

/** D6: "Validate and publish", two acts logged apart; when the second fails, the copy stays Validated (PUB-01 R3). */
export async function validateAndPublishAction(_previous: unknown, input: unknown): Promise<DecisionState> {
  return validateTeacherEvaluation(await getActor(), input, { publish: true });
}

/** PUB-01: publishes a Validated copy; refused for any other, a direct request included (CA1). */
export async function publishEvaluationAction(input: unknown): Promise<PublicationState> {
  return publishTeacherEvaluation(await getActor(), input);
}

/** PUB-01 R2: withdraws the publication; the copy is Validated again. */
export async function withdrawPublicationAction(input: unknown): Promise<PublicationState> {
  return withdrawTeacherPublication(await getActor(), input);
}
