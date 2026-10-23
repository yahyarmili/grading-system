import type { AssignmentLanguage } from "./assignment";
import { calculateGrade } from "./grade";
import { criterionIds, type CriterionId, type Level } from "./rubric";

// PUB-02 (E8 plan §4): what the student reads of their published result, a
// closed list. Built field by field from the row the projection reads
// (src/server/data/results/student.ts), never by spreading it: nothing of the
// proposal, the log, the alerts or the processing can reach it.

export type StudentResultCriterion = Readonly<{ id: CriterionId; level: Level; remark: string }>;

export type StudentResult = Readonly<{
  assignmentId: string;
  title: string;
  language: AssignmentLanguage;
  /** The grade as the teacher set it (D5). */
  finalGrade: number;
  /** Q5 [D]: the grade differs from the sum of the levels; said without a reason. */
  gradeAdjusted: boolean;
  criteria: readonly StudentResultCriterion[];
  generalComment: string;
  nextSteps: readonly string[];
  /** The rubric the levels were given on (en-1 for a French copy entered by hand, Q6). */
  rubricVersion: string;
  /** Q5 [D]: prepared from an AI proposal; false for a manual evaluation. */
  aiAssisted: boolean;
}>;

/** The columns the projection reads, and nothing else. */
export type StudentResultRow = {
  assignmentId: string;
  title: string;
  language: AssignmentLanguage;
  origin: "proposal" | "manual";
  rubricVersion: string;
  finalGrade: number | null;
  levels: Record<CriterionId, number | null>;
  remarks: Record<CriterionId, string>;
  generalComment: string;
  nextSteps: readonly string[];
};

/**
 * The closed result of a published evaluation. A published evaluation is
 * complete (0019): a missing level or grade throws rather than show a result
 * that was never validated.
 */
export function toStudentResult(row: StudentResultRow): StudentResult {
  const criteria = criterionIds.map((id) => {
    const level = row.levels[id];
    if (level === null) throw new Error("toStudentResult: a published evaluation has every level");
    return { id, level: level as Level, remark: row.remarks[id] };
  });
  if (row.finalGrade === null) throw new Error("toStudentResult: a published evaluation has a grade");
  return {
    assignmentId: row.assignmentId,
    title: row.title,
    language: row.language,
    finalGrade: row.finalGrade,
    gradeAdjusted: row.finalGrade !== calculateGrade(criteria.map((c) => c.level)),
    criteria,
    generalComment: row.generalComment,
    nextSteps: [...row.nextSteps],
    rubricVersion: row.rubricVersion,
    aiAssisted: row.origin === "proposal",
  };
}
