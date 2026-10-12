/**
 * Returns the test database URL, or throws before anything is reset:
 * the integration setup drops every table of the database it receives.
 */
export function assertTestDatabaseUrl(
  testUrl: string | undefined,
  devUrl: string | undefined,
): string {
  if (!testUrl) throw new Error("DATABASE_URL_TEST is not set");
  if (testUrl === devUrl) {
    throw new Error("DATABASE_URL_TEST equals DATABASE_URL: refusing to reset the dev database");
  }
  return testUrl;
}
