// Fictitious data for the submissions list mockup (REV-01). No real people.

import type { SubmissionStatus } from "@/lib/submission-status";

export type MockAssignment = {
  id: string;
  title: string;
  language: "English" | "French";
  classes: string[];
  due: string; // ISO date
};

export type SubmissionRow = {
  id: string;
  lastName: string;
  firstName: string;
  classes: string[];
  removedFromClass: boolean;
  status: SubmissionStatus;
  late: boolean;
  mode: "text" | "image" | null; // null when not submitted
  submittedAt: string | null; // active version, ISO date
  /** Grade set by the teacher; final for sorting. */
  teacherGrade: number | null;
  /** Grade calculated from the AI proposal; shown as provisional when no teacher grade. */
  proposedGrade: number | null;
  cause?: string; // not assessable
};

export const mockAssignment: MockAssignment = {
  id: "a1",
  title: "My last holiday",
  language: "English",
  classes: ["Grade 10 — A", "Grade 10 — B"],
  due: "2026-10-20",
};

const A = "Grade 10 — A";
const B = "Grade 10 — B";

// [last name, first name, classes, status, mode, submitted day of Oct, teacher grade, proposed grade]
type Seed = [string, string, string[], SubmissionStatus, "t" | "i" | null, number | null, number | null, number | null];

const seeds: Seed[] = [
  ["Martin", "Émile", [A], "to_review", "t", 14, null, 13.5],
  ["Martin", "Eric", [B], "to_review", "i", 19, null, 11],
  ["d'Aubigné", "Claire", [A], "validated", "t", 13, 16, 15],
  ["Dubois", "eric", [B], "published", "t", 12, 12.5, 12.5],
  ["Élie", "Sarah", [A], "to_review", "t", 21, null, 9.5],
  ["Alaoui", "Yasmine", [B], "to_submit", null, null, null, null],
  ["Bennani", "Omar", [A], "evaluating", "t", 22, null, null],
  ["Berrada", "Hiba", [B], "to_review", "i", 18, 15, 14],
  ["Chraibi", "Ilyas", [A], "transcription_failed", "i", 17, null, null],
  ["El Amrani", "Salma", [B], "validated", "t", 15, 17.5, 17.5],
  ["Fassi", "Mehdi", [A], "to_submit", null, null, null, null],
  ["Idrissi", "Nora", [B], "published", "i", 14, 10, 11.5],
  ["Tazi", "Youssef", [A], "not_assessable", "i", 16, null, null],
  ["Rami", "Adam", [A, B], "to_review", "t", 20, null, 12],
  ["Lambert", "Émilie", [B], "transcribing", "i", 23, null, null],
  ["Leroy", "Lucas", [A], "to_review", "t", 15, null, 8], // removed from class, still listed
  ["Moreau", "Inès", [B], "validated", "i", 13, 14, 13],
  ["Ouazzani", "Rayan", [A], "received", "i", 23, null, null],
  ["Petit", "Chloé", [B], "to_submit", null, null, null, null],
  ["Roux", "Hugo", [A], "evaluation_failed", "t", 19, null, null],
  ["Saidi", "Aya", [B], "to_review", "t", 16, null, 16.5],
  ["Benjelloun", "Karim", [A], "published", "t", 12, 13, 13],
  ["Kettani", "Lina", [B], "to_review", "i", 18, null, 10.5],
  ["Lahlou", "Zineb", [A], "to_submit", null, null, null, null],
  ["Naciri", "Amine", [B], "transcription_failed", "i", 21, null, null],
  ["Sefrioui", "Rim", [A], "validated", "t", 14, 11, 12],
  ["Zniber", "Othmane", [B], "to_review", "t", 17, null, 14.5],
  ["Garnier", "Léa", [A], "evaluating", "t", 20, null, null],
  ["Faure", "Nathan", [B], "to_submit", null, null, null, null],
  ["Girard", "Manon", [A], "published", "i", 13, 18, 17],
  ["Bonnet", "Louis", [B], "to_review", "t", 19, null, 7.5],
  ["Mercier", "Jade", [A], "not_assessable", "t", 18, null, null],
  ["Blanc", "Gabriel", [B], "validated", "t", 16, 9, 9],
  ["Guérin", "Camille", [A], "to_review", "i", 22, null, 13],
  ["Muller", "Tom", [B], "received", "t", 23, null, null],
  ["André", "Zoé", [A], "transcribing", "i", 22, null, null],
  ["Benali", "Ismail", [B], "to_submit", null, null, null, null],
  ["Cherkaoui", "Sofia", [A], "published", "t", 11, 15.5, 15.5],
  ["Amrani", "Walid", [B], "validated", "i", 15, 12, 11],
  ["de Villiers", "Anne", [A], "to_review", "t", 17, 13, 12.5],
];

const causes: Record<string, string> = {
  Tazi: "No readable writing",
  Mercier: "No assessable content",
};

const dueDay = Number(mockAssignment.due.slice(-2));

export const mockAssignmentSubmissions: SubmissionRow[] = seeds.map(
  ([lastName, firstName, classes, status, mode, day, teacherGrade, proposedGrade], i) => ({
    id: `r${i + 1}`,
    lastName,
    firstName,
    classes,
    removedFromClass: lastName === "Leroy",
    status,
    late: day !== null && day > dueDay,
    mode: mode === "t" ? "text" : mode === "i" ? "image" : null,
    submittedAt: day === null ? null : `2026-10-${String(day).padStart(2, "0")}`,
    teacherGrade,
    proposedGrade,
    cause: causes[lastName],
  }),
);
