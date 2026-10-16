import "server-only";
import { Mistral } from "@mistralai/mistralai";
import { HTTPClient, type Fetcher } from "@mistralai/mistralai/lib/http.js";
import { AI_MODEL } from "@/config/decisions";
import { AI_CALL_TIMEOUT_MS } from "@/config/provisional";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { errorForStatus, parseRetryAfter, providerCodeOf } from "./errors";
import {
  AiConfigurationError,
  EvaluatorError,
  type EvaluationContext,
  type EvaluationRequest,
  type EvaluationResponse,
  type Evaluator,
} from "./types";

// The Mistral adapter (rule 3), on the official SDK pinned at 2.7.0. Real
// sendings only: the simulator is the default (index.ts). What the SDK does by
// itself was read in its source (E5.3); the choices below follow from it:
// - every HTTP request goes through our fetcher, which writes the security log
//   line first (DON-05): a request the SDK refuses locally is never logged, a
//   log that fails sends nothing;
// - the SDK's errors carry the answer's body, even our input (422), in their
//   message: none leaves this file, only an EvaluatorError of a fixed kind;
// - its debug log writes the key and both bodies, and its telemetry the
//   prompts: the variables that turn them on are refused at start.

/**
 * Variables that make the SDK write the key, the request or the answer
 * somewhere (console, an OTLP endpoint). Refused whatever their value:
 * MISTRAL_DEBUG="false" still turns the debug log on.
 */
export const FORBIDDEN_ENV = [
  "MISTRAL_DEBUG",
  "MISTRAL_SDK_TELEMETRY",
  "MISTRAL_OTLP_TRACES_ENDPOINT",
  "MISTRAL_SDK_DEBUG_TRACING",
] as const;

/** The global endpoint, stated rather than left to the SDK's default. */
const SERVER_URL = "https://api.mistral.ai";

/** Replaces the debug logger: nothing is ever printed, even if MISTRAL_DEBUG were set later. */
const SILENT = { group() {}, groupEnd() {}, log() {} };

/** Writes that a request leaves for Mistral, before it leaves. Identifiers only. */
export type Journal = (subjectId: string | null) => Promise<void>;

const journalSending: Journal = (subjectId) => recordSecurityEvent("ai_request_sent", { subjectId });

/** The real fetch, looked up at call time (the tests' network guard replaces it). */
const realFetch: Fetcher = (input, init) => (init === undefined ? fetch(input) : fetch(input, init));

export type MistralOptions = {
  apiKey: string;
  /** Tests only: receives the final Request instead of the network. */
  fetcher?: Fetcher;
  /** Tests only: the security log line. */
  journal?: Journal;
  /** Longest wait for one call, answer read included. */
  callTimeoutMs?: number;
  /** Where the forbidden variables are looked for. */
  env?: Record<string, string | undefined>;
};

