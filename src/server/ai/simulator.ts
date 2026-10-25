import { createHash } from "node:crypto";
import { AI_CALL_TIMEOUT_MS } from "@/config/provisional";
import { criterionIds, type CriterionId, type Level } from "@/lib/rubric";
import type { CallError } from "@/lib/evaluation";
import {
  EvaluatorError,
  type EvaluationContext,
  type EvaluationRequest,
  type EvaluationResponse,
  type Evaluator,
  type Reader,
  type ReadingRequest,
  type ReadingResponse,
  type Usage,
} from "./types";
import type { Reading } from "./reading";

// The default evaluator and reader everywhere (tests, development, E2E): nothing leaves
// the machine, so nothing is written to the security log. Its answers follow
// the output contract of the plan (E5, §5), derived from the request alone,
// and faults are injected on demand (NFR-EXP-04).

export type SimulatedFault =
  /** An HTTP error, classified by the table below: 529 is Anthropic's overload (retried), 402 its billing error (budget). */
  | { kind: "error"; status: SimulatedStatus; retryAfterMs?: number }
  /** The spending limit set in the Console is reached: a 400, budget, never retried (E6). */
  | { kind: "spend_limit" }
  /** The model declines (HTTP 200, stop_reason "refusal"): billed, never retried; the category may be null. */
  | { kind: "refusal"; category: string | null }
  /** The answer is cut at max_tokens: truncated, billed, never retried (E6). */
  | { kind: "max_tokens" }
  /** Waits until the call is aborted (its deadline or the caller), then fails as a timeout. */
  | { kind: "timeout" }
  | {
      kind: "invalid_output";
      variant: "not_json" | "missing_criterion" | "level_out_of_range" | "non_integer_level" | "empty_justification";
    }
  /** A well-formed answer whose first quote is not in the text. */
  | { kind: "missing_quote" };

export type CapturedRequest = { request: EvaluationRequest; subjectId: string | null };

/**
 * Each simulated status, with its kind and Anthropic's error type: set here,
 * not read from a provider's classifier, so that the faults stay the same
 * when the adapter changes.
 */
const STATUS_FAULTS = {
  500: ["unavailable", "api_error"],
  529: ["unavailable", "overloaded_error"],
  429: ["rate_limited", "rate_limit_error"],
  401: ["configuration", "authentication_error"],
  402: ["budget", "billing_error"],
} as const satisfies Record<number, readonly [CallError, string]>;
type SimulatedStatus = keyof typeof STATUS_FAULTS;

/** What a refusal is said to have cost: fictitious, only so that the run's usage is seen to add it. */
const REFUSAL_USAGE: Usage = { promptTokens: 1000, completionTokens: 10, totalTokens: 1010 };
/** What a cut answer is said to have cost: fictitious, the whole max_tokens. */
const TRUNCATED_USAGE: Usage = { promptTokens: 1000, completionTokens: 4000, totalTokens: 5000 };

/** At most this many requests are kept, in memory only: never on disk, never in the console. */
const CAPTURE_LIMIT = 20;
const DEFAULT_LEVEL: Level = 2;

const REMARKS = {
  en: {
    justification: "Simulated justification for this criterion.",
    comment: "Simulated general comment.",
    next: "Simulated next step.",
  },
  fr: {
    justification: "Justification simulée pour ce critère.",
    comment: "Commentaire général simulé.",
    next: "Piste simulée.",
  },
} as const;

/** The student's text and the language, when the user message is the JSON of the request builder; the whole message otherwise. */
function readUserMessage(user: string): { text: string; language: "en" | "fr" } {
  try {
    const data: unknown = JSON.parse(user);
    if (data && typeof data === "object") {
      const { student_text: text, language } = data as Record<string, unknown>;
      return { text: typeof text === "string" ? text : user, language: language === "fr" ? "fr" : "en" };
    }
  } catch {
    // Not JSON: the trial's free text.
  }
  return { text: user, language: "en" };
}

/** The first words of the text, copied exactly: a quote the validator finds. */
const firstWords = (text: string) => text.match(/\S+(?:[ \t]+\S+){0,5}/)?.[0] ?? "";

const abortError = () => new EvaluatorError("timeout");

/** The faults of a failed call, shared by the evaluation and the reading simulators. */
type CallFault = Extract<SimulatedFault, { kind: "error" | "spend_limit" | "refusal" | "max_tokens" | "timeout" }>;

