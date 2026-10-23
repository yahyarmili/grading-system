import "server-only";
import { and, eq } from "drizzle-orm";
import { validationNature, type EvaluationChanges, type ValidationNature } from "@/lib/review";
import type { SubmissionStatus } from "@/lib/submission-status";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { submissions, teacherEvaluations } from "@/server/db/schema";
import { applyTransition } from "../submissions/transitions";
import {
  editLocked,
  lockCopy,
  lockedRefusal,
  type LockedCopy,
  type SavedEvaluation,
  type SeenEvaluation,
} from "./copy";
import { appendJournal } from "./record";

// REV-05, PUB-01 (E8.1): the teacher validates, publishes and withdraws their
// own copy, one act per call, each its own transaction and log entry with
// its author and date (D6: validating and publishing are two acts). Every
// change of state goes through applyTransition (8, 9, 10), under the row lock
// a replacement and a save take too: one act at a time on a copy (NFR-FIA-01).
// The database refuses a Validated or Published copy without a complete
// evaluation, and any change of the evaluation outside To review (0019).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The revision of the evaluation of the copy's active version, read under the lock by a statement of its own; 0 when none. */
async function storedRevision(tx: Tx, row: LockedCopy, submissionId: string): Promise<number> {
  const [found] = await tx
    .select({ revision: teacherEvaluations.revision })
    .from(teacherEvaluations)
    .where(and(eq(teacherEvaluations.submissionId, submissionId), eq(teacherEvaluations.versionNumber, row.versionNumber)));
  return found?.revision ?? 0;
}

export type ValidateResult =
  /** already: the copy was Validated or Published with this very evaluation: nothing written (a repeated click). */
  | { ok: true; already: false; nature: ValidationNature; evaluation: SavedEvaluation }
  | { ok: true; already: true; status: Extract<SubmissionStatus, "validated" | "published">; evaluation: SavedEvaluation }
  | { ok: false; reason: "replaced" | "not_open" | "incomplete" | "notice_required" }
  | { ok: false; reason: "conflict"; saved: SavedEvaluation };

/**
 * REV-05: validates the teacher's own copy with the whole form on screen,
 * in one transaction: what the form changed is saved first (editLocked:
 * logged field by field; a Validated or Published copy changed goes back To
 * review, Q8), then transition 8, logged "validated" with its nature,
 * established by content (E8 plan §1: the result against the proposal it
 * started from). A copy validated without any change gets its evaluation
 * created from the proposal (teacher_started_at set: SUB-05 CA3). Nothing
 * becomes visible to the student (R1). A copy failed or not assessable is
 * validated only with the five levels and a grade entered by hand (REV-06,
 * "incomplete" otherwise: nothing written), its nature "manual"; one not
 * evaluated yet is refused ("not_open"), whatever the screen allowed.
 */
export async function validateEvaluation(
  actor: Actor,
  seen: SeenEvaluation,
  changes: EvaluationChanges,
): Promise<ValidateResult | null> {
  const grant = authorize(actor, "unpublishedEvaluation", "write");
  return db.transaction(async (tx) => {
    const row = await lockCopy(tx, grant, seen.submissionId);
    if (!row) return null;
    const refused = lockedRefusal(row, seen);
    if (refused) return refused;
    const edit = await editLocked(tx, actor, grant, row, seen, changes, { create: true, complete: true });
    if (!edit.ok) return edit;
    // Validated or Published already, and the form changed nothing: the same act again (a double click).
    // A copy failed or not assessable, entered by hand, is To review now (REV-06): validated next.
    if (edit.status === "validated" || edit.status === "published") {
      return { ok: true, already: true, status: edit.status, evaluation: edit.evaluation };
    }

    const moved = await applyTransition(tx, seen.submissionId, 8, "validated", {
      where: eq(submissions.currentVersion, row.versionNumber),
    });
    if (!moved) throw new Error("validateEvaluation: the copy left To review under the row lock");
    const { revision, ...fields } = edit.evaluation;
    const nature = validationNature(edit.proposal, fields);
    await appendJournal(tx, [
      {
        assignmentId: row.assignmentId,
        submissionId: seen.submissionId,
        actorId: grant.userId,
        event: "validated",
        newValue: { nature, revision, finalGrade: fields.finalGrade },
        versionNumber: row.versionNumber,
      },
    ]);
    return { ok: true, already: false, nature, evaluation: edit.evaluation };
  });
}

