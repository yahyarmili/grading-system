import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { assignmentLanguages, assignmentLevels } from "../../../lib/assignment";
import { users } from "./auth";
import { classes } from "./classes";

// Assignments and their recipient classes (E3, ASG-01 to ASG-03).

/** D4: a closed list of labels; the level is never sent to the AI. */
export const assignmentLevel = pgEnum("assignment_level", assignmentLevels);
export const assignmentLanguage = pgEnum("assignment_language", assignmentLanguages);

/**
 * One assignment, created and marked by its teacher (invariant 3).
 * Locking (ASG-03): locked_at is set by the transaction of the first
 * submission (E4); the teacher's writes on locked fields require it null in
 * the same statement, so the row lock decides which one wins. content_version
 * grows with each change of a locked field: a submission names the version
 * the student read (E4).
 */
export const assignments = pgTable(
  "assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    teacherId: uuid()
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    subject: text().notNull(),
    level: assignmentLevel().notNull(),
    language: assignmentLanguage().notNull(),
    deadline: timestamp({ withTimezone: true }).notNull(),
    /** Null when there are none: never an empty string (ASG-01 CA3). */
    instructions: text(),
    contentVersion: integer().notNull().default(1),
    lockedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("assignments_title_trimmed", sql`${t.title} = btrim(${t.title}) and ${t.title} <> ''`),
    check("assignments_subject_trimmed", sql`${t.subject} = btrim(${t.subject}) and ${t.subject} <> ''`),
    check(
      "assignments_instructions_trimmed",
      sql`${t.instructions} is null or (${t.instructions} = btrim(${t.instructions}) and ${t.instructions} <> '')`,
    ),
    unique("assignments_id_teacher_unique").on(t.id, t.teacherId),
    index("assignments_teacher_deadline_idx").on(t.teacherId, t.deadline.desc()),
  ],
);

/**
 * The classes an assignment is sent to (F14, F15). The teacher is repeated so
 * that the database itself refuses another teacher's class (invariant 3).
 */
export const assignmentClasses = pgTable(
  "assignment_classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    assignmentId: uuid().notNull(),
    classId: uuid().notNull(),
    teacherId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("assignment_classes_assignment_class_unique").on(t.assignmentId, t.classId),
    index("assignment_classes_class_id_idx").on(t.classId),
    foreignKey({
      name: "assignment_classes_assignment_fk",
      columns: [t.assignmentId, t.teacherId],
      foreignColumns: [assignments.id, assignments.teacherId],
    }).onDelete("cascade"),
    foreignKey({
      name: "assignment_classes_class_fk",
      columns: [t.classId, t.teacherId],
      foreignColumns: [classes.id, classes.teacherId],
    }),
  ],
);
