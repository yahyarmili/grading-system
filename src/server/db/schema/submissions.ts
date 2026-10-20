import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  aiProviders,
  evaluationErrors,
  evaluationOutcomes,
  notAssessableCauses,
  proposalAlerts,
} from "../../../lib/evaluation";
import { storedSubmissionStatuses, submissionModes } from "../../../lib/submission-status";
import { assignments } from "./assignments";
import { users } from "./auth";

// Submissions and their versions (E4, SUB-02 to SUB-05; images in E9), and
// their evaluation runs and AI proposals (E5, EVL-03): one aggregate, one file,
// so the references between them need no import cycle.

/** §5.5 without "to submit", which is the absence of a row. */
export const submissionStatus = pgEnum("submission_status", storedSubmissionStatuses);
export const submissionMode = pgEnum("submission_mode", submissionModes);
export const evaluationOutcome = pgEnum("evaluation_outcome", evaluationOutcomes);
export const notAssessableCause = pgEnum("not_assessable_cause", notAssessableCauses);
export const evaluationError = pgEnum("evaluation_error", evaluationErrors);
export const proposalAlert = pgEnum("proposal_alert", proposalAlerts);
export const aiProvider = pgEnum("ai_provider", aiProviders);

/**
 * The one submission of a student for an assignment (SUB-05 R1), never deleted.
 * Its status changes only through the transition table (applyTransition).
 * submitted_at is the first submission, by the database clock; late is
 * computed in SQL from it and never changes (SUB-04 R2). current_version
 * names the active version. teacher_started_at is set by the teacher's first
 * change or validation (E7, E8) and closes replacement (SUB-05 R3).
 * current_proposal_id names the AI proposal in force: the database ties it to
 * this submission and its active version (SUB-05 R2), so replacing the text
 * empties it in the same statement.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    assignmentId: uuid().notNull(),
    /** The assignment's teacher, repeated so the database ties them (invariant 3). */
    teacherId: uuid().notNull(),
    studentId: uuid()
      .notNull()
      .references(() => users.id),
    status: submissionStatus().notNull().default("received"),
    submittedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    late: boolean().notNull(),
    /** The assignment's content_version the student read (ASG-03). */
    contentVersion: integer().notNull(),
    currentVersion: smallint().notNull().default(1),
    teacherStartedAt: timestamp({ withTimezone: true }),
    currentProposalId: uuid(),
    /** Set exactly when the status is not_assessable (EVL-04). */
    notAssessableCause: notAssessableCause(),
    /**
     * Who holds the evaluation (E6): set by the claim, exactly while the status
     * is evaluating (the workflow run's identifier, or a random one for the
     * command). Results and releases are guarded by it: a run frees only its
     * own claim. An identifier, never content.
     */
    claimToken: text(),
    /**
     * The teacher's last request of a retry or relaunch (E6.6): a random
     * identifier, set while the copy is failed or not assessable; the claim of
     * that request takes it, and any transition empties it. A second request
     * replaces the first, whose run then claims nothing.
     */
    evaluationRequest: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("submissions_assignment_student_unique").on(t.assignmentId, t.studentId),
    index("submissions_assignment_status_idx").on(t.assignmentId, t.status),
    index("submissions_student_id_idx").on(t.studentId),
    foreignKey({
      name: "submissions_assignment_fk",
      columns: [t.assignmentId, t.teacherId],
      foreignColumns: [assignments.id, assignments.teacherId],
    }),
    check("submissions_current_version_positive", sql`${t.currentVersion} >= 1`),
    check("submissions_content_version_positive", sql`${t.contentVersion} >= 1`),
    // Validating is the teacher's act: it closes replacement in the same statement.
    check(
      "submissions_validated_started",
      sql`${t.status} not in ('validated', 'published') or ${t.teacherStartedAt} is not null`,
    ),
    // MATCH SIMPLE: a null pointer is not checked, so transition 11 can move
    // the version and empty the pointer in one statement.
    foreignKey({
      name: "submissions_current_proposal_fk",
      columns: [t.currentProposalId, t.id, t.currentVersion],
      foreignColumns: [aiProposals.id, aiProposals.submissionId, aiProposals.versionNumber],
    }),
    check(
      "submissions_current_proposal_status",
      sql`${t.currentProposalId} is null or ${t.status} in ('to_review', 'validated', 'published')`,
    ),
    check(
      "submissions_not_assessable_cause",
      sql`(${t.status} = 'not_assessable') = (${t.notAssessableCause} is not null)`,
    ),
    check("submissions_claim_token_iff_evaluating", sql`(${t.status} = 'evaluating') = (${t.claimToken} is not null)`),
    check(
      "submissions_evaluation_request_status",
      sql`${t.evaluationRequest} is null or ${t.status} in ('evaluation_failed', 'not_assessable')`,
    ),
  ],
);

