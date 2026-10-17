import { AI_CALL_TIMEOUT_MS } from "@/config/provisional";
import { criterionIds, type CriterionId, type Level } from "@/lib/rubric";
import { errorForStatus } from "./errors";
import {
  EvaluatorError,
  type EvaluationContext,
  type EvaluationRequest,
  type EvaluationResponse,
  type Evaluator,
} from "./types";

// The default evaluator everywhere (tests, development, E2E): nothing leaves
// the machine, so nothing is written to the security log. Its answers follow
// the output contract of the plan (E5, §5), derived from the request alone,
// and faults are injected on demand (NFR-EXP-04).

export type SimulatedFault =
  | { kind: "error"; status: 500 | 429 | 401; retryAfterMs?: number }
  /** Waits until the call is aborted (its deadline or the caller), then fails as a timeout. */
  | { kind: "timeout" }
  | {
      kind: "invalid_output";
      variant: "not_json" | "missing_criterion" | "level_out_of_range" | "non_integer_level" | "empty_justification";
    }
  /** A well-formed answer whose first quote is not in the text. */
  | { kind: "missing_quote" };

export type CapturedRequest = { request: EvaluationRequest; subjectId: string | null };

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

/** Resolves when the signal aborts (never before), rejecting as a timeout. */
const untilAborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    if (signal.aborted) reject(abortError());
    else signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });

export class SimulatorEvaluator implements Evaluator {
  readonly provider = "simulator" as const;
  readonly model = "simulator";

  private faults: SimulatedFault[] = [];
  private holds: Promise<void>[] = [];
  private requests: CapturedRequest[] = [];
  private levels: Record<CriterionId, Level> = this.uniform(DEFAULT_LEVEL);

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
    if (fault?.kind === "error") throw errorForStatus(fault.status, fault.retryAfterMs);
    if (fault?.kind === "timeout") return untilAborted(signal);

    const content =
      fault?.kind === "invalid_output" && fault.variant === "not_json"
        ? "This is not JSON."
        : JSON.stringify(this.answer(request, fault));
    return { content, modelAnswered: this.model, providerAnswered: null, usage: null };
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

  /** The last requests received, oldest first (at most 20). */
  captured(): readonly CapturedRequest[] {
    return this.requests;
  }

  /** Forgets the requests, faults, holds and levels. */
  clear(): void {
    this.requests = [];
    this.faults = [];
    this.holds = [];
    this.levels = this.uniform(DEFAULT_LEVEL);
  }

  private uniform(level: Level): Record<CriterionId, Level> {
    return Object.fromEntries(criterionIds.map((id) => [id, level])) as Record<CriterionId, Level>;
  }

  private answer(request: EvaluationRequest, fault: SimulatedFault | undefined) {
    const { text, language } = readUserMessage(request.user);
    const remarks = REMARKS[language];
    const quote = firstWords(text);
    const criteria: Record<string, { level: number; justification: string; quotes: string[] }> = Object.fromEntries(
      criterionIds.map((id) => [id, { level: this.levels[id], justification: remarks.justification, quotes: [quote] }]),
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
      flags: { other_language: false, off_topic: false, addressed_to_marker: false },
    };
  }
}
