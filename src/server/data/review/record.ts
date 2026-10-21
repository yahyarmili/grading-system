import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { diffEvaluation, type EvaluationFields, type FieldChange } from "@/lib/review";
import type { ReviewEvent, TeacherEvaluationOrigin } from "@/lib/review-lists";
import type { db } from "@/server/db/client";
import { reviewJournalEntries, submissions, teacherEvaluations } from "@/server/db/schema";
import { markTeacherStarted } from "../submissions/transitions";

// The one writer of the teacher's evaluation and of the review log (E7,
// REV-03, REV-04; tests/review-writes.test.ts): an evaluation is written only
// with the log entries of its changes, in the caller's transaction, which has
// authorized the actor and locked the submission row. The database checks it
// again at commit (0017: no revision without its entry), keeps the log
// unchanged and never lets an evaluation be deleted.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One entry of the review log; the database dates it. */
export type JournalEntry = {
  assignmentId: string;
  /** Null only for list_opened. */
  submissionId: string | null;
  /** Null for the system. */
  actorId: string | null;
  event: ReviewEvent;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  evaluationRevision?: number;
  versionNumber?: number;
};

/** Adds entries to the review log, never changes one (REV-04 R3). */
export async function appendJournal(tx: Tx, entries: readonly JournalEntry[]): Promise<void> {
  if (entries.length === 0) throw new Error("appendJournal: no entry to add");
  await tx.insert(reviewJournalEntries).values(
    entries.map((entry) => ({
      assignmentId: entry.assignmentId,
      submissionId: entry.submissionId,
      actorId: entry.actorId,
      event: entry.event,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      evaluationRevision: entry.evaluationRevision ?? null,
      versionNumber: entry.versionNumber ?? null,
    })),
  );
}

/** Where a new evaluation starts: the proposal in force (REV-03 R1), or nothing (manual, E8). */
export type EvaluationStart =
  | { origin: Extract<TeacherEvaluationOrigin, "proposal">; proposalId: string; rubricVersion: string }
  | { origin: Extract<TeacherEvaluationOrigin, "manual">; rubricVersion: string };

export type EvaluationWrite = {
  assignmentId: string;
  submissionId: string;
  /** The active version, checked by the caller under the row lock. */
  versionNumber: number;
  actorId: string;
  /** The revision the write starts from, as the caller read it under the lock: 0 when none exists yet. */
  fromRevision: number;
  /** Needed when fromRevision is 0. */
  start?: EvaluationStart;
  before: EvaluationFields;
  after: EvaluationFields;
};

/** The write lost its revision although the caller held the row lock: a bug, never a user's doing. */
class EvaluationWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationWriteError";
  }
}

const columns = (fields: EvaluationFields) => ({
  levelTask: fields.levels.task,
  levelOrganization: fields.levels.organization,
  levelVocabulary: fields.levels.vocabulary,
  levelGrammar: fields.levels.grammar,
  levelMechanics: fields.levels.mechanics,
  remarkTask: fields.remarks.task,
  remarkOrganization: fields.remarks.organization,
  remarkVocabulary: fields.remarks.vocabulary,
  remarkGrammar: fields.remarks.grammar,
  remarkMechanics: fields.remarks.mechanics,
  rereadTask: fields.reread.task,
  rereadOrganization: fields.reread.organization,
  rereadVocabulary: fields.reread.vocabulary,
  rereadGrammar: fields.reread.grammar,
  rereadMechanics: fields.reread.mechanics,
  generalComment: fields.generalComment,
  nextSteps: fields.nextSteps,
  finalGrade: fields.finalGrade,
  gradeFixed: fields.gradeFixed,
});

/**
 * Writes one revision of the teacher's evaluation and, in the same
 * transaction, one log entry per changed field (old and new value, author,
 * revision; REV-04 CA1), plus evaluation_created for the first. Nothing when
 * nothing changed: null. The first write is the teacher's first act: it sets
 * teacher_started_at on the active version, which closes replacement
 * (SUB-05 R3). The AI proposal is never touched (invariant 5).
 */
export async function writeEvaluation(
  tx: Tx,
  write: EvaluationWrite,
): Promise<{ revision: number; changes: FieldChange[] } | null> {
  const changes = diffEvaluation(write.before, write.after);
  if (changes.length === 0) return null;
  const revision = write.fromRevision + 1;
  const entry = { assignmentId: write.assignmentId, submissionId: write.submissionId, actorId: write.actorId, versionNumber: write.versionNumber, evaluationRevision: revision };

  if (write.fromRevision === 0) {
    if (!write.start) throw new EvaluationWriteError("writeEvaluation: a new evaluation needs its start");
    const started = await markTeacherStarted(tx, write.submissionId, eq(submissions.currentVersion, write.versionNumber));
    if (!started) throw new EvaluationWriteError("writeEvaluation: the version is no longer active");
    await tx.insert(teacherEvaluations).values({
      submissionId: write.submissionId,
      versionNumber: write.versionNumber,
      origin: write.start.origin,
      proposalId: write.start.origin === "proposal" ? write.start.proposalId : null,
      rubricVersion: write.start.rubricVersion,
      createdBy: write.actorId,
      ...columns(write.after),
    });
  } else {
    const [updated] = await tx
      .update(teacherEvaluations)
      .set({ ...columns(write.after), revision, updatedAt: sql`now()` })
      .where(and(eq(teacherEvaluations.submissionId, write.submissionId), eq(teacherEvaluations.revision, write.fromRevision)))
      .returning({ id: teacherEvaluations.id });
    if (!updated) throw new EvaluationWriteError("writeEvaluation: the revision moved under the row lock");
  }

  await appendJournal(tx, [
    ...(write.fromRevision === 0
      ? [{ ...entry, event: "evaluation_created" as const, newValue: write.start ? { ...write.start } : null }]
      : []),
    ...changes.map((change) => ({ ...entry, event: "evaluation_changed" as const, ...change })),
  ]);
  return { revision, changes };
}
