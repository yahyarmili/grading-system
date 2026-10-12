import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl } from "./test-db-url";

describe("assertTestDatabaseUrl", () => {
  it("accepts a test URL distinct from the dev URL", () => {
    expect(assertTestDatabaseUrl("postgres://test", "postgres://dev")).toBe("postgres://test");
  });

  it("refuses a missing test URL", () => {
    expect(() => assertTestDatabaseUrl(undefined, "postgres://dev")).toThrow(/not set/);
  });

  it("refuses a test URL equal to the dev URL", () => {
    expect(() => assertTestDatabaseUrl("postgres://same", "postgres://same")).toThrow(/refusing/);
  });
});
