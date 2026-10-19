import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSources, type SourceFile } from "./helpers/access-inventory";
import { importsOf, UNFOLLOWABLE } from "./helpers/imports";

// Rule 3 and rule 5 (stack-technologique.md §4): requests to the AI leave
// from one place. Anthropic's SDK is imported by the adapter alone, and no
// other AI client library anywhere; Anthropic's API address is written in the
// adapter alone; the adapter and the simulator are imported by
// src/server/ai/index.ts alone; that index by the evaluation service (E5.5)
// and the two internal scripts alone. The SDK is pinned to the version
// audited (annexe-ia-anthropic.md §5). Tests may import anything. Scope: the
// .ts and .tsx files of src/ and scripts/.

const SDK = "@anthropic-ai/sdk";
const SDK_VERSION = "0.135.0";
/** Client libraries of AI services: each would read its own variables, retry and add headers. */
const AI_PACKAGES = ["openai", "@openrouter", "@mistralai", "@anthropic-ai", "@google/genai", "ai", "@ai-sdk"];
const ADAPTER = "src/server/ai/anthropic.ts";
/** Anthropic's API address: a request to it written anywhere else would bypass the adapter. */
const API_ADDRESS = /api\.anthropic\.com/i;
const INDEX = "src/server/ai";
const IMPLEMENTATIONS = ["src/server/ai/anthropic", "src/server/ai/simulator", "src/server/ai/openrouter"];

const mayUseIndex = (file: string) =>
  file.startsWith("src/server/evaluation/") || file === "scripts/evaluate.ts" || file === "scripts/ai-trial.ts";

const isAiPackage = (target: string) => AI_PACKAGES.some((name) => target === name || target.startsWith(`${name}/`));
const isSdk = (target: string) => target === SDK || target.startsWith(`${SDK}/`);

function checkSendPoint(files: SourceFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    if (API_ADDRESS.test(file.text) && file.path !== ADAPTER) {
      problems.push(`${file.path}: writes Anthropic's API address; only ${ADAPTER} may`);
    }
    for (const target of importsOf(file)) {
      if (target === UNFOLLOWABLE) {
        problems.push(`${file.path}: an import this check cannot follow (computed specifier or createRequire)`);
      } else if (isSdk(target) && file.path === ADAPTER) {
        continue;
      } else if (isAiPackage(target)) {
        problems.push(`${file.path}: imports the AI client library ${target}; only ${ADAPTER} imports ${SDK}`);
      } else if (IMPLEMENTATIONS.includes(target) && file.path !== "src/server/ai/index.ts") {
        problems.push(`${file.path}: imports ${target}; only src/server/ai/index.ts may`);
      } else if (target === INDEX && !mayUseIndex(file.path)) {
        problems.push(`${file.path}: imports ${INDEX}; only the evaluation service and the internal scripts may`);
      }
    }
  }
  return problems;
}

/** The SDK's version, exact in the manifest and resolved to it in the lock. */
function checkPinned(manifest: string, lock: string): string[] {
  const problems: string[] = [];
  const { dependencies = {}, devDependencies = {} } = JSON.parse(manifest) as Record<string, Record<string, string>>;
  const declared = dependencies[SDK] ?? devDependencies[SDK];
  if (declared !== SDK_VERSION) problems.push(`package.json: ${SDK} is ${JSON.stringify(declared)}, not exactly "${SDK_VERSION}"`);
  const resolved = (JSON.parse(lock) as { packages?: Record<string, { version?: string }> }).packages?.[`node_modules/${SDK}`]?.version;
  if (resolved !== SDK_VERSION) problems.push(`package-lock.json: ${SDK} resolves to ${JSON.stringify(resolved)}, not ${SDK_VERSION}`);
  return problems;
}

