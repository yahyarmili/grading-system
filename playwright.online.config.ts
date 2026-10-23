import { defineConfig, devices } from "@playwright/test";

// E7.8: E7's journey and measurement replayed on the deployed preview, on the
// simulator (the preview's AI_PROVIDER unset); E8.6: E8's journey and the
// resource pages' statuses too (a file name runs one of them). No local
// server and no reset: the preview's base is dev, where the journeys only add
// fictitious accounts
// and copies (e2e/support/env.ts). On demand:
//   docker compose run --rm e2e sh -c "npm install --no-audit --no-fund && E2E_ONLINE_URL=https://… npx playwright test -c playwright.online.config.ts"

const url = process.env.E2E_ONLINE_URL;
if (!url) throw new Error("E2E_ONLINE_URL is not set");

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["e7-journey.spec.ts", "e7-review-measure.spec.ts", "e8-journey.spec.ts", "route-statuses.spec.ts"],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: { baseURL: url, navigationTimeout: 60_000, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
