import { EvaluatorError } from "./types";

/**
 * The kind of a failed HTTP answer (EVL-03 R3), with a default for any other
 * status: an unknown status never escapes as a provider error.
 */
export function errorForStatus(status: number, retryAfterMs?: number, providerCode?: string): EvaluatorError {
  if (status === 429) return new EvaluatorError("rate_limited", retryAfterMs, providerCode);
  if (status === 401 || status === 403 || status === 404) return new EvaluatorError("configuration", undefined, providerCode);
  if (status >= 400 && status < 500) return new EvaluatorError("rejected", undefined, providerCode);
  return new EvaluatorError("unavailable", undefined, providerCode);
}

/** An identifier: letters, digits and _ . : - only, at most 64 characters. Anything else could be content. */
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * Mistral's error "type" and "code" from an error body, joined by "/", each
 * kept only when it is an identifier; undefined otherwise. Never the message.
 */
export function providerCodeOf(body: unknown): string | undefined {
  if (typeof body !== "string") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const { type, code } = parsed as Record<string, unknown>;
  const parts = [type, code].map((v) => (typeof v === "number" ? String(v) : v)).filter((v): v is string => typeof v === "string" && IDENTIFIER.test(v));
  return parts.length > 0 ? parts.join("/") : undefined;
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
