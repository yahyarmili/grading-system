import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Every test runs on the simulator and without network, whatever .env.local
// says: AI_PROVIDER and GRADING_ANTHROPIC_API_KEY are overridden, and fetch() is refused
// (tests/setup/network-guard.ts).
const aiEnv = { AI_PROVIDER: "simulator", GRADING_ANTHROPIC_API_KEY: "" };

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // The marker throws outside React Server Components; tests are server code.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: ["**/*.int.test.ts", "node_modules/**"],
          // No database for unit tests: a write left in one (a forgotten journal)
          // fails on this unreachable address instead of reaching the dev database.
          env: { ...aiEnv, DATABASE_URL: "postgres://unit-tests-database.invalid:5432/none" },
          setupFiles: ["tests/setup/network-guard.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts", "tests/**/*.int.test.ts"],
          // Code under test reads DATABASE_URL: point it at the test database.
          env: { ...aiEnv, DATABASE_URL: process.env.DATABASE_URL_TEST ?? "" },
          globalSetup: ["tests/setup/global-db.ts"],
          setupFiles: ["tests/setup/network-guard.ts", "tests/setup/integration.ts"],
          // One shared database: files run one after another.
          fileParallelism: false,
          // Neon suspends its compute after 5 min idle: allow a cold start.
          hookTimeout: 30_000,
          testTimeout: 15_000,
        },
      },
    ],
  },
});
