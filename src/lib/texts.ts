import { SUBMISSION_TEXT_MAX_LENGTH } from "@/config/decisions";

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

/** Q10 [D, 2026-10-15]: the instruction alone, shown before sending; no alert, no masking. */
export const NO_NAME_INSTRUCTION = "Do not write your name in your text.";

/** SUB-02 R1 [D, 2026-10-15]: the limit, announced before sending. */
export const SUBMISSION_TEXT_LIMIT_NOTICE = `At most ${SUBMISSION_TEXT_MAX_LENGTH.toLocaleString("en-US")} characters. A longer text is refused, never cut.`;

/** SUB-02 R2 [P]: mistakes are part of what is marked. */
export const TEXT_KEPT_AS_WRITTEN_NOTICE = "Your text is sent exactly as you wrote it: nothing is corrected.";

/** A3 [D]: the student does not read their text again after sending it. */
export const NO_READ_BACK_NOTICE = "Once you submit, your text is not shown to you again.";

/** A3 [D]: said again after sending. */
export const SUBMITTED_NO_READ_BACK_NOTICE = "Your text is not shown to you again.";
