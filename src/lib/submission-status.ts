// Submission states, from conception/fonctionnalites.md §5.5.
// Internal states are seen by the teacher; the student sees a closed list of three.

export const submissionStatuses = [
  "to_submit",
  "received",
  "transcribing",
  "transcription_failed",
  "evaluating",
  "evaluation_failed",
  "not_assessable",
  "to_review",
  "validated",
  "published",
] as const;

export type SubmissionStatus = (typeof submissionStatuses)[number];

/**
 * The states a submission row can hold: "to submit" is the absence of a row,
 * and transition 1 is its insertion.
 */
export const storedSubmissionStatuses = [
  "received",
  "transcribing",
  "transcription_failed",
  "evaluating",
  "evaluation_failed",
  "not_assessable",
  "to_review",
  "validated",
  "published",
] as const satisfies readonly SubmissionStatus[];

export type StoredSubmissionStatus = (typeof storedSubmissionStatuses)[number];

/** SUB-02 R3: a version is text OR page images, never both. */
export const submissionModes = ["text", "images"] as const;
export type SubmissionMode = (typeof submissionModes)[number];

export type TransitionId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type Transition = {
  id: TransitionId;
  by: "student" | "system" | "teacher";
  from: SubmissionStatus;
  to: StoredSubmissionStatus;
};

const edges = (
  id: TransitionId,
  by: Transition["by"],
  from: readonly SubmissionStatus[],
  to: readonly StoredSubmissionStatus[],
): Transition[] => from.flatMap((f) => to.map((t) => ({ id, by, from: f, to: t })));

/**
 * The transition table of §5.5, the only one: any move outside it is refused
 * (applyTransition, src/server/data/submissions/transitions.ts).
 */
export const TRANSITIONS: readonly Transition[] = [
  // The student submits (SUB-02, SUB-03).
  ...edges(1, "student", ["to_submit"], ["received"]),
  // Automatic processing (PRC-01): an image is transcribed first.
  ...edges(2, "system", ["received"], ["transcribing", "evaluating"]),
  ...edges(3, "system", ["transcribing"], ["evaluating", "transcription_failed", "not_assessable"]),
  // Retry by the teacher, or manual evaluation (REV-06).
  ...edges(4, "teacher", ["transcription_failed"], ["transcribing", "to_review"]),
  ...edges(5, "system", ["evaluating"], ["to_review", "evaluation_failed", "not_assessable"]),
  ...edges(6, "teacher", ["evaluation_failed"], ["evaluating", "to_review"]),
  ...edges(7, "teacher", ["not_assessable"], ["to_review", "evaluating"]),
  ...edges(8, "teacher", ["to_review"], ["validated"]),
  // "Published" only from "Validated"; "validate and publish" chains 8 and 9 (D6).
  ...edges(9, "teacher", ["validated"], ["published"]),
  // Withdrawal of the publication (PUB-01); change of the evaluation (REV-03, Q8).
  ...edges(10, "teacher", ["published"], ["validated"]),
  ...edges(10, "teacher", ["validated", "published"], ["to_review"]),
  // The student replaces their submission (SUB-05) while the teacher has neither changed nor validated it.
  ...edges(
    11,
    "student",
    ["received", "transcribing", "transcription_failed", "evaluating", "evaluation_failed", "not_assessable", "to_review"],
    ["received"],
  ),
];

/**
 * PRC-02 R3: the failed states the teacher's "Retry" starts from:
 * evaluation_failed (transition 6), transcription_failed (transition 4, E9,
 * the pages read again, then evaluated).
 */
export const retriedStatuses = ["evaluation_failed", "transcription_failed"] as const satisfies readonly StoredSubmissionStatus[];

/** REV-06: the states a manual evaluation starts from (transitions 6, 7 and, E9, 4). */
export const manualStartStatuses = ["evaluation_failed", "not_assessable", "transcription_failed"] as const satisfies readonly StoredSubmissionStatus[];

/** Whether `status` is one of `statuses`, for the lists above. */
export const isOneOf = (statuses: readonly SubmissionStatus[], status: SubmissionStatus): boolean => statuses.includes(status);

/** A call naming a move the table does not have: a bug, never a user's doing. */
export class InvalidTransitionError extends Error {
  constructor(id: TransitionId, to: StoredSubmissionStatus) {
    super(`Transition ${id} never reaches "${to}"`);
    this.name = "InvalidTransitionError";
  }
}

/** Whether the table has this move under this transition. */
export function canTransition(id: TransitionId, from: SubmissionStatus, to: SubmissionStatus): boolean {
  return TRANSITIONS.some((t) => t.id === id && t.from === from && t.to === to);
}

/** The stored states transition `id` may leave to reach `to`: the guard of the write statement. */
export function sourcesOf(id: TransitionId, to: StoredSubmissionStatus): StoredSubmissionStatus[] {
  return TRANSITIONS.filter((t) => t.id === id && t.to === to)
    .map((t) => t.from)
    .filter((from): from is StoredSubmissionStatus => from !== "to_submit");
}

/** Cross-cutting flag (D8): submitted after the deadline. */
export type LateFlag = boolean;

export const statusLabels: Record<SubmissionStatus, string> = {
  to_submit: "To submit",
  received: "Received",
  transcribing: "Transcribing",
  transcription_failed: "Transcription failed",
  evaluating: "Evaluating",
  evaluation_failed: "Evaluation failed",
  not_assessable: "Not assessable",
  to_review: "To review",
  validated: "Validated",
  published: "Published",
};

export const studentStatuses = ["to_submit", "being_marked", "marked"] as const;
export type StudentStatus = (typeof studentStatuses)[number];

export const studentStatusLabels: Record<StudentStatus, string> = {
  to_submit: "To submit",
  being_marked: "Submitted, being marked",
  marked: "Marked, result available",
};

/** No technical state reaches the student: everything between received and validated is "being marked". */
export function toStudentStatus(status: SubmissionStatus): StudentStatus {
  if (status === "to_submit") return "to_submit";
  if (status === "published") return "marked";
  return "being_marked";
}
