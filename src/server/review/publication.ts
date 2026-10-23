import "server-only";
import { z } from "zod";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import type { SavedEvaluation } from "@/server/data/review/copy";
import {
  publishEvaluation,
  validateEvaluation,
  withdrawPublication,
  type PublishResult,
  type SeenDecision,
  type ValidateResult,
} from "@/server/data/review/publication";
import type { EvaluationChanges } from "@/lib/review";
import { emptyLevelErrors, EVALUATION_MESSAGES, readEvaluationForm, type SaveEvaluationState } from "./evaluation";

// REV-05, PUB-01 (E8.1), without Next request APIs so integration tests can
// call it: validate (with the whole form on screen), publish, withdraw, and
// the shortcut "Validate and publish" (D6), which chains two acts, each its
// own transaction and log entry: when the second fails, the copy stays
// Validated and the teacher is told (PUB-01 R3).

export const PUBLICATION_MESSAGES = {
  validated: "Validated. The student sees nothing until you publish it.",
  alreadyValidated: "Already validated. Nothing changed.",
  published: "Published. The student can now see the result.",
  alreadyPublished: "Already published. Nothing changed.",
  validatedAndPublished: "Validated and published. The student can now see the result.",
  withdrawn: "Publication withdrawn. The copy is Validated again; the student no longer sees the result.",
  alreadyWithdrawn: "Not published. Nothing changed.",
  notOpen: "This copy cannot be validated: it has no evaluation to validate. The page has been reloaded. Nothing was validated.",
  notValidated: "Only a validated copy can be published. The page has been reloaded. Nothing was published.",
  notPublished: "This copy is not published. The page has been reloaded. Nothing changed.",
  changed: "This evaluation changed since this page was shown (another tab or window). The page has been reloaded. Nothing changed.",
  replaced: "This submission was replaced. The page has been reloaded. Nothing changed.",
  notFound: "This copy was not found. Nothing changed.",
  noticeRequired: "Read the teacher notice first. The page has been reloaded. Nothing changed.",
  failed: "The publication could not be completed. The copy stays Validated: publish it when ready.",
} as const;

/** What a validation, with or without the publication, answers the form. */
export type DecisionState =
  | SaveEvaluationState
  /** published: the shortcut's second act succeeded too (or the copy was published already). */
  | { status: "decided"; published: boolean; evaluation: SavedEvaluation; message: string }
  /** PUB-01 R3: validated, the publication refused or failed: the copy stays Validated. */
  | { status: "publish_failed"; evaluation: SavedEvaluation; message: string };

/** The validation's refusals, as the form shows them (the same as a save's, E7.4). */
function refusedValidation(result: Exclude<ValidateResult, { ok: true }>, changes: EvaluationChanges): DecisionState {
  switch (result.reason) {
    case "conflict":
      return { status: "conflict", message: EVALUATION_MESSAGES.conflict, saved: result.saved };
    case "replaced":
      return { status: "replaced", message: PUBLICATION_MESSAGES.replaced };
    case "notice_required":
      return { status: "not_open", message: PUBLICATION_MESSAGES.noticeRequired };
    case "incomplete":
      // REV-05 R2, REV-06: each level left empty is said next to it; nothing was written.
      return { status: "invalid", fieldErrors: emptyLevelErrors(changes) };
    case "not_open":
      return { status: "not_open", message: PUBLICATION_MESSAGES.notOpen };
  }
}

const publishRefusals: Record<Exclude<PublishResult, { ok: true }>["reason"], string> = {
  not_validated: PUBLICATION_MESSAGES.notValidated,
  changed: PUBLICATION_MESSAGES.changed,
  replaced: PUBLICATION_MESSAGES.replaced,
  notice_required: PUBLICATION_MESSAGES.noticeRequired,
};

/** A role without the right is logged and refused like a missing copy (AUTH-04). */
async function denied<T>(actor: Actor, error: unknown, answer: T): Promise<T> {
  if (!(error instanceof AccessDeniedError)) throw error;
  await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
  return answer;
}

export type PublicationDeps = { publish: typeof publishEvaluation };

