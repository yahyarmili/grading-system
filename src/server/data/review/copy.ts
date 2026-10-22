import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { AssignmentLanguage } from "@/lib/assignment";
import { compareText } from "@/lib/collation";
import type { EvaluationError, NotAssessableCause } from "@/lib/evaluation";
import { applyChanges, diffEvaluation, fieldsFromProposal, isComplete, type EvaluationChanges, type EvaluationFields } from "@/lib/review";
import type { RowClass } from "@/lib/review-list";
import type { CriterionId, Level } from "@/lib/rubric";
import type { SubmissionMode, SubmissionStatus } from "@/lib/submission-status";
import type { Actor } from "@/server/access/actor";
import { authorize, type Grant } from "@/server/access/policy";
import { db } from "@/server/db/client";
import {
  aiProposals,
  assignments,
  classes,
  classMemberships,
  evaluationRuns,
  submissions,
  submissionVersions,
  teacherEvaluations,
  users,
} from "@/server/db/schema";
import { ownedBy } from "../access";
import { proposalFromRow, type CurrentProposal } from "../evaluation/proposals";
import { acknowledgedNotice } from "../notices/notices";
import { applyTransition } from "../submissions/transitions";
import { appendJournal, writeEvaluation } from "./record";

// REV-02 (E7.3): one student's copy for one of the teacher's assignments,
// opened by a click on their name. Another teacher's assignment, a student
// who neither received it nor submitted, or a missing one: absent (AUTH-04
// R3). No result of the student's other assignments is read (R2).

const owned = (grant: Grant) => ownedBy(grant, { teacher: assignments.teacherId });

/**
 * The teacher's evaluation of the submission's active version. The database
 * holds it so (0018: born on the started, active version, which then never
 * changes); the join says it as well.
 */
const activeEvaluation = and(
  eq(teacherEvaluations.submissionId, submissions.id),
  eq(teacherEvaluations.versionNumber, submissions.currentVersion),
);

/** What the page saw: the guard of the writes (E7.4) and of the freshness check when shown. */
export type CopySeen = {
  submissionId: string;
  versionNumber: number;
  proposalId: string | null;
  /** 0 before the teacher's first change. */
  revision: number;
  status: SubmissionStatus;
};

export type TeacherCopy = {
  assignment: { id: string; title: string; subject: string; instructions: string | null; language: AssignmentLanguage };
  /** R1: the student's recipient classes of this assignment, all the teacher's own (invariant 3). */
  classes: RowClass[];
  status: SubmissionStatus;
  late: boolean;
  /** The first submission (SUB-04 R2); null when not submitted. */
  submittedAt: string | null;
  /** The active version: its text exactly as submitted (null for images, E9). */
  version: { number: number; mode: SubmissionMode; text: string | null; createdAt: string } | null;
  cause: NotAssessableCause | null;
  /** The last attempt's error of the active version's last run: why it failed. */
  lastError: EvaluationError | null;
  /**
   * E7.6, a failed or not assessable copy: the teacher's retry or relaunch
   * waits for its run ("pending"), or found no evaluation place in time and
   * was dropped ("abandoned"); null otherwise.
   */
  request: "pending" | "abandoned" | null;
  proposal: (CurrentProposal & { model: string | null; evaluatedAt: string }) | null;
  /** The teacher's evaluation, once they changed something (E7.4). */
  evaluation: (EvaluationFields & { revision: number }) | null;
  /** REV-05 CA1, PUB-01 (E8): who validated or published the copy in its state, and when; null in any other state. */
  decision: { event: "validated" | "published"; at: string; by: string } | null;
  /** Null when not submitted: nothing to log, nothing to write. */
  seen: CopySeen | null;
};

type EvaluationRow = typeof teacherEvaluations.$inferSelect;

function fieldsFromRow(e: EvaluationRow): EvaluationFields {
  const by = <T,>(pick: Record<CriterionId, T>) => pick;
  return {
    levels: by({ task: e.levelTask, organization: e.levelOrganization, vocabulary: e.levelVocabulary, grammar: e.levelGrammar, mechanics: e.levelMechanics }) as Record<CriterionId, Level | null>,
    remarks: by({ task: e.remarkTask, organization: e.remarkOrganization, vocabulary: e.remarkVocabulary, grammar: e.remarkGrammar, mechanics: e.remarkMechanics }),
    reread: by({ task: e.rereadTask, organization: e.rereadOrganization, vocabulary: e.rereadVocabulary, grammar: e.rereadGrammar, mechanics: e.rereadMechanics }),
    generalComment: e.generalComment,
    nextSteps: e.nextSteps,
    finalGrade: e.finalGrade,
    gradeFixed: e.gradeFixed,
  };
}