const sources = () => [...readSources("src", () => true), ...readSources("scripts", () => true)];
const only = `only ${ADAPTER} imports ${SDK}`;

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
      { path: "src/server/data/probe.ts", text: `import Anthropic from "@anthropic-ai/sdk";` },
      { path: "src/app/probe.ts", text: `import type { Message } from "@anthropic-ai/sdk/resources/messages";` },
      { path: "src/server/ai/output.ts", text: `import OpenAI from "openai";` },
      { path: "src/server/submissions/probe.ts", text: `const m = await import("../ai/simulator");` },
      { path: "src/server/ai/request.ts", text: `export { createAnthropicEvaluator } from "./anthropic";` },
      { path: "scripts/probe.ts", text: `import m = require("../src/server/ai/anthropic.ts");` },
      { path: "src/server/ai/probe.ts", text: `const name = "x"; await import(name);` },
      {
        path: "src/server/probe-require.ts",
        text: `import { createRequire } from "node:module";\nconst sdk = createRequire(import.meta.url)("@anthropic-ai/sdk");`,
      },
      { path: "src/server/email/probe.ts", text: `await fetch("https://API.anthropic.com/v1/messages", { method: "POST" });` },
      { path: "scripts/probe-mistral.ts", text: `import { Mistral } from "@mistralai/mistralai";` },
      { path: "src/lib/probe-type.ts", text: `export type E = import("@openrouter/sdk/models").Error;` },
    ];
    expect(checkSendPoint(fictitious)).toEqual([
      "src/app/teacher/probe/actions.ts: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/app/teacher/probe/page.tsx: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/server/probe.ts: imports src/server/ai; only the evaluation service and the internal scripts may",
      "src/lib/probe.ts: imports src/server/ai; only the evaluation service and the internal scripts may",
      `src/server/data/probe.ts: imports the AI client library @anthropic-ai/sdk; ${only}`,
      `src/app/probe.ts: imports the AI client library @anthropic-ai/sdk/resources/messages; ${only}`,
      `src/server/ai/output.ts: imports the AI client library openai; ${only}`,
      "src/server/submissions/probe.ts: imports src/server/ai/simulator; only src/server/ai/index.ts may",
      "src/server/ai/request.ts: imports src/server/ai/anthropic; only src/server/ai/index.ts may",
      "scripts/probe.ts: imports src/server/ai/anthropic; only src/server/ai/index.ts may",
      "src/server/ai/probe.ts: an import this check cannot follow (computed specifier or createRequire)",
      "src/server/probe-require.ts: an import this check cannot follow (computed specifier or createRequire)",
      `src/server/email/probe.ts: writes Anthropic's API address; only ${ADAPTER} may`,
      `scripts/probe-mistral.ts: imports the AI client library @mistralai/mistralai; ${only}`,
      `src/lib/probe-type.ts: imports the AI client library @openrouter/sdk/models; ${only}`,
    ]);
  });

  it("lets the adapter, the index, the service and the scripts through", () => {
    const allowed: SourceFile[] = [
      { path: ADAPTER, text: `import Anthropic from "@anthropic-ai/sdk";\nconst BASE_URL = "https://api.anthropic.com";` },
      {
        path: "src/server/ai/index.ts",
        text: `import { createAnthropicEvaluator } from "./anthropic";\nimport { SimulatorEvaluator } from "./simulator";`,
      },
      { path: "src/server/evaluation/evaluate.ts", text: `import { getEvaluator } from "@/server/ai";` },
      { path: "scripts/ai-trial.ts", text: `import { getEvaluator } from "@/server/ai";` },
      { path: "src/server/ai/errors.ts", text: `// https://platform.claude.com/docs/en/api/errors` },
      { path: "src/lib/aidan.ts", text: `import { x } from "aidan";` },
    ];
    expect(checkSendPoint(allowed)).toEqual([]);
  });
});

describe(`the SDK is pinned to ${SDK_VERSION}, the version audited`, () => {
  const manifest = readFileSync("package.json", "utf8");
  const lock = readFileSync("package-lock.json", "utf8");

  it("in package.json, exactly, and in package-lock.json", () => {
    expect(checkPinned(manifest, lock)).toEqual([]);
  });

  it.each([`^${SDK_VERSION}`, `~${SDK_VERSION}`, "0.136.0", "latest"])("would refuse %s in a copy of the manifest", (range) => {
    const copy = JSON.parse(manifest) as { dependencies: Record<string, string> };
    copy.dependencies[SDK] = range;
    expect(checkPinned(JSON.stringify(copy), lock)).toEqual([
      `package.json: ${SDK} is ${JSON.stringify(range)}, not exactly "${SDK_VERSION}"`,
    ]);
  });

  it("would refuse a lock that resolves another version", () => {
    const copy = JSON.parse(lock) as { packages: Record<string, { version: string }> };
    copy.packages[`node_modules/${SDK}`] = { ...copy.packages[`node_modules/${SDK}`], version: "0.136.0" };
    expect(checkPinned(manifest, JSON.stringify(copy))).toEqual([
      `package-lock.json: ${SDK} resolves to "0.136.0", not ${SDK_VERSION}`,
    ]);
  });
});
