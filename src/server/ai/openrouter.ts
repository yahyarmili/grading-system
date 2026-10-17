import "server-only";
import { AI_MODEL, AI_ROUTING } from "@/config/decisions";
import { AI_CALL_TIMEOUT_MS } from "@/config/provisional";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { errorCodeOf, errorForStatus, errorObjectOf, parseRetryAfter } from "./errors";
import {
  AiConfigurationError,
  EvaluatorError,
  type EvaluationContext,
  type EvaluationRequest,
  type EvaluationResponse,
  type Evaluator,
  type Usage,
} from "./types";

// The OpenRouter adapter (rule 3), on the platform's fetch, without a client
// library: a library reads its own variables (a key, a base URL, a log level),
// retries by itself and adds headers describing the machine. Real sendings
// only: the simulator is the default (index.ts). What it guarantees:
// - each HTTP request is preceded by its security log line (DON-05): a log
//   that fails sends nothing;
// - each call is bounded, answer read included;
// - the key is the one passed in, never read from the environment;
// - nothing identifies the app or a user: no attribution header
//   (HTTP-Referer, X-Title, X-OpenRouter-Title, X-OpenRouter-Categories), no
//   "user" field; the provider sees the account only;
// - OpenRouter's errors carry a message, sometimes our input (moderation,
//   raw provider payload): none leaves this file, only an EvaluatorError of a
//   fixed kind with identifiers.

/**
 * Variables that make Node write requests somewhere (NODE_DEBUG=http,undici
 * prints them). Refused whatever their value.
 */
export const FORBIDDEN_ENV = ["NODE_DEBUG"] as const;

/** OpenRouter's chat endpoint, stated in full. */
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Writes that a request leaves for OpenRouter, before it leaves. Identifiers only. */
export type Journal = (subjectId: string | null) => Promise<void>;

const journalSending: Journal = (subjectId) => recordSecurityEvent("ai_request_sent", { subjectId });

/** Sends one request; the real fetch, looked up at call time (the tests' network guard replaces it). */
export type Fetcher = (request: Request) => Promise<Response>;

const realFetch: Fetcher = (request) => fetch(request);

export type OpenRouterOptions = {
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

export function createOpenRouterEvaluator({
  apiKey,
  fetcher = realFetch,
  journal = journalSending,
  callTimeoutMs = AI_CALL_TIMEOUT_MS,
  env = process.env,
}: OpenRouterOptions): Evaluator {
  const set = FORBIDDEN_ENV.filter((name) => env[name] !== undefined);
  if (set.length > 0) {
    throw new AiConfigurationError(`Unset ${set.join(", ")}: Node would print the requests sent to the AI.`);
  }
  const key = apiKey.trim();
  if (key === "") throw new AiConfigurationError("OPENROUTER_API_KEY is empty.");
  if (!Number.isInteger(callTimeoutMs) || callTimeoutMs <= 0) {
    throw new AiConfigurationError("The call timeout must be a positive whole number of milliseconds.");
  }

  return {
    provider: "openrouter",
    model: AI_MODEL,

    async evaluate(request: EvaluationRequest, { signal, subjectId }: EvaluationContext): Promise<EvaluationResponse> {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(callTimeoutMs)]);
      if (deadline.aborted) throw new EvaluatorError("timeout");

      // A failure of the log is the caller's to handle, as it is: nothing has left.
      await journal(subjectId);
      // The log took the whole deadline (database waking up): the line says "about to send", but nothing leaves.
      if (deadline.aborted) throw new EvaluatorError("timeout");

      const outgoing = new Request(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(bodyOf(request)),
        signal: deadline,
        // Never cached, by Next's fetch either.
        cache: "no-store",
      });

      let status: number;
      let retryAfter: string | null;
      let text: string;
      try {
        ({ status, retryAfter, text } = await untilDeadline(send(fetcher, outgoing), deadline));
      } catch (error) {
        if (error instanceof EvaluatorError) throw error;
        // Network down, or aborted: the error itself is left behind.
        throw new EvaluatorError(deadline.aborted ? "timeout" : "unavailable");
      }
      return readAnswer(status, retryAfter, text);
    },
  };
}

/** The body sent: the whitelist request (rule 5), the pinned model and routing, nothing else. */
function bodyOf(request: EvaluationRequest) {
  return {
    model: AI_MODEL,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    temperature: request.generation.temperature,
    max_tokens: request.generation.maxOutputTokens,
    reasoning: { effort: request.generation.reasoningEffort },
    response_format: {
      type: "json_schema",
      json_schema: { name: request.schemaName, strict: true, schema: request.schema },
    },
    provider: AI_ROUTING,
    stream: false,
  };
}

/** One request, its answer read in full under the request's own signal. */
async function send(fetcher: Fetcher, request: Request) {
  const response = await fetcher(request);
  const text = await response.text();
  return { status: response.status, retryAfter: response.headers.get("retry-after"), text };
}

/**
 * The call, bounded by the deadline even when the fetcher ignores the signal
 * (a fetch that never answers, a body that never ends).
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

/** A name as OpenRouter gives a provider ("Phala", "Google AI Studio"); anything else is not kept. */
const PROVIDER_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.:()-]{0,63}$/;

/**
 * The answer, or the kind of its failure. An error can arrive with its HTTP
 * status, or inside a 200: at the top (no choices), or in the choice, after
 * part of the answer (which is dropped).
 */
export function readAnswer(status: number, retryAfter: string | null, text: string): EvaluationResponse {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  const retryAfterMs = parseRetryAfter(retryAfter);
  if (status < 200 || status >= 300) throw errorForStatus(status, retryAfterMs, errorObjectOf(body));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new EvaluatorError("unavailable");

  const topError = errorObjectOf(body);
  if (topError) throw errorForStatus(errorCodeOf(topError) ?? 500, retryAfterMs, topError);

  const answer = body as { model?: unknown; provider?: unknown; usage?: unknown; choices?: unknown };
  const choice = Array.isArray(answer.choices) ? (answer.choices[0] as Record<string, unknown> | undefined) : undefined;
  if (!choice || typeof choice !== "object") throw new EvaluatorError("unavailable");
  const choiceError = choice.error && typeof choice.error === "object" ? choice.error : undefined;
  if (choiceError || choice.finish_reason === "error") {
    throw errorForStatus(errorCodeOf(choiceError) ?? 500, retryAfterMs, choiceError);
  }
  const message = choice.message as Record<string, unknown> | undefined;
  if (!message || typeof message !== "object") throw new EvaluatorError("unavailable");
  // The model refused, or a filter stopped it: our request, not a failure of the service.
  if (choice.finish_reason === "content_filter" || (typeof message.refusal === "string" && message.refusal !== "")) {
    throw new EvaluatorError("rejected");
  }

  return {
    content: textOf(message.content),
    modelAnswered: typeof answer.model === "string" && answer.model !== "" ? answer.model : null,
    providerAnswered: typeof answer.provider === "string" && PROVIDER_NAME.test(answer.provider) ? answer.provider : null,
    usage: usageOf(answer.usage),
  };
}

/** The answer's text: a string, or the text parts of a list; the reasoning and anything else are left out. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: unknown) =>
      part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("");
}

function usageOf(usage: unknown): Usage | null {
  if (!usage || typeof usage !== "object") return null;
  const count = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
  const { prompt_tokens, completion_tokens, total_tokens } = usage as Record<string, unknown>;
  return { promptTokens: count(prompt_tokens), completionTokens: count(completion_tokens), totalTokens: count(total_tokens) };
}
