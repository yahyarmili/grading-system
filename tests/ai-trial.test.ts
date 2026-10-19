import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_DAILY_REQUEST_LIMIT } from "@/config/provisional";
import { publishedRubric } from "@/lib/rubric";
import { SimulatorEvaluator, type Evaluator, type Usage } from "@/server/ai";
import { isVeryShort } from "@/server/evaluation/alerts";
import { formatOutcomeLine } from "@/server/evaluation/evaluate";
import { estimateCostUsd, PRICES } from "@/server/evaluation/prices";
import {
  formatCallLine,
  formatTrialReport,
  requestsLeftToday,
  runTrial,
  selectTexts,
  TRIAL_RATE_LIMIT_RETRIES,
  trialTexts,
  type AdversarialText,
  type DevText,
  type TrialDeps,
  type TrialSet,
  type TrialSets,
} from "@/server/evaluation/trial";

// E5.7: the trial sets and their launcher (EVL-03 CA3), instrumented in E5.14.
// The real runs are recorded in conception/; here, the simulator.

const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "scripts/fixtures/ai", file), "utf8")) as T;
const dev = read<DevText[]>("dev.json");
const adversarial = read<AdversarialText[]>("adversarial.json");
const sensitive = read<DevText[]>("sensitive.json");
const sets: TrialSets = { dev, adversarial, sensitive };