/** The student's memberships of the assignment's recipient classes. */
const memberships = (studentId: string, active: boolean) => sql`
  from assignment_classes ac
  join class_memberships cm on cm.class_id = ac.class_id and cm.student_id = ${studentId}
  ${active ? sql`and cm.status = 'active'` : sql``}
  join classes c on c.id = ac.class_id
  where ac.assignment_id = ${assignments.id}`;

/**
 * REV-02: the copy, its proposal in force and the teacher's evaluation, in
 * one round trip. The student must be listed (REV-01 R2): an active member
 * of a recipient class, or with a submission.
 */
export async function getCopy(actor: Actor, assignmentId: string, studentId: string): Promise<TeacherCopy | "notice_required" | null> {
  const grant = authorize(actor, "submission", "read");
  authorize(actor, "aiProposal", "read");
  authorize(actor, "unpublishedEvaluation", "read");
  // A published copy shows its published evaluation (E8, PUB-01).
  authorize(actor, "publishedEvaluation", "read");
  // Whether the last request was dropped is read from the log (E7.6).
  authorize(actor, "reviewLog", "read");
  const [row] = await db
    .select({
      assignment: {
        id: assignments.id,
        title: assignments.title,
        subject: assignments.subject,
        instructions: assignments.instructions,
        language: assignments.language,
      },
      classes: sql<RowClass[]>`coalesce((
        select json_agg(json_build_object('id', c.id, 'name', c.name, 'removed', cm.status = 'removed'))
        ${memberships(studentId, false)}
      ), '[]')`,
      member: sql<boolean>`exists (select 1 ${memberships(studentId, true)})`,
      noticeRead: sql<boolean>`${acknowledgedNotice(grant.userId, "teacher_review")}`,
      submission: {
        id: submissions.id,
        status: submissions.status,
        late: submissions.late,
        submittedAt: submissions.submittedAt,
        currentVersion: submissions.currentVersion,
        cause: submissions.notAssessableCause,
        proposalId: submissions.currentProposalId,
      },
      version: { mode: submissionVersions.mode, text: submissionVersions.text, createdAt: submissionVersions.createdAt },
      lastError: sql<EvaluationError | null>`(
        select r.attempt_errors[cardinality(r.attempt_errors)] from evaluation_runs r
        where r.submission_id = ${submissions.id} and r.version_number = ${submissions.currentVersion}
        order by r.created_at desc, r.id desc limit 1
      )`,
      requested: sql<boolean>`${submissions.evaluationRequest} is not null`,
      // The active version's last request, dropped by the system (E7.6).
      abandoned: sql<boolean>`coalesce((
        select j.event = 'retry_abandoned' from review_journal_entries j
        where j.submission_id = ${submissions.id} and j.version_number = ${submissions.currentVersion}
          and j.event in ('retry_requested', 'relaunch_requested', 'retry_abandoned')
        order by j.created_at desc limit 1
      ), false)`,
      // REV-05 CA1, PUB-01: when the copy reached its state, by whom (E8): the log's last decision.
      decision: sql<{ event: "validated" | "published"; at: string; firstName: string; lastName: string } | null>`(
        select json_build_object('event', j.event, 'at', j.created_at, 'firstName', u.first_name, 'lastName', u.last_name)
        from review_journal_entries j join users u on u.id = j.actor_id
        where j.submission_id = ${submissions.id} and j.version_number = ${submissions.currentVersion}
          and j.event = (case ${submissions.status} when 'validated' then 'validated' when 'published' then 'published' end)::review_event
        order by j.created_at desc limit 1
      )`,
      proposal: aiProposals,
      run: { model: evaluationRuns.modelAnswered, createdAt: evaluationRuns.createdAt },
      evaluation: teacherEvaluations,
    })
    .from(assignments)
    .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, studentId)))
    .leftJoin(
      submissionVersions,
      and(eq(submissionVersions.submissionId, submissions.id), eq(submissionVersions.number, submissions.currentVersion)),
    )
    .leftJoin(aiProposals, eq(aiProposals.id, submissions.currentProposalId))
    .leftJoin(evaluationRuns, eq(evaluationRuns.id, aiProposals.runId))
    .leftJoin(teacherEvaluations, activeEvaluation)
    .where(and(eq(assignments.id, assignmentId), owned(grant)));
  if (!row || (!row.member && !row.submission)) return null;
  // NFR-DON-04 (E7.7): nothing of the copy before the teacher notice is read.
  if (!row.noticeRead) return "notice_required";

  const { submission, version, proposal, run, evaluation } = row;
  return {
    assignment: row.assignment,
    classes: [...row.classes].sort((a, b) => compareText(a.name, b.name)),
    status: submission?.status ?? "to_submit",
    late: submission?.late ?? false,
    submittedAt: submission?.submittedAt.toISOString() ?? null,
    version:
      submission && version
        ? { number: submission.currentVersion, mode: version.mode, text: version.text, createdAt: version.createdAt.toISOString() }
        : null,
    cause: submission?.cause ?? null,
    lastError: submission ? row.lastError : null,
    request:
      submission?.status !== "evaluation_failed" && submission?.status !== "not_assessable"
        ? null
        : row.requested
          ? "pending"
          : row.abandoned
            ? "abandoned"
            : null,
    proposal: proposal && run ? { ...proposalFromRow(proposal), model: run.model, evaluatedAt: run.createdAt.toISOString() } : null,
    evaluation: evaluation ? { ...fieldsFromRow(evaluation), revision: evaluation.revision } : null,
    decision:
      submission && row.decision
        ? {
            event: row.decision.event,
            at: new Date(row.decision.at).toISOString(),
            by: `${row.decision.firstName} ${row.decision.lastName}`,
          }
        : null,
    seen: submission
      ? {
          submissionId: submission.id,
          versionNumber: submission.currentVersion,
          proposalId: submission.proposalId,
          revision: evaluation?.revision ?? 0,
          status: submission.status,
        }
      : null,
  };
}