/**
 * One sending of a submission: the first, then each replacement, kept and
 * dated (SUB-05 R1). The active one is number = submissions.current_version.
 * Text OR images (SUB-02 R3): a text version holds its text; the pages of an
 * images version go in their own table (E9), tied by (version_id, mode) so a
 * text version can never have one. request_id makes a resent form a no-op.
 */
export const submissionVersions = pgTable(
  "submission_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid()
      .notNull()
      .references((): AnyPgColumn => submissions.id),
    number: smallint().notNull(),
    mode: submissionMode().notNull(),
    /** Exactly as submitted: no trim, no normalization, no correction (SUB-02 R2). */
    text: text(),
    requestId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("submission_versions_submission_number_unique").on(t.submissionId, t.number),
    unique("submission_versions_submission_request_unique").on(t.submissionId, t.requestId),
    unique("submission_versions_id_mode_unique").on(t.id, t.mode),
    check("submission_versions_number_positive", sql`${t.number} >= 1`),
    check("submission_versions_text_iff_mode", sql`(${t.mode} = 'text') = (${t.text} is not null)`),
    check("submission_versions_text_not_empty", sql`${t.text} <> ''`),
  ],
);

/**
 * One evaluation of one version, whatever its outcome (QUA-02, EXP-01): kept
 * for good, never changed (a trigger refuses it, 0011). No content: the model
 * and provider that answered, the prompt and rubric versions, the attempts
 * and why each one failed, the duration and the tokens counted.
 */
export const evaluationRuns = pgTable(
  "evaluation_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid().notNull(),
    versionNumber: smallint().notNull(),
    outcome: evaluationOutcome().notNull(),
    notAssessableCause: notAssessableCause(),
    provider: aiProvider().notNull(),
    /** Null when no request was made. */
    modelRequested: text(),
    modelAnswered: text(),
    /** The company that ran the model, when the answer names it as an identifier; its error codes are never stored. */
    providerAnswered: text(),
    /** Null exactly when not assessable: the blocking alert comes before any request. */
    promptVersion: text(),
    rubricVersion: text(),
    attempts: smallint().notNull(),
    /** One per failed attempt, in order, without content. */
    attemptErrors: evaluationError().array().notNull().default(sql`'{}'`),
    durationMs: integer().notNull(),
    /** Summed over the attempts; null when unknown. */
    promptTokens: integer(),
    completionTokens: integer(),
    totalTokens: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("evaluation_runs_id_submission_version_unique").on(t.id, t.submissionId, t.versionNumber),
    index("evaluation_runs_submission_id_idx").on(t.submissionId),
    foreignKey({
      name: "evaluation_runs_version_fk",
      columns: [t.submissionId, t.versionNumber],
      foreignColumns: [submissionVersions.submissionId, submissionVersions.number],
    }),
    check("evaluation_runs_duration_not_negative", sql`${t.durationMs} >= 0`),
    check(
      "evaluation_runs_cause_iff_not_assessable",
      sql`(${t.outcome} = 'not_assessable') = (${t.notAssessableCause} is not null)`,
    ),
    check(
      "evaluation_runs_versions_iff_assessable",
      sql`(${t.outcome} = 'not_assessable') = (${t.promptVersion} is null) and (${t.outcome} = 'not_assessable') = (${t.rubricVersion} is null)`,
    ),
    check(
      "evaluation_runs_proposed",
      sql`${t.outcome} <> 'proposed' or (${t.modelRequested} is not null and ${t.attempts} >= 1 and cardinality(${t.attemptErrors}) = ${t.attempts} - 1)`,
    ),
    check(
      "evaluation_runs_failed",
      sql`${t.outcome} <> 'failed' or (${t.attempts} >= 1 and cardinality(${t.attemptErrors}) = ${t.attempts})`,
    ),
    check(
      "evaluation_runs_not_assessable",
      sql`${t.outcome} <> 'not_assessable' or (${t.attempts} = 0 and cardinality(${t.attemptErrors}) = 0 and ${t.modelRequested} is null)`,
    ),
  ],
);

