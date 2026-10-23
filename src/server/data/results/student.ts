import "server-only";
import { and, eq } from "drizzle-orm";
import { toStudentResult, type StudentResult } from "@/lib/student-result";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assignments, submissions, teacherEvaluations } from "@/server/db/schema";
import { ownedBy } from "../access";

// PUB-02 (E8 plan §4): the one reader of a result for the student. One query,
// its columns listed one by one: the teacher's evaluation of the active
// version, once published, and the assignment's title and language. It joins
// neither the proposal, the runs nor the log, and reads no "to re-read",
// fixed-grade, proposal, cause, token or request column. No class condition:
// a removed student still reads their published result (SUB-01 R4).

/**
 * The student's published result for an assignment; null when it is not
 * published (to review, validated, withdrawn), not theirs, or missing: the
 * same answer, so nothing tells a validated copy from an absent one (R2).
 */
export async function getPublishedResult(actor: Actor, assignmentId: string): Promise<StudentResult | null> {
  const grant = authorize(actor, "publishedEvaluation", "read");
  const [row] = await db
    .select({
      assignmentId: assignments.id,
      title: assignments.title,
      language: assignments.language,
      origin: teacherEvaluations.origin,
      rubricVersion: teacherEvaluations.rubricVersion,
      finalGrade: teacherEvaluations.finalGrade,
      levels: {
        task: teacherEvaluations.levelTask,
        organization: teacherEvaluations.levelOrganization,
        vocabulary: teacherEvaluations.levelVocabulary,
        grammar: teacherEvaluations.levelGrammar,
        mechanics: teacherEvaluations.levelMechanics,
      },
      remarks: {
        task: teacherEvaluations.remarkTask,
        organization: teacherEvaluations.remarkOrganization,
        vocabulary: teacherEvaluations.remarkVocabulary,
        grammar: teacherEvaluations.remarkGrammar,
        mechanics: teacherEvaluations.remarkMechanics,
      },
      generalComment: teacherEvaluations.generalComment,
      nextSteps: teacherEvaluations.nextSteps,
    })
    .from(submissions)
    .innerJoin(
      teacherEvaluations,
      and(eq(teacherEvaluations.submissionId, submissions.id), eq(teacherEvaluations.versionNumber, submissions.currentVersion)),
    )
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(
      and(
        eq(submissions.assignmentId, assignmentId),
        ownedBy(grant, { student: submissions.studentId }),
        eq(submissions.status, "published"),
      ),
    );
  return row ? toStudentResult(row) : null;
}
