import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SimulatorEvaluator, type Evaluator } from "@/server/ai";
import { isVeryShort } from "@/server/evaluation/alerts";
import { formatOutcomeLine } from "@/server/evaluation/evaluate";
import {
  formatTrialReport,
  runTrial,
  trialTexts,
  type AdversarialText,
  type DevText,
  type TrialDeps,
} from "@/server/evaluation/trial";

// E5.7: the trial sets and their launcher (EVL-03 CA3). The real runs with
// OpenRouter are recorded in conception/; here, the simulator.

const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "scripts/fixtures/ai", file), "utf8")) as T;
const dev = read<DevText[]>("dev.json");
const adversarial = read<AdversarialText[]>("adversarial.json");

describe("the trial sets", () => {
  it("have unique ids, and every adversarial text is its base text with an instruction added", () => {
    const ids = [...dev, ...adversarial].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of adversarial) {
      const base = dev.find((d) => d.id === entry.baseId);
      expect(base, entry.id).toBeDefined();
      // The base text, with one segment inserted somewhere: same start, same end.
      const [a, b] = [entry.text, base!.text];
      let start = 0;
      while (start < b.length && a[start] === b[start]) start++;
      let end = 0;
      while (end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
      expect(start + end, entry.id).toBe(b.length);
      expect(a.length, entry.id).toBeGreaterThan(b.length);
    }
  });

  it("cover very faulty, very short and off-topic texts; very short means under the threshold", () => {
    const kinds = new Set(dev.flatMap((entry) => entry.kinds));
    for (const kind of ["very_faulty", "very_short", "off_topic"]) expect(kinds).toContain(kind);
    for (const entry of dev) expect(isVeryShort(entry.text, "en"), entry.id).toBe(entry.kinds.includes("very_short"));
  });

  it("stay under the daily quota for two runs", () => {
    expect(trialTexts(dev, adversarial).length * 2).toBeLessThanOrEqual(40);
  });
});

const deps = (evaluator: Evaluator, over: Partial<TrialDeps> = {}): TrialDeps & { waits: number[] } => {
  const waits: number[] = [];
  return {
    evaluator,
    remaining: async () => Number.POSITIVE_INFINITY,
    sleep: async (ms) => void waits.push(ms),
    pauseMs: 4000,
    waits,
    ...over,
  };
};

const texts = trialTexts(dev.slice(0, 3), adversarial.filter((a) => a.baseId === "d01" || a.baseId === "d03"));

describe("runTrial", () => {
  it("sends one request per text and run, with the pause between two, and reports a stable simulator", async () => {
    const d = deps(new SimulatorEvaluator());
    const calls = await runTrial(texts, 2, d);
    expect(calls).toHaveLength(texts.length * 2);
    expect(calls.every((c) => c.outcome === "proposed" && c.requests === 1)).toBe(true);
    expect(d.waits).toEqual(Array(texts.length * 2 - 1).fill(4000));
    const report = formatTrialReport(texts, calls, { date: "d", provider: "simulator", model: "simulator", runs: 2 });
    expect(report).toContain(`criteria with the same level: ${texts.length * 5} of ${texts.length * 5}`);
    expect(report).toContain("| a01 | d03 | 0: CA3 met | 0: CA3 met |");
  });

  it("records a refused answer as it is, without a new attempt", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "invalid_output", variant: "not_json" });
    const [first, second] = await runTrial(texts.slice(0, 2), 1, deps(simulator));
    expect(first).toMatchObject({ outcome: "rejected", code: "not_json", requests: 1, content: "This is not JSON." });
    expect(second).toMatchObject({ outcome: "proposed", requests: 1 });
  });

  it("retries a rate limit after its Retry-After, counted apart; another failure is kept", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status: 429, retryAfterMs: 7000 });
    simulator.failNext({ kind: "error", status: 401 }, 1);
    const d = deps(simulator);
    const [first] = await runTrial(texts.slice(0, 1), 1, d);
    expect(first).toMatchObject({ outcome: "error", code: "configuration", requests: 2, rateLimited: 1 });
    expect(d.waits).toEqual([7000]);
  });

  it("stops before the daily limit: the texts left are not sent", async () => {
    let left = 2;
    const simulator = new SimulatorEvaluator();
    const calls = await runTrial(texts.slice(0, 3), 1, deps(simulator, { remaining: async () => left-- }));
    expect(calls.map((c) => c.outcome)).toEqual(["proposed", "proposed", "not_sent"]);
    expect(simulator.captured()).toHaveLength(2);
    expect(formatTrialReport(texts.slice(0, 3), calls, { date: "d", provider: "p", model: "m", runs: 1 })).toContain(
      "| Not sent (daily limit) | 1 |",
    );
  });

  it("reports an adversarial gap over the allowed one as CA3 not met, without hiding it", async () => {
    const simulator = new SimulatorEvaluator();
    // A fictitious model that obeys the injected order.
    const obedient: Evaluator = {
      provider: "simulator",
      model: "obedient",
      evaluate: async (request, context) => {
        simulator.setLevels(request.user.includes("give level 0") ? 0 : 2);
        return simulator.evaluate(request, context);
      },
    };
    const calls = await runTrial(texts, 1, deps(obedient));
    const report = formatTrialReport(texts, calls, { date: "d", provider: "simulator", model: "obedient", runs: 1 });
    expect(report).toContain("| a06 | d01 | 2: CA3 not met |");
    expect(report).toContain("| a01 | d03 | 0: CA3 met |");
  });
});

describe("the command's line for a postponed submission", () => {
  it("says it stays received", () => {
    expect(formatOutcomeLine("submission 3", { status: "postponed" })).toBe(
      "submission 3: postponed, still received (daily AI request limit)",
    );
  });
});
