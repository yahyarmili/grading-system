import { GRADE_SCALE, SUBMISSION_MAX_REPLACEMENTS, SUBMISSION_TEXT_MAX_LENGTH } from "@/config/decisions";

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

/** Shown where a value depends on a decision not taken yet (QNF-1, QNF-4). */
export const TO_BE_DEFINED = "To be defined.";

/**
 * NFR-DON-04 [P]: what the student reads before their first submission.
 * Its reading is recorded with `version`: change the text, raise the version,
 * and every student reads it again before their next first submission (a
 * replacement does not ask again). No promise that their name is not sent
 * (Q10 [D]): a name written in the text goes with it. The data controller,
 * retention and contact wait for QNF-1 and QNF-4.
 * Version 2: the Mistral training opt-out is done and Labs models stay off
 * (stack-technologique.md §3). If either setting changes, change the sentence
 * and raise the version.
 */
export const STUDENT_NOTICE = {
  version: 2,
  title: "Before your first submission: your data",
  demonstration:
    "This is a demonstration with fictitious data. Do not submit real personal information or a real student's work.",
  sections: [
    { heading: "Who is responsible for your data", body: [TO_BE_DEFINED] },
    {
      heading: "Why it is used",
      body: ["To let your teacher mark your writing. An AI suggests a marking; your teacher checks it, changes it if needed, and decides."],
    },
    {
      heading: "What is sent to an AI",
      body: [
        "Your text, the assignment's subject, instructions and language, and the marking rubric are sent to Mistral AI, an outside AI service based outside Morocco.",
        "The app does not add your name, email or class. But everything written in your text is sent as it is: if you write your name in it, your name is sent too.",
        "The app's account with this service is set so that what it receives is not used to train its models.",
      ],
    },
    {
      heading: "What your teacher sees",
      body: ["Your first name, last name, email and class, your text, when you submitted it and whether it was late."],
    },
    { heading: "How long it is kept", body: [TO_BE_DEFINED] },
    {
      heading: "Your rights",
      body: [`You can ask to see your data and to have it corrected. Who to contact: ${TO_BE_DEFINED.toLowerCase()}`],
    },
  ],
  acknowledge: "I have read this notice",
} as const;

/** SUB-05, Q3 [D, 2026-10-15]: replacements left, until the teacher's first change or validation. */
export const replacementsLeftNotice = (left: number) =>
  `You can replace your text ${left === 1 ? "once more" : `${left} more times`}, until your teacher starts marking it. Your teacher marks the last text you sent.`;

/** SUB-04 R2 [P]: a replacement keeps the first date and the late mark. */
export const REPLACEMENT_KEEPS_DATE_NOTICE = "The date of your first submission stays, and so does a late mark.";

/** Q3 [D]: no replacement left. */
export const NO_REPLACEMENT_LEFT_NOTICE = `You have replaced this submission ${SUBMISSION_MAX_REPLACEMENTS} times, the most allowed. It can no longer be replaced.`;

/** SUB-05 R3: the teacher started, or the student left the class. */
export const REPLACEMENT_CLOSED_NOTICE = "This submission can no longer be replaced.";

/** EVL-01 R1 [D], invariant 8: one rubric, the same for everyone, changed by nobody. */
export const RUBRIC_FIXED_NOTICE =
  "Every assignment is marked on these five criteria, by every teacher. Teachers and students cannot change this rubric.";

/** Q1 [D, 2026-10-15], EVL-01 R3: the grade rule, shown with the rubric. */
export const GRADE_RULE = {
  title: `Grade out of ${GRADE_SCALE}`,
  body: `Each criterion gets a level from 0 to 4. The grade is the sum of the five levels, from 0 (all at 0) to ${GRADE_SCALE} (all at 4), calculated by the app, never by the AI. The teacher may set a different final grade; it is then shown as adjusted.`,
};

/** Q6 [D, 2026-10-15], EVL-01 R4: no AI proposal in French until the French rubric is validated. */
export const FRENCH_RUBRIC_PENDING_NOTICE = {
  title: "French version not validated yet",
  body: "French assignments use the same criteria, but their French wording is still to be validated. Until it is, the AI makes no proposal for a French assignment: the teacher marks it without one.",
};
