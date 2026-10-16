import "server-only";
import { and, eq } from "drizzle-orm";
import type { EvaluationInput } from "@/server/ai/request";
import { db } from "@/server/db/client";
import { assignments, submissions, submissionVersions } from "@/server/db/schema";

// System processing of the evaluation (§5.5, transitions 2 and 5): no Actor,
// called only by the evaluation service (E5.5). Listed in inventory.ts.

type Executor = Pick<typeof db, "select">;

/**
 * The whitelist of a submission for the AI (EVL-02), column by column: the
 * active version's text and the assignment's subject, instructions and
 * language. Nothing else is read: no title, level, deadline, lateness, name or
 * identifier. Null when the submission does not exist or its active version
 * is not a text (images: E9). The version number comes back beside the
 * input, never in it: it guards the result (E5.5).
 */
export async function readEvaluationInput(
  executor: Executor,
  submissionId: string,
): Promise<{ versionNumber: number; input: EvaluationInput } | null> {
  const [row] = await executor
    .select({
      versionNumber: submissionVersions.number,
      text: submissionVersions.text,
      subject: assignments.subject,
      instructions: assignments.instructions,
      language: assignments.language,
    })
    .from(submissions)
    .innerJoin(
      submissionVersions,
      and(eq(submissionVersions.submissionId, submissions.id), eq(submissionVersions.number, submissions.currentVersion)),
    )
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(eq(submissions.id, submissionId), eq(submissionVersions.mode, "text")));
  if (!row || row.text === null) return null;
  const { versionNumber, ...input } = row;
  return { versionNumber, input: { ...input, text: row.text } };
}
