import { callErrors, type CallError, type SelectableAiProvider } from "@/lib/evaluation";

// The single evaluation interface (stack-technologique.md §4, rule 3;
// NFR-EXP-04): the Anthropic adapter and the simulator implement it. It sees a
// request already built, never a submission, an identifier or an identity.

/** A JSON Schema object, sent as the expected shape of the answer. */
export type JsonSchema = { readonly [keyword: string]: unknown };

/** How the answer is generated; fixed for a prompt version. No temperature: Haiku 5.5 refuses any but 1. */
export type Generation = {
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  /** Adaptive thinking, or none; its blocks are never kept. */
  thinking: "adaptive" | "disabled";
  /** Most tokens of the answer, thinking included. */
  maxOutputTokens: number;
};

export type EvaluationRequest = {
  /** Fixed instructions, rubric included. */
  system: string;
  /** The data to evaluate, framed as data (built from the whitelist, rule 5). */
  user: string;
  /** Name of the answer schema: part of the prompt version, not sent (Anthropic's format has no name). */
  schemaName: string;
  schema: JsonSchema;
  generation: Generation;
};

/**
 * Tokens counted by the provider; null when it did not say. The three sums
 * are what a run stores (plan §2): prompt = input + cache read + cache
 * written; completion = output, thinking included.
 */
export type Usage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** The provider's own counts, for the trial report (E5.14): in memory only, never stored. */
  detail?: UsageDetail;
};

export type UsageDetail = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  /** Where the model ran, as the provider says ("us"). */
  inferenceGeo: string | null;
};

export type EvaluationResponse = {
  /** The raw answer, to be validated by the caller (EVL-03 R3): never trusted as is. */
  content: string;
  /** The model the provider says answered; null when it did not say. */
  modelAnswered: string | null;
  /** Anthropic runs its model itself: always null (kept for the runs of OpenRouter). */
  providerAnswered: null;
  /** Why the model stopped (`end_turn`, `max_tokens`); null when the provider did not say. */
  stopReason: string | null;
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
  readonly provider: SelectableAiProvider;
  /** The model requested at each call. */
  readonly model: string;
  /**
   * One call, one answer: no retry inside, and bounded by the evaluator itself
   * (AI_CALL_TIMEOUT_MS) as well as by the signal. Throws EvaluatorError, never
   * the provider's error.
   */
  evaluate(request: EvaluationRequest, context: EvaluationContext): Promise<EvaluationResponse>;
}

/**
 * One page to read (spec 0011): the image, then fixed instructions, and
 * nothing else. The image is a JPEG already shrunk and stripped of its
 * metadata; never a URL, a file name or an identifier.
 */
export type ReadingRequest = {
  /** Fixed reading rules, the same in English and French (TRX-01 R2). */
  system: string;
  image: { mediaType: "image/jpeg"; base64: string };
  /** Fixed text sent after the image. */
  instruction: string;
  /** Name of the answer schema: part of the prompt version, not sent. */
  schemaName: string;
  schema: JsonSchema;
  generation: Generation;
};

/** A reader answers like an evaluator: a raw text the caller validates, the model, the stop reason and the usage. */
export type ReadingResponse = EvaluationResponse;

/**
 * The single reading interface (spec 0011, rule 3): the Anthropic adapter and
 * the simulator implement it. It sees one page's image, never a submission,
 * a draft or an identity. Its failures are EvaluatorErrors, of the same kinds.
 */
export interface Reader {
  readonly provider: SelectableAiProvider;
  /** The model requested at each call. */
  readonly model: string;
  /** One call, one answer: no retry inside, bounded like evaluate. */
  read(request: ReadingRequest, context: EvaluationContext): Promise<ReadingResponse>;
}

/** Fixed messages: an error never carries a request, an answer, a key or a provider message. */
const MESSAGES: Record<CallError, string> = {
  timeout: "The AI did not answer in time.",
  rate_limited: "The AI refused the call: too many requests.",
  unavailable: "The AI could not be reached or failed.",
  rejected: "The AI refused the request.",
  configuration: "The AI refused the access: key, model or account.",
  refused: "The AI declined to evaluate this text.",
  budget: "The AI refused the call: spending limit or credit reached.",
  truncated: "The AI's answer was cut at its length limit.",
};

/** A failed call, by kind only (EVL-03 R3). No cause attached: the provider's error stays behind. */
export class EvaluatorError extends Error {
  readonly kind: CallError;
  /** For rate_limited: the wait the provider asked for, when it said. */
  readonly retryAfterMs?: number;
  /**
   * The provider's own error code (Anthropic's error type and error_code, or
   * the refusal's category), kept only when it looks like an identifier: it
   * tells a budget from a rate limit, without content.
   */
  readonly providerCode?: string;
  /** Why the model stopped, for an answer that is a failure (`refusal`). */
  readonly stopReason?: string;
  /** What the provider counted for a failed call it billed (a refusal): added to the run. */
  readonly usage?: Usage;
  /** The provider's request-id, an identifier: shown by the commands on a failure, never stored [P]. */
  readonly requestId?: string;
  /** The HTTP status of a failed answer: shown by the commands with the request-id, never stored [P]. */
  readonly status?: number;

  constructor(
    kind: CallError,
    retryAfterMs?: number,
    providerCode?: string,
    extra: { stopReason?: string; usage?: Usage; requestId?: string; status?: number } = {},
  ) {
    super(MESSAGES[kind]);
    this.name = "EvaluatorError";
    this.kind = kind;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
    if (providerCode !== undefined) this.providerCode = providerCode;
    if (extra.stopReason !== undefined) this.stopReason = extra.stopReason;
    if (extra.usage !== undefined) this.usage = extra.usage;
    if (extra.requestId !== undefined) this.requestId = extra.requestId;
    if (extra.status !== undefined) this.status = extra.status;
  }
}

/**
 * The security log line could not be written before a sending: nothing left.
 * Not an EvaluatorError, so that the evaluation ends on "internal", without a
 * retry, and never passes for an unavailable provider.
 */
export class AiJournalError extends Error {
  constructor() {
    super("The security log could not be written: nothing was sent to the AI.");
    this.name = "AiJournalError";
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
