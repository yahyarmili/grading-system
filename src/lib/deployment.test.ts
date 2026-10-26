import { describe, expect, it } from "vitest";
import { isProductionDeployment } from "./deployment";

describe("isProductionDeployment", () => {
  it("is true on the Vercel Production deployment only", () => {
    expect(isProductionDeployment({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("is false on Preview, in development, in tests and on the E2E server", () => {
    expect(isProductionDeployment({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionDeployment({ VERCEL_ENV: "development" })).toBe(false);
    expect(isProductionDeployment({})).toBe(false);
  });
});
