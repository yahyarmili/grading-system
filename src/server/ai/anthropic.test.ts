import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnthropicEvaluator, forbiddenVariables, guardedFetch, type AnthropicOptions } from "./anthropic";
import { AiConfigurationError, AiJournalError, EvaluatorError, type EvaluationRequest } from "./types";

// The Anthropic adapter against a fake fetch, one test per guarantee of the
// plan (E5, §11), each with its counter-proof: what leaves, when the security
// log is written, how each failure is named, and that nothing it does prints
// or carries the key, the request or the answer. No network (network-guard.ts).

const KEY = "test-key-7f3a91c2";
const STUDENT = "MARKER-STUDENT-TEXT-c41d";
const ECHO = "MARKER-ANSWER-BODY-9e0b";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

const request: EvaluationRequest = {
  system: "Fixed instructions.",
  user: JSON.stringify({ task: { subject: "My town", instructions: null }, language: "en", student_text: STUDENT }),
  schemaName: "trial",
  schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
  generation: { effort: "low", thinking: "adaptive", maxOutputTokens: 4000 },
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const USAGE = { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 40, cache_creation_input_tokens: 0, inference_geo: "us" };

/** An Anthropic message: text blocks, or the blocks given. */
const message = (content: unknown, extra: Record<string, unknown> = {}) =>
  json(
    200,
    {
      id: "msg_01",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: typeof content === "string" ? [{ type: "text", text: content }] : content,
      stop_reason: "end_turn",
      stop_details: null,
      usage: USAGE,
      ...extra,
    },
    { "request-id": "req_011abc" },
  );

/** An Anthropic error body whose every free-text field carries the markers. */
const failure = (type: string, details: Record<string, unknown> = {}, message = `${ECHO} ${STUDENT}`) => ({
  type: "error",
  error: { type, message, details: { reason: `${ECHO} ${STUDENT}`, ...details } },
  request_id: "req_011abc",
});

type Sent = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> };

/** An adapter whose requests are captured and answered by `answer`; the log lines are counted. */
function adapter(answer: (req: Request) => Promise<Response> | Response, options: Partial<AnthropicOptions> = {}) {
  const sent: Sent[] = [];
  const log: (string | null)[] = [];
  const evaluator = createAnthropicEvaluator({
    apiKey: KEY,
    env: {},
    journal: async (subjectId) => {
      log.push(subjectId);
    },
    fetcher: async (req) => {
      sent.push({ url: req.url, method: req.method, headers: Object.fromEntries(req.headers), body: await req.clone().json() });
      return answer(req);
    },
    ...options,
  });
  return { evaluator, sent, log };
}

const call = (evaluator: ReturnType<typeof adapter>["evaluator"], signal = new AbortController().signal) =>
  evaluator.evaluate(request, { signal, subjectId: "subject-1" });

const failed = (promise: Promise<unknown>) => promise.then(() => undefined, (e: unknown) => e);

/** Rejects when the request's own signal aborts, as fetch does. */
const hang = (req: Request) =>
  new Promise<Response>((_, reject) => req.signal.addEventListener("abort", () => reject(req.signal.reason), { once: true }));

