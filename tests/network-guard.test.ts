import { describe, expect, it } from "vitest";
import { drainBlocked, NETWORK_BLOCKED } from "./setup/network-guard";

// The guard itself: a fetch made by a test is refused and recorded (origin
// only), so that the test fails even if it caught the error.

describe("the network guard", () => {
  it("refuses fetch and records its origin, without the query", async () => {
    await expect(fetch("https://openrouter.ai/api/v1/chat/completions?key=secret")).rejects.toThrow(NETWORK_BLOCKED);
    await expect(fetch(new Request("https://example.test/x"))).rejects.toThrow(NETWORK_BLOCKED);
    expect(drainBlocked()).toEqual(["https://openrouter.ai", "https://example.test"]);
  });
});
