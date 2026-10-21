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
 * timeout, unavailable, and rate_limited when the wait asked for is short
 * (E6). Final: rejected (the request itself was refused), configuration
 * (key, model or access), refused (the model declined to evaluate the text;
 * billed, so never retried automatically, but the teacher may ask again,
 * transition 6), budget (spending limit, credit or billing: the submission
 * becomes "AI unavailable" [P], E6) and truncated (the answer reached
 * max_tokens: billed, and a new attempt would likely be cut again [P], E6).
 */
export const callErrors = ["timeout", "rate_limited", "unavailable", "rejected", "configuration", "refused", "budget", "truncated"] as const;
export type CallError = (typeof callErrors)[number];

/** What one evaluation run gave (E5.5): a proposal, a failure, or a blocking alert before any request. */
export const evaluationOutcomes = ["proposed", "failed", "not_assessable"] as const;
export type EvaluationOutcome = (typeof evaluationOutcomes)[number];

/**
 * Why a submission is not assessable: a blocking alert, raised before any
 * request (EVL-04), or the AI unavailable (E6, EXP-02): the monthly cost cap
 * reached, or the provider's budget (spending limit, credit) [P]. E9 will add
 * its own causes.
 */
export const notAssessableCauses = ["no_content", "rubric_unavailable", "ai_unavailable"] as const;
export type NotAssessableCause = (typeof notAssessableCauses)[number];

/**
 * The causes that may disappear, for which the teacher is offered a relaunch
 * (PRC-02 R4, transition 7, E6.3): the rubric of the language published, the
 * cost cap or the provider's budget lifted. Never no_content: the text itself
 * would have to change, and a replacement evaluates it again.
 */
export const relaunchableCauses = ["rubric_unavailable", "ai_unavailable"] as const satisfies readonly NotAssessableCause[];
export type RelaunchableCause = (typeof relaunchableCauses)[number];

/** The teacher's label of each cause. */
export const notAssessableCauseLabels: Record<NotAssessableCause, string> = {
  no_content: "No content to assess",
  rubric_unavailable: "Rubric not validated for this language",
  ai_unavailable: "AI unavailable",
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

/**
 * The version of a submission an automatic evaluation is for (PRC-01, E6):
 * identifiers only, the one argument of the workflow and its steps (rule 4),
 * never the text. Built by the data layer once the transaction committed.
 * `origin` (E6.3) names the transition of the claim: "auto" (2, from
 * received, the default) after a submission or replacement; "retry" (6, from
 * evaluation_failed) and "relaunch" (7, from not_assessable) by the teacher.
 * `request` (E6.6): for a retry or a relaunch, the random identifier of the
 * teacher's request, stored with the copy; the claim takes it once, so a
 * request evaluates once, and a ref without it never leaves those states.
 */
export type EvaluationRef = { submissionId: string; versionNumber: number; origin?: EvaluationOrigin; request?: string };

export const evaluationOrigins = ["auto", "retry", "relaunch"] as const;
export type EvaluationOrigin = (typeof evaluationOrigins)[number];

/** Information alerts of a proposal (EVL-04): read by the owner teacher only, never by the student. */
export const proposalAlerts = ["very_short", "other_language", "off_topic", "addressed_to_marker"] as const;
export type ProposalAlert = (typeof proposalAlerts)[number];

/** [P] The teacher's label of each information alert (EVL-04 R2): best effort, never shown to the student. */
export const proposalAlertLabels: Record<ProposalAlert, string> = {
  very_short: "Very short text",
  other_language: "Possibly written in another language",
  off_topic: "Possibly off topic",
  addressed_to_marker: "Contains a message addressed to the marker",
};

/**
 * [P] Why the evaluation failed, for the teacher, from the last attempt's
 * error of the last run (null: released by the sweep, or no run). Without
 * any content of the answer.
 */
export function evaluationFailureLabel(error: EvaluationError | null): string {
  switch (error) {
    case "refused":
      return "The AI declined to assess this text.";
    case "timeout":
    case "rate_limited":
    case "unavailable":
      return "The AI could not be reached.";
    case "not_json":
    case "schema":
    case "quote_not_found":
    case "truncated":
      return "The AI's answer could not be used.";
    case null:
      return "The evaluation stopped before it finished.";
    default:
      return "The evaluation could not be completed.";
  }
}
