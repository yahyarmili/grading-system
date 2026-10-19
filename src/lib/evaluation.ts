// Closed lists of the evaluation by the AI (E5). Kept free of imports: the
// database schema will read them (E5.5), and drizzle-kit loads the schema alone.

/**
 * Every provider a run may name, base of the ai_provider enum: a value is
 * never removed (a stored run is immutable), so openrouter stays after it
 * stops being selectable.
 */
export const aiProviders = ["simulator", "openrouter", "anthropic"] as const;
export type AiProvider = (typeof aiProviders)[number];

/** The providers the environment or a command may select now: the simulator by default, a real one only on demand. */
export const selectableAiProviders = ["simulator", "anthropic"] as const satisfies readonly AiProvider[];
export type SelectableAiProvider = (typeof selectableAiProviders)[number];

/**
 * Why a call to the AI failed, without content (EVL-03 R3). Retried:
 * timeout, rate_limited, unavailable. Final: rejected (the request itself was
 * refused), configuration (key, model, access or budget), refused (the model
 * declined to evaluate the text; billed, so never retried automatically, but
 * the teacher may ask again, transition 6).
 */
export const callErrors = ["timeout", "rate_limited", "unavailable", "rejected", "configuration", "refused"] as const;
export type CallError = (typeof callErrors)[number];

/** What one evaluation run gave (E5.5): a proposal, a failure, or a blocking alert before any request. */
export const evaluationOutcomes = ["proposed", "failed", "not_assessable"] as const;
export type EvaluationOutcome = (typeof evaluationOutcomes)[number];

/**
 * Why a submission is not assessable: a blocking alert, raised before any
 * request (EVL-04). E6 and E9 will add their own causes.
 */
export const notAssessableCauses = ["no_content", "rubric_unavailable"] as const;
export type NotAssessableCause = (typeof notAssessableCauses)[number];

/** The teacher's label of each cause. */
export const notAssessableCauseLabels: Record<NotAssessableCause, string> = {
  no_content: "No content to assess",
  rubric_unavailable: "AI unavailable: French rubric not validated",
};

/**
 * Why one attempt failed, without content: a failed call (callErrors), an
 * answer refused by the validator (not_json, schema, quote_not_found), the
 * text replaced meanwhile (superseded), or an unexpected error (internal).
 */
export const evaluationErrors = [
  ...callErrors,
  "not_json",
  "schema",
  "quote_not_found",
  "superseded",
  "internal",
] as const;
export type EvaluationError = (typeof evaluationErrors)[number];

/** Information alerts of a proposal (EVL-04): read by the owner teacher only, never by the student. */
export const proposalAlerts = ["very_short", "other_language", "off_topic", "addressed_to_marker"] as const;
export type ProposalAlert = (typeof proposalAlerts)[number];
