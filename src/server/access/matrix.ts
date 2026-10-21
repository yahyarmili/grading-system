/**
 * Access matrix of conception/fonctionnalites.md §5.4, as data: resource ×
 * column (role, and whether the resource is the actor's own) → actions.
 * authorize() (policy.ts) reads it and nothing else; the tests replay every
 * refused cell. A new resource gets its row here before any data function.
 */

export const ACTIONS = ["read", "write"] as const;
export type Action = (typeof ACTIONS)[number];

/** The columns of §5.4. "concerned"/"owner": the resource is the actor's own. */
export const COLUMNS = [
  "concernedStudent",
  "otherStudent",
  "ownerTeacher",
  "otherTeacher",
  "admin",
  "visitor",
] as const;
export type Column = (typeof COLUMNS)[number];

export type MatrixRow = { label: string } & Record<Column, readonly Action[]>;

const L = ["read"] as const;
const W = ["write"] as const;
const LW = ["read", "write"] as const;
/** "—" in §5.4: refused, and replayed by a negative test. */
const NO = [] as const;

export const ACCESS_MATRIX = {
  studentAccount: {
    label: "Student account (name, first name, email)",
    // Teacher: students of their classes only.
    concernedStudent: LW, otherStudent: NO, ownerTeacher: L, otherTeacher: NO, admin: NO, visitor: NO,
  },
  teacherAccount: {
    label: "Teacher account",
    // Administrator: through the invitation only (row below).
    concernedStudent: NO, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: W, visitor: NO,
  },
  teacherInvitation: {
    // [P] Detail of "Teacher account / Administrator: É (invitation)". Reading
    // the list (AUTH-03 R4, prompt E1.5) is not in §5.4: to confirm (T5).
    label: "Teacher invitation",
    concernedStudent: NO, otherStudent: NO, ownerTeacher: NO, otherTeacher: NO, admin: LW, visitor: NO,
  },
  class: {
    // §5.4 "Class, link, code, list of students", split [P]: the link and code in classInvite.
    label: "Class",
    // Student: their classes with an active membership, without the list of students (CLS-04).
    concernedStudent: L, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  classInvite: {
    // [P] Detail of "Class, link, code": a student who joined sees the class,
    // never its link or code; joining goes through the code, not this row.
    label: "Class invitation link and code",
    concernedStudent: NO, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  classMembership: {
    // [P] The student's own membership: joining by link or code (CLS-03).
    // The teacher reads and changes memberships through classRoster (CLS-04).
    label: "Own class membership (join)",
    concernedStudent: W, otherStudent: NO, ownerTeacher: NO, otherTeacher: NO, admin: NO, visitor: NO,
  },
  classRoster: {
    // [P] Detail of "list of students": first name, last name and email of the
    // class's students (invariant 9); writing removes and readmits (CLS-04).
    label: "Class list of students",
    concernedStudent: NO, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  assignment: {
    label: "Assignment",
    // Student: assignments sent to a class where their membership is active
    // (received by derivation [D]), or, from E4, with a submission of theirs.
    // Teacher: writes per locking (ASG-03), guarded in the write statement.
    concernedStudent: L, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  assignmentRecipients: {
    // [P] Detail of "Assignment": the classes it is sent to (Envoi, ASG-01 R3).
    // Chosen at creation only. The student never sees them: an assignment
    // sent to two of their classes is one assignment.
    label: "Assignment recipient classes",
    concernedStudent: NO, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  ownSubmissionStatus: {
    // [P] What the student reads of their own submission: its status in the
    // closed list of SUB-01 R3 (toStudentStatus), never the submission itself
    // (no read on "submission"). The teacher reads the internal status through "submission".
    label: "Own submission: status in the closed list (SUB-01 R3), late flag, dates, replacements left; never the text",
    concernedStudent: L, otherStudent: NO, ownerTeacher: NO, otherTeacher: NO, admin: NO, visitor: NO,
  },
  noticeAcknowledgement: {
    // [P] NFR-DON-04: the student's own reading of the notice before the
    // first submission (account, date, version); written once read.
    label: "Own reading of a notice (NFR-DON-04)",
    concernedStudent: LW, otherStudent: NO, ownerTeacher: NO, otherTeacher: NO, admin: NO, visitor: NO,
  },
  submission: {
    label: "Submission and images",
    // Student: replaces their own (SUB-05), never reads it back. Teacher [P]:
    // reads the copies of their assignments, among them those offered for a
    // relaunch (listRelaunchable, PRC-02 R4, E6.3).
    concernedStudent: W, otherStudent: NO, ownerTeacher: L, otherTeacher: NO, admin: NO, visitor: NO,
  },
  transcription: {
    label: "Transcription",
    concernedStudent: NO, otherStudent: NO, ownerTeacher: L, otherTeacher: NO, admin: NO, visitor: NO,
  },
  aiProposal: {
    label: "AI proposal and alerts",
    // Written by the system alone, never by a role (inventory.ts): the
    // evaluation runs, the proposals and their alerts. Never changed (0011).
    concernedStudent: NO, otherStudent: NO, ownerTeacher: L, otherTeacher: NO, admin: NO, visitor: NO,
  },
  unpublishedEvaluation: {
    label: "Unpublished evaluation",
    // [P] E6.3, PRC-02 R3: the retry (transition 6), the relaunch (7) and the
    // manual evaluation (6 or 7 to to_review) write the evaluation in progress.
    // E7, REV-03: the teacher's own evaluation (teacher_evaluations), apart
    // from the AI proposal, written with its log entries.
    concernedStudent: NO, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  publishedEvaluation: {
    label: "Published evaluation (grade, levels, remarks, comment, next steps)",
    // Teacher: writes to withdraw the publication.
    concernedStudent: L, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  reviewLog: {
    label: "Log (of the teacher's own copies)",
    // E7, REV-04 R3: review_journal_entries. Read by the corrector only; written
    // by no role directly, only as the trace of their acts; never changed (0017).
    concernedStudent: NO, otherStudent: NO, ownerTeacher: L, otherTeacher: NO, admin: NO, visitor: NO,
  },
  rubric: {
    label: "Rubric",
    // Read-only for everyone (invariant 8); not owned by anyone. Its versions
    // live in the code (src/lib/rubric.ts), in no table: nothing can write it.
    concernedStudent: L, otherStudent: L, ownerTeacher: L, otherTeacher: L, admin: L, visitor: NO,
  },
} as const satisfies Record<string, MatrixRow>;

export type Resource = keyof typeof ACCESS_MATRIX;
export const RESOURCES = Object.keys(ACCESS_MATRIX) as Resource[];
