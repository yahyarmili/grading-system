import "server-only";
import { AI_BREAKER_WINDOW_MS, AI_CALL_PROMPT_TOKENS_CEILING, AI_MAX_OUTPUT_TOKENS } from "@/config/provisional";
import { readAiGuardCounts, type AiGuardCounts } from "@/server/data/evaluation/system";
import { estimateRunsCostUsd } from "@/server/evaluation/prices";

// This month's estimated AI cost, the one computation the cost cap compares
// (budget.ts) and ai:status prints (spec 0012, AC-4). Apart from budget.ts so
// a script reads it without loading the email module.

/**
 * This month's estimated cost (prices.ts), by excess: the tokens of
 * Anthropic's runs, and each call whose usage no run holds at the ceiling of
 * one call (E6.6: timeouts, the trial's calls, a result never recorded).
 */
export function monthCostUsd(counts: AiGuardCounts): number {
  return (
    estimateRunsCostUsd(counts.promptTokens, counts.completionTokens) +
    counts.uncountedCalls * estimateRunsCostUsd(AI_CALL_PROMPT_TOKENS_CEILING, AI_MAX_OUTPUT_TOKENS)
  );
}

/** This month's estimated cost on the database in use, read only: what costCapReached compares to the cap. */
export async function readMonthCostUsd(breakerWindowMs: number = AI_BREAKER_WINDOW_MS): Promise<number> {
  return monthCostUsd(await readAiGuardCounts("anthropic", breakerWindowMs));
}
