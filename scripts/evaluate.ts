// Internal command (E5.5): evaluates received submissions with the AI, until
// E6 chains the evaluation after each submission. One line per submission:
// the state reached, the attempts and the duration; never a text or a name.
// Run inside the container:
//   docker compose exec web npm run ai:evaluate -- --submission <id>
//   docker compose exec web npm run ai:evaluate -- --assignment <id>
// --simulate <fault> makes every attempt fail with that fault (simulator only):
//   invalid_output, missing_quote, error_500, error_429, error_401, timeout.
// The evaluator is AI_PROVIDER's: the simulator by default (conception/procedures.md).
// Runs with --conditions=react-server so "server-only" modules load outside Next.

import { parseArgs } from "node:util";
import { AI_MAX_ATTEMPTS } from "@/config/provisional";
import { AiConfigurationError, getEvaluator, SimulatorEvaluator, type SimulatedFault } from "@/server/ai";
import { closeDatabase } from "@/server/data/lifecycle";
import {
  defaultDeps,
  errorKind,
  evaluateAssignment,
  evaluateSubmission,
  formatOutcomeLine,
} from "@/server/evaluation/evaluate";

const FAULTS: Record<string, SimulatedFault> = {
  invalid_output: { kind: "invalid_output", variant: "not_json" },
  missing_quote: { kind: "missing_quote" },
  error_500: { kind: "error", status: 500 },
  error_429: { kind: "error", status: 429 },
  error_401: { kind: "error", status: 401 },
  timeout: { kind: "timeout" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { submission: { type: "string" }, assignment: { type: "string" }, simulate: { type: "string" } },
  });
  const target = values.submission ?? values.assignment;
  if (!target || (values.submission && values.assignment) || !UUID.test(target)) {
    console.error("Usage: npm run ai:evaluate -- --submission <id> | --assignment <id> [--simulate <fault>]");
    return 2;
  }

  const evaluator = getEvaluator();
  if (values.simulate !== undefined) {
    const fault = FAULTS[values.simulate];
    if (!fault) {
      console.error(`Unknown fault. One of: ${Object.keys(FAULTS).join(", ")}.`);
      return 2;
    }
    if (!(evaluator instanceof SimulatorEvaluator)) {
      console.error("--simulate works with the simulator only.");
      return 2;
    }
    evaluator.failNext(fault, AI_MAX_ATTEMPTS);
  }
  console.log(`Provider: ${evaluator.provider}; model requested: ${evaluator.model}`);

  const deps = defaultDeps();
  if (values.submission) {
    console.log(formatOutcomeLine("submission", await evaluateSubmission(values.submission, deps)));
    return 0;
  }
  const results = await evaluateAssignment(target, deps);
  if (results.length === 0) console.log("No received submission in this assignment.");
  results.forEach(({ outcome }, i) => console.log(formatOutcomeLine(`submission ${i + 1}`, outcome)));
  return results.some(({ outcome }) => outcome.status === "error") ? 1 : 0;
}

main()
  .then(async (code) => {
    await closeDatabase();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    // Its kind or class only, never its message: it may carry content.
    console.error(`Failed: ${error instanceof AiConfigurationError ? error.message : errorKind(error)}`);
    await closeDatabase().catch(() => {});
    process.exit(1);
  });
