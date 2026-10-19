import { describe, expect, it } from "vitest";
import { criterionIds } from "@/lib/rubric";
import { SimulatorEvaluator } from "./simulator";
import { EvaluatorError, type EvaluationRequest } from "./types";

// NFR-EXP-04: the simulator answers like the AI, without leaving the machine,
// and fails on demand in each way the evaluation must survive.

const request = (studentText: string, language: "en" | "fr" = "en"): EvaluationRequest => ({
  system: "Fixed instructions.",
  user: JSON.stringify({ task: { subject: "My town", instructions: null }, language, student_text: studentText }),
  schemaName: "evaluation",
  schema: { type: "object" },
  generation: { temperature: 0, maxOutputTokens: 2000, reasoningEffort: "none" },
});

const TEXT = "My town is small but it is beatiful. There is a market every friday.";
const context = (signal = new AbortController().signal) => ({ signal, subjectId: null });

async function answer(simulator: SimulatorEvaluator, req = request(TEXT)) {
  const response = await simulator.evaluate(req, context());
  return { response, output: JSON.parse(response.content) };
}

describe("the simulator's answer", () => {
  it("follows the output contract: five criteria, level 2 by default, quotes copied from the text", async () => {
    const { response, output } = await answer(new SimulatorEvaluator());
    expect(response.modelAnswered).toBe("simulator");
    expect(Object.keys(output.criteria)).toEqual([...criterionIds]);
    for (const id of criterionIds) {
      expect(output.criteria[id].level).toBe(2);
      expect(output.criteria[id].justification.trim()).not.toBe("");
      for (const quote of output.criteria[id].quotes) expect(TEXT).toContain(quote);
    }
    expect(output.general_comment).not.toBe("");
    expect(output.next_steps.length).toBeGreaterThan(0);
    expect(output.flags).toEqual({ other_language: false, off_topic: false, addressed_to_marker: false });
  });

  it("writes its remarks in the language of the assignment (Q5)", async () => {
    const { output } = await answer(new SimulatorEvaluator(), request("Ma ville est petite.", "fr"));
    expect(output.general_comment).toBe("Commentaire général simulé.");
    expect(output.criteria.task.quotes).toEqual(["Ma ville est petite."]);
  });

  it("gives the levels it is set to, until cleared", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.setLevels({ task: 4, organization: 3, vocabulary: 2, grammar: 1, mechanics: 0 });
    const { output } = await answer(simulator);
    expect(criterionIds.map((id) => output.criteria[id].level)).toEqual([4, 3, 2, 1, 0]);
    simulator.clear();
    expect((await answer(simulator)).output.criteria.task.level).toBe(2);
  });

  it("keeps the last 20 requests in memory, with their subject", async () => {
    const simulator = new SimulatorEvaluator();
    for (let i = 0; i < 25; i++) await simulator.evaluate(request(`Text ${i}.`), { signal: new AbortController().signal, subjectId: `s${i}` });
    expect(simulator.captured()).toHaveLength(20);
    expect(simulator.captured()[0].subjectId).toBe("s5");
    expect(simulator.captured().at(-1)?.request.user).toContain("Text 24.");
  });
});

