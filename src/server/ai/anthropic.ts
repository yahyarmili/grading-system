import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_INFERENCE_GEO, AI_MODEL } from "@/config/decisions";
import { AI_CALL_TIMEOUT_MS } from "@/config/provisional";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { errorForStatus, identifierOf, parseRetryAfter } from "./errors";
import {
  AiConfigurationError,
  AiJournalError,
  EvaluatorError,
  type EvaluationContext,
  type EvaluationRequest,
  type EvaluationResponse,
  type Evaluator,
  type Usage,
} from "./types";

// The Anthropic adapter (rule 3), the only file that imports the SDK
// (@anthropic-ai/sdk, pinned to 0.135.0: audited in
// conception/annexe-ia-anthropic.md §5). Real sendings only: the simulator is
// the default (index.ts). What it guarantees (plan of E5, §3):
// - the SDK is hardened by explicit options: no retry, no log, no telemetry,
//   no key, token or URL read from the environment, a fetch of its own;
// - every request goes through guardedFetch: POST to the messages endpoint
//   only, the expected body keys only, four headers only (no User-Agent, no
//   X-Stainless-*, no attribution), its security log line written before it
//   leaves (DON-05): a log that fails sends nothing;
// - each call is bounded, answer read included;
// - the key is the one passed in, never read from the environment, and
//   ANTHROPIC_* and NODE_DEBUG are refused, at start and at each call;
// - nothing identifies a user: never "metadata";
// - the SDK's errors carry the error body in their message: none leaves this
//   file, only an EvaluatorError of a fixed kind with identifiers.

const BASE_URL = "https://api.anthropic.com";
/** The only request that may leave. */
const ENDPOINT = `${BASE_URL}/v1/messages`;

/** The only headers sent; any other the SDK adds is dropped. */
const SENT_HEADERS = ["accept", "anthropic-version", "content-type", "x-api-key"] as const;

/** The keys of the body (plan §4): never temperature, top_p, top_k, metadata, tools, stream, service_tier… */
const BODY_KEYS = new Set(["model", "max_tokens", "system", "messages", "output_config", "thinking", "inference_geo"]);

/** The SDK's headers that describe the machine and the library; removed at the source too. */
const PLATFORM_HEADERS = [
  "User-Agent",
  "X-Stainless-Lang",
  "X-Stainless-Package-Version",
  "X-Stainless-OS",
  "X-Stainless-Arch",
  "X-Stainless-Runtime",
  "X-Stainless-Runtime-Version",
  "X-Stainless-Retry-Count",
  "X-Stainless-Timeout",
] as const;

const SILENT = { error() {}, warn() {}, info() {}, debug() {} };

/**
 * Variables refused whatever their value: NODE_DEBUG makes Node print the
 * requests; the SDK reads ANTHROPIC_CUSTOM_HEADERS whatever its options, and
 * the other ANTHROPIC_* (a key, a token, a URL, a log level, telemetry) are
 * refused alike (annexe §5).
 */
export function forbiddenVariables(env: Record<string, string | undefined>): string[] {
  return Object.keys(env)
    .filter((name) => env[name] !== undefined && (name === "NODE_DEBUG" || name.startsWith("ANTHROPIC_")))
    .sort();
}

function assertCleanEnvironment(env: Record<string, string | undefined>): void {
  const set = forbiddenVariables(env);
  if (set.length > 0) {
    throw new AiConfigurationError(`Unset ${set.join(", ")}: the AI's library or Node would read them.`);
  }
}

/** Writes that a request leaves for Anthropic, before it leaves. Identifiers only. */
export type Journal = (subjectId: string | null) => Promise<void>;

const journalSending: Journal = (subjectId) => recordSecurityEvent("ai_request_sent", { subjectId });

/** Sends one request; without one, the global fetch, looked up at call time (the tests' network guard replaces it). */
export type Fetcher = (request: Request) => Promise<Response>;

export type AnthropicOptions = {
  apiKey: string;
  /** Tests only: receives the final Request instead of the network. */
  fetcher?: Fetcher;
  /** Tests only: the security log line. */
  journal?: Journal;
  /** Longest wait for one call, answer read included. */
  callTimeoutMs?: number;
  /** Where the forbidden variables are looked for, at start and at each call. */
  env?: Record<string, string | undefined>;
  /** Tests only: the SDK's retries, to show that maxRetries: 0 is what stops them. */
  maxRetries?: number;
};

