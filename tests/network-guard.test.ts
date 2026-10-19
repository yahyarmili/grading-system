import { describe, expect, it } from "vitest";
import { createAnthropicEvaluator } from "@/server/ai/anthropic";
import { drainBlocked, NETWORK_BLOCKED } from "./setup/network-guard";

// The guard itself: a fetch made by a test is refused and recorded (origin
// only), so that the test fails even if it caught the error.

describe("the network guard", () => {
  it("refuses fetch and records its origin, without the query", async () => {
    await expect(fetch("https://api.anthropic.com/v1/messages?key=secret")).rejects.toThrow(NETWORK_BLOCKED);
    await expect(fetch(new Request("https://example.test/x"))).rejects.toThrow(NETWORK_BLOCKED);
    expect(drainBlocked()).toEqual(["https://api.anthropic.com", "https://example.test"]);
  });

  it("blocks the Anthropic adapter without an injected fetcher: it looks fetch up at each call", async () => {
    const evaluator = createAnthropicEvaluator({ apiKey: "test-key", env: {}, journal: async () => {} });
    const request = {
      system: "s",
      user: "u",
      schemaName: "n",
      schema: { type: "object" },
      generation: { effort: "low", thinking: "adaptive", maxOutputTokens: 100 },
    } as const;
    await expect(evaluator.evaluate(request, { signal: new AbortController().signal, subjectId: null })).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(drainBlocked()).toEqual(["https://api.anthropic.com"]);
  });
});
