import { describe, expect, it } from "vitest";
import { errorForStatus, parseRetryAfter, providerCodeOf } from "./errors";

describe("errorForStatus", () => {
  it.each([
    [429, "rate_limited"],
    [401, "configuration"],
    [403, "configuration"],
    [404, "configuration"],
    [400, "rejected"],
    [422, "rejected"],
    [418, "rejected"],
    [500, "unavailable"],
    [503, "unavailable"],
    [200, "unavailable"],
    [302, "unavailable"],
  ] as const)("%i → %s", (status, kind) => {
    expect(errorForStatus(status).kind).toBe(kind);
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
  it("keeps Mistral's type and code when they are identifiers", () => {
    expect(providerCodeOf('{"object":"error","message":"Rate limit exceeded","type":"rate_limited","code":"1300"}')).toBe("rate_limited/1300");
    expect(providerCodeOf('{"type":"invalid_request_error","code":3051}')).toBe("invalid_request_error/3051");
  });

  it("never keeps a message, a sentence, or anything that is not an identifier", () => {
    expect(providerCodeOf('{"message":"My town is small","type":"My town is small","code":"a b"}')).toBeUndefined();
    expect(providerCodeOf(`{"type":"${"x".repeat(65)}"}`)).toBeUndefined();
    expect(providerCodeOf("not json")).toBeUndefined();
    expect(providerCodeOf(undefined)).toBeUndefined();
    expect(providerCodeOf('["rate_limited"]')).toBeUndefined();
  });
});
