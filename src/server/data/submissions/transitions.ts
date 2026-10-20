import "server-only";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import {
  canTransition,
  InvalidTransitionError,
  sourcesOf,
  type StoredSubmissionStatus,
  type TransitionId,
} from "@/lib/submission-status";
import type { db } from "@/server/db/client";
import { submissions } from "@/server/db/schema";

// The only writer of a submission's status (§5.5): transition 1 inserts the
// row, every other one goes through applyTransition. A move outside the table
// is refused; tests/submission-writes.test.ts checks no other file writes the table.
// Both run inside a transaction that has already checked the actor, or inside
// the system processing of the evaluation (transitions 2 and 5,
// src/server/data/evaluation/system.ts).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Fields a transition may change besides the status; identity, first date and lateness never change. */
type TransitionSet = Omit<
  PgUpdateSetSource<typeof submissions>,
  "id" | "status" | "assignmentId" | "teacherId" | "studentId" | "submittedAt" | "late" | "createdAt"
>;

export type NewSubmission = {
  assignmentId: string;
  teacherId: string;
  studentId: string;
  /** Computed in SQL by the caller, from the database clock (SUB-04 R2). */
  late: boolean;
  contentVersion: number;
};

/**
 * Transition 1, to submit → received: inserts the one submission of the pair.
 * Null when the pair already has one (the unique constraint decides under concurrency).
 */
export async function insertReceived(tx: Tx, values: NewSubmission) {
  const [created] = await tx
    .insert(submissions)
    .values({ ...values, status: "received" })
    .onConflictDoNothing({ target: [submissions.assignmentId, submissions.studentId] })
    .returning({ id: submissions.id, submittedAt: submissions.submittedAt, late: submissions.late });
  return created ?? null;
}

/**
 * Applies transition `id` to reach `to`, in one statement guarded by the
 * table's source states and the caller's own guards (`where`). Returns the
 * updated row, or null when the submission is absent or the move is refused
 * (wrong state, guard not met): the row lock makes the first writer win.
 * Leaving not_assessable empties its cause; reaching it needs one in `set`
 * (check constraint). Likewise the claim token (E6): leaving evaluating
 * empties it; reaching evaluating needs one in `set`.
 */
export async function applyTransition(
  tx: Tx,
  submissionId: string,
  id: TransitionId,
  to: StoredSubmissionStatus,
  guard: { where?: SQL; set?: TransitionSet } = {},
) {
  const from = sourcesOf(id, to);
  if (id === 1 || from.length === 0 || !from.every((f) => canTransition(id, f, to))) {
    throw new InvalidTransitionError(id, to);
  }
  const [updated] = await tx
    .update(submissions)
    .set({
      ...guard.set,
      ...(to === "not_assessable" ? {} : { notAssessableCause: null }),
      ...(to === "evaluating" ? {} : { claimToken: null }),
      status: to,
    })
    .where(and(eq(submissions.id, submissionId), inArray(submissions.status, from), guard.where))
    .returning({ id: submissions.id, status: submissions.status, currentVersion: submissions.currentVersion });
  return updated ?? null;
}
