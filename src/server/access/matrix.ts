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
    label: "Class, link, code, list of students",
    // Student: their classes with an active membership, without the list of students (CLS-04).
    concernedStudent: L, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  assignment: {
    label: "Assignment",
    // Student: assignments of their classes, or with a submission. Teacher: writes per locking (ASG-03).
    concernedStudent: L, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  submission: {
    label: "Submission and images",
    // Student: replaces their own (SUB-05), never reads it back.
    concernedStudent: W, otherStudent: NO, ownerTeacher: L, otherTeacher: NO, admin: NO, visitor: NO,
  },
  transcription: {
    label: "Transcription",
    concernedStudent: NO, otherStudent: NO, ownerTeacher: L, otherTeacher: NO, admin: NO, visitor: NO,
  },
  aiProposal: {
    label: "AI proposal and alerts",
    concernedStudent: NO, otherStudent: NO, ownerTeacher: L, otherTeacher: NO, admin: NO, visitor: NO,
  },
  unpublishedEvaluation: {
    label: "Unpublished evaluation",
    concernedStudent: NO, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  publishedEvaluation: {
    label: "Published evaluation (grade, levels, remarks, comment, next steps)",
    // Teacher: writes to withdraw the publication.
    concernedStudent: L, otherStudent: NO, ownerTeacher: LW, otherTeacher: NO, admin: NO, visitor: NO,
  },
  reviewLog: {
    label: "Log (of the teacher's own copies)",
    concernedStudent: NO, otherStudent: NO, ownerTeacher: L, otherTeacher: NO, admin: NO, visitor: NO,
  },
  rubric: {
    label: "Rubric",
    // Read-only for everyone (invariant 8); not owned by anyone.
    concernedStudent: L, otherStudent: L, ownerTeacher: L, otherTeacher: L, admin: L, visitor: NO,
  },
} as const satisfies Record<string, MatrixRow>;

export type Resource = keyof typeof ACCESS_MATRIX;
export const RESOURCES = Object.keys(ACCESS_MATRIX) as Resource[];
