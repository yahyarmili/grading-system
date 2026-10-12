// Fictitious data for the submissions list and copy screen mockups (REV-01, REV-02). No real people.

import { calculateGrade } from "@/lib/grade";
import type { SubmissionStatus } from "@/lib/submission-status";
import { copyTemplates, type CopyTemplate } from "./copies";

export type MockAssignment = {
  id: string;
  title: string;
  language: "English" | "French";
  classes: string[];
  due: string; // ISO date
  instructions: string;
};

export type SubmissionRow = {
  id: string;
  lastName: string;
  firstName: string;
  email: string;
  classes: string[];
  removedFromClass: boolean;
  status: SubmissionStatus;
  late: boolean;
  mode: "text" | "image" | null; // null when not submitted
  submittedAt: string | null; // active version, ISO date
  /** Grade set by the teacher; final for sorting. */
  teacherGrade: number | null;
  /** Grade calculated from the AI proposal levels; shown as provisional when no teacher grade. */
  proposedGrade: number | null;
  /** Index into copyTemplates; null when there is no text yet. */
  copy: number | null;
  /** Whether an AI proposal exists for the active version. */
  hasProposal: boolean;
  cause?: string; // not assessable
};

export const mockAssignment: MockAssignment = {
  id: "a1",
  title: "My last holiday",
  language: "English",
  classes: ["Grade 10 — A", "Grade 10 — B"],
  due: "2026-10-20",
  instructions: "Write 150 to 200 words about your last holiday. Say where you went, what you did and why it mattered to you.",
};

const A = "Grade 10 — A";
const B = "Grade 10 — B";

// [last name, first name, classes, status, mode, submitted day of Oct, teacher grade, copy template]
type Seed = [string, string, string[], SubmissionStatus, "t" | "i" | null, number | null, number | null, number | null];

const seeds: Seed[] = [
  ["Martin", "Émile", [A], "to_review", "t", 14, null, 0],
  ["Martin", "Eric", [B], "to_review", "i", 19, null, 4],
  ["d'Aubigné", "Claire", [A], "validated", "t", 13, 16, 2],
  ["Dubois", "eric", [B], "published", "t", 12, 12.5, 0],
  ["Élie", "Sarah", [A], "to_review", "t", 21, null, 3],
  ["Alaoui", "Yasmine", [B], "to_submit", null, null, null, null],
  ["Bennani", "Omar", [A], "evaluating", "t", 22, null, 1],
  ["Berrada", "Hiba", [B], "to_review", "i", 18, 15, 4],
  ["Chraibi", "Ilyas", [A], "transcription_failed", "i", 17, null, null],
  ["El Amrani", "Salma", [B], "validated", "t", 15, 17.5, 2],
  ["Fassi", "Mehdi", [A], "to_submit", null, null, null, null],
  ["Idrissi", "Nora", [B], "published", "i", 14, 10, 1],
  ["Tazi", "Youssef", [A], "not_assessable", "i", 16, null, null],
  ["Rami", "Adam", [A, B], "to_review", "t", 20, null, 1],
  ["Lambert", "Émilie", [B], "transcribing", "i", 23, null, null],
  ["Leroy", "Lucas", [A], "to_review", "t", 15, null, 3], // removed from class, still listed
  ["Moreau", "Inès", [B], "validated", "i", 13, 14, 0],
  ["Ouazzani", "Rayan", [A], "received", "i", 23, null, null],
  ["Petit", "Chloé", [B], "to_submit", null, null, null, null],
  ["Roux", "Hugo", [A], "evaluation_failed", "t", 19, null, 1],
  ["Saidi", "Aya", [B], "to_review", "t", 16, null, 2],
  ["Benjelloun", "Karim", [A], "published", "t", 12, 13, 4],
  ["Kettani", "Lina", [B], "to_review", "i", 18, null, 1],
  ["Lahlou", "Zineb", [A], "to_submit", null, null, null, null],
  ["Naciri", "Amine", [B], "transcription_failed", "i", 21, null, null],
  ["Sefrioui", "Rim", [A], "validated", "t", 14, 11, 4],
  ["Zniber", "Othmane", [B], "to_review", "t", 17, null, 0],
  ["Garnier", "Léa", [A], "evaluating", "t", 20, null, 2],
  ["Faure", "Nathan", [B], "to_submit", null, null, null, null],
  ["Girard", "Manon", [A], "published", "i", 13, 18, 2],
  ["Bonnet", "Louis", [B], "to_review", "t", 19, null, 3],
  ["Mercier", "Jade", [A], "not_assessable", "t", 18, null, null],
  ["Blanc", "Gabriel", [B], "validated", "t", 16, 9, 3],
  ["Guérin", "Camille", [A], "to_review", "i", 22, null, 4],
  ["Muller", "Tom", [B], "received", "t", 23, null, 0],
  ["André", "Zoé", [A], "transcribing", "i", 22, null, null],
  ["Benali", "Ismail", [B], "to_submit", null, null, null, null],
  ["Cherkaoui", "Sofia", [A], "published", "t", 11, 15.5, 2],
  ["Amrani", "Walid", [B], "validated", "i", 15, 12, 1],
  ["de Villiers", "Anne", [A], "to_review", "t", 17, 13, 0],
];

const causes: Record<string, string> = {
  Tazi: "No readable writing",
  Mercier: "No assessable content",
};

const withProposal: SubmissionStatus[] = ["to_review", "validated", "published"];

const dueDay = Number(mockAssignment.due.slice(-2));

/** "d'Aubigné" + "Claire" -> "claire.daubigne@example.test" */
function mockEmail(firstName: string, lastName: string) {
  const ascii = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
  return `${ascii(firstName)}.${ascii(lastName)}@example.test`;
}

export const mockAssignmentSubmissions: SubmissionRow[] = seeds.map(
  ([lastName, firstName, classes, status, mode, day, teacherGrade, copy], i) => {
    const hasProposal = withProposal.includes(status) && copy !== null;
    return {
      id: `r${i + 1}`,
      lastName,
      firstName,
      email: mockEmail(firstName, lastName),
      classes,
      removedFromClass: lastName === "Leroy",
      status,
      late: day !== null && day > dueDay,
      mode: mode === "t" ? "text" : mode === "i" ? "image" : null,
      submittedAt: day === null ? null : `2026-10-${String(day).padStart(2, "0")}`,
      teacherGrade,
      proposedGrade: hasProposal ? calculateGrade(copyTemplates[copy].proposal.levels) : null,
      copy,
      hasProposal,
      cause: causes[lastName],
    };
  },
);

export function findSubmission(id: string): SubmissionRow | undefined {
  return mockAssignmentSubmissions.find((r) => r.id === id);
}

export function copyOf(row: SubmissionRow): CopyTemplate | null {
  return row.copy === null ? null : copyTemplates[row.copy];
}