const CALL_FAULTS: readonly string[] = ["error", "spend_limit", "refusal", "max_tokens", "timeout"] satisfies CallFault["kind"][];
const isCallFault = (fault: { kind: string }): fault is CallFault => CALL_FAULTS.includes(fault.kind);

/** Throws as the adapter would for this fault; a timeout waits for the abort. */
function failWith(fault: CallFault, signal: AbortSignal): Promise<never> {
  if (fault.kind === "error") {
    const [kind, type] = STATUS_FAULTS[fault.status];
    throw new EvaluatorError(kind, kind === "rate_limited" ? fault.retryAfterMs : undefined, type);
  }
  if (fault.kind === "spend_limit") throw new EvaluatorError("budget", undefined, "invalid_request_error/spend_limit");
  if (fault.kind === "refusal") {
    throw new EvaluatorError("refused", undefined, `refusal/${fault.category ?? "null"}`, {
      stopReason: "refusal",
      usage: REFUSAL_USAGE,
    });
  }
  if (fault.kind === "max_tokens") {
    throw new EvaluatorError("truncated", undefined, "stop_reason/max_tokens", { stopReason: "max_tokens", usage: TRUNCATED_USAGE });
  }
  return untilAborted(signal);
}

const reply = (content: string, model: string): EvaluationResponse => ({
  content,
  modelAnswered: model,
  providerAnswered: null,
  stopReason: "end_turn",
  usage: null,
});

/** Resolves when the signal aborts (never before), rejecting as a timeout. */
const untilAborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    if (signal.aborted) reject(abortError());
    else signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });

/** The texts and flags of the next answers, in place of the simulated ones: markers for the leak sweep (E8.4). */
export type SimulatedTexts = {
  /** The justification of each criterion, followed by its id. */
  justification: string;
  comment: string;
  nextStep: string;
  flags?: { other_language: boolean; off_topic: boolean; addressed_to_marker: boolean };
};

export class SimulatorEvaluator implements Evaluator {
  readonly provider = "simulator" as const;
  readonly model = "simulator";

  private faults: SimulatedFault[] = [];
  private holds: Promise<void>[] = [];
  private requests: CapturedRequest[] = [];
  private levels: Record<CriterionId, Level> = this.uniform(DEFAULT_LEVEL);
  private texts: SimulatedTexts | null = null;

  /** Each call is bounded like the adapter's: the caller's signal, or this many milliseconds. */
  constructor(private readonly callTimeoutMs: number = AI_CALL_TIMEOUT_MS) {}

  async evaluate(request: EvaluationRequest, context: EvaluationContext): Promise<EvaluationResponse> {
    const { subjectId } = context;
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(this.callTimeoutMs)]);
    if (signal.aborted) throw abortError();
    this.requests.push({ request, subjectId });
    if (this.requests.length > CAPTURE_LIMIT) this.requests.shift();

    const hold = this.holds.shift();
    if (hold) await Promise.race([hold, untilAborted(signal)]);

    const fault = this.faults.shift();
    if (fault && isCallFault(fault)) return failWith(fault, signal);

    const answer = JSON.stringify(this.answer(request, fault));
    return reply(fault?.kind === "invalid_output" && fault.variant === "not_json" ? "This is not JSON." : answer, this.model);
  }

  /** The next `times` calls fail with this fault, in order after any already queued. */
  failNext(fault: SimulatedFault, times = 1): void {
    for (let i = 0; i < times; i++) this.faults.push(fault);
  }

  /** The next call waits until release() (or its abort): to replace a text while it is being evaluated. */
  holdNext(): () => void {
    let release!: () => void;
    this.holds.push(new Promise<void>((resolve) => (release = resolve)));
    return () => release();
  }

  /** The levels of the next answers: one for all criteria, or one per criterion. */
  setLevels(levels: Level | Record<CriterionId, Level>): void {
    this.levels = typeof levels === "number" ? this.uniform(levels) : { ...levels };
  }

  /** The texts and flags of the next answers; null puts back the simulated ones. */
  setTexts(texts: SimulatedTexts | null): void {
    this.texts = texts;
  }

  /** The last requests received, oldest first (at most 20). */
  captured(): readonly CapturedRequest[] {
    return this.requests;
  }

  /** Forgets the requests, faults, holds, levels and texts. */
  clear(): void {
    this.requests = [];
    this.faults = [];
    this.holds = [];
    this.levels = this.uniform(DEFAULT_LEVEL);
    this.texts = null;
  }

  private uniform(level: Level): Record<CriterionId, Level> {
    return Object.fromEntries(criterionIds.map((id) => [id, level])) as Record<CriterionId, Level>;
  }

  private answer(request: EvaluationRequest, fault: SimulatedFault | undefined) {
    const { text, language } = readUserMessage(request.user);
    const { texts } = this;
    const remarks = texts
      ? { justification: texts.justification, comment: texts.comment, next: texts.nextStep }
      : REMARKS[language];
    const quote = firstWords(text);
    const criteria: Record<string, { level: number; justification: string; quotes: string[] }> = Object.fromEntries(
      criterionIds.map((id) => [
        id,
        { level: this.levels[id], justification: texts ? `${remarks.justification}-${id}` : remarks.justification, quotes: [quote] },
      ]),
    );
    const [first] = criterionIds;
    if (fault?.kind === "invalid_output") {
      if (fault.variant === "missing_criterion") delete criteria[criterionIds.at(-1)!];
      if (fault.variant === "level_out_of_range") criteria[first].level = 5;
      if (fault.variant === "non_integer_level") criteria[first].level = 2.5;
      if (fault.variant === "empty_justification") criteria[first].justification = " ";
    }
    if (fault?.kind === "missing_quote") criteria[first].quotes = ["A sentence the student never wrote."];
    return {
      criteria,
      general_comment: remarks.comment,
      next_steps: [remarks.next],
      flags: texts?.flags ?? { other_language: false, off_topic: false, addressed_to_marker: false },
    };
  }
}

