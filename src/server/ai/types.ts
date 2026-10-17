import { callErrors, type AiProvider, type CallError } from "@/lib/evaluation";

// The single evaluation interface (stack-technologique.md §4, rule 3;
// NFR-EXP-04): the OpenRouter adapter and the simulator implement it. It sees a
// request already built, never a submission, an identifier or an identity.

/** A JSON Schema object, sent as the expected shape of the answer. */
export type JsonSchema = { readonly [keyword: string]: unknown };

/** How the answer is generated; fixed for a prompt version. */
export type Generation = {
  temperature: number;
  maxOutputTokens: number;
  reasoningEffort: "none" | "low" | "medium" | "high";
};

export type EvaluationRequest = {
  /** Fixed instructions, rubric included. */
  system: string;
  /** The data to evaluate, framed as data (built from the whitelist, rule 5). */
  user: string;
  /** Name of the answer schema, sent with it. */
  schemaName: string;
  schema: JsonSchema;
  generation: Generation;
};

/** Tokens counted by the provider; null when it did not say. */
export type Usage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type EvaluationResponse = {
  /** The raw answer, to be validated by the caller (EVL-03 R3): never trusted as is. */
  content: string;
  /** The model the provider says answered; null when it did not say. */
  modelAnswered: string | null;
  /** The company that ran the model, when OpenRouter names it (undocumented field); null otherwise. */
  providerAnswered: string | null;
  usage: Usage | null;
};

export type EvaluationContext = {
  /** Aborts the call (caller's deadline, or a newer version replaced the text). */
  signal: AbortSignal;
  /**
   * What the security log names as the subject of a real sending (DON-05):
   * the submission's identifier, or null for a manual trial. Never content.
   */
  subjectId: string | null;
};

export interface Evaluator {
  readonly provider: AiProvider;
  /** The model requested at each call. */
  readonly model: string;
  /**
   * One call, one answer: no retry inside, and bounded by the evaluator itself
   * (AI_CALL_TIMEOUT_MS) as well as by the signal. Throws EvaluatorError, never
   * the provider's error.
   */
  evaluate(request: EvaluationRequest, context: EvaluationContext): Promise<EvaluationResponse>;
}

/** Fixed messages: an error never carries a request, an answer, a key or a provider message. */
const MESSAGES: Record<CallError, string> = {
  timeout: "The AI did not answer in time.",
  rate_limited: "The AI refused the call: too many requests.",
  unavailable: "The AI could not be reached or failed.",
  rejected: "The AI refused the request.",
  configuration: "The AI refused the access: key, model or account.",
};

/** A failed call, by kind only (EVL-03 R3). No cause attached: the provider's error stays behind. */
export class EvaluatorError extends Error {
  readonly kind: CallError;
  /** For rate_limited: the wait the provider asked for, when it said. */
  readonly retryAfterMs?: number;
  /**
   * The provider's own error code (OpenRouter's metadata error_type and
   * provider_code), kept only when it looks like an identifier: it tells a
   * quota from a capacity limit, without content.
   */
  readonly providerCode?: string;

  constructor(kind: CallError, retryAfterMs?: number, providerCode?: string) {
    super(MESSAGES[kind]);
    this.name = "EvaluatorError";
    this.kind = kind;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
    if (providerCode !== undefined) this.providerCode = providerCode;
  }
}

/** The environment asks for a provider that cannot start; nothing is sent. Its message names variables, never values. */
export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export const isCallError = (value: string): value is CallError => (callErrors as readonly string[]).includes(value);
