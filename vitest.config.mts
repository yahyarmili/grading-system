import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts", "tests/**/*.int.test.ts"],
          // Code under test reads DATABASE_URL: point it at the test database.
          env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? "" },
          globalSetup: ["tests/setup/global-db.ts"],
          setupFiles: ["tests/setup/integration.ts"],
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