/** guardedFetch refused a request the adapter never builds: a bug, ended on "internal". */
export class AiRequestBlockedError extends Error {
  constructor() {
    super("A request to the AI was blocked: not the expected endpoint, method or body.");
    this.name = "AiRequestBlockedError";
  }
}

/** What one call's fetch saw, read after the SDK has wrapped its errors. */
type CallState = { journalFailed: boolean; blocked: boolean };

export function createAnthropicEvaluator({
  apiKey,
  fetcher,
  journal = journalSending,
  callTimeoutMs = AI_CALL_TIMEOUT_MS,
  env = process.env,
  maxRetries = 0,
}: AnthropicOptions): Evaluator {
  assertCleanEnvironment(env);
  const key = apiKey.trim();
  if (key === "") throw new AiConfigurationError("GRADING_ANTHROPIC_API_KEY is empty.");
  if (!Number.isInteger(callTimeoutMs) || callTimeoutMs <= 0) {
    throw new AiConfigurationError("The call timeout must be a positive whole number of milliseconds.");
  }

  return {
    provider: "anthropic",
    model: AI_MODEL,

    async evaluate(request: EvaluationRequest, { signal, subjectId }: EvaluationContext): Promise<EvaluationResponse> {
      // A variable set after the start does not pass either.
      assertCleanEnvironment(env);
      const { effort, thinking } = request.generation;
      if (thinking === "disabled" && (effort === "xhigh" || effort === "max")) {
        throw new AiConfigurationError("Thinking cannot be disabled at the xhigh or max effort.");
      }
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(callTimeoutMs)]);
      if (deadline.aborted) throw new EvaluatorError("timeout");

      // One client per call: the log's subject stays in this call's fetch, shared with no other call.
      const state: CallState = { journalFailed: false, blocked: false };
      const client = new Anthropic({
        apiKey: key,
        authToken: null,
        webhookKey: null,
        baseURL: BASE_URL,
        maxRetries,
        timeout: callTimeoutMs,
        logLevel: "off",
        logger: SILENT,
        openTelemetry: false,
        fetch: guardedFetch({ key, subjectId, state, journal, fetcher }),
        fetchOptions: { cache: "no-store" },
        defaultHeaders: Object.fromEntries(PLATFORM_HEADERS.map((name) => [name, null])),
      });

      let message: unknown;
      try {
        message = await untilDeadline(client.messages.create(bodyOf(request), { signal: deadline, maxRetries }), deadline);
      } catch (error) {
        // Nothing of the SDK's error leaves: its message holds the error body.
        if (state.journalFailed) throw new AiJournalError();
        if (state.blocked) throw new AiRequestBlockedError();
        throw classify(error, deadline);
      }
      return readMessage(message);
    },
  };
}

/** The body sent (plan §4): the whitelist request, the pinned model and region, nothing else. Exported for its digest test only (tests/ai-request.test.ts). */
export function bodyOf(request: EvaluationRequest): Anthropic.MessageCreateParamsNonStreaming {
  const { effort, thinking, maxOutputTokens } = request.generation;
  return {
    model: AI_MODEL,
    max_tokens: maxOutputTokens,
    system: request.system,
    messages: [{ role: "user", content: request.user }],
    output_config: { format: { type: "json_schema", schema: { ...request.schema } }, effort },
    thinking: thinking === "adaptive" ? { type: "adaptive", display: "omitted" } : { type: "disabled" },
    inference_geo: AI_INFERENCE_GEO,
  };
}

type SdkFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * The SDK's fetch, called with the final init (exported for its tests): refuses anything but the
 * expected request, keeps four headers, writes the log line, then sends.
 */
export function guardedFetch({
  key,
  subjectId,
  state,
  journal,
  fetcher,
}: {
  key: string;
  subjectId: string | null;
  state: CallState;
  journal: Journal;
  fetcher: Fetcher | undefined;
}): SdkFetch {
  return async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    if (url !== ENDPOINT || method !== "POST" || !hasExpectedKeys(init.body)) {
      state.blocked = true;
      throw new AiRequestBlockedError();
    }
    const source = new Headers(init.headers);
    const headers = new Headers();
    for (const name of SENT_HEADERS) {
      const value = source.get(name);
      if (value !== null) headers.set(name, value);
    }
    // The key passed in, whatever a variable or the SDK set.
    headers.set("x-api-key", key);

    try {
      await journal(subjectId);
    } catch {
      state.journalFailed = true;
      throw new AiJournalError();
    }
    // The log took the whole deadline (a database waking up): the line says "about to send", but nothing leaves.
    if (init.signal?.aborted) throw new EvaluatorError("timeout");

    const outgoing = new Request(url, { method, headers, body: init.body as string, signal: init.signal ?? null, cache: "no-store" });
    return fetcher ? fetcher(outgoing) : globalThis.fetch(outgoing);
  };
}

