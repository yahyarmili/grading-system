import { EvaluatorError } from "./types";

// Anthropic's errors (https://platform.claude.com/docs/en/api/errors, read
// 2026-10-19): a body {type: "error", error: {type, message, details?},
// request_id}, with the HTTP status. Only identifiers are kept: the message
// may hold our input. It is read only to compare a documented beginning
// (the spending limits, https://platform.claude.com/docs/en/api/rate-limits),
// then forgotten.

/** An identifier: letters, digits and _ . : - only, at most 64 characters. Anything else could be content. */
export const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,64}$/;

/** The value when it is an identifier; undefined otherwise. */
export const identifierOf = (value: unknown): string | undefined =>
  typeof value === "string" && IDENTIFIER.test(value) ? value : undefined;

/** The limit set in the Console (workspace or organization): a 400, never retried. */
const SPEND_LIMIT = ["You have reached your specified API usage limits", "You have reached your specified workspace API usage limits"];
/** No credit left; its status is not documented: read on any 4xx, a 429 included (plan of E6 §4). */
const CREDIT_EXHAUSTED = "Your credit balance is too low";

/** The error object of an Anthropic body (its "error" field), or undefined when the body is not one. */
export function errorObjectOf(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const error = (body as { error?: unknown }).error;
  return error && typeof error === "object" && !Array.isArray(error) ? (error as Record<string, unknown>) : undefined;
}

const startsWithAny = (message: unknown, beginnings: readonly string[]) =>
  typeof message === "string" && beginnings.some((beginning) => message.startsWith(beginning));

/**
 * The kind of a failed answer (EVL-03 R3), from its HTTP status and
 * Anthropic's error object (plan of E5 §3, point 7). Budget [P] (plan of E6
 * §4): the Console's spending limit, no credit left, the tier's spending cap
 * and the billing error (402); never retried, the submission becomes "AI
 * unavailable". A wrong key, model or request stays configuration or
 * rejected. An unknown status never escapes as a provider error.
 */
export function errorForStatus(status: number, body?: unknown, retryAfterMs?: number): EvaluatorError {
  const error = errorObjectOf(body);
  const type = identifierOf(error?.type);
  const details = error?.details && typeof error.details === "object" ? (error.details as Record<string, unknown>) : undefined;
  const errorCode = identifierOf(details?.error_code);
  const fail = (kind: EvaluatorError["kind"], code = type, wait?: number) => new EvaluatorError(kind, wait, code);

  if (status >= 400 && status < 500 && startsWithAny(error?.message, [CREDIT_EXHAUSTED])) {
    return fail("budget", `${type ?? "error"}/credit_exhausted`);
  }
  if (status === 400) {
    if (startsWithAny(error?.message, SPEND_LIMIT)) return fail("budget", "invalid_request_error/spend_limit");
    return fail("configuration");
  }
  if (status === 402) return fail("budget");
  if (status === 401 || status === 403 || status === 404) return fail("configuration");
  if (status === 429) {
    if (errorCode === "enforced_spend_limit_reached") return fail("budget", `${type ?? "rate_limit_error"}/${errorCode}`);
    return fail("rate_limited", type, retryAfterMs);
  }
  if (status === 504) return fail("timeout");
  if (status === 409 || status >= 500) return fail("unavailable");
  if (status >= 400) return fail("rejected");
  return fail("unavailable");
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