export function createMistralEvaluator({
  apiKey,
  fetcher = realFetch,
  journal = journalSending,
  callTimeoutMs = AI_CALL_TIMEOUT_MS,
  env = process.env,
}: MistralOptions): Evaluator {
  const set = FORBIDDEN_ENV.filter((name) => env[name] !== undefined);
  if (set.length > 0) {
    throw new AiConfigurationError(`Unset ${set.join(", ")}: the Mistral SDK would log or export the key and the requests.`);
  }
  // An empty key sends the request with no authorization at all; a blank one, a blank one.
  const key = apiKey.trim();
  if (key === "") throw new AiConfigurationError("MISTRAL_API_KEY is empty.");
  if (!Number.isInteger(callTimeoutMs) || callTimeoutMs <= 0) {
    throw new AiConfigurationError("The call timeout must be a positive whole number of milliseconds.");
  }

  return {
    provider: "mistral",
    model: AI_MODEL,

    async evaluate(request: EvaluationRequest, { signal, subjectId }: EvaluationContext): Promise<EvaluationResponse> {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(callTimeoutMs)]);
      if (deadline.aborted) throw new EvaluatorError("timeout");

      // A log failure is kept here: the SDK would wrap it as one of its own errors.
      // The HTTP status of the answer, when one came: it decides the kind before the SDK's error name.
      const sending: { logFailure?: { error: unknown }; status?: number; retryAfter?: string | null } = {};
      const client = new Mistral({
        apiKey: key,
        serverURL: SERVER_URL,
        retryConfig: { strategy: "none" },
        timeoutMs: callTimeoutMs,
        debugLogger: SILENT,
        httpClient: new HTTPClient({
          fetcher: async (input, init) => {
            try {
              await journal(subjectId);
            } catch (error) {
              sending.logFailure = { error };
              throw new Error("Security log unavailable: nothing sent.");
            }
            // The log took the whole deadline (database waking up): the line says "about to send", but nothing leaves.
            if (deadline.aborted) throw new EvaluatorError("timeout");
            const response = await fetcher(input, init);
            sending.status = response.status;
            sending.retryAfter = response.headers.get("retry-after");
            return response;
          },
        }),
      });

      try {
        const call = client.chat.complete(
          {
            model: AI_MODEL,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            temperature: request.generation.temperature,
            maxTokens: request.generation.maxOutputTokens,
            reasoningEffort: request.generation.reasoningEffort,
            responseFormat: {
              type: "json_schema",
              jsonSchema: { name: request.schemaName, schemaDefinition: { ...request.schema }, strict: true },
            },
          },
          { signal: deadline, retries: { strategy: "none" } },
        );
        const response = await untilDeadline(call, deadline);
        const choice = response.choices[0];
        const usage = response.usage;
        return {
          content: textOf(choice?.message?.content),
          modelAnswered: response.model || null,
          usage: usage
            ? {
                promptTokens: usage.promptTokens ?? null,
                completionTokens: usage.completionTokens ?? null,
                totalTokens: usage.totalTokens ?? null,
              }
            : null,
        };
      } catch (error) {
        // The security log failed: not a failure of the AI, the caller's to handle.
        if (sending.logFailure) throw sending.logFailure.error;
        throw classify(error, deadline, sending.status, sending.retryAfter);
      }
    },
  };
}

/** The answer's text: a string, or the text chunks of a list; anything else is left out. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((chunk: unknown) =>
      chunk && typeof chunk === "object" && (chunk as { type?: unknown }).type === "text" && typeof (chunk as { text?: unknown }).text === "string"
        ? (chunk as { text: string }).text
        : "",
    )
    .join("");
}

/**
 * The call, bounded by the deadline even while the answer is being read: the
 * SDK reads the body outside its own timeout handling.
 */
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

/**
 * The kind of a failed call, by the error's name and status only: its
 * message, body, headers and cause are left behind (they may hold the
 * answer, our input or the request). By name rather than instanceof: the
 * SDK's SDKValidationError claims any error with a raw value.
 */
export function classify(error: unknown, deadline: AbortSignal, httpStatus?: number, httpRetryAfter?: string | null): EvaluatorError {
  if (error instanceof EvaluatorError) return error;
  if (deadline.aborted) return new EvaluatorError("timeout");
  const headers = (error as { headers?: unknown } | null)?.headers;
  const retryAfter = parseRetryAfter(httpRetryAfter ?? (headers instanceof Headers ? headers.get("retry-after") : null));
  const code = providerCodeOf((error as { body?: unknown } | null)?.body);
  // An error status Mistral sent decides, whatever the SDK made of its body
  // (a 422 it could not parse is still our request refused).
  if (httpStatus !== undefined && httpStatus >= 400) return errorForStatus(httpStatus, retryAfter, code);
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "RequestTimeoutError":
    case "RequestAbortedError":
    case "TimeoutError":
    case "AbortError":
      return new EvaluatorError("timeout");
    case "ConnectionError":
      return new EvaluatorError("unavailable");
    // Our request refused before it left: a fault of the request, not of Mistral.
    case "SDKValidationError":
      return new EvaluatorError("rejected");
    // An answer the SDK could not read (a 200 that is not a chat completion).
    case "ResponseValidationError":
      return new EvaluatorError("unavailable");
  }
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status === "number") return errorForStatus(status, retryAfter, code);
  return new EvaluatorError("unavailable");
}