// Everything written to the console or the standard streams during a test.
let printed: string[];
beforeEach(() => {
  printed = [];
  const keep = (...args: unknown[]) => {
    printed.push(args.map((a) => (typeof a === "string" ? a : inspect(a, { depth: 5 }))).join(" "));
    return true;
  };
  for (const method of ["log", "info", "warn", "error", "debug", "group", "groupEnd"] as const) {
    vi.spyOn(console, method).mockImplementation(keep);
  }
  vi.spyOn(process.stdout, "write").mockImplementation(keep);
  vi.spyOn(process.stderr, "write").mockImplementation(keep);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Neither the key, nor the student's text, nor the answer's body: in the error, its inspection, its code or anything printed. */
function expectNothingLeaked(error: unknown, log: unknown[] = []) {
  const code = error instanceof EvaluatorError ? (error.providerCode ?? "") : "";
  const seen = [String(error), inspect(error, { depth: 10, showHidden: true }), JSON.stringify(error), code, JSON.stringify(log), ...printed].join("\n");
  for (const secret of [KEY, STUDENT, ECHO]) expect(seen).not.toContain(secret);
}

describe("what leaves: host, method, headers and body, exactly", () => {
  it("one POST to the messages endpoint, four headers, the body of the plan and nothing else", async () => {
    const { evaluator, sent } = adapter(() => message('{"ok":true}'));
    await call(evaluator);
    expect(sent).toHaveLength(1);
    const [req] = sent;
    expect(req.method).toBe("POST");
    expect(req.url).toBe(ENDPOINT);
    // No User-Agent, no X-Stainless-*, no traceparent, no authorization, no anthropic-beta.
    expect(req.headers).toEqual({
      accept: "application/json",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": KEY,
    });
    expect(req.body).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 4000,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
      output_config: { format: { type: "json_schema", schema: request.schema }, effort: "low" },
      thinking: { type: "adaptive", display: "omitted" },
      inference_geo: "us",
    });
  });

  it("sends thinking disabled as such, at an effort that allows it", async () => {
    const { evaluator, sent } = adapter(() => message("{}"));
    await evaluator.evaluate({ ...request, generation: { ...request.generation, thinking: "disabled", effort: "high" } }, { signal: new AbortController().signal, subjectId: null });
    expect(sent[0].body.thinking).toEqual({ type: "disabled" });
  });

  it("carries the key passed in, in x-api-key alone", async () => {
    const { evaluator, sent } = adapter(() => message("{}"));
    await call(evaluator);
    const holders = Object.entries(sent[0].headers).filter(([, value]) => value.includes(KEY));
    expect(holders).toEqual([["x-api-key", KEY]]);
  });

  describe("guardedFetch refuses anything else (counter-proof): nothing logged, nothing sent", () => {
    const body = JSON.stringify({ model: "m", max_tokens: 1, system: "s", messages: [] });
    it.each([
      ["another URL", "https://api.anthropic.com/v1/messages/batches", { method: "POST", body }],
      ["another host", "https://example.test/v1/messages", { method: "POST", body }],
      ["a query string", `${ENDPOINT}?beta=true`, { method: "POST", body }],
      ["another method", ENDPOINT, { method: "GET" }],
      ["a forbidden body key", ENDPOINT, { method: "POST", body: JSON.stringify({ model: "m", metadata: { user_id: "u1" } }) }],
      ["a temperature", ENDPOINT, { method: "POST", body: JSON.stringify({ model: "m", temperature: 0 }) }],
      ["a body that is not JSON", ENDPOINT, { method: "POST", body: "x" }],
    ] as const)("%s", async (_label, url, init) => {
      const journal = vi.fn(async () => {});
      const fetcher = vi.fn(async () => message("{}"));
      const state = { journalFailed: false, blocked: false };
      const fetch = guardedFetch({ key: KEY, subjectId: "s", state, journal, fetcher });
      await expect(fetch(url, init)).rejects.toThrow("A request to the AI was blocked");
      expect(state.blocked).toBe(true);
      expect(journal).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("and lets the expected request through, keeping four headers of any it is given", async () => {
      const fetcher = vi.fn<(req: Request) => Promise<Response>>(async () => message("{}"));
      const fetch = guardedFetch({ key: KEY, subjectId: "s", state: { journalFailed: false, blocked: false }, journal: async () => {}, fetcher });
      await fetch(ENDPOINT, {
        method: "POST",
        body,
        headers: { "x-api-key": "other", "User-Agent": "x", traceparent: "00-1", authorization: "Bearer t", "anthropic-beta": "b", "content-type": "application/json" },
      });
      expect(Object.fromEntries(fetcher.mock.calls[0][0].headers)).toEqual({ "content-type": "application/json", "x-api-key": KEY });
    });
  });
});

describe("the answer", () => {
  it("gives the raw text, the model, the stop reason and the usage, summed as a run stores it", async () => {
    const { evaluator } = adapter(() => message('{"ok":true}'));
    expect(await call(evaluator)).toEqual({
      content: '{"ok":true}',
      modelAnswered: "claude-haiku-5-5",
      providerAnswered: null,
      stopReason: "end_turn",
      usage: {
        promptTokens: 1240,
        completionTokens: 300,
        totalTokens: 1540,
        detail: { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 40, cacheCreationTokens: 0, inferenceGeo: "us" },
      },
    });
  });

  it("keeps the text blocks only: a thinking block before the text is left out", async () => {
    const blocks = [
      { type: "thinking", thinking: ECHO, signature: "sig" },
      { type: "redacted_thinking", data: ECHO },
      { type: "text", text: '{"ok":' },
      { type: "text", text: "true}" },
    ];
    const { evaluator } = adapter(() => message(blocks));
    const response = await call(evaluator);
    expect(response.content).toBe('{"ok":true}');
    expect(JSON.stringify(response)).not.toContain(ECHO);
  });

  it("leaves a cut answer (max_tokens) to the validator, as it came", async () => {
    const { evaluator } = adapter(() => message('{"ok":', { stop_reason: "max_tokens" }));
    expect(await call(evaluator)).toMatchObject({ content: '{"ok":', stopReason: "max_tokens" });
  });

  it("says nothing it was not told, or told in a form that is not an identifier", async () => {
    const { evaluator } = adapter(() => message("{}", { model: `${ECHO} x`, usage: { input_tokens: -1, output_tokens: 2.5, inference_geo: `${ECHO} x` } }));
    expect(await call(evaluator)).toMatchObject({
      modelAnswered: null,
      usage: { promptTokens: null, completionTokens: null, totalTokens: null, detail: { inferenceGeo: null } },
    });
  });

  it.each([
    ["a named category", { category: "general_harms" }, "refusal/general_harms"],
    ["no category", { category: null }, "refusal/null"],
    ["no details at all", null, "refusal/null"],
    ["a category that is not an identifier", { category: `${ECHO} ${STUDENT}` }, "refusal/null"],
  ])("a refusal with %s → refused, its code filtered, its billed usage carried", async (_label, details, code) => {
    const { evaluator, log } = adapter(() => message([{ type: "text", text: ECHO }], { stop_reason: "refusal", stop_details: details }));
    const error = await failed(call(evaluator));
    expect(error).toBeInstanceOf(EvaluatorError);
    expect(error).toMatchObject({ kind: "refused", providerCode: code, stopReason: "refusal", usage: { totalTokens: 1540 } });
    expectNothingLeaked(error, log);
  });

  it.each(["tool_use", "pause_turn", null])("any other stop reason (%s) → unavailable", async (stop_reason) => {
    const { evaluator } = adapter(() => message("{}", { stop_reason }));
    await expect(call(evaluator)).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("the security log (DON-05)", () => {
  it("writes one line per request, with its subject, before the request leaves", async () => {
    const order: string[] = [];
    const { evaluator } = adapter(
      () => {
        order.push("sent");
        return message("{}");
      },
      {
        journal: async (subjectId) => {
          order.push(`log:${subjectId}`);
        },
      },
    );
    await call(evaluator);
    await call(evaluator);
    expect(order).toEqual(["log:subject-1", "sent", "log:subject-1", "sent"]);
  });

  it("keeps each call's subject apart when calls run at once (one client per call)", async () => {
    const log: (string | null)[] = [];
    const { evaluator } = adapter(() => message("{}"), {
      journal: async (subjectId) => {
        await new Promise((resolve) => setTimeout(resolve, subjectId === "a" ? 30 : 0));
        log.push(subjectId);
      },
    });
    const signal = new AbortController().signal;
    await Promise.all([evaluator.evaluate(request, { signal, subjectId: "a" }), evaluator.evaluate(request, { signal, subjectId: "b" })]);
    expect(log.sort()).toEqual(["a", "b"]);
  });

  it("sends nothing when the log cannot be written: an AiJournalError, never an unavailable provider (counter-proof)", async () => {
    const { evaluator, sent } = adapter(() => message("{}"), {
      journal: async () => {
        throw new Error(`database down ${STUDENT}`);
      },
    });
    const error = await failed(call(evaluator));
    expect(error).toBeInstanceOf(AiJournalError);
    expect(error).not.toBeInstanceOf(EvaluatorError);
    expect(sent).toHaveLength(0);
    expectNothingLeaked(error);
  });

  it("sends nothing when the log outlasts the deadline (a database waking up)", async () => {
    const { evaluator, sent } = adapter(() => message("{}"), {
      callTimeoutMs: 30,
      journal: () => new Promise((resolve) => setTimeout(resolve, 80)),
    });
    await expect(call(evaluator)).rejects.toMatchObject({ kind: "timeout" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sent).toHaveLength(0);
  });

  it("writes nothing for a call refused before it leaves (already past its deadline)", async () => {
    const { evaluator, sent, log } = adapter(() => message("{}"));
    const controller = new AbortController();
    controller.abort();
    await expect(call(evaluator, controller.signal)).rejects.toMatchObject({ kind: "timeout" });
    expect(sent).toHaveLength(0);
    expect(log).toHaveLength(0);
  });
});

describe("no hidden retry: one HTTP request per call", () => {
  /** Asks the SDK to retry at once, so that the counter-proof stays fast. */
  const now = { "retry-after-ms": "1" };
  const cases = [
    ["408", () => json(408, failure("timeout_error"), now)],
    ["409", () => json(409, failure("conflict_error"), now)],
    ["429", () => json(429, failure("rate_limit_error"), now)],
    ["500", () => json(500, failure("api_error"), now)],
    ["529", () => json(529, failure("overloaded_error"), now)],
    ["a 400 with x-should-retry: true", () => json(400, failure("invalid_request_error"), { ...now, "x-should-retry": "true" })],
    ["a connection refused", () => Promise.reject(new TypeError(`fetch failed: ${ECHO}`))],
  ] as const;

  it.each(cases)("%s", async (_label, answer) => {
    const { evaluator, sent, log } = adapter(answer);
    const error = await failed(call(evaluator));
    expect(error).toBeInstanceOf(EvaluatorError);
    expect(sent).toHaveLength(1);
    expect(log).toHaveLength(1);
    expectNothingLeaked(error, log);
  });

  it("a deadline reached before the headers", async () => {
    const { evaluator, sent } = adapter(hang, { callTimeoutMs: 50 });
    await expect(call(evaluator)).rejects.toMatchObject({ kind: "timeout" });
    expect(sent).toHaveLength(1);
  });

  it.each(cases)("counter-proof, %s: the SDK's own retries (maxRetries 2) would send three", { timeout: 10_000 }, async (_label, answer) => {
    const { evaluator, sent, log } = adapter(answer, { maxRetries: 2 });
    await failed(call(evaluator));
    expect(sent).toHaveLength(3);
    // Each retry still writes its line first.
    expect(log).toHaveLength(3);
  });
});

describe("each failure has a kind, and carries nothing (EVL-03 R3)", () => {
  it.each([
    ["400, spending limit", () => json(400, failure("invalid_request_error", {}, "You have reached your specified workspace API usage limits.")), "configuration", "invalid_request_error/spend_limit"],
    ["400, no credit", () => json(400, failure("invalid_request_error", {}, "Your credit balance is too low to access the API.")), "configuration", "invalid_request_error/credit_exhausted"],
    ["400", () => json(400, failure("invalid_request_error")), "configuration", "invalid_request_error"],
    ["401", () => json(401, failure("authentication_error")), "configuration", "authentication_error"],
    ["402", () => json(402, failure("billing_error")), "configuration", "billing_error"],
    ["403", () => json(403, failure("permission_error")), "configuration", "permission_error"],
    ["404", () => json(404, failure("not_found_error")), "configuration", "not_found_error"],
    ["413 from Cloudflare", () => new Response(`<html>${ECHO}</html>`, { status: 413, headers: { "content-type": "text/html" } }), "rejected", undefined],
    ["429, the tier's spending cap", () => json(429, failure("rate_limit_error", { error_code: "enforced_spend_limit_reached" })), "configuration", "rate_limit_error/enforced_spend_limit_reached"],
    ["429", () => json(429, failure("rate_limit_error"), { "retry-after": "7" }), "rate_limited", "rate_limit_error"],
    ["504", () => json(504, failure("timeout_error")), "timeout", "timeout_error"],
    ["409", () => json(409, failure("conflict_error")), "unavailable", "conflict_error"],
    ["500", () => json(500, failure("api_error")), "unavailable", "api_error"],
    ["529", () => json(529, failure("overloaded_error")), "unavailable", "overloaded_error"],
    ["503 in plain text", () => new Response(ECHO, { status: 503 }), "unavailable", undefined],
    ["a 200 that is not a message", () => json(200, { answer: ECHO }), "unavailable", undefined],
    ["a 200 with a broken JSON body", () => new Response(`{"x": "${ECHO}`, { status: 200, headers: { "content-type": "application/json" } }), "unavailable", undefined],
    ["a 200 in plain text", () => new Response(ECHO, { status: 200, headers: { "content-type": "text/plain" } }), "unavailable", undefined],
    ["the network down", () => Promise.reject(new TypeError(`fetch failed: ${ECHO}`)), "unavailable", undefined],
  ] as const)("%s → %s", async (_label, answer, kind, code) => {
    const { evaluator, log } = adapter(answer);
    const error = await failed(call(evaluator));
    expect(error).toBeInstanceOf(EvaluatorError);
    expect(error).toMatchObject({ kind });
    expect((error as EvaluatorError).providerCode).toBe(code);
    expect((error as EvaluatorError).cause).toBeUndefined();
    // The request left: it is in the log, by its subject alone.
    expect(log).toEqual(["subject-1"]);
    expectNothingLeaked(error, log);
  });

  it("keeps the wait asked and the request-id, both identifiers", async () => {
    const { evaluator } = adapter(() => json(429, failure("rate_limit_error"), { "retry-after": "7", "request-id": "req_011xyz" }));
    expect(await failed(call(evaluator))).toMatchObject({ kind: "rate_limited", retryAfterMs: 7000, requestId: "req_011xyz" });
  });

  it("would see a leak (counter-proof): the check finds a marker in a code, an error or what is printed", () => {
    expect(() => expectNothingLeaked(new EvaluatorError("unavailable", undefined, ECHO))).toThrow();
    expect(() => expectNothingLeaked(new Error(ECHO))).toThrow();
    expect(() => expectNothingLeaked(Object.assign(new Error("x"), { body: STUDENT }))).toThrow();
    expect(() => expectNothingLeaked(null, [STUDENT])).toThrow();
    console.warn(`x-api-key: ${KEY}`);
    expect(() => expectNothingLeaked(null)).toThrow();
    printed = [];
  });

  it("prints nothing on success either", async () => {
    const { evaluator } = adapter(() => message(`{"echo":"${ECHO}"}`));
    await call(evaluator);
    expect(printed).toEqual([]);
  });
});

describe("the duration is bounded, answer read included", () => {
  const stalled = (deaf: boolean) => (req: Request) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"type":"message",'));
          if (!deaf) req.signal.addEventListener("abort", () => controller.error(req.signal.reason), { once: true });
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("a body that stalls after the headers → timeout, within the deadline", async () => {
    const { evaluator } = adapter(stalled(false), { callTimeoutMs: 50 });
    const started = Date.now();
    await expect(call(evaluator)).rejects.toMatchObject({ kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("counter-proof: a body deaf to the signal, which the SDK's timeout (headers only) never ends, still ends in time", async () => {
    const { evaluator } = adapter(stalled(true), { callTimeoutMs: 50 });
    const started = Date.now();
    await expect(call(evaluator)).rejects.toMatchObject({ kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("an answer that never comes, from a fetch deaf to the signal → timeout, within the deadline", async () => {
    const { evaluator } = adapter(() => new Promise<Response>(() => {}), { callTimeoutMs: 50 });
    const started = Date.now();
    await expect(call(evaluator)).rejects.toMatchObject({ kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("a call aborted by the caller → timeout", async () => {
    const { evaluator } = adapter(hang);
    const controller = new AbortController();
    const pending = call(evaluator, controller.signal);
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("fetch is looked up at call time", () => {
  // The network guard blocking an adapter without a fetcher: tests/network-guard.test.ts.
  it("the fetch in place at the call is the one used, not one kept from the construction", async () => {
    const evaluator = createAnthropicEvaluator({ apiKey: KEY, env: {}, journal: async () => {} });
    const later = vi.fn<(req: Request) => Promise<Response>>(async () => message("{}"));
    vi.stubGlobal("fetch", later);
    await call(evaluator);
    expect(later).toHaveBeenCalledTimes(1);
    expect(later.mock.calls[0][0].url).toBe(ENDPOINT);
  });
});

describe("the adapter refuses to start", () => {
  const TRAPS = [
    ["ANTHROPIC_API_KEY", KEY],
    ["ANTHROPIC_AUTH_TOKEN", KEY],
    ["ANTHROPIC_BASE_URL", "https://example.test"],
    ["ANTHROPIC_LOG", "debug"],
    ["ANTHROPIC_CUSTOM_HEADERS", `X-Api-Key: ${KEY}`],
    ["ANTHROPIC_OPEN_TELEMETRY", "true"],
    ["ANTHROPIC_OPEN_TELEMETRY_CAPTURE_CONTENT", "content"],
    ["NODE_DEBUG", "http,undici"],
    ["NODE_DEBUG", ""],
  ] as const;

  it.each(TRAPS)("when %s is set (to %j): its name in the refusal, never its value", (name, value) => {
    const error = (() => {
      try {
        createAnthropicEvaluator({ apiKey: KEY, env: { [name]: value } });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(AiConfigurationError);
    expect(String(error)).toContain(name);
    if (value !== "") expect(inspect(error)).not.toContain(value);
    expect(inspect(error)).not.toContain(KEY);
  });

  it.each(TRAPS)("when %s is set after the start: the call is refused, nothing logged or sent", async (name, value) => {
    const env: Record<string, string | undefined> = {};
    const { evaluator, sent, log } = adapter(() => message("{}"), { env });
    env[name] = value;
    await expect(call(evaluator)).rejects.toThrow(AiConfigurationError);
    expect(sent).toHaveLength(0);
    expect(log).toHaveLength(0);
  });

  it("counter-proof: starts in a clean environment, other variables included", async () => {
    const { evaluator } = adapter(() => message("{}"), { env: { NODE_ENV: "development", PATH: "/usr/bin", GRADING_ANTHROPIC_API_KEY: KEY } });
    await expect(call(evaluator)).resolves.toBeDefined();
    expect(forbiddenVariables({ ANTHROPIC_X: undefined, anthropic_lower: "x" })).toEqual([]);
  });

  it.each(["", "   "])("without a key (%j): a request would leave unauthenticated", (apiKey) => {
    expect(() => createAnthropicEvaluator({ apiKey, env: {} })).toThrow(AiConfigurationError);
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])("with a call timeout of %s", (callTimeoutMs) => {
    expect(() => createAnthropicEvaluator({ apiKey: KEY, env: {}, callTimeoutMs })).toThrow(AiConfigurationError);
  });

  it.each(["xhigh", "max"] as const)("thinking disabled at the %s effort (a 400): nothing logged or sent", async (effort) => {
    const { evaluator, sent, log } = adapter(() => message("{}"));
    const disabled = { ...request, generation: { ...request.generation, thinking: "disabled" as const, effort } };
    await expect(evaluator.evaluate(disabled, { signal: new AbortController().signal, subjectId: null })).rejects.toThrow(AiConfigurationError);
    expect(sent).toHaveLength(0);
    expect(log).toHaveLength(0);
  });
});