export type StudentIdentity = { firstName: string; lastName: string; email: string };

/**
 * Invariant 9, D9: a student's name and email, for the student themself or
 * the teacher of one of their classes, removed or not (row "studentAccount").
 */
export async function getStudentIdentity(actor: Actor, studentId: string): Promise<StudentIdentity | null> {
  const grant = authorize(actor, "studentAccount", "read");
  const [found] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.id, studentId),
        eq(users.role, "student"),
        ownedBy(grant, {
          student: users.id,
          teacher: (userId) => sql`exists (
            select 1 from ${classMemberships} join ${classes} on ${classes.id} = ${classMemberships.classId}
            where ${classMemberships.studentId} = ${users.id} and ${classes.teacherId} = ${userId}
          )`,
        }),
      ),
    );
  return found ?? null;
}

/**
 * REV-04: the teacher opened the copy (journal "copy opened", by the
 * database clock), for the measure of O1. Called by the page once shown,
 * never while rendering: a prefetch logs nothing (E7 plan §1.6). Gives what
 * the copy is now, so a page shown from the router's cache is refreshed when
 * it changed. Null when absent or another person's: nothing logged.
 */
export async function recordCopyOpened(actor: Actor, submissionId: string): Promise<CopySeen | null> {
  const grant = authorize(actor, "submission", "read");
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({
        assignmentId: submissions.assignmentId,
        versionNumber: submissions.currentVersion,
        proposalId: submissions.currentProposalId,
        status: submissions.status,
        revision: teacherEvaluations.revision,
      })
      .from(submissions)
      .leftJoin(teacherEvaluations, activeEvaluation)
      .where(
        and(
          eq(submissions.id, submissionId),
          ownedBy(grant, { teacher: submissions.teacherId }),
          acknowledgedNotice(grant.userId, "teacher_review"),
        ),
      );
    if (!found) return null;
    await appendJournal(tx, [
      {
        assignmentId: found.assignmentId,
        submissionId,
        actorId: grant.userId,
        event: "copy_opened",
        versionNumber: found.versionNumber,
      },
    ]);
    return {
      submissionId,
      versionNumber: found.versionNumber,
      proposalId: found.proposalId,
      revision: found.revision ?? 0,
      status: found.status,
    };
  });
}

