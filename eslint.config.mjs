import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Who may import what, in one table (stack-technologique.md §4): each entry,
 * the import patterns it forbids and the files allowed to use them. In a flat
 * config the last block that sets a rule replaces it whole, so every block
 * below is derived from this table: a block that lifts one restriction keeps
 * all the others. A glob inside another (a file of src/server/data/**) keeps
 * what the outer one lifts (tests/eslint-restrictions.test.ts).
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
  {
    // The evaluation's system functions take no Actor and read the student's text: the evaluation service only.
    group: ["@/server/data/evaluation/system", "**/data/evaluation/system", "**/evaluation/system"],
    message: "Only the evaluation service (src/server/evaluation/) uses these system functions, which take no Actor.",
    allowed: ["src/server/evaluation/**", "tests/**"],
  },
  {
    // Rule 4: a workflow and its steps carry identifiers only; one place starts them and defines them (E6).
    group: ["workflow", "workflow/*", "@workflow/*"],
    message: "Only the evaluation service (src/server/evaluation/) starts or defines workflows, with identifiers only.",
    allowed: ["src/server/evaluation/**", "next.config.ts"],
  },
  {
    // REV-03, REV-04 (E7): the teacher's evaluation and the review log have one
    // writer, record.ts, which writes an evaluation only with the log entries of
    // its changes. Only it and their readers import these tables; a namespace
    // import of the schema (schema.teacherEvaluations) is refused with them.
    // tests/review-writes.test.ts checks the readers' text for writes.
    group: ["@/server/db/schema", "@/server/db/schema/reviews", "**/db/schema", "**/db/schema/reviews"],
    importNames: ["teacherEvaluations", "reviewJournalEntries"],
    message: "Only src/server/data/review/record.ts writes the teacher's evaluation and the review log; their readers are listed in eslint.config.mjs.",
    allowed: [
      "src/server/data/review/record.ts",
      // Readers: the copy (getCopy, saveEvaluation's re-read, recordCopyOpened) and its history.
      "src/server/data/review/copy.ts",
      "src/server/data/review/journal.ts",
      // Better Auth's adapter receives the whole schema (import * as schema); a
      // namespace import of any schema file falls under the group's paths.
      "src/server/data/auth/better-auth.ts",
      "src/server/db/**",
      "tests/**",
    ],
  },
];

const restrictedImports = (restrictions) => [
  "error",
  {
    patterns: restrictions.map(({ group, importNames, message }) => ({ group, ...(importNames && { importNames }), message })),
  },
];

/**
 * Whether `outer` matches every file `inner` matches: the same glob, or a
 * directory glob ("dir/**") above it. Allowed globs are directory globs or
 * file paths (tests/eslint-restrictions.test.ts), so two globs matching one
 * file are always nested.
 */
export const covers = (outer, inner) => outer === inner || (outer.endsWith("/**") && inner.startsWith(outer.slice(0, -2)));

/**
 * One block for every file, then one per allowed glob (once, even when
 * several entries allow it), with every restriction neither that glob nor a
 * glob covering it is allowed. A narrower glob comes after the globs covering
 * it: the last block a file gets lifts all it is allowed.
 */
export const importRestrictionBlocks = (restrictions = IMPORT_RESTRICTIONS) => {
  const globs = [...new Set(restrictions.flatMap(({ allowed }) => allowed))];
  return [
    { files: ["**/*.{ts,tsx}"], rules: { "no-restricted-imports": restrictedImports(restrictions) } },
    ...globs
      .map((glob) => ({ glob, outer: globs.filter((other) => covers(other, glob)) }))
      .sort((a, b) => a.outer.length - b.outer.length)
      .map(({ glob, outer }) => ({
        files: [glob],
        rules: {
          "no-restricted-imports": restrictedImports(restrictions.filter((r) => !r.allowed.some((a) => outer.includes(a)))),
        },
      })),
  ];
};

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
    // Generated by withWorkflow (E6), not committed.
    "src/app/.well-known/workflow/**",
  ]),
]);

export default eslintConfig;
