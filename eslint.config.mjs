import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Who may import what, in one table (stack-technologique.md §4): each entry,
 * the import patterns it forbids and the files allowed to use them. In a flat
 * config the last block that sets a rule replaces it whole, so every block
 * below is derived from this table: a block that lifts one restriction keeps
 * all the others. The allowed globs never overlap (tests/eslint-restrictions.test.ts).
 */
export const IMPORT_RESTRICTIONS = [
  {
    // Rule 1: access control applies in the data access layer, at a single point.
    group: ["@/server/db", "@/server/db/*", "**/server/db", "**/server/db/*"],
    message: "Go through the data access layer (src/server/data/), which applies the access matrix.",
    allowed: ["src/server/data/**", "src/server/db/**", "tests/**"],
  },
  {
    // Rules 3 and 5: the AI is reached from its hardened adapter only.
    group: ["@anthropic-ai/*", "@anthropic-ai/*/**"],
    message: "Only src/server/ai/anthropic.ts imports Anthropic's SDK, hardened by its options.",
    allowed: ["src/server/ai/anthropic.ts"],
  },
];

const restrictedImports = (restrictions) => [
  "error",
  { patterns: restrictions.map(({ group, message }) => ({ group, message })) },
];

/** One block for every file, then one per allowed glob, with every restriction that glob is not allowed. */
export const importRestrictionBlocks = (restrictions = IMPORT_RESTRICTIONS) => [
  { files: ["**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(restrictions) } },
  ...restrictions.flatMap(({ allowed }) =>
    allowed.map((glob) => ({
      files: [glob],
      rules: { "no-restricted-imports": restrictedImports(restrictions.filter((r) => !r.allowed.includes(glob))) },
    })),
  ),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...importRestrictionBlocks(),
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
