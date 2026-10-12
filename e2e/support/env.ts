import os from "node:os";
import path from "node:path";

/** The E2E server, distinct from the dev server (port 3000). */
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** Where the E2E server writes captured emails (inside the container, outside the repository). */
export const E2E_MAIL_DIR = path.join(os.tmpdir(), "grading-e2e-mail");

/** The test database: reset at each run, like the integration tests. */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set");
  return url;
}
