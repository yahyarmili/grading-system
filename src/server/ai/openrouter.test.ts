import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterEvaluator, FORBIDDEN_ENV, type OpenRouterOptions } from "./openrouter";
import { AiConfigurationError, EvaluatorError, type EvaluationRequest } from "./types";

// The OpenRouter adapter against a fake fetch: what leaves, when the security
// log is written, how each failure is named, and that nothing it does prints
// or carries the key, the request or the answer. No network (network-guard.ts).

const KEY = "test-key-7f3a91c2";
const STUDENT = "MARKER-STUDENT-TEXT-c41d";
const ECHO = "MARKER-ANSWER-BODY-9e0b";
const MODEL = "xingchen-agi/xing4.0-29b-a4b:free";

const request: EvaluationRequest = {
  system: "Fixed instructions.",
  user: JSON.stringify({ task: { subject: "My town", instructions: null }, language: "en", student_text: STUDENT }),
  schemaName: "trial",
  schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
  generation: { temperature: 0, maxOutputTokens: 300, reasoningEffort: "none" },
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const completion = (content: unknown, extra: Record<string, unknown> = {}, choice: Record<string, unknown> = {}) =>
  json(200, {
    id: "gen-1",
    object: "chat.completion",
    model: MODEL,
    provider: "Phala",
    created: 1_760_000_000,
    usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop", native_finish_reason: "stop", ...choice }],
    ...extra,
  });

/** An OpenRouter error body whose every free-text field carries the markers. */
const failure = (code: number, metadata: Record<string, unknown> = {}) => ({
  error: {
    code,
    message: `${ECHO} ${STUDENT}`,
    metadata: { raw: `${ECHO} ${STUDENT}`, moderation: { reasons: [ECHO], flagged_input: STUDENT, provider_name: "Phala" }, ...metadata },
  },
});

type Sent = { url: string; method: string; headers: [string, string][]; body: Record<string, unknown> };

/** An adapter whose requests are captured and answered by `answer`; the log lines are counted. */
function adapter(answer: (req: Request) => Promise<Response> | Response, options: Partial<OpenRouterOptions> = {}) {
  const sent: Sent[] = [];
  const log: (string | null)[] = [];
  const evaluator = createOpenRouterEvaluator({
    apiKey: KEY,
    env: {},
    journal: async (subjectId) => {
      log.push(subjectId);
    },
    fetcher: async (req) => {
      sent.push({ url: req.url, method: req.method, headers: [...req.headers.entries()], body: await req.clone().json() });
      return answer(req);
    },
    ...options,
  });
  return { evaluator, sent, log };
}

const call = (evaluator: ReturnType<typeof adapter>["evaluator"], signal = new AbortController().signal) =>
  evaluator.evaluate(request, { signal, subjectId: "subject-1" });

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
});

/** Neither the key, nor the student's text, nor the answer's body: in the error, its inspection or anything printed. */
function expectNothingLeaked(error: unknown) {
  const seen = [String(error), inspect(error, { depth: 10, showHidden: true }), JSON.stringify(error), ...printed].join("\n");
  for (const secret of [KEY, STUDENT, ECHO]) expect(seen).not.toContain(secret);
}

describe("what leaves", () => {
  it("one POST to OpenRouter's chat endpoint, with the pinned model and routing, the whitelist request and nothing else", async () => {
    const { evaluator, sent } = adapter(() => completion('{"ok":true}'));
    await call(evaluator);
    expect(sent).toHaveLength(1);
    const [req] = sent;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    // Exactly these headers: no attribution (HTTP-Referer, X-Title, X-OpenRouter-Title, X-OpenRouter-Categories).
    expect(Object.fromEntries(req.headers)).toEqual({ authorization: `Bearer ${KEY}`, "content-type": "application/json" });
    expect(req.body).toEqual({
      model: MODEL,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      temperature: 0,
      max_tokens: 300,
      reasoning: { effort: "none" },
      response_format: { type: "json_schema", json_schema: { name: "trial", strict: true, schema: request.schema } },
      provider: { require_parameters: true, zdr: true },
      stream: false,
    });
  });

  it("returns the raw text, the model and the provider that answered, and the tokens used", async () => {
    const { evaluator } = adapter(() => completion('{"ok":true}'));
    expect(await call(evaluator)).toEqual({
      content: '{"ok":true}',
      modelAnswered: MODEL,
      providerAnswered: "Phala",
      usage: { promptTokens: 120, completionTokens: 30, totalTokens: 150 },
    });
  });

  it("says nothing of a provider it was not told, or told in a form that is not a name", async () => {
    for (const provider of [undefined, "", 7, `${ECHO}\n${STUDENT}`, "x".repeat(65)]) {
      const { evaluator } = adapter(() => completion("{}", { provider, usage: undefined, model: undefined }));
      expect(await call(evaluator)).toMatchObject({ providerAnswered: null, modelAnswered: null, usage: null });
    }
    const { evaluator } = adapter(() => completion("{}", { provider: "Google AI Studio" }));
    expect((await call(evaluator)).providerAnswered).toBe("Google AI Studio");
  });

  it("joins the text parts of a list answer, and leaves the reasoning out", async () => {
    const content = [
      { type: "reasoning", text: "hidden" },
      { type: "text", text: '{"ok":' },
      { type: "text", text: "true}" },
    ];
    const { evaluator } = adapter(() => completion(null, {}, { message: { role: "assistant", reasoning: "hidden", content } }));
    expect((await call(evaluator)).content).toBe('{"ok":true}');
  });

  it("leaves a cut answer to the validator: its text, as it came", async () => {
    const { evaluator } = adapter(() => completion('{"ok":', {}, { finish_reason: "length" }));
    expect((await call(evaluator)).content).toBe('{"ok":');
  });
});

