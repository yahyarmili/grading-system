import { describe, expect, it } from "vitest";
import { aiProviders, selectableAiProviders } from "@/lib/evaluation";
import { evaluatorForCommand, getEvaluator, getSimulator, selectEvaluator, SimulatorEvaluator } from ".";
import { AiConfigurationError } from "./types";

// The simulator by default; Anthropic only by name and with a key; a wrong
// setting is refused, never quietly replaced by the other provider.

describe("selectEvaluator", () => {
  it.each([
    ["nothing set", {}],
    ["an empty AI_PROVIDER", { AI_PROVIDER: "" }],
    ["a blank AI_PROVIDER", { AI_PROVIDER: "  " }],
    ["AI_PROVIDER=simulator, even with a key", { AI_PROVIDER: "simulator", GRADING_ANTHROPIC_API_KEY: "k" }],
    ["a key alone", { GRADING_ANTHROPIC_API_KEY: "k" }],
  ])("gives the simulator with %s", (_label, env) => {
    expect(selectEvaluator({ NODE_ENV: "development", ...env })).toEqual({ provider: "simulator" });
  });

  it("gives Anthropic when asked by name, with a key", () => {
    expect(selectEvaluator({ NODE_ENV: "production", AI_PROVIDER: "anthropic", GRADING_ANTHROPIC_API_KEY: " k1 " })).toEqual({
      provider: "anthropic",
      apiKey: "k1",
    });
  });

  it("always gives the simulator under test, even when Anthropic is asked", () => {
    expect(selectEvaluator({ NODE_ENV: "test", AI_PROVIDER: "anthropic", GRADING_ANTHROPIC_API_KEY: "k" })).toEqual({ provider: "simulator" });
  });

  it.each([
    ["Anthropic without a key", { AI_PROVIDER: "anthropic" }],
    ["Anthropic with an empty key", { AI_PROVIDER: "anthropic", GRADING_ANTHROPIC_API_KEY: "" }],
    ["Anthropic with a blank key", { AI_PROVIDER: "anthropic", GRADING_ANTHROPIC_API_KEY: "   " }],
    ["an unknown provider", { AI_PROVIDER: "openai", GRADING_ANTHROPIC_API_KEY: "k" }],
    ["the former provider, Mistral", { AI_PROVIDER: "mistral", GRADING_ANTHROPIC_API_KEY: "k" }],
    ["OpenRouter, stored but no longer selectable", { AI_PROVIDER: "openrouter", GRADING_ANTHROPIC_API_KEY: "k" }],
    ["a provider in capitals", { AI_PROVIDER: "Anthropic", GRADING_ANTHROPIC_API_KEY: "k" }],
  ])("refuses %s", (_label, env) => {
    expect(() => selectEvaluator({ NODE_ENV: "development", ...env })).toThrow(AiConfigurationError);
  });

  it("names variables in its refusals, never the key", () => {
    const error = (() => {
      try {
        selectEvaluator({ NODE_ENV: "development", AI_PROVIDER: "other", GRADING_ANTHROPIC_API_KEY: "secret-key-1" });
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

describe("evaluatorForCommand (E5.7)", () => {
  const env = { NODE_ENV: "development", AI_PROVIDER: "anthropic", GRADING_ANTHROPIC_API_KEY: "k" };

  it("gives the simulator unless the command line names Anthropic, whatever AI_PROVIDER says", () => {
    expect(evaluatorForCommand(undefined, env)).toBeInstanceOf(SimulatorEvaluator);
    expect(evaluatorForCommand("simulator", env)).toBeInstanceOf(SimulatorEvaluator);
  });

  it("gives Anthropic by name with a key; refuses it without a key, and any other name", () => {
    expect(evaluatorForCommand("anthropic", env).provider).toBe("anthropic");
    expect(() => evaluatorForCommand("anthropic", { NODE_ENV: "development" })).toThrow(AiConfigurationError);
    expect(() => evaluatorForCommand("mistral", env)).toThrow(AiConfigurationError);
    expect(() => evaluatorForCommand("openrouter", env)).toThrow(AiConfigurationError);
  });

  it("reads the key under its own name only: ANTHROPIC_API_KEY selects nothing, and stops the adapter", () => {
    expect(() => evaluatorForCommand("anthropic", { NODE_ENV: "development", ANTHROPIC_API_KEY: "k" })).toThrow(
      "AI_PROVIDER=anthropic needs GRADING_ANTHROPIC_API_KEY.",
    );
    expect(() => evaluatorForCommand("anthropic", { ...env, ANTHROPIC_API_KEY: "k" })).toThrow(/Unset ANTHROPIC_API_KEY/);
  });
});

describe("the stored and selectable providers (E5.12, E5.13)", () => {
  it("keeps every provider a run may name, and selects only some of them", () => {
    expect(aiProviders).toEqual(["simulator", "openrouter", "anthropic"]);
    expect(selectableAiProviders).toEqual(["simulator", "anthropic"]);
    for (const name of selectableAiProviders) expect(aiProviders).toContain(name);
  });
});
