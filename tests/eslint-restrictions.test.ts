import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { IMPORT_RESTRICTIONS } from "../eslint.config.mjs";

// The import restrictions of eslint.config.mjs, as ESLint applies them: in a
// flat config the last block that sets a rule replaces it whole, so a block
// lifting one restriction could lift the others in silence. Fictitious files,
// linted in memory with the project's own config.

const SDK = `import Anthropic from "@anthropic-ai/sdk";\nexport const client = Anthropic;\n`;
const SDK_DEEP = `import type { Message } from "@anthropic-ai/sdk/resources/messages";\nexport type M = Message;\n`;
const DATABASE = `import { db } from "@/server/db/client";\nexport const database = db;\n`;

const eslint = new ESLint();

/** The restricted imports ESLint reports for this text at this path. */
async function restricted(filePath: string, text: string): Promise<string[]> {
  const [result] = await eslint.lintText(text, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

describe("each import is allowed where the table says, refused everywhere else", () => {
  it.each([
    ["src/server/data/x.ts", SDK],
    ["src/app/x.ts", SDK],
    ["tests/x.ts", SDK],
    ["src/server/ai/x.ts", SDK_DEEP],
    ["scripts/x.ts", SDK],
  ])("refuses the SDK in %s", { timeout: 30_000 }, async (path, text) => {
    expect(await restricted(path, text)).toEqual([expect.stringContaining("Only src/server/ai/anthropic.ts imports")]);
  });

  it.each([["src/server/ai/anthropic.ts"], ["src/app/x.ts"], ["scripts/x.ts"]])(
    "refuses the database in %s",
    { timeout: 30_000 },
    async (path) => {
      expect(await restricted(path, DATABASE)).toEqual([expect.stringContaining("Go through the data access layer")]);
    },
  );

  it.each([
    ["src/server/data/x.ts", DATABASE],
    ["src/server/db/x.ts", DATABASE],
    ["tests/x.ts", DATABASE],
    ["src/server/ai/anthropic.ts", SDK],
    ["src/server/ai/anthropic.ts", SDK_DEEP],
  ])("lets %s through", { timeout: 30_000 }, async (path, text) => {
    expect(await restricted(path, text)).toEqual([]);
  });

  it("has allowed globs that never overlap: a file matched by two blocks would keep only the last", () => {
    const globs = IMPORT_RESTRICTIONS.flatMap((r) => r.allowed);
    expect(new Set(globs).size).toBe(globs.length);
    for (const glob of globs) {
      const prefix = glob.replace(/\*\*$/, "");
      expect(globs.filter((other) => other !== glob && other.startsWith(prefix))).toEqual([]);
    }
  });
});