describe("the security log (DON-05)", () => {
  it("writes one line per request, with its subject, before the request leaves", async () => {
    const order: string[] = [];
    const { evaluator } = adapter(
      () => {
        order.push("sent");
        return completion("{}");
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

  it("sends nothing when the log cannot be written, and gives back the log's failure", async () => {
    const failure = new Error("database down");
    const { evaluator, sent } = adapter(() => completion("{}"), {
      journal: async () => {
        throw failure;
      },
    });
    await expect(call(evaluator)).rejects.toBe(failure);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing when the log outlasts the deadline (a database waking up)", async () => {
    const { evaluator, sent } = adapter(() => completion("{}"), {
      callTimeoutMs: 30,
      journal: () => new Promise((resolve) => setTimeout(resolve, 80)),
    });
    await expect(call(evaluator)).rejects.toMatchObject({ kind: "timeout" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sent).toHaveLength(0);
  });

  it("writes nothing for a call refused before it leaves (already past its deadline)", async () => {
    const { evaluator, sent, log } = adapter(() => completion("{}"));
    const controller = new AbortController();
    controller.abort();
    await expect(call(evaluator, controller.signal)).rejects.toMatchObject({ kind: "timeout" });
    expect(sent).toHaveLength(0);
    expect(log).toHaveLength(0);
  });
});

describe("each failure has a kind, and carries nothing (EVL-03 R3)", () => {
  it.each([
    ["400", () => json(400, failure(400)), "rejected"],
    ["401", () => json(401, failure(401)), "configuration"],
    ["402 (no credit left)", () => json(402, failure(402)), "configuration"],
    ["403 by a budget of the account", () => json(403, failure(403, { limit_source: "key_limit" })), "configuration"],
    ["403 by moderation, echoing our input", () => json(403, failure(403)), "rejected"],
    ["404 (unknown model)", () => json(404, failure(404)), "configuration"],
    ["408", () => json(408, failure(408)), "timeout"],
    ["418, any other 4xx", () => json(418, failure(418)), "rejected"],
    ["500", () => json(500, failure(500)), "unavailable"],
    ["502 (model down)", () => json(502, failure(502, { error_type: "provider_unavailable" })), "unavailable"],
    ["503 (no provider meets the routing)", () => json(503, failure(503)), "unavailable"],
    ["503 in plain text", () => new Response(ECHO, { status: 503 }), "unavailable"],
    ["an error at the top of a 200", () => json(200, { id: "gen-1", ...failure(502) }), "unavailable"],
    ["a 429 at the top of a 200", () => json(200, failure(429)), "rate_limited"],
    ["an error at the top of a 200, without a code", () => json(200, { error: { message: ECHO } }), "unavailable"],
    ["an error in the choice, after part of the answer", () => completion(`{"partial":"${ECHO}`, {}, { finish_reason: "error", error: failure(502).error }), "unavailable"],
    ["a choice ended by an error, with no error object", () => completion(`{"partial":"${ECHO}`, {}, { finish_reason: "error" }), "unavailable"],
    ["a content filter", () => completion(ECHO, {}, { finish_reason: "content_filter" }), "rejected"],
    ["a refusal", () => completion(null, {}, { message: { role: "assistant", content: null, refusal: ECHO } }), "rejected"],
    ["a 200 with no choice", () => json(200, { id: "gen-1", model: MODEL, choices: [] }), "unavailable"],
    ["a 200 that is not JSON", () => new Response(ECHO, { status: 200, headers: { "content-type": "text/plain" } }), "unavailable"],
    ["a 200 that is not a chat completion", () => json(200, { answer: ECHO }), "unavailable"],
    ["a 200 with a broken JSON body", () => new Response(`{"x": "${ECHO}`, { status: 200, headers: { "content-type": "application/json" } }), "unavailable"],
    ["the network down", () => Promise.reject(new TypeError(`fetch failed: ${ECHO}`)), "unavailable"],
    ["any other failure of fetch", () => Promise.reject(new Error(ECHO)), "unavailable"],
  ] as const)("%s → %s", async (_label, answer, kind) => {
    const { evaluator, log } = adapter(answer);
    const error = await call(evaluator).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EvaluatorError);
    expect((error as EvaluatorError).kind).toBe(kind);
    expect((error as EvaluatorError).cause).toBeUndefined();
    // The request left: it is in the log.
    expect(log).toEqual(["subject-1"]);
    expectNothingLeaked(error);
  });

  it("429 → rate_limited, with the wait and the code OpenRouter gave", async () => {
    const { evaluator } = adapter(() => json(429, failure(429, { error_type: "rate_limit_exceeded", provider_code: 1300 }), { "retry-after": "7" }));
    const error = await call(evaluator).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "rate_limited", retryAfterMs: 7000, providerCode: "rate_limit_exceeded/1300" });
    expectNothingLeaked(error);
  });

  it("an answer slower than the call's deadline → timeout, within the deadline", async () => {
    const { evaluator } = adapter(hang, { callTimeoutMs: 50 });
    const started = Date.now();
    const error = await call(evaluator).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
    expectNothingLeaked(error);
  });

  it("an answer whose body stalls after the headers → timeout too", async () => {
    const stalled = (req: Request) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"id":'));
            req.signal.addEventListener("abort", () => controller.error(req.signal.reason), { once: true });
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const { evaluator } = adapter(stalled, { callTimeoutMs: 50 });
    await expect(call(evaluator)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("an answer that never comes, from a fetch deaf to the signal → timeout, within the deadline", async () => {
    const { evaluator } = adapter(() => new Promise<Response>(() => {}), { callTimeoutMs: 50 });
    const started = Date.now();
    await expect(call(evaluator)).rejects.toMatchObject({ kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("a body that never ends, from a fetch deaf to the signal → timeout, within the deadline", async () => {
    const endless = () =>
      new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode('{"id":')) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const { evaluator } = adapter(endless, { callTimeoutMs: 50 });
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

  it("would see a leak: the check finds the markers in an error and in what is printed", () => {
    expect(() => expectNothingLeaked(new Error(ECHO))).toThrow();
    expect(() => expectNothingLeaked(Object.assign(new Error("x"), { body: STUDENT }))).toThrow();
    console.warn(`Bearer ${KEY}`);
    expect(() => expectNothingLeaked(null)).toThrow();
    printed = [];
  });

  it("prints nothing on success either", async () => {
    const { evaluator } = adapter(() => completion(`{"echo":"${ECHO}"}`));
    await call(evaluator);
    expectNothingLeaked(null);
    expect(printed).toEqual([]);
  });
});

describe("the adapter refuses to start", () => {
  it.each(FORBIDDEN_ENV.flatMap((name) => [[name, "http,undici"], [name, "false"], [name, ""]]))(
    "when %s is set, even to %j",
    (name, value) => {
      expect(() => createOpenRouterEvaluator({ apiKey: KEY, env: { [name]: value } })).toThrow(AiConfigurationError);
    },
  );

  it.each(["", "   "])("without a key (%j): a request would leave unauthenticated", (apiKey) => {
    expect(() => createOpenRouterEvaluator({ apiKey, env: {} })).toThrow(AiConfigurationError);
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])("with a call timeout of %s", (callTimeoutMs) => {
    expect(() => createOpenRouterEvaluator({ apiKey: KEY, env: {}, callTimeoutMs })).toThrow(AiConfigurationError);
  });

  it("and its refusal names variables, never the key", () => {
    const error = (() => {
      try {
        createOpenRouterEvaluator({ apiKey: KEY, env: { NODE_DEBUG: "http" } });
      } catch (e) {
        return e;
      }
    })();
    expect(String(error)).toContain("NODE_DEBUG");
    expect(inspect(error)).not.toContain(KEY);
  });

  it("reads no key from the environment: OPENROUTER_API_KEY alone starts nothing", () => {
    expect(() => createOpenRouterEvaluator({ apiKey: "", env: { OPENROUTER_API_KEY: KEY } })).toThrow(AiConfigurationError);
  });
});
