import "server-only";
import { z } from "zod";
import { REVIEW_TEXT_MAX_LENGTH } from "@/config/provisional";
import { readTypedGrade, REVIEW_FIELD_MESSAGES, type EvaluationChanges } from "@/lib/review";
import { criterionIds, levels as LEVELS, type CriterionId, type Level } from "@/lib/rubric";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { saveEvaluation, type SavedEvaluation } from "@/server/data/review/copy";

// REV-03 (E7.4), without Next request APIs so integration tests can call it:
// the teacher saves the whole form of a copy. Everything the client sends is
// checked here, field by field, whatever the screen allowed (a direct request
// included); the data layer checks the copy, the database the ranges again.

export const EVALUATION_MESSAGES = {
  ...REVIEW_FIELD_MESSAGES,
  replaced: "This submission was replaced. The page has been reloaded. Nothing was saved.",
  notOpen: "This copy can no longer be changed here. The page has been reloaded. Nothing was saved.",
  conflict: "This evaluation was changed in another tab or window. Nothing was saved.",
  notFound: "This copy was not found. Nothing was saved.",
  noticeRequired: "Read the teacher notice first. The page has been reloaded. Nothing was saved.",
} as const;

/** A field of the form, as the messages name it: "level.task", "remark.task", "generalComment", "nextSteps", "grade". */
export type EvaluationField = `level.${CriterionId}` | `remark.${CriterionId}` | "generalComment" | "nextSteps" | "grade";

export type SaveEvaluationState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Partial<Record<EvaluationField, string>> }
  | { status: "saved"; changed: boolean; evaluation: SavedEvaluation }
  | { status: "replaced" | "not_open" | "not_found"; message: string }
  | { status: "conflict"; message: string; saved: SavedEvaluation };

const text = z.string().max(REVIEW_TEXT_MAX_LENGTH, EVALUATION_MESSAGES.tooLong);
const perCriterion = <T extends z.ZodType>(schema: T) =>
  z.object(Object.fromEntries(criterionIds.map((id) => [id, schema])) as Record<CriterionId, T>);

/** "13,5" or "13.5"; a typed grade is checked on the range, then the step [P]. */
const fixedGrade = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const read = readTypedGrade(value);
  if ("error" in read) {
    ctx.addIssue({ code: "custom", message: read.error });
    return z.NEVER;
  }
  return read.value;
});

const saveSchema = z.object({
  seen: z.object({
    submissionId: z.uuid(),
    versionNumber: z.int().min(1),
    proposalId: z.uuid().nullable(),
    revision: z.int().min(0),
  }),
  // Range checked here: the type follows it.
  levels: perCriterion(
    z.int(EVALUATION_MESSAGES.level).min(LEVELS[0], EVALUATION_MESSAGES.level).max(LEVELS.at(-1)!, EVALUATION_MESSAGES.level).transform((level) => level as Level),
  ),
  remarks: perCriterion(text),
  generalComment: text,
  /** One step per line, as typed in the box; empty lines dropped. */
  nextSteps: text.transform((value) => value.split("\n").map((line) => line.trim()).filter(Boolean)),
  grade: z.discriminatedUnion("fixed", [
    z.object({ fixed: z.literal(false) }),
    z.object({ fixed: z.literal(true), value: fixedGrade }),
  ]),
  rereadDone: z.array(z.enum(criterionIds)).max(criterionIds.length),
});

/** One message per field, keyed as the form names them; the first issue of a field wins. */
function fieldErrors(error: z.ZodError): Partial<Record<EvaluationField, string>> {
  const errors: Partial<Record<EvaluationField, string>> = {};
  for (const issue of error.issues) {
    const [first, second] = issue.path.map(String);
    const field = (
      first === "levels" ? `level.${second}` : first === "remarks" ? `remark.${second}` : first
    ) as EvaluationField;
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Validates, then saves; a role without the right is logged and refused like a missing copy. */
export async function saveTeacherEvaluation(actor: Actor, raw: unknown): Promise<SaveEvaluationState> {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    // A malformed request, not a field the teacher typed: nothing to show next to a field.
    if (Object.keys(errors).some((key) => key === "seen" || key === "rereadDone")) {
      return { status: "not_found", message: EVALUATION_MESSAGES.notFound };
    }
    return { status: "invalid", fieldErrors: errors };
  }
  const { seen, grade, ...rest } = parsed.data;
  const changes: EvaluationChanges = { ...rest, grade };
  try {
    const result = await saveEvaluation(actor, seen, changes);
    if (!result) return { status: "not_found", message: EVALUATION_MESSAGES.notFound };
    if (result.ok) return { status: "saved", changed: result.changed, evaluation: result.evaluation };
    if (result.reason === "conflict") return { status: "conflict", message: EVALUATION_MESSAGES.conflict, saved: result.saved };
    // E7.7: the page reloads on the notice; the copy is not open to this teacher yet.
    if (result.reason === "notice_required") return { status: "not_open", message: EVALUATION_MESSAGES.noticeRequired };
    return result.reason === "replaced"
      ? { status: "replaced", message: EVALUATION_MESSAGES.replaced }
      : { status: "not_open", message: EVALUATION_MESSAGES.notOpen };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { status: "not_found", message: EVALUATION_MESSAGES.notFound };
  }
}
