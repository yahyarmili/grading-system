// Fictitious data for the navigation skeleton (step 1.2).
// No real people. Replaced by the database from E1 onwards.

import type { StudentStatus } from "@/lib/submission-status";

/** The student's view: "Adam Rami", in two of Sarah Bennett's classes and one of Karim Alaoui's. */
export const mockStudentAssignments: {
  id: string;
  title: string;
  className: string;
  due: string; // ISO date
  status: StudentStatus;
  late: boolean;
}[] = [
  { id: "a2", title: "A letter to a friend", className: "Grade 10 — B", due: "2026-10-27", status: "to_submit", late: false },
  { id: "a3", title: "Describe your town", className: "French — Group 2", due: "2026-11-03", status: "to_submit", late: false },
  { id: "a1", title: "My last holiday", className: "Grade 10 — A, Grade 10 — B", due: "2026-10-20", status: "being_marked", late: false },
  { id: "a4", title: "Mon quartier", className: "French — Group 2", due: "2026-10-06", status: "marked", late: true },
];
