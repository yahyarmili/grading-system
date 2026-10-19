import "server-only";
import { selectableAiProviders } from "@/lib/evaluation";
import { createAnthropicEvaluator } from "./anthropic";
import { SimulatorEvaluator } from "./simulator";
import { AiConfigurationError, type Evaluator } from "./types";

export type {
  EvaluationContext,
  EvaluationRequest,
  EvaluationResponse,
  Evaluator,
  Generation,
  JsonSchema,
  Usage,
  UsageDetail,
} from "./types";
export { AiConfigurationError, AiJournalError, EvaluatorError } from "./types";
export { SimulatorEvaluator, type CapturedRequest, type SimulatedFault } from "./simulator";

type AiEnv = Record<string, string | undefined> & {
  NODE_ENV?: string;
  /** "anthropic" sends for real; absent or empty: the simulator. */
  AI_PROVIDER?: string;
  /**
   * The key [P], under this name only: never ANTHROPIC_API_KEY, which Claude
   * Code would take instead of its subscription, and which the adapter refuses.
   */
  GRADING_ANTHROPIC_API_KEY?: string;
};

export type EvaluatorChoice = { provider: "simulator" } | { provider: "anthropic"; apiKey: string };

/**
 * The simulator by default, everywhere; Anthropic only when asked by name,
 * with a key (conception/procedures.md, "Activer l'envoi réel à l'IA"). Tests
 * always get the simulator. Anything else (openrouter and mistral included)
 * is refused, never replaced by the simulator: a typo must not pass for a
 * real sending, nor the reverse.
 */
export function selectEvaluator(env: AiEnv): EvaluatorChoice {
  if (env.NODE_ENV === "test") return { provider: "simulator" };
  const provider = env.AI_PROVIDER?.trim() ?? "";
  if (provider === "" || provider === "simulator") return { provider: "simulator" };
  // A stored provider is not a selectable one: openrouter stays in the runs, not here.
  if (!(selectableAiProviders as readonly string[]).includes(provider)) {
    const names = selectableAiProviders.map((name) => `"${name}"`).join(" or ");
    throw new AiConfigurationError(`AI_PROVIDER must be ${names}, or be left empty.`);
  }
  const apiKey = env.GRADING_ANTHROPIC_API_KEY?.trim() ?? "";
  if (apiKey === "") throw new AiConfigurationError("AI_PROVIDER=anthropic needs GRADING_ANTHROPIC_API_KEY.");
  return { provider: "anthropic", apiKey };
}

/** `env` is read as it is at each call by the adapter (its forbidden variables); `provider` replaces its AI_PROVIDER. */
function createEvaluator(env: AiEnv, provider = env.AI_PROVIDER): Evaluator {
  const choice = selectEvaluator({ ...env, AI_PROVIDER: provider });
  return choice.provider === "anthropic" ? createAnthropicEvaluator({ apiKey: choice.apiKey, env }) : new SimulatorEvaluator();
}

/**
 * The internal commands' evaluator: the simulator unless the command line
 * names Anthropic (--provider anthropic), with GRADING_ANTHROPIC_API_KEY. The
 * environment's AI_PROVIDER is ignored, so that a value left in .env.local
 * never makes a command send for real.
 */
export function evaluatorForCommand(provider: string | undefined, env: AiEnv = process.env): Evaluator {
  return createEvaluator(env, provider ?? "simulator");
}

// One evaluator per process, kept across hot reloads like the database pool.
const globalForAi = globalThis as unknown as { evaluator?: Evaluator };

/** The only way the application reaches an AI. */
export function getEvaluator(): Evaluator {
  globalForAi.evaluator ??= createEvaluator(process.env);
  return globalForAi.evaluator;
}

/** Tests: the simulator, to read requests and inject faults. */
export function getSimulator(): SimulatorEvaluator {
  const evaluator = getEvaluator();
  if (!(evaluator instanceof SimulatorEvaluator)) throw new Error("The AI simulator is not active");
  return evaluator;
}
