import { AI_INFERENCE_GEO, AI_MODEL } from "@/config/decisions";
import type { Usage } from "@/server/ai";

// Published prices of the model (a fact, neither [D] nor [P]): used for the
// estimated cost of the trial only (E5.14), never stored, never billed from.
// Read on 2026-10-19; to read again before a trial that relies on them.

export const PRICES = {
  model: AI_MODEL,
  readOn: "2026-10-19",
  sources: [
    "https://platform.claude.com/docs/en/about-claude/pricing",
    "https://platform.claude.com/docs/en/manage-claude/data-residency",
  ],
  /** USD per million tokens, for a prompt of at most `longContext.above` tokens. */
  perMillion: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite5m: 0.125 },
  /** Over this prompt size, input and output cost more; the cache prices there were not read. */
  longContext: { above: 100_000, input: 0.5, output: 2.5 },
  /** inference_geo "us": every category of tokens. */
  usMultiplier: 1.1,
} as const;

/**
 * The estimated cost of one call in USD, from what the provider counted; null
 * when it did not count, or when a price was not read. Without the provider's
 * detail, the stored sums stand in (prompt as input, completion as output),
 * and the geo is the one requested.
 */
export function estimateCostUsd(usage: Usage | null | undefined): number | null {
  if (!usage) return null;
  const detail = usage.detail;
  const input = detail ? detail.inputTokens : usage.promptTokens;
  const output = detail ? detail.outputTokens : usage.completionTokens;
  const cacheRead = detail ? detail.cacheReadTokens ?? 0 : 0;
  const cacheWrite = detail ? detail.cacheCreationTokens ?? 0 : 0;
  if (input === null || output === null) return null;

  const long = input + cacheRead + cacheWrite > PRICES.longContext.above;
  if (long && cacheRead + cacheWrite > 0) return null;
  const rates = long ? { ...PRICES.perMillion, ...PRICES.longContext } : PRICES.perMillion;
  const geo = detail?.inferenceGeo ?? AI_INFERENCE_GEO;
  const cost =
    (input * rates.input + output * rates.output + cacheRead * rates.cacheRead + cacheWrite * rates.cacheWrite5m) / 1_000_000;
  return geo === "us" ? cost * PRICES.usMultiplier : cost;
}
