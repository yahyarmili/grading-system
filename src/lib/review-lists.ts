// Closed lists of the teacher's review (E7). Kept free of imports: the
// database schema reads them, and drizzle-kit loads the schema alone.

/** Where the teacher's evaluation started: the AI proposal in force, or a manual evaluation (E8, REV-06). */
export const teacherEvaluationOrigins = ["proposal", "manual"] as const;
export type TeacherEvaluationOrigin = (typeof teacherEvaluationOrigins)[number];

/**
 * The events of the review log (REV-04 R2). Declared together so E8 adds no
 * enum value: validated, published, unpublished, sent_back_to_review and
 * manual_started are written from E8.
 */
export const reviewEvents = [
  "list_opened",
  "copy_opened",
  "evaluation_created",
  "evaluation_changed",
  "retry_requested",
  "relaunch_requested",
  "retry_abandoned",
  "manual_started",
  "validated",
  "published",
  "unpublished",
  "sent_back_to_review",
] as const;
export type ReviewEvent = (typeof reviewEvents)[number];