/** The copy as the page saw it: the guard of a save (E7 plan §1.5). */
export type SeenEvaluation = Pick<CopySeen, "submissionId" | "versionNumber" | "proposalId" | "revision">;

export type SavedEvaluation = EvaluationFields & { revision: number };

export type SaveEvaluationResult =
  /** changed: false when the form held nothing new (nothing written, nothing logged). */
  | { ok: true; changed: boolean; evaluation: SavedEvaluation; sentBack: boolean }
  /** The student replaced the copy, or its proposal changed, since it was opened (R5). */
  | { ok: false; reason: "replaced" }
  /** Neither To review, Validated nor Published, or without an AI proposal (manual evaluation: E8.2). */
  | { ok: false; reason: "not_open" }
  /** Saved meanwhile elsewhere (another tab): what is stored now, never overwritten silently (CA4). */
  | { ok: false; reason: "conflict"; saved: SavedEvaluation }
  /** NFR-DON-04 (E7.7): the teacher notice not read yet: nothing written. */
  | { ok: false; reason: "notice_required" };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The teacher's own submission row, locked: what every write on the copy checks first. */
export type LockedCopy = {
  assignmentId: string;
  status: SubmissionStatus;
  versionNumber: number;
  proposalId: string | null;
  noticeRead: boolean;
};

/**
 * Locks the row of the teacher's own submission (FOR UPDATE), the lock a
 * replacement takes too (SUB-05 R3): every write on the copy waits for the
 * one before. Null when absent or another teacher's. In the caller's
 * transaction, which has authorized the actor (`grant`).
 */
export async function lockCopy(tx: Tx, grant: Grant, submissionId: string): Promise<LockedCopy | null> {
  const [row] = await tx
    .select({
      assignmentId: submissions.assignmentId,
      status: submissions.status,
      versionNumber: submissions.currentVersion,
      proposalId: submissions.currentProposalId,
      noticeRead: sql<boolean>`${acknowledgedNotice(grant.userId, "teacher_review")}`,
    })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), ownedBy(grant, { teacher: submissions.teacherId })))
    .for("update");
  return row ?? null;
}

/** The guards every write on the copy shares, in order, once it is found: the notice, then the version and proposal seen. */
export function lockedRefusal(row: LockedCopy, seen: Pick<SeenEvaluation, "versionNumber" | "proposalId">) {
  if (!row.noticeRead) return { ok: false, reason: "notice_required" } as const;
  if (row.versionNumber !== seen.versionNumber || row.proposalId !== seen.proposalId) return { ok: false, reason: "replaced" } as const;
  return null;
}

export type EditOutcome =
  | {
      ok: true;
      changed: boolean;
      evaluation: SavedEvaluation;
      /** The proposal's values, what a validation compares the evaluation with (REV-05 R2). */
      proposal: EvaluationFields;
      /** Transition 10 was applied: the copy was Validated or Published and is To review again (Q8). */
      sentBack: boolean;
    }
  | { ok: false; reason: "not_open" | "incomplete" }
  | { ok: false; reason: "conflict"; saved: SavedEvaluation };

const EDITABLE: readonly SubmissionStatus[] = ["to_review", "validated", "published"];

/**
 * One save of the whole form on a locked copy (E7.4), shared by the save and
 * the validation (E8): checks the status, then the revision, applies the
 * changes, and writes them with their log entries (record.ts). Q8 [D,
 * 2026-10-22]: a real change of a Validated or Published copy first sends it
 * back To review (transition 10, logged sent_back_to_review): the database
 * never lets an evaluation change outside To review (0019), and a published
 * one leaves the student's view. A change of a Published copy also needs the
 * right to write the published evaluation. `create` writes the evaluation
 * even unchanged (a validation without changes); `complete` refuses levels
 * or a grade missing before anything is written.
 */
