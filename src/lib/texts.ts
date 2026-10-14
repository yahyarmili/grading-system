// Texts that depend on a decision of conception/ (notices, AI mention, "no
// name" instruction). One place, so that a change of decision changes them all.

/**
 * ASG-01 R4 [P]: subject and instructions are sent to the AI (EVL-02), the
 * level and the class never are (D4, invariant 4).
 */
export const AI_FIELDS_NOTICE =
  "The subject and the instructions are sent to the AI that proposes the marking. " +
  "Do not write a student's name, the level or the class in them.";

/** ASG-01 R4 [P]: the task frames the marking; it does not change the rubric. */
export const RUBRIC_UNCHANGED_NOTICE =
  "They help judge whether a text fits the task. They cannot add, remove or reweight a criterion of the rubric.";

/** D4: the level is a label for the teacher. */
export const LEVEL_NOT_SENT_NOTICE = "A label for you. It is never sent to the AI.";

/** D8: the deadline never closes the assignment. */
export const LATE_ACCEPTED_NOTICE = "Late submissions are accepted and marked late.";

/** ASG-03 R2 [P]: after the first submission, the task is locked and the assignment stays. */
export const ASSIGNMENT_LOCKED_NOTICE =
  "Students have submitted: the subject, language, instructions and deadline are locked, " +
  "so that every copy is marked on the same task. You can still change the title and the level.";

/** ASG-03 R2 [P]: why an assignment with a submission is not deleted. */
export const ASSIGNMENT_NOT_DELETED_NOTICE = "An assignment with submissions can't be deleted.";

/** ASG-03 R1 [P]: an edit before the first submission reaches the students at once. */
export const ASSIGNMENT_EDIT_VISIBLE_NOTICE = "Your students see the changes as soon as you save them.";