/** What a publication or a withdrawal guards: the copy and the evaluation the page showed. */
export type SeenDecision = Pick<SeenEvaluation, "submissionId" | "versionNumber" | "proposalId" | "revision">;

export type PublishResult =
  /** already: published with this very evaluation: nothing written (PUB-01 R2: one publication). */
  | { ok: true; already: boolean }
  /** Not Validated (PUB-01 R1, CA1): To review, failed, withdrawn to To review by a change… */
  | { ok: false; reason: "replaced" | "not_validated" | "changed" | "notice_required" };

/**
 * PUB-01: publishes the teacher's own Validated copy (transition 9), logged
 * "published". Only from Validated, never automatically (R1); refused
 * whatever the screen allowed, a direct request included (CA1). The
 * evaluation must be the one the page showed (`revision`): a change made
 * since in another tab sent the copy back To review, or validated another
 * revision ("changed"). Repeated, it publishes nothing more (R2).
 */
export async function publishEvaluation(actor: Actor, seen: SeenDecision): Promise<PublishResult | null> {
  const grant = authorize(actor, "unpublishedEvaluation", "write");
  return db.transaction(async (tx) => {
    const row = await lockCopy(tx, grant, seen.submissionId);
    if (!row) return null;
    const refused = lockedRefusal(row, seen);
    if (refused) return refused;
    if (row.status !== "validated" && row.status !== "published") return { ok: false, reason: "not_validated" };
    if ((await storedRevision(tx, row, seen.submissionId)) !== seen.revision) return { ok: false, reason: "changed" };
    if (row.status === "published") return { ok: true, already: true };

    const moved = await applyTransition(tx, seen.submissionId, 9, "published", {
      where: eq(submissions.currentVersion, row.versionNumber),
    });
    if (!moved) throw new Error("publishEvaluation: the copy left Validated under the row lock");
    await appendJournal(tx, [
      {
        assignmentId: row.assignmentId,
        submissionId: seen.submissionId,
        actorId: grant.userId,
        event: "published",
        newValue: { revision: seen.revision },
        versionNumber: row.versionNumber,
      },
    ]);
    return { ok: true, already: false };
  });
}

export type WithdrawResult =
  | { ok: true; already: boolean }
  | { ok: false; reason: "replaced" | "not_published" | "changed" | "notice_required" };

/**
 * PUB-01 R2: withdraws the publication of the teacher's own copy
 * (transition 10, Published → Validated), logged "unpublished": the student
 * no longer sees the result at their next access (CA3, E8.3). Repeated, it
 * does nothing more.
 */
export async function withdrawPublication(actor: Actor, seen: SeenDecision): Promise<WithdrawResult | null> {
  const grant = authorize(actor, "publishedEvaluation", "write");
  return db.transaction(async (tx) => {
    const row = await lockCopy(tx, grant, seen.submissionId);
    if (!row) return null;
    const refused = lockedRefusal(row, seen);
    if (refused) return refused;
    if (row.status !== "validated" && row.status !== "published") return { ok: false, reason: "not_published" };
    if ((await storedRevision(tx, row, seen.submissionId)) !== seen.revision) return { ok: false, reason: "changed" };
    if (row.status === "validated") return { ok: true, already: true };

    const moved = await applyTransition(tx, seen.submissionId, 10, "validated", {
      where: eq(submissions.currentVersion, row.versionNumber),
    });
    if (!moved) throw new Error("withdrawPublication: the copy left Published under the row lock");
    await appendJournal(tx, [
      {
        assignmentId: row.assignmentId,
        submissionId: seen.submissionId,
        actorId: grant.userId,
        event: "unpublished",
        newValue: { revision: seen.revision },
        versionNumber: row.versionNumber,
      },
    ]);
    return { ok: true, already: false };
  });
}
