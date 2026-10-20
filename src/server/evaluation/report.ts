import type { AiProvider } from "@/lib/evaluation";
import type { StoredSubmissionStatus } from "@/lib/submission-status";
import type { CopyMeasure, RunMeasure } from "@/server/data/evaluation/measures";
import { estimateRunsCostUsd, PRICES } from "@/server/evaluation/prices";

// EXP-01 (E6.4): the evaluation report, by assignment, from the runs and the
// copies alone: delays, attempts, failures, AI usage and its estimated cost.
// No identity, no content: an assignment is named by its identifier, a copy
// by nothing. Figures as measured, without a target.

/** min, median and max; null for no value. */
export type Spread = { min: number; median: number; max: number } | null;

export function spread(values: number[]): Spread {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min: sorted[0], median, max: sorted[sorted.length - 1] };
}

/** What one provider's runs used, per copy: tokens summed over every run of the copy. */
export type ProviderUsage = {
  provider: AiProvider;
  copies: number;
  promptTokens: Spread;
  completionTokens: Spread;
  /** Anthropic only: the simulator's tokens are made up, not priced. */
  costUsd: (Spread & { total: number }) | null;
};

export type AssignmentReport = {
  assignmentId: string;
  copies: number;
  states: Partial<Record<StoredSubmissionStatus, number>>;
  runs: number;
  outcomes: { proposed: number; failed: number; not_assessable: number };
  /** Failed runs over runs; copies evaluation_failed now over copies. */
  failureRate: { runs: number | null; copies: number | null };
  /** Runs by attempts (0: not assessable before any call). */
  attempts: Record<number, number>;
  /** Proposed runs: from the version submitted to the proposal recorded, in ms. */
  toReviewMs: Spread;
  /** Each run's own duration (the claim to the record), in ms. */
  runMs: Spread;
  usage: ProviderUsage[];
};

const count = <T extends string | number>(values: T[]) =>
  values.reduce<Partial<Record<T, number>>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});

/** One report per assignment that has copies or runs, in the order of their identifiers. */
export function buildReport(runs: RunMeasure[], copies: CopyMeasure[]): AssignmentReport[] {
  const ids = [...new Set([...copies.map((c) => c.assignmentId), ...runs.map((r) => r.assignmentId)])].sort();
  return ids.map((assignmentId) => {
    const own = runs.filter((r) => r.assignmentId === assignmentId);
    const ownCopies = copies.filter((c) => c.assignmentId === assignmentId);
    const outcomes = { proposed: 0, failed: 0, not_assessable: 0, ...count(own.map((r) => r.outcome)) };
    const failedCopies = ownCopies.filter((c) => c.status === "evaluation_failed").length;
    return {
      assignmentId,
      copies: ownCopies.length,
      states: count(ownCopies.map((c) => c.status)),
      runs: own.length,
      outcomes,
      failureRate: {
        runs: own.length ? outcomes.failed / own.length : null,
        copies: ownCopies.length ? failedCopies / ownCopies.length : null,
      },
      attempts: count(own.map((r) => r.attempts)) as Record<number, number>,
      toReviewMs: spread(own.filter((r) => r.outcome === "proposed").map((r) => r.sinceVersionMs)),
      runMs: spread(own.map((r) => r.durationMs)),
      usage: usageByProvider(own),
    };
  });
}

function usageByProvider(runs: RunMeasure[]): ProviderUsage[] {
  const providers = [...new Set(runs.map((r) => r.provider))].sort();
  return providers.map((provider) => {
    const perCopy = new Map<string, { prompt: number; completion: number }>();
    for (const run of runs.filter((r) => r.provider === provider)) {
      const sum = perCopy.get(run.submissionId) ?? { prompt: 0, completion: 0 };
      sum.prompt += run.promptTokens ?? 0;
      sum.completion += run.completionTokens ?? 0;
      perCopy.set(run.submissionId, sum);
    }
    const sums = [...perCopy.values()];
    const costs = sums.map((s) => estimateRunsCostUsd(s.prompt, s.completion));
    const costSpread = spread(costs);
    return {
      provider,
      copies: sums.length,
      promptTokens: spread(sums.map((s) => s.prompt)),
      completionTokens: spread(sums.map((s) => s.completion)),
      costUsd: provider === "anthropic" && costSpread ? { ...costSpread, total: costs.reduce((a, b) => a + b, 0) } : null,
    };
  });
}

const seconds = (s: Spread) =>
  s ? `${(s.min / 1000).toFixed(1)} / ${(s.median / 1000).toFixed(1)} / ${(s.max / 1000).toFixed(1)} s` : "–";
const tokens = (s: Spread) => (s ? `${s.min} / ${s.median} / ${s.max}` : "–");
const usd = (n: number) => `$${n.toFixed(6)}`;
const percent = (n: number | null) => (n === null ? "–" : `${(n * 100).toFixed(1)} %`);
const tally = (record: Record<string | number, number | undefined>) =>
  Object.entries(record)
    .map(([key, n]) => `${key} × ${n}`)
    .join(", ") || "–";

/** The report in Markdown: one table per assignment, the prices with their source and date. */
export function formatReport(reports: AssignmentReport[], heading: string): string {
  const lines = [
    `# Evaluation report`,
    "",
    heading,
    `Estimated cost: stored token sums × the published prices of ${PRICES.model} read on ${PRICES.readOn} ` +
      `(${PRICES.sources.join(", ")}): prompt at the input price, completion at the output price, ×${PRICES.usMultiplier} (inference_geo us). ` +
      "An estimate by excess (a cache read is counted at the input price). The simulator's tokens are made up and not priced.",
    "Spreads are min / median / max.",
  ];
  if (reports.length === 0) lines.push("", "No copy.");
  for (const r of reports) {
    lines.push(
      "",
      `## Assignment ${r.assignmentId}`,
      "",
      "| Measure | Value |",
      "|---|---|",
      `| Copies | ${r.copies} (${tally(r.states)}) |`,
      `| Runs | ${r.runs} (proposed ${r.outcomes.proposed}, failed ${r.outcomes.failed}, not assessable ${r.outcomes.not_assessable}) |`,
      `| Failure rate | runs ${percent(r.failureRate.runs)}; copies evaluation failed now ${percent(r.failureRate.copies)} |`,
      `| Runs by attempts | ${tally(r.attempts)} |`,
      `| Submission to To review | ${seconds(r.toReviewMs)} |`,
      `| Duration of a run | ${seconds(r.runMs)} |`,
    );
    for (const u of r.usage) {
      lines.push(
        `| Tokens per copy, ${u.provider} (${u.copies} copies) | prompt ${tokens(u.promptTokens)}; completion ${tokens(u.completionTokens)} |`,
        `| Cost per copy, ${u.provider} | ${u.costUsd ? `${usd(u.costUsd.min)} / ${usd(u.costUsd.median)} / ${usd(u.costUsd.max)}; total ${usd(u.costUsd.total)}` : "not priced"} |`,
      );
    }
  }
  return lines.join("\n") + "\n";
}
