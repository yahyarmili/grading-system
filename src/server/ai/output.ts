import { z } from "zod";
import { AI_MAX_QUOTES_PER_CRITERION, REVIEW_TEXT_MAX_LENGTH } from "@/config/provisional";
import type { EvaluationError } from "@/lib/evaluation";
import { criterionIds, MAX_LEVEL, type CriterionId, type Level } from "@/lib/rubric";
import { quoteFound } from "./quotes";

// The output contract (plan E5, §5; EVL-03): the answer is checked in full on
// the server, whatever the provider claims to enforce. Anything that does not
// conform is refused with a code, never repaired and never given a default
// value (R3): a refused answer is never stored as a proposal.
//
// A proposal's texts start the teacher's form (E7.4), so an accepted proposal
// must save unchanged: each text fits the teacher's box, counted as the
// teacher's schema counts it (string length, of the stored trimmed value), and
// a next step is one line, since the form joins the steps by "\n" and the
// server splits them again by line.

/** Not blank once trimmed; stored trimmed. A quote: never in the form, found in the text instead. */
const nonBlank = z.string().trim().min(1);

/** A justification, the general comment or a next step: no longer than the teacher's box once trimmed. */
const remark = nonBlank.max(REVIEW_TEXT_MAX_LENGTH);

/** One line: "\r" too, which the browser turns into a line break as soon as the box is edited. */
const nextStep = remark.refine((step) => !/[\r\n]/.test(step));

/** The steps as the form shows them, one per line, fit one box. */
const nextSteps = z
  .array(nextStep)
  .min(1)
  .refine((steps) => steps.join("\n").length <= REVIEW_TEXT_MAX_LENGTH);

const criterion = z.strictObject({
  // An integer from 0 to 4: "2" and 2.5 are refused, never rounded.
  level: z.number().int().min(0).max(MAX_LEVEL),
  justification: remark,
  quotes: z.array(nonBlank).min(1).max(AI_MAX_QUOTES_PER_CRITERION),
});

const outputSchema = z.strictObject({
  criteria: z.strictObject(
    Object.fromEntries(criterionIds.map((id) => [id, criterion])) as Record<CriterionId, typeof criterion>,
  ),
  general_comment: remark,
  next_steps: nextSteps,
  flags: z.strictObject({
    other_language: z.boolean(),
    off_topic: z.boolean(),
    addressed_to_marker: z.boolean(),
  }),
});

export type ProposalOutput = {
  criteria: Record<CriterionId, { level: Level; justification: string; quotes: string[] }>;
  generalComment: string;
  nextSteps: string[];
  flags: { otherLanguage: boolean; offTopic: boolean; addressedToMarker: boolean };
};

export type OutputRejection = Extract<EvaluationError, "not_json" | "schema" | "quote_not_found">;

export type ParsedOutput = { ok: true; value: ProposalOutput } | { ok: false; code: OutputRejection };

/**
 * The model's answer, checked against the contract and against the text it
 * evaluated (`text`, the active version, as written): not JSON, not the
 * schema, or a quote not found in the text.
 */
export function parseProposalOutput(content: string, text: string): ParsedOutput {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return { ok: false, code: "not_json" };
  }
  const parsed = outputSchema.safeParse(data);
  if (!parsed.success) return { ok: false, code: "schema" };
  const { criteria, general_comment, next_steps, flags } = parsed.data;
  for (const id of criterionIds) {
    if (!criteria[id].quotes.every((quote) => quoteFound(quote, text))) return { ok: false, code: "quote_not_found" };
  }
  return {
    ok: true,
    value: {
      criteria: Object.fromEntries(
        criterionIds.map((id) => [id, { ...criteria[id], level: criteria[id].level as Level }]),
      ) as ProposalOutput["criteria"],
      generalComment: general_comment,
      nextSteps: next_steps,
      flags: { otherLanguage: flags.other_language, offTopic: flags.off_topic, addressedToMarker: flags.addressed_to_marker },
    },
  };
}
