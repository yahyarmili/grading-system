import { sql } from "drizzle-orm";
import {
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
import { storedSubmissionStatuses, submissionModes } from "../../../lib/submission-status";
import { assignments } from "./assignments";
import { users } from "./auth";

// Submissions and their versions (E4, SUB-02 to SUB-05; images in E9).

/** §5.5 without "to submit", which is the absence of a row. */
export const submissionStatus = pgEnum("submission_status", storedSubmissionStatuses);
export const submissionMode = pgEnum("submission_mode", submissionModes);

/**
 * The one submission of a student for an assignment (SUB-05 R1), never deleted.
 * Its status changes only through the transition table (applyTransition).
 * submitted_at is the first submission, by the database clock; late is
 * computed in SQL from it and never changes (SUB-04 R2). current_version
 * names the active version. teacher_started_at is set by the teacher's first
 * change or validation (E7, E8) and closes replacement (SUB-05 R3).
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
      .references(() => submissions.id),
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
