import { describe, expect, it } from "vitest";
import { errorForStatus, errorObjectOf, identifierOf, parseRetryAfter } from "./errors";

// Anthropic's errors, one case per row of the table (plan of E5, §3, point 7):
// by status, error type and error_code, the message read only against a
// documented beginning, never kept.

const MARKER = "MARKER-ERROR-MESSAGE-5d1e";
const body = (type: string, message = MARKER, details?: unknown) => ({
  type: "error",
  error: { type, message, ...(details === undefined ? {} : { details }) },
  request_id: "req_011CSHoEeqs5C35K2UUqR7Fy",
});

describe("errorForStatus", () => {
  it.each([
    ["400, the workspace's spending limit", 400, body("invalid_request_error", "You have reached your specified workspace API usage limits. You will regain access on 2026-11-01."), "budget", "invalid_request_error/spend_limit"],
    ["400, the organization's spending limit", 400, body("invalid_request_error", "You have reached your specified API usage limits. You will regain access on 2026-11-01."), "budget", "invalid_request_error/spend_limit"],
    ["400, no credit left", 400, body("invalid_request_error", "Your credit balance is too low to access the Anthropic API."), "budget", "invalid_request_error/credit_exhausted"],
    ["429, no credit left (status not documented)", 429, body("rate_limit_error", "Your credit balance is too low to access the Anthropic API."), "budget", "rate_limit_error/credit_exhausted"],
    ["403, no credit left", 403, body("permission_error", "Your credit balance is too low to access the Anthropic API."), "budget", "permission_error/credit_exhausted"],
    ["500, no credit left (whatever the status, plan of E6 §4)", 500, body("api_error", "Your credit balance is too low to access the Anthropic API."), "budget", "api_error/credit_exhausted"],
    ["400, any other", 400, body("invalid_request_error"), "configuration", "invalid_request_error"],
    ["401", 401, body("authentication_error"), "configuration", "authentication_error"],
    ["402", 402, body("billing_error"), "budget", "billing_error"],
    ["403", 403, body("permission_error"), "configuration", "permission_error"],
    ["404", 404, body("not_found_error"), "configuration", "not_found_error"],
    ["429, the tier's spending cap", 429, body("rate_limit_error", MARKER, { error_code: "enforced_spend_limit_reached" }), "budget", "rate_limit_error/enforced_spend_limit_reached"],
    ["429, any other", 429, body("rate_limit_error"), "rate_limited", "rate_limit_error"],
    ["504", 504, body("timeout_error"), "timeout", "timeout_error"],
    ["409", 409, body("conflict_error"), "unavailable", "conflict_error"],
    ["500", 500, body("api_error"), "unavailable", "api_error"],
    ["529", 529, body("overloaded_error"), "unavailable", "overloaded_error"],
    ["502 without a body", 502, undefined, "unavailable", undefined],
    ["413, from Cloudflare", 413, "<html>Request Entity Too Large</html>", "rejected", undefined],
    ["418, any other 4xx", 418, body("invalid_request_error"), "rejected", "invalid_request_error"],
    ["a 3xx", 302, undefined, "unavailable", undefined],
  ] as const)("%s → %s", (_label, status, error, kind, code) => {
    const failure = errorForStatus(status, error, status === 429 ? 7000 : undefined);
    expect(failure.kind).toBe(kind);
    expect(failure.providerCode).toBe(code);
    expect(`${failure.message} ${failure.providerCode ?? ""}`).not.toContain(MARKER);
  });

  it("keeps the wait for a rate limit only, never for the tier's spending cap", () => {
    expect(errorForStatus(429, body("rate_limit_error"), 7000).retryAfterMs).toBe(7000);
    expect(errorForStatus(429, body("rate_limit_error", MARKER, { error_code: "enforced_spend_limit_reached" }), 7000).retryAfterMs).toBeUndefined();
    expect(errorForStatus(500, body("api_error"), 7000).retryAfterMs).toBeUndefined();
  });

  it("reads the spending limit from the beginning of the message only, a 400 only", () => {
    expect(errorForStatus(400, body("invalid_request_error", `${MARKER} You have reached your specified API usage limits`)).providerCode).toBe("invalid_request_error");
    expect(errorForStatus(403, body("permission_error", "You have reached your specified API usage limits")).providerCode).toBe("permission_error");
  });

  it("keeps no type or error code that is not an identifier", () => {
    const failure = errorForStatus(429, body(`${MARKER} spaced`, MARKER, { error_code: `${MARKER}\n` }));
    expect(failure.kind).toBe("rate_limited");
    expect(failure.providerCode).toBeUndefined();
  });
});

describe("helpers", () => {
  it("reads the error object of a body, or nothing", () => {
    expect(errorObjectOf(body("api_error"))).toMatchObject({ type: "api_error" });
    for (const value of [undefined, null, "x", [], { error: "x" }, { error: [] }]) expect(errorObjectOf(value)).toBeUndefined();
  });

  it("keeps identifiers only", () => {
    expect(identifierOf("overloaded_error")).toBe("overloaded_error");
    for (const value of ["", "has space", "x".repeat(65), 7, null, `a\nb`]) expect(identifierOf(value)).toBeUndefined();
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates; ignores anything else", () => {
    expect(parseRetryAfter("7")).toBe(7000);
    expect(parseRetryAfter("1.5")).toBe(1500);
    expect(parseRetryAfter("Fri, 16 Oct 2026 12:00:10 GMT", Date.parse("2026-10-16T12:00:00Z"))).toBe(10_000);
    expect(parseRetryAfter("Fri, 16 Oct 2026 11:00:00 GMT", Date.parse("2026-10-16T12:00:00Z"))).toBe(0);
    for (const value of [null, undefined, "", "soon", "-3"]) expect(parseRetryAfter(value)).toBeUndefined();
  });
});
