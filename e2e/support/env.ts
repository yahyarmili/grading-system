import os from "node:os";
import path from "node:path";

/** The E2E server, distinct from the dev server (port 3000). */
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** Where the E2E server writes captured emails (inside the container, outside the repository). */
export const E2E_MAIL_DIR = path.join(os.tmpdir(), "grading-e2e-mail");

/**
 * Where the E2E server's Local World keeps its runs (Vercel Workflows, E6):
 * not the dev server's .workflow-data, whose queue it would mix with.
 */
export const E2E_WORKFLOW_DIR = path.join(os.tmpdir(), "grading-e2e-workflow");

/** The cron route's secret on the E2E server (E6.4: the measured batch calls it); a test value. */
export const E2E_CRON_SECRET = "e2e-cron-secret";

/**
 * E7.8: the deployed preview a journey is replayed on (playwright.online.config.ts),
 * or null for the local E2E server.
 */
export const E2E_ONLINE_URL = process.env.E2E_ONLINE_URL || null;

/**
 * The test database: reset at each run, like the integration tests. Online,
 * the preview's own base (dev), never reset: the journeys only add
 * fictitious accounts and copies to it.
 */
export function testDatabaseUrl(): string {
  const url = E2E_ONLINE_URL ? process.env.DATABASE_URL : process.env.DATABASE_URL_TEST;
  if (!url) throw new Error(E2E_ONLINE_URL ? "DATABASE_URL is not set" : "DATABASE_URL_TEST is not set");
  return url;
}
