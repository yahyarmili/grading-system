// Closed lists of an assignment (ASG-01 R1, R2). Kept free of imports: the
// database schema reads them, and drizzle-kit loads the schema alone.

/** D4: a label only, never sent to the AI. */
export const assignmentLevels = ["A1", "A2", "B1", "B2", "C1"] as const;
export type AssignmentLevel = (typeof assignmentLevels)[number];

export const assignmentLanguages = ["en", "fr"] as const;
export type AssignmentLanguage = (typeof assignmentLanguages)[number];

export const languageLabels: Record<AssignmentLanguage, string> = { en: "English", fr: "French" };
