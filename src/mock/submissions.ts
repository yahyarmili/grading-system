// Fictitious submissions for the /dev/design showcase. No real people.

import { submissionStatuses, type SubmissionStatus } from "@/lib/submission-status";

export type MockSubmission = {
  id: string;
  student: string;
  assignment: string;
  submittedAt: string | null; // ISO date, null when not submitted
  status: SubmissionStatus;
  late: boolean;
  cause?: string; // for not_assessable
};

const firstNames = ["Adam", "Salma", "Youssef", "Nora", "Ilyas", "Hiba", "Omar", "Lina", "Rayan", "Aya", "Mehdi"];
const lastNames = ["Rami", "Bennani", "Tazi", "Idrissi", "Chraibi", "Alami", "Fassi", "Berrada"];
const assignments = ["My last holiday", "A letter to a friend", "Describe your town"];
const causes = ["No readable writing", "French rubric not validated"];

export const mockSubmissions: MockSubmission[] = Array.from({ length: 34 }, (_, i) => {
  const status = submissionStatuses[(i * 7) % submissionStatuses.length];
  const day = 10 + (i % 18);
  return {
    id: `s${i + 1}`,
    student: `${firstNames[i % firstNames.length]} ${lastNames[(i * 3) % lastNames.length]}`,
    assignment: assignments[i % assignments.length],
    submittedAt: status === "to_submit" ? null : `2026-10-${String(day).padStart(2, "0")}`,
    status,
    late: status !== "to_submit" && day > 22,
    cause: status === "not_assessable" ? causes[i % causes.length] : undefined,
  };
});
