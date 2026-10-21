import { pgEnum, pgTable, smallint, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

// NFR-DON-04: notices read before a first use, each reading recorded (E4).

/** Which notice: the student's, before the first submission; the teacher's, before the first access to copies (E7.7). */
export const noticeKind = pgEnum("notice_kind", ["student_submission", "teacher_review"]);

/** One reading of one version of a notice, by its account, dated by the database. */
export const noticeAcknowledgements = pgTable(
  "notice_acknowledgements",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    notice: noticeKind().notNull(),
    /** STUDENT_NOTICE.version in src/lib/texts.ts. */
    version: smallint().notNull(),
    acknowledgedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("notice_acknowledgements_user_notice_version_unique").on(t.userId, t.notice, t.version)],
);
