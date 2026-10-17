import { EvaluatorError } from "./types";

// OpenRouter's errors (https://openrouter.ai/docs/api_reference/errors-and-debugging):
// a body {error: {code, message, metadata?}}, with the HTTP status, or inside
// a 200 when the failure came after the provider accepted the request. Only
// identifiers are kept: the message, metadata.raw and the moderation details
// may hold our input.

/**
 * The kind of a failed answer (EVL-03 R3), from its HTTP status (or the code
 * of an error inside a 200) and OpenRouter's error object, with a default for
 * any other status: an unknown status never escapes as a provider error.
 */
export function errorForStatus(status: number, retryAfterMs?: number, error?: unknown): EvaluatorError {
  const code = providerCodeOf(error);
  if (status === 408) return new EvaluatorError("timeout", undefined, code);
  if (status === 429) return new EvaluatorError("rate_limited", retryAfterMs, code);
  // 402: no credit left (a negative balance, even on a free model).
  if (status === 401 || status === 402 || status === 404) return new EvaluatorError("configuration", undefined, code);
  // 403: a budget of the account, or our request refused (moderation, guardrail).
  if (status === 403) return new EvaluatorError(isBudgetBlock(error) ? "configuration" : "rejected", undefined, code);
  if (status >= 400 && status < 500) return new EvaluatorError("rejected", undefined, code);
  return new EvaluatorError("unavailable", undefined, code);
}

/** An identifier: letters, digits and _ . : - only, at most 64 characters. Anything else could be content. */
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,64}$/;

const metadataOf = (error: unknown): Record<string, unknown> | undefined => {
  const metadata = error && typeof error === "object" ? (error as { metadata?: unknown }).metadata : undefined;
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined;
};

const isBudgetBlock = (error: unknown) => typeof metadataOf(error)?.limit_source === "string";

/**
 * OpenRouter's error_type and the upstream provider_code from an error
 * object's metadata, joined by "/", each kept only when it is an identifier;
 * undefined otherwise. Never the message.
 */
export function providerCodeOf(error: unknown): string | undefined {
  const metadata = metadataOf(error);
  if (!metadata) return undefined;
  const parts = [metadata.error_type, metadata.provider_code]
    .map((v) => (typeof v === "number" ? String(v) : v))
    .filter((v): v is string => typeof v === "string" && IDENTIFIER.test(v));
  return parts.length > 0 ? parts.join("/") : undefined;
}

/** The error object of an OpenRouter body (its "error" field), or undefined when the body is not one. */
export function errorObjectOf(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const error = (body as { error?: unknown }).error;
  return error && typeof error === "object" && !Array.isArray(error) ? error : undefined;
}

/** The HTTP-like code of an error object (OpenRouter's error.code), when it is one. */
export function errorCodeOf(error: unknown): number | undefined {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "number" && Number.isInteger(code) ? code : undefined;
}

/** Retry-After in milliseconds, from seconds or an HTTP date; undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  // An HTTP date only ("Fri, 16 Oct 2026 12:00:10 GMT"): Date.parse also reads "-3" as a year.
  if (!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed)) return undefined;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