describe("injected faults", () => {
  it.each([
    [500, "unavailable"],
    [429, "rate_limited"],
    [401, "configuration"],
  ] as const)("an HTTP %i fails as %s, once", async (status, kind) => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status, retryAfterMs: status === 429 ? 3000 : undefined });
    const error = await simulator.evaluate(request(TEXT), context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EvaluatorError);
    expect((error as EvaluatorError).kind).toBe(kind);
    if (status === 429) expect((error as EvaluatorError).retryAfterMs).toBe(3000);
    await expect(simulator.evaluate(request(TEXT), context())).resolves.toBeDefined();
  });

  it.each([
    [529, "unavailable", "overloaded_error"],
    [402, "configuration", "billing_error"],
  ] as const)("an HTTP %i fails as %s, with Anthropic's error type (E5.12)", async (status, kind, code) => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status });
    await expect(simulator.evaluate(request(TEXT), context())).rejects.toMatchObject({ kind, providerCode: code });
  });

  it("fails on the Console's spending limit as a configuration", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "spend_limit" });
    await expect(simulator.evaluate(request(TEXT), context())).rejects.toMatchObject({
      kind: "configuration",
      providerCode: "invalid_request_error/spend_limit",
    });
  });

  it.each([
    ["general_harms", "refusal/general_harms"],
    [null, "refusal/null"],
  ] as const)("refuses with category %s: refused, its stop reason and a billed usage, a fixed message", async (category, code) => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "refusal", category });
    const error = (await simulator.evaluate(request(TEXT), context()).catch((e: unknown) => e)) as EvaluatorError;
    expect(error).toBeInstanceOf(EvaluatorError);
    expect(error).toMatchObject({ kind: "refused", providerCode: code, stopReason: "refusal" });
    expect(error.usage?.totalTokens).toBeGreaterThan(0);
    expect(error.message).toBe("The AI declined to evaluate this text.");
  });

  it("cuts its answer at max_tokens: a 200 whose JSON is incomplete", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "max_tokens" });
    const response = await simulator.evaluate(request(TEXT), context());
    expect(response.stopReason).toBe("max_tokens");
    expect(() => JSON.parse(response.content)).toThrow();
    expect((await simulator.evaluate(request(TEXT), context())).stopReason).toBe("end_turn");
  });

  it("fails as many times as asked, then answers", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "error", status: 500 }, 2);
    await expect(simulator.evaluate(request(TEXT), context())).rejects.toThrow(EvaluatorError);
    await expect(simulator.evaluate(request(TEXT), context())).rejects.toThrow(EvaluatorError);
    await expect(simulator.evaluate(request(TEXT), context())).resolves.toBeDefined();
  });

  it("times out: waits for the deadline, then fails as a timeout", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "timeout" });
    const error = await simulator.evaluate(request(TEXT), context(AbortSignal.timeout(20))).catch((e: unknown) => e);
    expect((error as EvaluatorError).kind).toBe("timeout");
  });

  it("bounds each call by itself, like the adapter, even when the caller sets no deadline", async () => {
    const simulator = new SimulatorEvaluator(30);
    simulator.failNext({ kind: "timeout" });
    await expect(simulator.evaluate(request(TEXT), context())).rejects.toMatchObject({ kind: "timeout" });
  });

  it("refuses a call already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new SimulatorEvaluator().evaluate(request(TEXT), context(controller.signal))).rejects.toMatchObject({ kind: "timeout" });
  });

  it.each([
    ["not_json", (content: string) => expect(() => JSON.parse(content)).toThrow()],
    ["missing_criterion", (content: string) => expect(Object.keys(JSON.parse(content).criteria)).toHaveLength(4)],
    ["level_out_of_range", (content: string) => expect(JSON.parse(content).criteria.task.level).toBe(5)],
    ["non_integer_level", (content: string) => expect(JSON.parse(content).criteria.task.level).toBe(2.5)],
    ["empty_justification", (content: string) => expect(JSON.parse(content).criteria.task.justification.trim()).toBe("")],
  ] as const)("returns an invalid output on demand: %s", async (variant, check) => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "invalid_output", variant });
    check((await simulator.evaluate(request(TEXT), context())).content);
  });

  it("returns a quote that is not in the text on demand", async () => {
    const simulator = new SimulatorEvaluator();
    simulator.failNext({ kind: "missing_quote" });
    const { output } = await answer(simulator);
    expect(TEXT).not.toContain(output.criteria.task.quotes[0]);
  });

  it("holds a call until released, or until its deadline", async () => {
    const simulator = new SimulatorEvaluator();
    const release = simulator.holdNext();
    let settled = false;
    const pending = simulator.evaluate(request(TEXT), context()).then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    release();
    await pending;
    expect(settled).toBe(true);

    simulator.holdNext();
    await expect(simulator.evaluate(request(TEXT), context(AbortSignal.timeout(20)))).rejects.toMatchObject({ kind: "timeout" });
  });
});
