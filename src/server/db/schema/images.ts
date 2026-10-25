import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
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
import { pageReadingStatuses, readingOutcomes } from "../../../lib/transcription";
import { assignments } from "./assignments";
import { users } from "./auth";
import { aiProvider, evaluationError, submissionMode, submissionVersions } from "./submissions";

// The image channel (E9, spec 0011): a student's draft of pages before
// sending, the pages of an image version, the reading runs, the confirmed
// transcription and the student's word changes. Images live here alone and
// are read by one route (architecture rule 2). The triggers of 0022 hold
// what a constraint cannot: attached pages, runs, transcriptions and changes
// never change but in the ways named on each table. The unique positions are
// deferrable (a reorder swaps them): declared in 0022, outside this file,
// because Drizzle has no deferrable unique.

export const pageReadingStatus = pgEnum("page_reading_status", pageReadingStatuses);
export const readingOutcome = pgEnum("reading_outcome", readingOutcomes);

/** A JPEG's bytes. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * One open draft per student and assignment: the pages before the student
 * confirms. Not a submission state: a submission exists only once confirmed,
 * and the confirming transaction deletes the draft. updated_at is the
 * database clock, bumped by each write of the draft (the sweep's lifetime).
 */
export const submissionDrafts = pgTable(
  "submission_drafts",
  {
    id: uuid().primaryKey().defaultRandom(),
    assignmentId: uuid()
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("submission_drafts_assignment_student_unique").on(t.assignmentId, t.studentId)],
);

/**
 * One reading of one page, whatever its outcome, kept for good (a trigger,
 * 0022): only page_id may go from a page to null, when the page is deleted.
 * No student data, no text. draft_id and student_id carry no foreign key, so
 * that the reads of a draft and of a day are still counted once it is gone;
 * submission_id is set for the pipeline's reads instead of draft_id.
 */
export const readingRuns = pgTable(
  "reading_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    pageId: uuid().references((): AnyPgColumn => submissionPages.id, { onDelete: "set null" }),
    draftId: uuid(),
    studentId: uuid(),
    submissionId: uuid(),
    outcome: readingOutcome().notNull(),
    provider: aiProvider().notNull(),
    modelRequested: text().notNull(),
    modelAnswered: text(),
    promptVersion: text().notNull(),
    attempts: smallint().notNull(),
    /** One per failed attempt, in order, without content. */
    attemptErrors: evaluationError().array().notNull().default(sql`'{}'`),
    durationMs: integer().notNull(),
    /** Summed over the attempts; null when unknown. */
    promptTokens: integer(),
    completionTokens: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reading_runs_draft_id_idx").on(t.draftId),
    index("reading_runs_student_created_idx").on(t.studentId, t.createdAt),
    index("reading_runs_submission_id_idx").on(t.submissionId),
    check("reading_runs_draft_or_submission", sql`(${t.draftId} is null) <> (${t.submissionId} is null)`),
    check("reading_runs_draft_student", sql`${t.draftId} is null or ${t.studentId} is not null`),
    check("reading_runs_duration_not_negative", sql`${t.durationMs} >= 0`),
    check(
      "reading_runs_attempts",
      sql`${t.attempts} >= 1 and cardinality(${t.attemptErrors}) = ${t.attempts} - (case when ${t.outcome} = 'failed' then 0 else 1 end)`,
    ),
  ],
);

/**
 * One page: of a draft while the student prepares it, then of an image
 * version once confirmed (the attach, once). Exactly one of the two. The
 * image is a JPEG without metadata, checked and encoded again by the server
 * (page-image.ts). Once attached, its bytes and position never change, and
 * its reading only from pending or failed to read (the pipeline reading an
 * unchecked version); it is never deleted (0022).
 */
export const submissionPages = pgTable(
  "submission_pages",
  {
    id: uuid().primaryKey().defaultRandom(),
    draftId: uuid().references(() => submissionDrafts.id, { onDelete: "cascade" }),
    versionId: uuid(),
    /** Constant: ties a page to an image version only, never a text one. */
    mode: submissionMode().notNull().default("images"),
    position: smallint().notNull(),
    image: bytea().notNull(),
    byteLength: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    sha256: text().notNull(),
    /** The browser's id of the upload: a retry after a network cut stores one page. */
    uploadRequestId: uuid().notNull(),
    readingStatus: pageReadingStatus().notNull().default("pending"),
    /** The engine's reading, exactly as it answered; set exactly when read. */
    readingText: text(),
    hasWriting: boolean(),
    readingRunId: uuid().references((): AnyPgColumn => readingRuns.id),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("submission_pages_draft_upload_unique").on(t.draftId, t.uploadRequestId),
    index("submission_pages_version_id_idx").on(t.versionId),
    foreignKey({
      name: "submission_pages_version_fk",
      columns: [t.versionId, t.mode],
      foreignColumns: [submissionVersions.id, submissionVersions.mode],
    }),
    check("submission_pages_mode_images", sql`${t.mode} = 'images'`),
    check("submission_pages_draft_or_version", sql`(${t.draftId} is null) <> (${t.versionId} is null)`),
    check("submission_pages_position_positive", sql`${t.position} >= 1`),
    check("submission_pages_byte_length", sql`${t.byteLength} = octet_length(${t.image})`),
    check("submission_pages_size_positive", sql`${t.width} >= 1 and ${t.height} >= 1`),
    check(
      "submission_pages_read",
      sql`(${t.readingStatus} = 'read') = (${t.readingText} is not null and ${t.hasWriting} is not null and ${t.readingRunId} is not null and ${t.readAt} is not null)`,
    ),
  ],
);

/**
 * The transcription of an image version, written once at confirmation: the
 * assembled text sent to evaluation, checked by the student or not. Null text
 * until the pipeline reads an unchecked version; afterwards only that text,
 * from null, by the pipeline (0022).
 */
export const submissionTranscriptions = pgTable(
  "submission_transcriptions",
  {
    versionId: uuid().primaryKey(),
    /** Constant: ties a transcription to an image version only. */
    mode: submissionMode().notNull().default("images"),
    text: text(),
    checkedByStudent: boolean().notNull(),
    confirmedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "submission_transcriptions_version_fk",
      columns: [t.versionId, t.mode],
      foreignColumns: [submissionVersions.id, submissionVersions.mode],
    }),
    check("submission_transcriptions_mode_images", sql`${t.mode} = 'images'`),
    check("submission_transcriptions_checked_text", sql`not ${t.checkedByStudent} or ${t.text} is not null`),
  ],
);

/**
 * One word the student replaced before confirming (Q4): the engine's word
 * and theirs, by its index on its page. At most one per word; rows only for
 * a checked transcription. Never changed (0022).
 */
export const transcriptionChanges = pgTable(
  "transcription_changes",
  {
    id: uuid().primaryKey().defaultRandom(),
    versionId: uuid()
      .notNull()
      .references(() => submissionTranscriptions.versionId),
    pageId: uuid()
      .notNull()
      .references(() => submissionPages.id),
    wordIndex: integer().notNull(),
    engineWord: text().notNull(),
    studentWord: text().notNull(),
  },
  (t) => [
    unique("transcription_changes_page_word_unique").on(t.pageId, t.wordIndex),
    index("transcription_changes_version_id_idx").on(t.versionId),
    check("transcription_changes_word_index", sql`${t.wordIndex} >= 0`),
    check("transcription_changes_engine_word", sql`${t.engineWord} ~ '^\\S+$'`),
    check("transcription_changes_student_word", sql`${t.studentWord} <> '' and ${t.studentWord} !~ '[\\r\\n]'`),
  ],
);
