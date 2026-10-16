import { describe, expect, it } from "vitest";
import { readSources, type SourceFile } from "./helpers/access-inventory";
import { importsOf, UNFOLLOWABLE } from "./helpers/imports";

// Rule 3 and rule 5 (stack-technologique.md §4): requests to the AI leave
// from one place. The Mistral SDK is imported by the adapter alone; the
// adapter and the simulator by src/server/ai/index.ts alone; that index by
// the evaluation service (E5.5) and the two internal scripts alone. Tests may
// import anything. Scope: the .ts and .tsx files of src/ and scripts/.

const SDK = "@mistralai/mistralai";
const INDEX = "src/server/ai";
const IMPLEMENTATIONS = ["src/server/ai/mistral", "src/server/ai/simulator"];

const mayUseIndex = (file: string) =>
  file.startsWith("src/server/evaluation/") || file === "scripts/evaluate.ts" || file === "scripts/ai-trial.ts";

function checkSendPoint(files: SourceFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    for (const target of importsOf(file)) {
      if (target === UNFOLLOWABLE) {
        problems.push(`${file.path}: an import this check cannot follow (computed specifier or createRequire)`);
      } else if ((target === SDK || target.startsWith(`${SDK}/`)) && file.path !== "src/server/ai/mistral.ts") {
        problems.push(`${file.path}: imports the Mistral SDK; only src/server/ai/mistral.ts may`);
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
      { path: "src/server/data/probe.ts", text: `import { Mistral } from "@mistralai/mistralai";` },
      { path: "src/server/submissions/probe.ts", text: `const m = await import("../ai/simulator");` },
      { path: "src/lib/probe-type.ts", text: `export type E = import("@mistralai/mistralai/models/errors").SDKError;` },
      { path: "src/server/ai/request.ts", text: `export { createMistralEvaluator } from "./mistral";` },
      { path: "scripts/probe.ts", text: `import m = require("../src/server/ai/mistral.ts");` },
      { path: "src/server/ai/probe.ts", text: `const name = "x"; await import(name);` },
      { path: "src/server/probe-require.ts", text: `import { createRequire } from "node:module";\nconst sdk = createRequire(import.meta.url)("@mistralai/mistralai");` },
    ];
    expect(checkSendPoint(fictitious)).toEqual([
      "src/app/teacher/probe/actions.ts: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/app/teacher/probe/page.tsx: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/server/probe.ts: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/lib/probe.ts: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/server/data/probe.ts: imports the Mistral SDK; only src/server/ai/mistral.ts may",
      "src/server/submissions/probe.ts: imports src/server/ai/simulator; only src/server/ai/index.ts may",
      "src/lib/probe-type.ts: imports the Mistral SDK; only src/server/ai/mistral.ts may",
      "src/server/ai/request.ts: imports src/server/ai/mistral; only src/server/ai/index.ts may",
      "scripts/probe.ts: imports src/server/ai/mistral; only src/server/ai/index.ts may",
      "src/server/ai/probe.ts: an import this check cannot follow (computed specifier or createRequire)",
      "src/server/probe-require.ts: an import this check cannot follow (computed specifier or createRequire)",
    ]);
  });

  it("lets the adapter, the index, the service and the scripts through", () => {
    const allowed: SourceFile[] = [
      { path: "src/server/ai/mistral.ts", text: `import { Mistral } from "@mistralai/mistralai";\nimport { HTTPClient } from "@mistralai/mistralai/lib/http.js";` },
      { path: "src/server/ai/index.ts", text: `import { createMistralEvaluator } from "./mistral";\nimport { SimulatorEvaluator } from "./simulator";` },
      { path: "src/server/evaluation/evaluate.ts", text: `import { getEvaluator } from "@/server/ai";` },
      { path: "scripts/ai-trial.ts", text: `import { getEvaluator } from "@/server/ai";` },
      { path: "src/server/ai/request.ts", text: `import type { EvaluationRequest } from "./types";` },
    ];
    expect(checkSendPoint(allowed)).toEqual([]);
  });
});
