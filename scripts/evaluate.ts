// Internal command (E5.5, final in E5.7): evaluates one received submission,
// or every received submission of an assignment, outside any screen, until
// E6 chains the evaluation after each submission. One line per submission:
// the state reached, the attempts and the duration; never a text or a name.
// Run inside the container:
//   docker compose exec web npm run ai:evaluate -- --submission <id>
//   docker compose exec web npm run ai:evaluate -- --assignment <id>
// The simulator by default. OpenRouter only when named on the command line,
// with OPENROUTER_API_KEY (conception/procedures.md, "Activer l'envoi réel"):
//   docker compose exec web npm run ai:evaluate -- --assignment <id> --provider openrouter
// AI_PROVIDER in the environment is ignored here. With OpenRouter, a
// submission starts only if its attempts fit in what is left of the daily
// quota (AI_DAILY_REQUEST_LIMIT, counted on the security log); the others
// stay received.
// --simulate <fault> makes every attempt fail with that fault (simulator only):
//   invalid_output, missing_quote, error_500, error_429, error_401, timeout.
// Runs with --conditions=react-server so "server-only" modules load outside Next.

import { parseArgs } from "node:util";
import { AI_DAILY_REQUEST_LIMIT, AI_MAX_ATTEMPTS } from "@/config/provisional";
import { AiConfigurationError, evaluatorForCommand, SimulatorEvaluator, type SimulatedFault } from "@/server/ai";
import { countAiRequestsToday } from "@/server/data/auth/security-events";
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
const USAGE =
  "Usage: npm run ai:evaluate -- --submission <id> | --assignment <id> [--provider simulator|openrouter] [--simulate <fault>]";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      submission: { type: "string" },
      assignment: { type: "string" },
      provider: { type: "string" },
      simulate: { type: "string" },
    },
  });
  const target = values.submission ?? values.assignment;
  if (!target || (values.submission && values.assignment) || !UUID.test(target)) {
    console.error(USAGE);
    return 2;
  }

  const evaluator = evaluatorForCommand(values.provider);
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

  // A submission may take AI_MAX_ATTEMPTS requests: it starts only if they all fit today.
  const mayStart = async () => {
    if (evaluator.provider !== "openrouter") return true;
    const sent = await countAiRequestsToday();
    console.log(`Requests sent to the AI today (UTC): ${sent} of ${AI_DAILY_REQUEST_LIMIT}`);
    return sent + AI_MAX_ATTEMPTS <= AI_DAILY_REQUEST_LIMIT;
  };

  const deps = defaultDeps(evaluator);
  if (values.submission) {
    if (!(await mayStart())) {
      console.log(formatOutcomeLine("submission", { status: "postponed" }));
      return 1;
    }
    console.log(formatOutcomeLine("submission", await evaluateSubmission(values.submission, deps)));
    return 0;
  }
  const results = await evaluateAssignment(target, deps, mayStart);
  if (results.length === 0) console.log("No received submission in this assignment.");
  results.forEach(({ outcome }, i) => console.log(formatOutcomeLine(`submission ${i + 1}`, outcome)));
  return results.some(({ outcome }) => outcome.status === "error" || outcome.status === "postponed") ? 1 : 0;
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
