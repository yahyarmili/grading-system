import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_MAIL_DIR, E2E_PORT } from "./e2e/support/env";

// E1 journeys in a real browser. Runs in the "e2e" compose service (Playwright
// image): docker compose run --rm e2e
// It starts its own Next server on the test database, with the capture email
// transport: no real email leaves, the dev server and dev database stay untouched.

export default defineConfig({
  testDir: "./e2e",
  // One shared test database and mailbox: journeys run one after another.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // First visits compile pages on demand (next dev).
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/support/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/sign-in`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "ignore",
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      BETTER_AUTH_URL: E2E_BASE_URL,
      EMAIL_TRANSPORT: "capture",
      MAIL_CAPTURE_DIR: E2E_MAIL_DIR,
      // The journeys never reach the AI, whatever .env.local says (E5).
      AI_PROVIDER: "simulator",
      OPENROUTER_API_KEY: "",
    },
  },
});
