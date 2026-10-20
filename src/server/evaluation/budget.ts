import "server-only";
import { AI_BREAKER_FAILURES, AI_BREAKER_WINDOW_MS, AI_MONTHLY_COST_CAP_USD } from "@/config/provisional";
import type { AiProvider } from "@/lib/evaluation";
import { claimAiAlert, readAiGuardCounts, type AiAlert } from "@/server/data/evaluation/system";
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
 * The guard. The cost is this month's Anthropic runs, estimated by excess
 * (prices.ts), whatever the provider in use: the simulator is stopped too,
 * so the cap is tested without money. Calls of the trial (ai:trial) store no
 * run and are not counted; the calls under way (EVALUATION_CONCURRENCY at
 * most) may pass the cap by about a cent. Reached, each administrator gets
 * one email per period.
 */
export function createAiGuard(settings: AiGuardSettings = SETTINGS): AiGuard {
  return async (provider) => {
    const counts = await readAiGuardCounts(provider, settings.breakerWindowMs);
    const costUsd = estimateRunsCostUsd(counts.promptTokens, counts.completionTokens);
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
  const counts = await readAiGuardCounts("anthropic", settings.breakerWindowMs);
  return estimateRunsCostUsd(counts.promptTokens, counts.completionTokens) >= settings.capUsd;
}

/** Once per period, an email to each administrator; a failure is logged by kind and never stops the evaluation. */
async function alertAdmins(alert: AiAlert, settings: AiGuardSettings, detail: string): Promise<void> {
  try {
    const recipients = await claimAiAlert(alert, settings.breakerWindowMs);
    const kind = alert === "ai_cost_cap_reached" ? "cost_cap" : "breaker";
    for (const to of recipients) await getEmailSender().send(aiAlertMessage(to, kind, detail));
  } catch (error) {
    console.error(`[evaluation] AI alert not sent: ${error instanceof Error ? error.name : "unknown"}`);
  }
}

/** The guard of the application, with the provisional settings. */
export const aiGuard: AiGuard = createAiGuard();
