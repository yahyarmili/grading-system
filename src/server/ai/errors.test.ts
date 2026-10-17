import { describe, expect, it } from "vitest";
import { errorCodeOf, errorForStatus, errorObjectOf, parseRetryAfter, providerCodeOf } from "./errors";

describe("errorForStatus", () => {
  it.each([
    [408, "timeout"],
    [429, "rate_limited"],
    [401, "configuration"],
    [402, "configuration"],
    [404, "configuration"],
    [403, "rejected"],
    [400, "rejected"],
    [422, "rejected"],
    [418, "rejected"],
    [500, "unavailable"],
    [502, "unavailable"],
    [503, "unavailable"],
    [200, "unavailable"],
    [302, "unavailable"],
  ] as const)("%i → %s", (status, kind) => {
    expect(errorForStatus(status).kind).toBe(kind);
  });

  it("names a 403 from a budget of the account a configuration, any other 403 a refusal of the request", () => {
    expect(errorForStatus(403, undefined, { code: 403, metadata: { limit_source: "key_limit" } }).kind).toBe("configuration");
    expect(errorForStatus(403, undefined, { code: 403, metadata: { reasons: ["x"], flagged_input: "My town" } }).kind).toBe("rejected");
  });

  it("keeps the wait for a 429 only, and the code for every kind", () => {
    const error = { code: 429, metadata: { error_type: "rate_limit_exceeded" } };
    expect(errorForStatus(429, 7000, error)).toMatchObject({ retryAfterMs: 7000, providerCode: "rate_limit_exceeded" });
    expect(errorForStatus(503, 7000, { metadata: { error_type: "provider_unavailable" } })).toMatchObject({ kind: "unavailable", providerCode: "provider_unavailable" });
    expect(errorForStatus(503, 7000).retryAfterMs).toBeUndefined();
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

describe("providerCodeOf", () => {
  it("keeps OpenRouter's error_type and the upstream provider_code when they are identifiers", () => {
    expect(providerCodeOf({ code: 429, message: "Rate limit exceeded", metadata: { error_type: "rate_limit_exceeded", provider_code: "1300" } })).toBe(
      "rate_limit_exceeded/1300",
    );
    expect(providerCodeOf({ metadata: { error_type: "provider_unavailable", provider_code: 3051 } })).toBe("provider_unavailable/3051");
    expect(providerCodeOf({ metadata: { error_type: "content_policy_violation" } })).toBe("content_policy_violation");
  });

  it("never keeps a message, a sentence, the code alone, or anything that is not an identifier", () => {
    const flagged = { reasons: ["My town is small"], flagged_input: "My town is small", provider_name: "Phala", model_slug: "x" };
    expect(providerCodeOf({ code: 403, message: "My town is small", metadata: { error_type: "My town is small", provider_code: "a b", raw: "x", moderation: flagged } })).toBeUndefined();
    expect(providerCodeOf({ metadata: { error_type: "x".repeat(65) } })).toBeUndefined();
    expect(providerCodeOf({ code: 429 })).toBeUndefined();
    expect(providerCodeOf("rate_limited")).toBeUndefined();
    expect(providerCodeOf(undefined)).toBeUndefined();
  });
});

describe("errorObjectOf, errorCodeOf", () => {
  it("find the error of an OpenRouter body and its code", () => {
    const error = { code: 502, message: "down" };
    expect(errorObjectOf({ error })).toBe(error);
    expect(errorCodeOf(error)).toBe(502);
    for (const body of [undefined, null, "x", [], { error: "down" }, { error: [] }, { choices: [] }]) expect(errorObjectOf(body)).toBeUndefined();
    for (const value of [undefined, { code: "502" }, { code: 502.5 }]) expect(errorCodeOf(value)).toBeUndefined();
  });
});
