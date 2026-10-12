// Fictitious data for the navigation skeleton (step 1.2).
// No real people. Replaced by the database from E1 onwards.

export type MockUser = { name: string; email: string };

export const mockUsers = {
  teacher: { name: "Sarah Bennett", email: "s.bennett@example.test" },
  student: { name: "Adam Rami", email: "adam.rami@example.test" },
  admin: { name: "Site Admin", email: "admin@example.test" },
} satisfies Record<string, MockUser>;

export const mockTeacherClasses = [
  { id: "c1", name: "Grade 10 — A", students: 28 },
  { id: "c2", name: "Grade 10 — B", students: 26 },
  { id: "c3", name: "Grade 11 — Literature", students: 19 },
];

export const mockTeacherAssignments = [
  { id: "a1", title: "My last holiday", className: "Grade 10 — A, Grade 10 — B", due: "Oct 20" },
  { id: "a2", title: "A letter to a friend", className: "Grade 10 — B", due: "Oct 27" },
];

export const mockStudentAssignments = [
  { id: "a1", title: "My last holiday", className: "Grade 10 — A", due: "Oct 20" },
  { id: "a3", title: "Describe your town", className: "French — Group 2", due: "Nov 3" },
];

export const mockStudentClasses = [
  { id: "c1", name: "Grade 10 — A", teacher: "Sarah Bennett" },
  { id: "c4", name: "French — Group 2", teacher: "Karim Alaoui" },
];

export const mockTeachers = [
  { id: "t1", name: "Sarah Bennett", email: "s.bennett@example.test" },
  { id: "t2", name: "Karim Alaoui", email: "k.alaoui@example.test" },
  { id: "t3", name: "Lina Haddad", email: "l.haddad@example.test" },
];
