import { describe, expect, it } from "vitest";
import { getEvaluator, getSimulator, selectEvaluator, SimulatorEvaluator } from ".";
import { AiConfigurationError } from "./types";

// The simulator by default; Mistral only by name and with a key; a wrong
// setting is refused, never quietly replaced by the other provider.

describe("selectEvaluator", () => {
  it.each([
    ["nothing set", {}],
    ["an empty AI_PROVIDER", { AI_PROVIDER: "" }],
    ["a blank AI_PROVIDER", { AI_PROVIDER: "  " }],
    ["AI_PROVIDER=simulator, even with a key", { AI_PROVIDER: "simulator", MISTRAL_API_KEY: "k" }],
    ["a key alone", { MISTRAL_API_KEY: "k" }],
  ])("gives the simulator with %s", (_label, env) => {
    expect(selectEvaluator({ NODE_ENV: "development", ...env })).toEqual({ provider: "simulator" });
  });

  it("gives Mistral when asked by name, with a key", () => {
    expect(selectEvaluator({ NODE_ENV: "production", AI_PROVIDER: "mistral", MISTRAL_API_KEY: " k1 " })).toEqual({
      provider: "mistral",
      apiKey: "k1",
    });
  });

  it("always gives the simulator under test, even when Mistral is asked", () => {
    expect(selectEvaluator({ NODE_ENV: "test", AI_PROVIDER: "mistral", MISTRAL_API_KEY: "k" })).toEqual({ provider: "simulator" });
  });

  it.each([
    ["Mistral without a key", { AI_PROVIDER: "mistral" }],
    ["Mistral with an empty key", { AI_PROVIDER: "mistral", MISTRAL_API_KEY: "" }],
    ["Mistral with a blank key", { AI_PROVIDER: "mistral", MISTRAL_API_KEY: "   " }],
    ["an unknown provider", { AI_PROVIDER: "openai", MISTRAL_API_KEY: "k" }],
    ["a provider in capitals", { AI_PROVIDER: "Mistral", MISTRAL_API_KEY: "k" }],
  ])("refuses %s", (_label, env) => {
    expect(() => selectEvaluator({ NODE_ENV: "development", ...env })).toThrow(AiConfigurationError);
  });

  it("names variables in its refusals, never the key", () => {
    const error = (() => {
      try {
        selectEvaluator({ NODE_ENV: "development", AI_PROVIDER: "other", MISTRAL_API_KEY: "secret-key-1" });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).toContain("AI_PROVIDER");
    expect(error?.message).not.toContain("secret-key-1");
  });
});

describe("getEvaluator", () => {
  it("is the simulator in the tests, one per process", () => {
    expect(getEvaluator()).toBeInstanceOf(SimulatorEvaluator);
    expect(getEvaluator()).toBe(getSimulator());
  });
});
