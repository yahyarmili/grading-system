import { z } from "zod";
import { AI_MAX_QUOTES_PER_CRITERION } from "@/config/provisional";
import type { EvaluationError } from "@/lib/evaluation";
import { criterionIds, MAX_LEVEL, type CriterionId, type Level } from "@/lib/rubric";
import { quoteFound } from "./quotes";

// The output contract (plan E5, §5; EVL-03): the answer is checked in full on
// the server, whatever the provider claims to enforce. Anything that does not
// conform is refused with a code, never repaired and never given a default
// value (R3): a refused answer is never stored as a proposal.

/** Not blank once trimmed; stored trimmed. */
const remark = z.string().trim().min(1);

const criterion = z.strictObject({
  // An integer from 0 to 4: "2" and 2.5 are refused, never rounded.
  level: z.number().int().min(0).max(MAX_LEVEL),
  justification: remark,
  quotes: z.array(remark).min(1).max(AI_MAX_QUOTES_PER_CRITERION),
});

const outputSchema = z.strictObject({
  criteria: z.strictObject(
    Object.fromEntries(criterionIds.map((id) => [id, criterion])) as Record<CriterionId, typeof criterion>,
  ),
  general_comment: remark,
  next_steps: z.array(remark).min(1),
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
