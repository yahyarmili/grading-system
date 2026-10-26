import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AiProvider, EvaluationError, EvaluationOutcome } from "@/lib/evaluation";
import type { StoredSubmissionStatus } from "@/lib/submission-status";
import { db } from "@/server/db/client";
import { evaluationRuns, readingRuns, securityEvents, submissions, submissionVersions } from "@/server/db/schema";

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

// Spec 0012, AC-11 (ai:status): what the AI did on the database in use, for
// the internal command only (scripts/ai-status.ts). Identifiers, counts and
// costs; never a name, email, text, image, proposal or actor_user_id.

/** One evaluation or reading run of the window, without content. */
export type StatusRun = {
  kind: "evaluation" | "reading";
  createdAt: Date;
  submissionId: string | null;
  /** A reading before confirmation. */
  draftId: string | null;
  /** A reading; null once its page is deleted. */
  pageId: string | null;
  /** An evaluation. */
  versionNumber: number | null;
  provider: AiProvider;
  modelAnswered: string | null;
  outcome: string;
  attempts: number;
};

/** Over all time, for a submission seen in the window: its evaluation runs of one version, or its reading runs of one page. */
export type RunCount = { submissionId: string; versionNumber?: number; pageId?: string | null; runs: number };

/** The ai_request_sent lines of the window, by subject. */
export type RequestGroup = {
  subjectId: string | null;
  label: "submission" | "page" | "none" | "unknown";
  /** A page: the submission or the draft of its latest reading run. */
  readingSubmissionId: string | null;
  readingDraftId: string | null;
  requests: number;
};

export type AiStatus = {
  /** `since`, else now() minus 24 hours, on the database clock. */
  windowStart: Date;
  /** Sorted by createdAt, at most `limit`. */
  runs: StatusRun[];
  /** Runs of the window beyond `limit`, not listed. */
  runsLeftOut: number;
  evaluationsPerVersion: RunCount[];
  readingsPerPage: RunCount[];
  requests: RequestGroup[];
};

/** The runs and the request lines created since `since` (default now() minus 24 hours), read only. */
export async function readAiStatus(filter: { since?: Date; limit?: number } = {}): Promise<AiStatus> {
  const limit = filter.limit ?? 200;
  const since = filter.since ? filter.since.toISOString() : null;
  const [{ start }] = (
    await db.execute<{ start: string }>(sql`select coalesce(${since}::timestamptz, now() - interval '24 hours') as start`)
  ).rows;
  const windowStart = new Date(start);
  const from = windowStart.toISOString();

  const evaluations = await db
    .select({
      createdAt: evaluationRuns.createdAt,
      submissionId: evaluationRuns.submissionId,
      versionNumber: evaluationRuns.versionNumber,
      provider: evaluationRuns.provider,
      modelAnswered: evaluationRuns.modelAnswered,
      outcome: evaluationRuns.outcome,
      attempts: evaluationRuns.attempts,
      id: evaluationRuns.id,
    })
    .from(evaluationRuns)
    .where(sql`${evaluationRuns.createdAt} >= ${from}`);
  const readings = await db
    .select({
      createdAt: readingRuns.createdAt,
      submissionId: readingRuns.submissionId,
      draftId: readingRuns.draftId,
      pageId: readingRuns.pageId,
      provider: readingRuns.provider,
      modelAnswered: readingRuns.modelAnswered,
      outcome: readingRuns.outcome,
      attempts: readingRuns.attempts,
      id: readingRuns.id,
    })
    .from(readingRuns)
    .where(sql`${readingRuns.createdAt} >= ${from}`);

  const all = [
    ...evaluations.map((r) => ({ kind: "evaluation" as const, ...r, draftId: null, pageId: null })),
    ...readings.map((r) => ({ kind: "reading" as const, ...r, versionNumber: null })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const runs: StatusRun[] = all.slice(0, limit).map(({ kind, createdAt, submissionId, draftId, pageId, versionNumber, provider, modelAnswered, outcome, attempts }) => ({
    kind, createdAt, submissionId, draftId, pageId, versionNumber, provider, modelAnswered, outcome, attempts,
  }));

  const seen = [...new Set(all.map((r) => r.submissionId).filter((id): id is string => id !== null))];
  const evaluationsPerVersion = seen.length
    ? await db
        .select({ submissionId: evaluationRuns.submissionId, versionNumber: evaluationRuns.versionNumber, runs: sql<number>`count(*)::int` })
        .from(evaluationRuns)
        .where(inArray(evaluationRuns.submissionId, seen))
        .groupBy(evaluationRuns.submissionId, evaluationRuns.versionNumber)
        .orderBy(evaluationRuns.submissionId, evaluationRuns.versionNumber)
    : [];
  const readingsPerPage = seen.length
    ? (
        await db
          .select({ submissionId: readingRuns.submissionId, pageId: readingRuns.pageId, runs: sql<number>`count(*)::int` })
          .from(readingRuns)
          .where(inArray(readingRuns.submissionId, seen))
          .groupBy(readingRuns.submissionId, readingRuns.pageId)
          .orderBy(readingRuns.submissionId, readingRuns.pageId)
      ).map((row) => ({ ...row, submissionId: row.submissionId ?? "" }))
    : [];

  const requests = (
    await db.execute<{ subject_id: string | null; label: RequestGroup["label"]; submission_id: string | null; draft_id: string | null; requests: number }>(
      sql`select e.subject_id,
          case
            when e.subject_id is null then 'none'
            when exists (select 1 from ${evaluationRuns} where ${evaluationRuns.submissionId} = e.subject_id) then 'submission'
            when exists (select 1 from ${readingRuns} where ${readingRuns.pageId} = e.subject_id) then 'page'
            else 'unknown'
          end as label,
          reading.submission_id, reading.draft_id, count(*)::int as requests
        from ${securityEvents} e
        left join lateral (
          select ${readingRuns.submissionId} as submission_id, ${readingRuns.draftId} as draft_id from ${readingRuns}
          where ${readingRuns.pageId} = e.subject_id order by ${readingRuns.createdAt} desc limit 1
        ) reading on true
        where e.type = 'ai_request_sent' and e.created_at >= ${from}
        group by e.subject_id, reading.submission_id, reading.draft_id
        order by min(e.created_at), e.subject_id`,
    )
  ).rows.map((row) => ({
    subjectId: row.subject_id,
    label: row.label,
    readingSubmissionId: row.label === "page" ? row.submission_id : null,
    readingDraftId: row.label === "page" ? row.draft_id : null,
    requests: row.requests,
  }));

  return { windowStart, runs, runsLeftOut: all.length - runs.length, evaluationsPerVersion, readingsPerPage, requests };
}