describe("the trial sets", () => {
  it("have unique ids, and every adversarial text is its base text with an instruction added", () => {
    const ids = [...dev, ...adversarial, ...sensitive].map((entry) => entry.id);
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

  it("keep 10 development and 7 adversarial texts; the sensitive set has an accident, a war and an illness, none very short", () => {
    expect([dev.length, adversarial.length]).toEqual([10, 7]);
    expect(sensitive.map((entry) => entry.kinds)).toEqual([
      ["sensitive", "accident"],
      ["sensitive", "war"],
      ["sensitive", "health"],
    ]);
    for (const entry of sensitive) expect(isVeryShort(entry.text, "en"), entry.id).toBe(false);
  });

  it("stay under the daily guard for three runs of all, every rate limit retried", () => {
    const worst = selectTexts("all", sets).length * 3 * (1 + TRIAL_RATE_LIMIT_RETRIES);
    expect(worst).toBeLessThanOrEqual(AI_DAILY_REQUEST_LIMIT);
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

describe("selectTexts", () => {
  const ids = (set: TrialSet) => selectTexts(set, sets).map((t) => t.id);

  it("gives each set its texts: adversarial with its bases first, all with the three sets", () => {
    expect(ids("dev")).toEqual(dev.map((d) => d.id));
    expect(ids("sensitive")).toEqual(["s01", "s02", "s03"]);
    const bases = dev.filter((d) => adversarial.some((a) => a.baseId === d.id)).map((d) => d.id);
    expect(ids("adversarial")).toEqual([...bases, ...adversarial.map((a) => a.id)]);
    expect(ids("all")).toEqual([...dev, ...adversarial, ...sensitive].map((entry) => entry.id));
  });

  it("keeps only the first n texts with a limit, and sends only those, through the evaluation's request", async () => {
    const simulator = new SimulatorEvaluator();
    const texts = selectTexts("dev", sets, 1);
    expect(texts.map((t) => t.id)).toEqual(["d01"]);
    const calls = await runTrial(texts, 1, deps(simulator));
    expect(calls).toHaveLength(1);
    expect(simulator.captured()).toHaveLength(1);
    const user = JSON.parse(simulator.captured()[0].request.user);
    expect(user).toEqual({ task: { subject: dev[0].subject, instructions: null }, language: "en", student_text: dev[0].text });
  });
});

const texts = trialTexts(dev.slice(0, 3), adversarial.filter((a) => a.baseId === "d01" || a.baseId === "d03"));

/** A simulator that says what a provider counts, as Anthropic does. */
const counting = (simulator: SimulatorEvaluator, usage: Usage): Evaluator => ({
  provider: "simulator",
  model: "claude-haiku-5-5",
  evaluate: async (request, context) => ({ ...(await simulator.evaluate(request, context)), modelAnswered: "claude-haiku-5-5", usage }),
});
const USAGE: Usage = {
  promptTokens: 2100,
  completionTokens: 900,
  totalTokens: 3000,
  detail: { inputTokens: 2000, outputTokens: 900, cacheReadTokens: 100, cacheCreationTokens: 0, inferenceGeo: "us" },
};

describe("runTrial", () => {
  it("sends one request per text and run, with the pause between two, and reports a simulator without dispersion", async () => {
    const d = deps(new SimulatorEvaluator());
    const calls = await runTrial(texts, 3, d);
    expect(calls).toHaveLength(texts.length * 3);
    expect(calls.every((c) => c.outcome === "proposed" && c.requests === 1)).toBe(true);
    expect(d.waits).toEqual(Array(texts.length * 3 - 1).fill(4000));
    const report = formatTrialReport(texts, calls, { date: "d", provider: "simulator", model: "simulator", runs: 3 });
    expect(report).toContain(`for each text with a proposal in every run (${texts.length} of ${texts.length}).`);
    expect(report).toContain(`| task | ${texts.length} | 0 | 0 | 0 |`);
    expect(report).toContain("Texts with a different level on at least one criterion: none.");
    expect(report).not.toContain("run 1 against run 2");
    expect(report).toContain("| a01 | d03 | 0: CA3 met | 0: CA3 met | 0: CA3 met |");
  });

  it("measures the dispersion of each criterion over every run, not only the first two", async () => {
    const simulator = new SimulatorEvaluator();
    const levels = [2, 2, 4] as const;
    let call = 0;
    const drifting: Evaluator = {
      provider: "simulator",
      model: "drifting",
      evaluate: async (request, context) => {
        simulator.setLevels(levels[call++]);
        return simulator.evaluate(request, context);
      },
    };
    const one = texts.slice(0, 1);
    const report = formatTrialReport(one, await runTrial(one, 3, deps(drifting)), { date: "d", provider: "p", model: "m", runs: 3 });
    expect(report).toContain("| task | 0 | 0 | 1 | 2 |");
    expect(report).toContain("Texts with a different level on at least one criterion: d01.");
  });

  it("reads the rubric version from the registry, and flags the first use of the schema only", async () => {
    const calls = await runTrial(texts, 2, deps(new SimulatorEvaluator()));
    const version = publishedRubric("en")!.id;
    expect(calls.every((c) => c.rubricVersion === version)).toBe(true);
    expect(calls.filter((c) => c.firstUseOfSchema).map((c) => [c.run, c.id])).toEqual([[1, texts[0].id]]);
    const report = formatTrialReport(texts, calls, { date: "d", provider: "p", model: "m", runs: 2 });
    expect(report).toContain(`Rubric: ${version}.`);
    expect(report).toContain(`first use: ${texts[0].id} `);
  });

  it("keeps the model that answered, the stop reason, the usage with its inference_geo, and the estimated cost", async () => {
    const [call] = await runTrial(texts.slice(0, 1), 1, deps(counting(new SimulatorEvaluator(), USAGE)));
    expect(call).toMatchObject({ modelAnswered: "claude-haiku-5-5", stopReason: "end_turn", usage: USAGE });
    expect(call.costUsd).toBeCloseTo(((2000 * 0.1 + 900 * 0.5 + 100 * 0.01) / 1e6) * 1.1, 12);
    expect(formatCallLine(call)).toContain("2000 in / 900 out, cache 100 read / 0 written, geo us");
    expect(formatCallLine(call)).toContain("first use of the schema");
    const report = formatTrialReport(texts.slice(0, 1), [call], { date: "d", provider: "p", model: "m", runs: 1 });
    expect(report).toContain("inference_geo that answered: us.");
    expect(report).toContain("Stop reasons: end_turn × 1.");
    expect(report).toContain(`| 1 | d01 | proposed | claude-haiku-5-5 | end_turn | 2000 / 900 | 100 / 0 | us | $${call.costUsd!.toFixed(6)} |`);
    expect(report).toContain(`read on ${PRICES.readOn}`);
  });

  it("records a rejected answer as it is, without a new attempt, with its stop reason", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "max_tokens" });
    const [first, second] = await runTrial(texts.slice(0, 2), 1, deps(simulator));
    expect(first).toMatchObject({ outcome: "rejected", code: "not_json", requests: 1, stopReason: "max_tokens" });
    expect(second).toMatchObject({ outcome: "proposed", requests: 1 });
  });

  it("counts the refusals by category, null included, with what they cost, apart from the failed calls", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "refusal", category: "cyber" });
    simulator.failNext({ kind: "refusal", category: null });
    simulator.failNext({ kind: "refusal", category: "cyber" });
    simulator.failNext({ kind: "error", status: 529 });
    const five = texts.slice(0, 5);
    const calls = await runTrial(five, 1, deps(simulator));
    expect(calls[0]).toMatchObject({ outcome: "error", code: "refused", providerCode: "refusal/cyber", stopReason: "refusal", requests: 1 });
    expect(calls[0].costUsd).toBeGreaterThan(0);
    const report = formatTrialReport(five, calls, { date: "d", provider: "p", model: "m", runs: 1 });
    expect(report).toContain("| Refusals of the model (stop_reason refusal) | 3 |");
    expect(report).toContain("| Failed calls | 1 (unavailable × 1) |");
    expect(report).toContain(`| cyber | 2 | ${calls[0].id}, ${calls[2].id} | 2000 / 20 |`);
    expect(report).toContain(`| null | 1 | ${calls[1].id} | 1000 / 10 |`);
  });

  it("retries a rate limit after its Retry-After, counted apart; another failure is kept with its code", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status: 429, retryAfterMs: 7000 });
    simulator.failNext({ kind: "error", status: 401 }, 1);
    const d = deps(simulator);
    const [first] = await runTrial(texts.slice(0, 1), 1, d);
    expect(first).toMatchObject({ outcome: "error", code: "configuration", providerCode: "authentication_error", requests: 2, rateLimited: 1 });
    expect(d.waits).toEqual([7000]);
  });

  it("stops before the daily limit: the texts left are not sent", async () => {
    let left = 2;
    const simulator = new SimulatorEvaluator();
    const seen: string[] = [];
    const calls = await runTrial(texts.slice(0, 3), 1, deps(simulator, { remaining: async () => left--, onCall: (c) => seen.push(c.id) }));
    expect(calls.map((c) => c.outcome)).toEqual(["proposed", "proposed", "not_sent"]);
    expect(seen).toEqual(calls.map((c) => c.id));
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

describe("estimateCostUsd", () => {
  it("prices each kind of token at the published prices, ×1.1 in us, and nothing it was not told", () => {
    const detail = { inputTokens: 10_000, outputTokens: 10_000, cacheReadTokens: 10_000, cacheCreationTokens: 10_000, inferenceGeo: "global" };
    const usage = { promptTokens: 30_000, completionTokens: 10_000, totalTokens: 40_000, detail };
    const perMillion = 0.1 + 0.5 + 0.01 + 0.125;
    expect(estimateCostUsd(usage)).toBeCloseTo(perMillion / 100, 12);
    expect(estimateCostUsd({ ...usage, detail: { ...detail, inferenceGeo: "us" } })).toBeCloseTo((perMillion / 100) * 1.1, 12);
    // Over 100 K tokens of prompt: dearer input and output; the cache prices there were not read.
    const long = { ...detail, inputTokens: 200_000, cacheReadTokens: 0, cacheCreationTokens: 0 };
    expect(estimateCostUsd({ ...usage, detail: long })).toBeCloseTo((200_000 * 0.5 + 10_000 * 2.5) / 1e6, 12);
    expect(estimateCostUsd({ ...usage, detail: { ...long, cacheReadTokens: 1 } })).toBeNull();
    expect(estimateCostUsd(null)).toBeNull();
    expect(estimateCostUsd({ promptTokens: null, completionTokens: 10, totalTokens: null })).toBeNull();
  });
});

describe("the command's line for a postponed submission", () => {
  it("says it stays received", () => {
    expect(formatOutcomeLine("submission 3", { status: "postponed" })).toBe(
      "submission 3: postponed, still received (daily AI request limit)",
    );
  });
});

describe("requestsLeftToday, the daily guard of every real request (the connection trial's included)", () => {
  it("counts the log for a real provider, and never reads it for the simulator", async () => {
    let reads = 0;
    const sentToday = async () => (reads++, 198);
    expect(await requestsLeftToday("anthropic", sentToday, 200)).toBe(2);
    expect(await requestsLeftToday("anthropic", async () => 200, 200)).toBe(0);
    expect(await requestsLeftToday("simulator", sentToday, 200)).toBe(Number.POSITIVE_INFINITY);
    expect(reads).toBe(1);
  });
});
