import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { AiProvider, EvaluationError, EvaluationOutcome } from "@/lib/evaluation";
import type { StoredSubmissionStatus } from "@/lib/submission-status";
import { db } from "@/server/db/client";
import { evaluationRuns, submissions, submissionVersions } from "@/server/db/schema";

// EXP-01 (E6.4): what the evaluation report reads, for the internal command
// only (scripts/evaluation-report.ts). No name, email, text or proposal: the
// assignment and submission identifiers group the rows and are never printed.

/** One run, without content: how it went and how long it took. */
export type RunMeasure = {
  assignmentId: string;
  /** Groups the runs of one copy; not printed. */
  submissionId: string;
  outcome: EvaluationOutcome;
  provider: AiProvider;
  attempts: number;
  attemptErrors: EvaluationError[];
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  /** From the version evaluated to the run's record, on the database clock. */
  sinceVersionMs: number;
  createdAt: Date;
};

/** One copy: its state now. */
export type CopyMeasure = { assignmentId: string; submissionId: string; status: StoredSubmissionStatus };

/**
 * The runs and the copies of one assignment, or of every assignment; `since`
 * keeps the runs recorded from that instant (a test batch). Read on the
 * database clock.
 */
export async function readEvaluationMeasures(filter: { assignmentId?: string; since?: Date } = {}): Promise<{
  runs: RunMeasure[];
  copies: CopyMeasure[];
}> {
  const ofAssignment = filter.assignmentId ? eq(submissions.assignmentId, filter.assignmentId) : undefined;
  const runs = await db
    .select({
      assignmentId: submissions.assignmentId,
      submissionId: evaluationRuns.submissionId,
      outcome: evaluationRuns.outcome,
      provider: evaluationRuns.provider,
      attempts: evaluationRuns.attempts,
      attemptErrors: evaluationRuns.attemptErrors,
      durationMs: evaluationRuns.durationMs,
      promptTokens: evaluationRuns.promptTokens,
      completionTokens: evaluationRuns.completionTokens,
      sinceVersionMs: sql<number>`(extract(epoch from ${evaluationRuns.createdAt} - ${submissionVersions.createdAt}) * 1000)::int`,
      createdAt: evaluationRuns.createdAt,
    })
    .from(evaluationRuns)
    .innerJoin(submissions, eq(submissions.id, evaluationRuns.submissionId))
    .innerJoin(
      submissionVersions,
      and(eq(submissionVersions.submissionId, evaluationRuns.submissionId), eq(submissionVersions.number, evaluationRuns.versionNumber)),
    )
    .where(and(ofAssignment, filter.since ? sql`${evaluationRuns.createdAt} >= ${filter.since.toISOString()}` : undefined))
    .orderBy(evaluationRuns.createdAt, evaluationRuns.id);
  const copies = await db
    .select({ assignmentId: submissions.assignmentId, submissionId: submissions.id, status: submissions.status })
    .from(submissions)
    .where(ofAssignment)
    .orderBy(submissions.assignmentId, submissions.id);
  return { runs, copies };
}
