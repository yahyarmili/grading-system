import "server-only";
import { createMistralEvaluator } from "./mistral";
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
} from "./types";
export { AiConfigurationError, EvaluatorError } from "./types";
export { SimulatorEvaluator, type CapturedRequest, type SimulatedFault } from "./simulator";

type AiEnv = {
  NODE_ENV?: string;
  /** "mistral" sends for real; absent or empty: the simulator. */
  AI_PROVIDER?: string;
  MISTRAL_API_KEY?: string;
};

export type EvaluatorChoice = { provider: "simulator" } | { provider: "mistral"; apiKey: string };

/**
 * The simulator by default, everywhere; Mistral only when asked by name, with
 * a key (conception/procedures.md, "Activer l'envoi réel à Mistral"). Tests
 * always get the simulator. Anything else is refused, never replaced by the
 * simulator: a typo must not pass for a real sending, nor the reverse.
 */
export function selectEvaluator(env: AiEnv): EvaluatorChoice {
  if (env.NODE_ENV === "test") return { provider: "simulator" };
  const provider = env.AI_PROVIDER?.trim() ?? "";
  if (provider === "" || provider === "simulator") return { provider: "simulator" };
  if (provider !== "mistral") {
    throw new AiConfigurationError('AI_PROVIDER must be "simulator" or "mistral", or be left empty.');
  }
  const apiKey = env.MISTRAL_API_KEY?.trim() ?? "";
  if (apiKey === "") throw new AiConfigurationError("AI_PROVIDER=mistral needs MISTRAL_API_KEY.");
  return { provider: "mistral", apiKey };
}

function createEvaluator(env: NodeJS.ProcessEnv): Evaluator {
  const choice = selectEvaluator(env);
  return choice.provider === "mistral" ? createMistralEvaluator({ apiKey: choice.apiKey }) : new SimulatorEvaluator();
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