/**
 * REV-05, and D6's shortcut when `publish` is asked: first the validation
 * (its own transaction: committed whatever follows), then the publication
 * of the revision just validated (another one). Its refusal or failure
 * leaves the copy Validated, said to the teacher (PUB-01 R3, CA2). `deps`
 * lets a test make the second act fail (E8 plan §2).
 */
export async function validateTeacherEvaluation(
  actor: Actor,
  raw: unknown,
  options: { publish?: boolean } = {},
  deps: PublicationDeps = { publish: publishEvaluation },
): Promise<DecisionState> {
  const form = readEvaluationForm(raw);
  if (!form.ok) return form.state;
  const { seen, changes } = form;
  let validated: Extract<ValidateResult, { ok: true }>;
  try {
    const result = await validateEvaluation(actor, seen, changes);
    if (!result) return { status: "not_found", message: PUBLICATION_MESSAGES.notFound };
    if (!result.ok) return refusedValidation(result, changes);
    validated = result;
  } catch (error) {
    return denied(actor, error, { status: "not_found", message: PUBLICATION_MESSAGES.notFound } as const);
  }

  const { evaluation } = validated;
  const alreadyPublished = validated.already && validated.status === "published";
  if (!options.publish || alreadyPublished) {
    const message = alreadyPublished
      ? PUBLICATION_MESSAGES.alreadyPublished
      : validated.already
        ? PUBLICATION_MESSAGES.alreadyValidated
        : PUBLICATION_MESSAGES.validated;
    return { status: "decided", published: alreadyPublished, evaluation, message };
  }

  // The second act, on the revision the first one validated.
  try {
    const published = await deps.publish(actor, { ...seen, revision: evaluation.revision });
    if (published?.ok) return { status: "decided", published: true, evaluation, message: PUBLICATION_MESSAGES.validatedAndPublished };
    const why = published ? publishRefusals[published.reason] : PUBLICATION_MESSAGES.notFound;
    return { status: "publish_failed", evaluation, message: why };
  } catch {
    return { status: "publish_failed", evaluation, message: PUBLICATION_MESSAGES.failed };
  }
}

export type PublicationState = { status: "done" | "refused"; message: string };

const decisionSchema = z.object({
  submissionId: z.uuid(),
  versionNumber: z.int().min(1),
  proposalId: z.uuid().nullable(),
  revision: z.int().min(1),
});

/** PUB-01: publishes a Validated copy, from its page; refused otherwise, a direct request included (CA1). */
export async function publishTeacherEvaluation(actor: Actor, raw: unknown): Promise<PublicationState> {
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { status: "refused", message: PUBLICATION_MESSAGES.notFound };
  try {
    const result = await publishEvaluation(actor, parsed.data satisfies SeenDecision);
    if (!result) return { status: "refused", message: PUBLICATION_MESSAGES.notFound };
    if (!result.ok) return { status: "refused", message: publishRefusals[result.reason] };
    return { status: "done", message: result.already ? PUBLICATION_MESSAGES.alreadyPublished : PUBLICATION_MESSAGES.published };
  } catch (error) {
    return denied(actor, error, { status: "refused", message: PUBLICATION_MESSAGES.notFound } as const);
  }
}

/** PUB-01 R2: withdraws a publication; the copy is Validated again. */
export async function withdrawTeacherPublication(actor: Actor, raw: unknown): Promise<PublicationState> {
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { status: "refused", message: PUBLICATION_MESSAGES.notFound };
  try {
    const result = await withdrawPublication(actor, parsed.data);
    if (!result) return { status: "refused", message: PUBLICATION_MESSAGES.notFound };
    if (!result.ok) {
      const message = {
        not_published: PUBLICATION_MESSAGES.notPublished,
        changed: PUBLICATION_MESSAGES.changed,
        replaced: PUBLICATION_MESSAGES.replaced,
        notice_required: PUBLICATION_MESSAGES.noticeRequired,
      }[result.reason];
      return { status: "refused", message };
    }
    return { status: "done", message: result.already ? PUBLICATION_MESSAGES.alreadyWithdrawn : PUBLICATION_MESSAGES.withdrawn };
  } catch (error) {
    return denied(actor, error, { status: "refused", message: PUBLICATION_MESSAGES.notFound } as const);
  }
}
