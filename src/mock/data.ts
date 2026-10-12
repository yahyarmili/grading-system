// Fictitious data for the navigation skeleton (step 1.2).
// No real people. Replaced by the database from E1 onwards.

import type { StudentStatus } from "@/lib/submission-status";

export type MockUser = { name: string; email: string };

export const mockUsers = {
  teacher: { name: "Sarah Bennett", email: "s.bennett@example.test" },
  student: { name: "Adam Rami", email: "adam.rami@example.test" },
  admin: { name: "Site Admin", email: "admin@example.test" },
} satisfies Record<string, MockUser>;

/** Students counts of Grade 10 classes come from the roster (assignment-submissions.ts). */
export const mockTeacherClasses: { id: string; name: string; students?: number }[] = [
  { id: "c1", name: "Grade 10 — A" },
  { id: "c2", name: "Grade 10 — B" },
  { id: "c3", name: "Grade 11 — Literature", students: 19 },
];

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

export const mockStudentClasses = [
  { id: "c1", name: "Grade 10 — A", teacher: "Sarah Bennett" },
  { id: "c2", name: "Grade 10 — B", teacher: "Sarah Bennett" },
  { id: "c4", name: "French — Group 2", teacher: "Karim Alaoui" },
];

export const mockTeachers = [
  { id: "t1", name: "Sarah Bennett", email: "s.bennett@example.test" },
  { id: "t2", name: "Karim Alaoui", email: "k.alaoui@example.test" },
  { id: "t3", name: "Lina Haddad", email: "l.haddad@example.test" },
];
