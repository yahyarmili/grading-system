import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Access control applies in the data access layer, at a single point
  // (stack-technologique.md §4, rule 1): only it may reach the database.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/server/data/**", "src/server/db/**", "tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db", "@/server/db/*", "**/server/db", "**/server/db/*"],
              message: "Go through the data access layer (src/server/data/), which applies the access matrix.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
