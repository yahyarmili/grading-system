import "server-only";
import {
  AI_ALERT_SEND_MAX_MS,
  AI_BREAKER_FAILURES,
  AI_BREAKER_WINDOW_MS,
  AI_CALL_PROMPT_TOKENS_CEILING,
  AI_MAX_OUTPUT_TOKENS,
  AI_MONTHLY_COST_CAP_USD,
} from "@/config/provisional";
import type { AiProvider } from "@/lib/evaluation";
import { claimAiAlert, readAiGuardCounts, type AiAlert, type AiGuardCounts } from "@/server/data/evaluation/system";
import { getEmailSender } from "@/server/email";
import { aiAlertMessage } from "@/server/email/templates";
import { estimateRunsCostUsd } from "@/server/evaluation/prices";

// The guard of the AI (E6, plan §5, EXP-02), asked before every attempt of
// an evaluation: the monthly cost cap, then the circuit breaker. Each closes
// by itself: the cap with the next UTC month (or a higher cap), the breaker
// once its window has passed. No command resets them.

/** Whether a call may leave: "cost_cap" makes the submission "AI unavailable"; "breaker" ends it evaluation_failed. */
export type AiGuardState = "open" | "cost_cap" | "breaker";

export type AiGuard = (provider: AiProvider) => Promise<AiGuardState>;

export type AiGuardSettings = { capUsd: number; breakerFailures: number; breakerWindowMs: number };

const SETTINGS: AiGuardSettings = {
  capUsd: AI_MONTHLY_COST_CAP_USD,
  breakerFailures: AI_BREAKER_FAILURES,
  breakerWindowMs: AI_BREAKER_WINDOW_MS,
};

/**
 * This month's estimated cost (prices.ts), by excess: the tokens of
 * Anthropic's runs, and each call whose usage no run holds at the ceiling of
 * one call (E6.6: timeouts, the trial's calls, a result never recorded).
 */
function monthCostUsd(counts: AiGuardCounts): number {
  return (
    estimateRunsCostUsd(counts.promptTokens, counts.completionTokens) +
    counts.uncountedCalls * estimateRunsCostUsd(AI_CALL_PROMPT_TOKENS_CEILING, AI_MAX_OUTPUT_TOKENS)
  );
}

/**
 * The guard. The cost is this month's Anthropic calls (monthCostUsd),
 * whatever the provider in use: the simulator is stopped too, so the cap is
 * tested without money. The calls under way (EVALUATION_CONCURRENCY, plus one
 * per command running) may pass the cap by about a cent. Reached, each
 * administrator gets one email per period.
 */
export function createAiGuard(settings: AiGuardSettings = SETTINGS): AiGuard {
  return async (provider) => {
    const counts = await readAiGuardCounts(provider, settings.breakerWindowMs);
    const costUsd = monthCostUsd(counts);
    if (costUsd >= settings.capUsd) {
      await alertAdmins("ai_cost_cap_reached", settings, `about ${costUsd.toFixed(2)} USD, cap ${settings.capUsd} USD`);
      return "cost_cap";
    }
    if (counts.breakerFailures >= settings.breakerFailures) {
      await alertAdmins(
        "ai_breaker_tripped",
        settings,
        `${counts.breakerFailures} submissions within ${settings.breakerWindowMs / 60_000} minutes`,
      );
      return "breaker";
    }
    return "open";
  };
}

/**
 * Whether this month's cost reached the cap, read only: no alert, no call
 * stopped. For the relaunch of the copies "AI unavailable" (relaunch.ts,
 * E6.3): offered once the cap is lifted (the next UTC month, or a higher cap).
 */
export async function costCapReached(settings: AiGuardSettings = SETTINGS): Promise<boolean> {
  return monthCostUsd(await readAiGuardCounts("anthropic", settings.breakerWindowMs)) >= settings.capUsd;
}

/** E6.6: the AI could not be set up (evaluate.ts); the administrators are told once per window. */
export async function alertAiConfiguration(settings: AiGuardSettings = SETTINGS): Promise<void> {
  await alertAdmins("ai_configuration_failed", settings, "AI_PROVIDER, its key, or a forbidden variable");
}

const ALERT_KIND = { ai_cost_cap_reached: "cost_cap", ai_breaker_tripped: "breaker", ai_configuration_failed: "configuration" } as const;

/**
 * Once per period, an email to each administrator, recorded once sent
 * (claimAiAlert): a failed or slow send is tried again by the next guard.
 * The sending is bounded by AI_ALERT_SEND_MAX_MS, counted in the step's
 * longest duration. A failure is logged by kind and never stops the evaluation.
 */
async function alertAdmins(alert: AiAlert, settings: AiGuardSettings, detail: string): Promise<void> {
  try {
    await claimAiAlert(alert, settings.breakerWindowMs, (recipients) =>
      within(AI_ALERT_SEND_MAX_MS, async () => {
        for (const to of recipients) await getEmailSender().send(aiAlertMessage(to, ALERT_KIND[alert], detail));
      }),
    );
  } catch (error) {
    console.error(`[evaluation] AI alert not sent: ${error instanceof Error ? error.name : "unknown"}`);
  }
}

class AlertTimeoutError extends Error {
  override name = "AlertTimeoutError";
}

/** `work`, or an AlertTimeoutError after `ms`: the step does not wait for a slow mail server. */
async function within(ms: number, work: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AlertTimeoutError()), ms);
  });
  try {
    await Promise.race([work(), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The guard of the application, with the provisional settings. */
export const aiGuard: AiGuard = createAiGuard();
