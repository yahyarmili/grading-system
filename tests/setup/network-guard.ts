import { afterEach, expect } from "vitest";

// No test calls fetch() (E5: the Anthropic adapter runs only with an injected
// fetch, and reads the global one at each call). Every fetch() is refused and
// recorded, and the test that made it fails even if it caught the error.
// Only fetch() is guarded: the database (pg, over TCP) is meant to be
// reached, email goes to the capture transport in tests, and a module that
// opened node:http or a socket by itself would not be caught here.

const blocked: string[] = [];

/** What a test that needs HTTP injects instead: tests/setup/network-guard.ts refuses the real one. */
export const NETWORK_BLOCKED = "Network access is blocked in tests: inject a fetcher instead.";

globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = input instanceof Request ? input.url : String(input);
  // The origin only: a query string could carry a value under test.
  blocked.push(URL.canParse(url) ? new URL(url).origin : "(unparsable URL)");
  throw new Error(NETWORK_BLOCKED);
};

/** The guard's own test: the calls refused so far, forgotten once read. */
export const drainBlocked = () => blocked.splice(0);

afterEach(() => {
  const calls = drainBlocked();
  expect(calls, "fetch() called during the test: tests never touch the network").toEqual([]);
});
