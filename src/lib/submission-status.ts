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