/** A JSON body whose keys are all expected. */
function hasExpectedKeys(body: unknown): boolean {
  if (typeof body !== "string") return false;
  try {
    const parsed: unknown = JSON.parse(body);
    return !!parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).every((k) => BODY_KEYS.has(k));
  } catch {
    return false;
  }
}

/** The call, bounded by the deadline even when the body stalls (the SDK's timeout stops at the headers). */
function untilDeadline<T>(call: Promise<T>, deadline: AbortSignal): Promise<T> {
  // The call may still fail after the deadline: nobody waits for it any more.
  call.catch(() => {});
  return Promise.race([
    call,
    new Promise<never>((_, reject) => {
      if (deadline.aborted) reject(new EvaluatorError("timeout"));
      deadline.addEventListener("abort", () => reject(new EvaluatorError("timeout")), { once: true });
    }),
  ]);
}

/** The kind of a failed call, from the SDK's error: its status, type, code and retry-after only. */
function classify(error: unknown, deadline: AbortSignal): EvaluatorError {
  if (error instanceof EvaluatorError) return error;
  if (deadline.aborted) return new EvaluatorError("timeout");
  if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIUserAbortError) {
    return new EvaluatorError("timeout");
  }
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    const failure = errorForStatus(error.status, error.error, parseRetryAfter(error.headers?.get("retry-after")));
    const requestId = identifierOf(error.requestID);
    return new EvaluatorError(failure.kind, failure.retryAfterMs, failure.providerCode, {
      status: error.status,
      ...(requestId ? { requestId } : {}),
    });
  }
  // Network down, a body that is not JSON, anything else: the error itself is left behind.
  return new EvaluatorError("unavailable");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * The answer, or the kind of its failure. The stop reason is read before the
 * content: a refusal is a failure (billed, its usage carried); a cut answer
 * goes to the validator; any other reason is a failure of the service.
 */
export function readMessage(message: unknown): EvaluationResponse {
  if (!isRecord(message) || message.type !== "message") throw new EvaluatorError("unavailable");
  const usage = usageOf(message.usage);
  const stopReason = message.stop_reason;
  if (stopReason === "refusal") {
    const category = identifierOf(isRecord(message.stop_details) ? message.stop_details.category : undefined) ?? "null";
    throw new EvaluatorError("refused", undefined, `refusal/${category}`, { stopReason: "refusal", usage: usage ?? undefined });
  }
  if (stopReason !== "end_turn" && stopReason !== "max_tokens") {
    const code = identifierOf(stopReason);
    throw new EvaluatorError("unavailable", undefined, code ? `stop_reason/${code}` : undefined);
  }
  return {
    content: textOf(message.content),
    modelAnswered: identifierOf(message.model) ?? null,
    providerAnswered: null,
    stopReason,
    usage,
  };
}

/** The text blocks, joined; thinking, redacted thinking and anything else are left out, never kept. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((block: unknown) => (isRecord(block) && block.type === "text" && typeof block.text === "string" ? block.text : "")).join("");
}

/** The counts, field by field (whole numbers ≥ 0, null otherwise), and the sums a run stores (plan §2). */
function usageOf(usage: unknown): Usage | null {
  if (!isRecord(usage)) return null;
  const count = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
  const inputTokens = count(usage.input_tokens);
  const outputTokens = count(usage.output_tokens);
  const cacheReadTokens = count(usage.cache_read_input_tokens);
  const cacheCreationTokens = count(usage.cache_creation_input_tokens);
  const promptTokens = inputTokens === null ? null : inputTokens + (cacheReadTokens ?? 0) + (cacheCreationTokens ?? 0);
  return {
    promptTokens,
    completionTokens: outputTokens,
    totalTokens: promptTokens === null || outputTokens === null ? null : promptTokens + outputTokens,
    detail: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, inferenceGeo: identifierOf(usage.inference_geo) ?? null },
  };
}