const level = () => smallint().notNull();
const justification = () => text().notNull();
const quotes = () => text().array().notNull();

/**
 * The conform answer of a run (EVL-03), one for one, never changed (a
 * trigger refuses it, 0011): a new evaluation is a new run. The grade is the
 * sum of the levels (Q1 [D]), held by the database, never given by the AI.
 */
export const aiProposals = pgTable(
  "ai_proposals",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid().notNull(),
    submissionId: uuid().notNull(),
    versionNumber: smallint().notNull(),
    levelTask: level(),
    levelOrganization: level(),
    levelVocabulary: level(),
    levelGrammar: level(),
    levelMechanics: level(),
    justificationTask: justification(),
    justificationOrganization: justification(),
    justificationVocabulary: justification(),
    justificationGrammar: justification(),
    justificationMechanics: justification(),
    quotesTask: quotes(),
    quotesOrganization: quotes(),
    quotesVocabulary: quotes(),
    quotesGrammar: quotes(),
    quotesMechanics: quotes(),
    generalComment: text().notNull(),
    nextSteps: text().array().notNull(),
    alerts: proposalAlert().array().notNull().default(sql`'{}'`),
    proposedGrade: smallint().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => {
    const levels = [t.levelTask, t.levelOrganization, t.levelVocabulary, t.levelGrammar, t.levelMechanics];
    const justifications = [
      t.justificationTask, t.justificationOrganization, t.justificationVocabulary, t.justificationGrammar, t.justificationMechanics,
    ];
    const quoteLists = [t.quotesTask, t.quotesOrganization, t.quotesVocabulary, t.quotesGrammar, t.quotesMechanics];
    const all = (parts: SQL[]) => sql.join(parts, sql` and `);
    return [
      unique("ai_proposals_run_unique").on(t.runId),
      unique("ai_proposals_id_submission_version_unique").on(t.id, t.submissionId, t.versionNumber),
      foreignKey({
        name: "ai_proposals_run_fk",
        columns: [t.runId, t.submissionId, t.versionNumber],
        foreignColumns: [evaluationRuns.id, evaluationRuns.submissionId, evaluationRuns.versionNumber],
      }),
      check("ai_proposals_levels_range", all(levels.map((c) => sql`${c} between 0 and 4`))),
      check("ai_proposals_justifications_not_blank", all(justifications.map((c) => sql`btrim(${c}) <> ''`))),
      check("ai_proposals_quotes_present", all(quoteLists.map((c) => sql`cardinality(${c}) >= 1`))),
      check("ai_proposals_general_comment_not_blank", sql`btrim(${t.generalComment}) <> ''`),
      check("ai_proposals_next_steps_present", sql`cardinality(${t.nextSteps}) >= 1`),
      // Q1 [D]: the sum of the five levels. A new rule comes with a new rubric version, and replaces this check.
      check("ai_proposals_grade_is_sum", sql`${t.proposedGrade} = ${sql.join(levels, sql` + `)}`),
    ];
  },
);
