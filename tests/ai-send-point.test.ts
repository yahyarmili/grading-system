import { describe, expect, it } from "vitest";
import { readSources, type SourceFile } from "./helpers/access-inventory";
import { importsOf, UNFOLLOWABLE } from "./helpers/imports";

// Rule 3 and rule 5 (stack-technologique.md §4): requests to the AI leave
// from one place. No AI client library is imported anywhere (the adapter is
// fetch alone); OpenRouter's API address is written in the adapter alone; the
// adapter and the simulator are imported by src/server/ai/index.ts alone; that
// index by the evaluation service (E5.5) and the two internal scripts alone.
// Tests may import anything. Scope: the .ts and .tsx files of src/ and scripts/.

/** Client libraries of AI services: each would read its own variables, retry and add headers. */
const AI_PACKAGES = ["openai", "@openrouter", "@mistralai", "@anthropic-ai", "@google/genai", "ai", "@ai-sdk"];
const ADAPTER = "src/server/ai/openrouter.ts";
/** OpenRouter's API address: a request to it written anywhere else would bypass the adapter. */
const API_ADDRESS = /openrouter\.ai\/api/i;
const INDEX = "src/server/ai";
const IMPLEMENTATIONS = ["src/server/ai/openrouter", "src/server/ai/simulator"];

const mayUseIndex = (file: string) =>
  file.startsWith("src/server/evaluation/") || file === "scripts/evaluate.ts" || file === "scripts/ai-trial.ts";

const isAiPackage = (target: string) => AI_PACKAGES.some((name) => target === name || target.startsWith(`${name}/`));

function checkSendPoint(files: SourceFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    if (API_ADDRESS.test(file.text) && file.path !== ADAPTER) {
      problems.push(`${file.path}: writes OpenRouter's API address; only ${ADAPTER} may`);
    }
    for (const target of importsOf(file)) {
      if (target === UNFOLLOWABLE) {
        problems.push(`${file.path}: an import this check cannot follow (computed specifier or createRequire)`);
      } else if (isAiPackage(target)) {
        problems.push(`${file.path}: imports the AI client library ${target}; the adapter uses fetch alone`);
      } else if (IMPLEMENTATIONS.includes(target) && file.path !== "src/server/ai/index.ts") {
        problems.push(`${file.path}: imports ${target}; only src/server/ai/index.ts may`);
      } else if (target === INDEX && !mayUseIndex(file.path)) {
        problems.push(`${file.path}: imports ${INDEX}; only the evaluation service and the internal scripts may`);
      }
    }
  }
  return problems;
}

const sources = () => [...readSources("src", () => true), ...readSources("scripts", () => true)];

describe("requests to the AI leave from one place", () => {
  // Parses every file of src/ and scripts/: slow on the Windows bind mount.
  it("holds in the real code", { timeout: 30_000 }, () => {
    expect(checkSendPoint(sources())).toEqual([]);
  });

  it("finds a screen, an action or a module that would send, by any import form", () => {
    const fictitious: SourceFile[] = [
      { path: "src/app/teacher/probe/actions.ts", text: `"use server";\nimport { getEvaluator } from "@/server/ai";` },
      { path: "src/app/teacher/probe/page.tsx", text: `import { getEvaluator } from "@/server/ai/";` },
      { path: "src/server/probe.ts", text: `import { getEvaluator } from "./ai/index.ts";` },
      { path: "src/lib/probe.ts", text: `export { getEvaluator } from "@/server/ai/../ai";` },
      { path: "src/server/data/probe.ts", text: `import OpenAI from "openai";` },
      { path: "src/server/submissions/probe.ts", text: `const m = await import("../ai/simulator");` },
      { path: "src/lib/probe-type.ts", text: `export type E = import("@openrouter/sdk/models").Error;` },
      { path: "src/server/ai/request.ts", text: `export { createOpenRouterEvaluator } from "./openrouter";` },
      { path: "scripts/probe.ts", text: `import m = require("../src/server/ai/openrouter.ts");` },
      { path: "src/server/ai/probe.ts", text: `const name = "x"; await import(name);` },
      { path: "src/server/probe-require.ts", text: `import { createRequire } from "node:module";\nconst sdk = createRequire(import.meta.url)("openai");` },
      { path: "src/server/email/probe.ts", text: `await fetch("https://OpenRouter.ai/api/v1/chat/completions", { method: "POST" });` },
      { path: "scripts/probe-mistral.ts", text: `import { Mistral } from "@mistralai/mistralai";` },
    ];
    expect(checkSendPoint(fictitious)).toEqual([
      "src/app/teacher/probe/actions.ts: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/app/teacher/probe/page.tsx: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/server/probe.ts: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/lib/probe.ts: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/server/data/probe.ts: imports the AI client library openai; the adapter uses fetch alone",
      "src/server/submissions/probe.ts: imports src/server/ai/simulator; only src/server/ai/index.ts may",
      "src/lib/probe-type.ts: imports the AI client library @openrouter/sdk/models; the adapter uses fetch alone",
      "src/server/ai/request.ts: imports src/server/ai/openrouter; only src/server/ai/index.ts may",
      "scripts/probe.ts: imports src/server/ai/openrouter; only src/server/ai/index.ts may",
      "src/server/ai/probe.ts: an import this check cannot follow (computed specifier or createRequire)",
      "src/server/probe-require.ts: an import this check cannot follow (computed specifier or createRequire)",
      "src/server/email/probe.ts: writes OpenRouter's API address; only src/server/ai/openrouter.ts may",
      "scripts/probe-mistral.ts: imports the AI client library @mistralai/mistralai; the adapter uses fetch alone",
    ]);
  });

  it("lets the adapter, the index, the service and the scripts through", () => {
    const allowed: SourceFile[] = [
      { path: ADAPTER, text: `const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";` },
      { path: "src/server/ai/index.ts", text: `import { createOpenRouterEvaluator } from "./openrouter";\nimport { SimulatorEvaluator } from "./simulator";` },
      { path: "src/server/evaluation/evaluate.ts", text: `import { getEvaluator } from "@/server/ai";` },
      { path: "scripts/ai-trial.ts", text: `import { getEvaluator } from "@/server/ai";` },
      { path: "src/server/ai/errors.ts", text: `// https://openrouter.ai/docs/api_reference/errors-and-debugging` },
      { path: "src/lib/aidan.ts", text: `import { x } from "aidan";` },
    ];
    expect(checkSendPoint(allowed)).toEqual([]);
  });
});
