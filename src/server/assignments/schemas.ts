import { z } from "zod";
import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import {
  ASSIGNMENT_INSTRUCTIONS_MAX_LENGTH,
  ASSIGNMENT_SUBJECT_MAX_LENGTH,
  ASSIGNMENT_TITLE_MAX_LENGTH,
} from "@/config/provisional";
import { assignmentLanguages, assignmentLevels } from "@/lib/assignment";
import { TIME_ZONE_NAME } from "@/lib/dates";
import { isWallTime, wallTimeToInstant } from "@/lib/time-zone";

// Server-side validation of an assignment (ASG-01 R1 to R3): one message per field.

export const ASSIGNMENT_ERRORS = {
  title: "Enter a title.",
  subject: "Enter the subject of the task.",
  level: "Choose a level from A1 to C1.",
  language: "Choose English or French.",
  deadline: "Choose the date and time of the deadline.",
  deadlineSkipped: `This time does not exist in ${TIME_ZONE_NAME}: the clocks change then. Choose another time.`,
  deadlinePast: "Choose a deadline in the future.",
  classes: "Choose at least one of your classes.",
  classNotFound: "One of the chosen classes is not among your classes. Nothing was created.",
} as const;

const tooLong = (max: number) => ({ error: `Use at most ${max} characters.` });

/** One line: trimmed, inner spaces collapsed. */
const titleSchema = z
  .string({ error: ASSIGNMENT_ERRORS.title })
  .transform((title) => title.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, { error: ASSIGNMENT_ERRORS.title }).max(ASSIGNMENT_TITLE_MAX_LENGTH, tooLong(ASSIGNMENT_TITLE_MAX_LENGTH)));

/** Several lines: trimmed only, line breaks kept as typed. */
const subjectSchema = z
  .string({ error: ASSIGNMENT_ERRORS.subject })
  .trim()
  .min(1, { error: ASSIGNMENT_ERRORS.subject })
  .max(ASSIGNMENT_SUBJECT_MAX_LENGTH, tooLong(ASSIGNMENT_SUBJECT_MAX_LENGTH));

/** CA3: optional; nothing typed is stored as null, never as an empty block. */
const instructionsSchema = z
  .string()
  .optional()
  .transform((text) => text?.trim() || null)
  .pipe(z.string().max(ASSIGNMENT_INSTRUCTIONS_MAX_LENGTH, tooLong(ASSIGNMENT_INSTRUCTIONS_MAX_LENGTH)).nullable());

/**
 * A wall time ("YYYY-MM-DDTHH:mm") in the single time zone, read as an
 * instant. [P] A skipped time is refused; a repeated one is its first occurrence.
 */
const wallDeadlineSchema = z
  .string({ error: ASSIGNMENT_ERRORS.deadline })
  .trim()
  .min(1, { error: ASSIGNMENT_ERRORS.deadline })
  .transform((wall, ctx) => {
    const instant = wallTimeToInstant(wall, DEADLINE_TIME_ZONE);
    if (instant) return instant;
    // A real calendar time that the zone skips, or not a date and time at all.
    ctx.addIssue({ code: "custom", message: isWallTime(wall) ? ASSIGNMENT_ERRORS.deadlineSkipped : ASSIGNMENT_ERRORS.deadline });
    return z.NEVER;
  });

/** [P] A new deadline is in the future. An edit checks it only when the deadline changes (ASG-03). */
export const isFutureDeadline = (deadline: Date) => deadline.getTime() > Date.now();

const deadlineSchema = wallDeadlineSchema.refine(isFutureDeadline, { error: ASSIGNMENT_ERRORS.deadlinePast });

/** R3: at least one class; the same class twice counts once. */
const classIdsSchema = z
  .array(z.string(), { error: ASSIGNMENT_ERRORS.classes })
  .transform((ids) => [...new Set(ids)])
  .pipe(z.array(z.uuid({ error: ASSIGNMENT_ERRORS.classNotFound })).min(1, { error: ASSIGNMENT_ERRORS.classes }));

export const createAssignmentSchema = z.object({
  title: titleSchema,
  subject: subjectSchema,
  level: z.enum(assignmentLevels, { error: ASSIGNMENT_ERRORS.level }),
  language: z.enum(assignmentLanguages, { error: ASSIGNMENT_ERRORS.language }),
  deadline: deadlineSchema,
  instructions: instructionsSchema,
  classIds: classIdsSchema,
});

/** ASG-03: what an edit always carries; a lock leaves these two open (R2). */
export const assignmentLabelsSchema = createAssignmentSchema.pick({ title: true, level: true });

/** ASG-03: the task, locked by the first submission. A deadline kept as it was may be past. */
export const assignmentTaskSchema = z.object({
  subject: subjectSchema,
  language: z.enum(assignmentLanguages, { error: ASSIGNMENT_ERRORS.language }),
  deadline: wallDeadlineSchema,
  instructions: instructionsSchema,
});
