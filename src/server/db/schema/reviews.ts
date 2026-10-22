import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { GRADE_SCALE } from "../../../config/decisions";
import { reviewEvents, teacherEvaluationOrigins } from "../../../lib/review-lists";
import { users } from "./auth";
import { aiProposals, submissions, submissionVersions } from "./submissions";

// The teacher's review (E7, REV-03, REV-04): the teacher's own evaluation,
// apart from the immutable AI proposal, and the review log. Both written by
// src/server/data/review/record.ts alone, in one transaction
// (tests/review-writes.test.ts); the log never changes, and no evaluation
// revision commits without its log entry (triggers, 0017, 0018). An
// evaluation exists only on a started submission, on its active version,
// which then never changes (0018).

export const teacherEvaluationOrigin = pgEnum("teacher_evaluation_origin", teacherEvaluationOrigins);
export const reviewEvent = pgEnum("review_event", reviewEvents);

const level = () => smallint();
const remark = () => text().notNull().default("");
const reread = () => boolean().notNull().default(false);

/**
 * The owner teacher's evaluation of a submission, one per submission, born at
 * the teacher's first change from the proposal in force (or, in E8, a manual
 * evaluation). Its first write sets teacher_started_at, which closes
 * replacement, retry and relaunch: it always concerns the active version.
 * `revision` grows by one at each write (optimistic concurrency, REV-03 R5).
 * The grade: the sum of the levels while not fixed (Q1 [D]); fixed by the
 * teacher, any value from 0 to GRADE_SCALE (its step, a [P] value, is checked
 * by the server, not here).
 */
export const teacherEvaluations = pgTable(
  "teacher_evaluations",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid().notNull().unique("teacher_evaluations_submission_unique"),
    versionNumber: smallint().notNull(),
    origin: teacherEvaluationOrigin().notNull(),
    /** The proposal it started from; null for a manual evaluation (E8). */
    proposalId: uuid(),
    rubricVersion: text().notNull(),
    /** Null only while a manual evaluation is in progress (E8). */
    levelTask: level(),
    levelOrganization: level(),
    levelVocabulary: level(),
    levelGrammar: level(),
    levelMechanics: level(),
    remarkTask: remark(),
    remarkOrganization: remark(),
    remarkVocabulary: remark(),
    remarkGrammar: remark(),
    remarkMechanics: remark(),
    /** "To re-read" (REV-03 R3): the level changed since the remark was last written or marked re-read. */
    rereadTask: reread(),
    rereadOrganization: reread(),
    rereadVocabulary: reread(),
    rereadGrammar: reread(),
    rereadMechanics: reread(),
    generalComment: text().notNull().default(""),
    nextSteps: text().array().notNull().default(sql`'{}'`),
    finalGrade: numeric({ precision: 4, scale: 2, mode: "number" }),
    gradeFixed: boolean().notNull().default(false),
    revision: integer().notNull().default(1),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => {
    const levels = [t.levelTask, t.levelOrganization, t.levelVocabulary, t.levelGrammar, t.levelMechanics];
    const all = (parts: SQL[]) => sql.join(parts, sql` and `);
    return [
      foreignKey({
        name: "teacher_evaluations_submission_fk",
        columns: [t.submissionId],
        foreignColumns: [submissions.id],
      }),
      foreignKey({
        name: "teacher_evaluations_version_fk",
        columns: [t.submissionId, t.versionNumber],
        foreignColumns: [submissionVersions.submissionId, submissionVersions.number],
      }),
      // MATCH SIMPLE: a manual evaluation has no proposal, and is not checked.
      foreignKey({
        name: "teacher_evaluations_proposal_fk",
        columns: [t.proposalId, t.submissionId, t.versionNumber],
        foreignColumns: [aiProposals.id, aiProposals.submissionId, aiProposals.versionNumber],
      }),
      check("teacher_evaluations_proposal_iff_origin", sql`(${t.origin} = 'proposal') = (${t.proposalId} is not null)`),
      check("teacher_evaluations_levels_range", all(levels.map((c) => sql`(${c} is null or ${c} between 0 and 4)`))),
      check(
        "teacher_evaluations_proposal_levels",
        sql`${t.origin} <> 'proposal' or (${all(levels.map((c) => sql`${c} is not null`))})`,
      ),
      check("teacher_evaluations_grade_range", sql`${t.finalGrade} is null or ${t.finalGrade} between 0 and ${sql.raw(String(GRADE_SCALE))}`),
      // Not fixed: the calculated grade (Q1 [D]), null while a level is missing.
      check(
        "teacher_evaluations_grade_calculated",
        sql`${t.gradeFixed} or ${t.finalGrade} is not distinct from (${sql.join(levels, sql` + `)})`,
      ),
      check("teacher_evaluations_fixed_grade_present", sql`not ${t.gradeFixed} or ${t.finalGrade} is not null`),
      check("teacher_evaluations_revision_positive", sql`${t.revision} >= 1`),
    ];
  },
);

/**
 * The review log (REV-04): who did what to which copy, and the old and new
 * value of each change, dated by the database clock. Never changed nor
 * deleted (0017); never read by the student; apart from the security log
 * (DON-05), which holds no content. assignment_id has no foreign key: an
 * assignment without submissions may be deleted after its list was opened,
 * and the log outlives it.
 */
export const reviewJournalEntries = pgTable(
  "review_journal_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    assignmentId: uuid().notNull(),
    submissionId: uuid().references(() => submissions.id),
    /** Null for the system (E7.6: a retry abandoned for want of a place). */
    actorId: uuid().references(() => users.id),
    event: reviewEvent().notNull(),
    /** The changed field (`level.task`, `remark.task`, `final_grade`…), for evaluation_changed only. */
    field: text(),
    oldValue: jsonb(),
    newValue: jsonb(),
    /** The evaluation revision this entry records: set for evaluation_created and evaluation_changed, and for them only. */
    evaluationRevision: integer(),
    versionNumber: smallint(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_journal_entries_submission_idx").on(t.submissionId, t.createdAt.desc()),
    index("review_journal_entries_assignment_idx").on(t.assignmentId, t.createdAt),
    check("review_journal_entries_submission_iff_copy", sql`(${t.event} = 'list_opened') = (${t.submissionId} is null)`),
    check("review_journal_entries_field_iff_change", sql`(${t.event} = 'evaluation_changed') = (${t.field} is not null)`),
    // A revision marks a write, and a write only (0018): the triggers find a
    // revision's entries by it.
    check(
      "review_journal_entries_revision_of_writes",
      sql`(${t.event} in ('evaluation_created', 'evaluation_changed')) = (${t.evaluationRevision} is not null)`,
    ),
  ],
);
