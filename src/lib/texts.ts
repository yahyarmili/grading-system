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

/** SUB-01 R2 [D, 2026-10-22] (revises A3): the student reads their submission back after sending it. */
export const READ_BACK_NOTICE = "After you submit, you can read your text here, as you sent it.";

/** Shown where a value depends on a decision not taken yet (QNF-1, QNF-4). */
export const TO_BE_DEFINED = "To be defined.";

/**
 * NFR-DON-04 [P]: what the student reads before their first submission.
 * Its reading is recorded with `version`: change the text, raise the version,
 * and every student reads it again before their next first submission (a
 * replacement does not ask again). No promise that their name is not sent
 * (Q10 [D]): a name written in the text goes with it. The data controller,
 * retention and contact wait for QNF-1 and QNF-4.
 * Version 4 (E5.15, 2026-10-19): Anthropic instead of OpenRouter. Each
 * sentence rests on the DON-02 sheet read that day (stack-technologique.md
 * §3): a company of the United States; inference_geo "us" asked at each call
 * and the workspace's region the United States, so processed and stored there;
 * no training on API data by default, the account in no partner programme and
 * with feedback off (Console); inputs and outputs deleted within 30 days
 * (Console: "On · 30 days", no zero retention), content flagged by the safety
 * systems kept up to 2 years. Said as Anthropic's word, which the app cannot
 * check. Nothing on images (E9). A change of provider, of these pages or of
 * the Console: change the sentence, raise the version.
 */
export const STUDENT_NOTICE = {
  version: 4,
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
        "Your text, the assignment's subject, instructions and language, and the marking rubric are sent to Anthropic, a company based in the United States, which runs the AI model. They are processed and stored in the United States.",
        "The app does not add your name, email or class. But everything written in your text is sent as it is: if you write your name in it, your name is sent too.",
        "Anthropic says it does not use them to train its models, unless the account agrees to it or sends feedback; the app's account does neither.",
        "Anthropic says it deletes them within 30 days. A text that its safety systems flag may be kept for up to 2 years. The app cannot check this itself.",
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

/**
 * NFR-DON-04, REV-04 (E7.7) [P]: the teacher reads it before their first
 * access to copies. Frozen under its version (tests/teacher-notice.test.ts):
 * any change of the text needs a new version, read again.
 */
export const TEACHER_NOTICE = {
  // v2 [P, E8.1, 2026-10-22]: validations, publications, withdrawals and manual evaluations; how long the log is kept.
  version: 2,
  title: "Before you review copies: what the review log records",
  sections: [
    {
      heading: "What is recorded",
      body: [
        "When you open an assignment's submissions and a student's copy, every change you make to an evaluation (old and new value), your retries and relaunches, your validations (without or after changes), your publications and their withdrawals, and the copies you evaluate by hand, without an AI proposal. Each entry has its author and date.",
        "The AI proposal is kept unchanged beside your evaluation.",
      ],
    },
    {
      heading: "What it measures",
      body: [
        "Your review time, from the times you open and validate a copy.",
        "How close your final evaluation is to the AI proposal.",
      ],
    },
    {
      heading: "Who reads it",
      body: [
        "You, on your own copies, under History. Students never see it. The project team reads it, without names, to measure the review time and the closeness to the AI.",
        "No one can change or delete an entry, you included.",
        "How long the log is kept is not decided yet. This notice will say it, and ask you to read it again.",
      ],
    },
    {
      heading: "Its limit",
      body: [
        "Closeness to the AI proposal does not tell whether you agreed because the AI was right, or because its proposal influenced you.",
      ],
    },
  ],
  acknowledge: "I have read this notice",
} as const;

/**
 * Q6 (E8 plan §3, [D, 2026-10-22]) [P] wording: a manual evaluation of an
 * assignment whose language has no validated rubric (French) is entered on
 * the English one, en-1, recorded with it; shown to the teacher, and to the
 * student with the result (E8.3).
 */
export const MANUAL_RUBRIC_SUBSTITUTE_NOTICE =
  "The rubric for this language is not validated yet: these are the criteria of the English rubric (en-1).";

/**
 * PUB-02, Q5 [D, 2026-10-15]: the AI is mentioned to the student, on a result
 * prepared from its proposal. [P] wording, to be confirmed with the legal
 * framework (QNF-1). Not said on a result marked by hand.
 */
export const RESULT_AI_MENTION =
  "Your teacher prepared this feedback with the help of an AI tool, then reviewed and published it.";

/** PUB-02 [P]: said on every result, the one line of a result marked by hand. */
export const RESULT_MARKED_BY_TEACHER = "Marked and published by your teacher.";

/** Q5 [D, 2026-10-15]: the grade differs from the sum of the levels; no reason given. */
export const GRADE_ADJUSTED_NOTICE = "Grade adjusted by your teacher";

/** Q6 [D, 2026-10-22] [P] wording: the student's side of MANUAL_RUBRIC_SUBSTITUTE_NOTICE. */
export const RESULT_RUBRIC_SUBSTITUTE_NOTICE =
  "The rubric for this language is not validated yet: your text was marked on the criteria of the English rubric (en-1).";

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