/** A fault of the reading simulator: a failed call, an answer off the schema, or a page read as blank. */
export type SimulatedReadingFault = CallFault | { kind: "invalid_output" } | { kind: "no_writing" };

export type CapturedReading = { request: ReadingRequest; subjectId: string | null };

/** What the reading simulator reads on a page no test named. */
export const SIMULATED_READING = "Simulated reading of a page.";

const sha256 = (base64: string) => createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");

/**
 * The default reader everywhere (spec 0011): nothing leaves the machine. It
 * reads a fixture image as the test said (keyed on the image's bytes), any
 * other as SIMULATED_READING, and fails on demand like the evaluator, plus
 * a page without writing.
 */
export class SimulatorReader implements Reader {
  readonly provider = "simulator" as const;
  readonly model = "simulator";

  private faults: SimulatedReadingFault[] = [];
  private holds: Promise<void>[] = [];
  private requests: CapturedReading[] = [];
  private readings = new Map<string, Reading>();

  constructor(private readonly callTimeoutMs: number = AI_CALL_TIMEOUT_MS) {}

  async read(request: ReadingRequest, context: EvaluationContext): Promise<ReadingResponse> {
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(this.callTimeoutMs)]);
    if (signal.aborted) throw abortError();
    this.requests.push({ request, subjectId: context.subjectId });
    if (this.requests.length > CAPTURE_LIMIT) this.requests.shift();

    const hold = this.holds.shift();
    if (hold) await Promise.race([hold, untilAborted(signal)]);

    const fault = this.faults.shift();
    if (fault && isCallFault(fault)) return failWith(fault, signal);
    if (fault?.kind === "invalid_output") return reply("This is not JSON.", this.model);
    const reading =
      fault?.kind === "no_writing"
        ? { hasWriting: false, text: "" }
        : (this.readings.get(sha256(request.image.base64)) ?? { hasWriting: true, text: SIMULATED_READING });
    return reply(JSON.stringify({ has_writing: reading.hasWriting, text: reading.text }), this.model);
  }

  /** What the next readings of this image (its JPEG bytes) give. */
  setReading(jpeg: Uint8Array, reading: Reading): void {
    this.readings.set(sha256(Buffer.from(jpeg).toString("base64")), reading);
  }

  /** The next `times` calls fail with this fault, in order after any already queued. */
  failNext(fault: SimulatedReadingFault, times = 1): void {
    for (let i = 0; i < times; i++) this.faults.push(fault);
  }

  /** The next call waits until release() (or its abort): to confirm or replace while a page is read. */
  holdNext(): () => void {
    let release!: () => void;
    this.holds.push(new Promise<void>((resolve) => (release = resolve)));
    return () => release();
  }

  /** The last requests received, oldest first (at most 20). */
  captured(): readonly CapturedReading[] {
    return this.requests;
  }

  /** Forgets the requests, faults, holds and readings. */
  clear(): void {
    this.requests = [];
    this.faults = [];
    this.holds = [];
    this.readings.clear();
  }
}