export async function editLocked(
  tx: Tx,
  actor: Actor,
  grant: Grant,
  row: LockedCopy,
  seen: SeenEvaluation,
  changes: EvaluationChanges,
  options: { create?: boolean; complete?: boolean } = {},
): Promise<EditOutcome> {
  if (!EDITABLE.includes(row.status) || !row.proposalId) return { ok: false, reason: "not_open" };

  // Read once the lock is held, by a statement of its own: a save that
  // waited for the lock sees what the other one committed (READ COMMITTED
  // re-reads the locked row only, never the rows joined to it).
  const [current] = await tx
    .select({ proposal: aiProposals, rubricVersion: evaluationRuns.rubricVersion, evaluation: teacherEvaluations })
    .from(aiProposals)
    .innerJoin(evaluationRuns, eq(evaluationRuns.id, aiProposals.runId))
    .leftJoin(
      teacherEvaluations,
      and(eq(teacherEvaluations.submissionId, aiProposals.submissionId), eq(teacherEvaluations.versionNumber, aiProposals.versionNumber)),
    )
    .where(eq(aiProposals.id, row.proposalId));
  if (!current?.rubricVersion) return { ok: false, reason: "not_open" };

  const { evaluation } = current;
  const proposal = fieldsFromProposal(proposalFromRow(current.proposal));
  const stored: SavedEvaluation = evaluation ? { ...fieldsFromRow(evaluation), revision: evaluation.revision } : { ...proposal, revision: 0 };
  if (stored.revision !== seen.revision) return { ok: false, reason: "conflict", saved: stored };

  const { revision: fromRevision, ...before } = stored;
  const after = applyChanges(before, changes);
  if (options.complete && !isComplete(after)) return { ok: false, reason: "incomplete" };
  const changed = diffEvaluation(before, after).length > 0;

  const sentBack = changed && row.status !== "to_review";
  if (sentBack) {
    if (row.status === "published") authorize(actor, "publishedEvaluation", "write");
    const moved = await applyTransition(tx, seen.submissionId, 10, "to_review", {
      where: eq(submissions.currentVersion, row.versionNumber),
    });
    if (!moved) throw new Error("editLocked: the copy left its state under the row lock");
    await appendJournal(tx, [
      {
        assignmentId: row.assignmentId,
        submissionId: seen.submissionId,
        actorId: grant.userId,
        event: "sent_back_to_review",
        newValue: { from: row.status },
        versionNumber: row.versionNumber,
      },
    ]);
  }

  const written = await writeEvaluation(tx, {
    assignmentId: row.assignmentId,
    submissionId: seen.submissionId,
    versionNumber: row.versionNumber,
    actorId: grant.userId,
    fromRevision,
    start: { origin: "proposal", proposalId: current.proposal.id, rubricVersion: current.rubricVersion },
    before,
    after,
    create: options.create,
  });
  return written
    ? { ok: true, changed, evaluation: { ...after, revision: written.revision }, proposal, sentBack }
    : { ok: true, changed: false, evaluation: stored, proposal, sentBack: false };
}

/**
 * REV-03, REV-04: saves the whole form of the teacher's own copy. Under the
 * submission row's lock, the one a replacement takes too (SUB-05 R3): the
 * version and the proposal seen, then the status, then the revision. The
 * first save from the proposal creates the evaluation and sets
 * teacher_started_at, which closes replacement; each changed field gets its
 * log entry in the same transaction (record.ts). A Validated or Published
 * copy changed goes back To review (Q8, editLocked). The proposal is never
 * written. Null when absent or another teacher's. `changes` comes validated
 * (src/server/review/evaluation.ts); a level out of 0 to 4 still throws here
 * and in the database.
 */
export async function saveEvaluation(
  actor: Actor,
  seen: SeenEvaluation,
  changes: EvaluationChanges,
): Promise<SaveEvaluationResult | null> {
  const grant = authorize(actor, "unpublishedEvaluation", "write");
  return db.transaction(async (tx) => {
    const row = await lockCopy(tx, grant, seen.submissionId);
    if (!row) return null;
    const refused = lockedRefusal(row, seen);
    if (refused) return refused;
    const edit = await editLocked(tx, actor, grant, row, seen, changes);
    if (!edit.ok) return edit.reason === "conflict" ? edit : { ok: false, reason: "not_open" };
    return { ok: true, changed: edit.changed, evaluation: edit.evaluation, sentBack: edit.sentBack };
  });
}
