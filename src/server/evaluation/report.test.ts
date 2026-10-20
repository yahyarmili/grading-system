import { describe, expect, it } from "vitest";
import type { CopyMeasure, RunMeasure } from "@/server/data/evaluation/measures";
import { estimateRunsCostUsd } from "./prices";
import { buildReport, formatReport, spread } from "./report";

// EXP-01 (E6.4): the report's figures, from runs and copies made up here.

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

const run = (over: Partial<RunMeasure>): RunMeasure => ({
  assignmentId: A, submissionId: "s1", outcome: "proposed", provider: "anthropic", attempts: 1, attemptErrors: [],
  durationMs: 7000, promptTokens: 3000, completionTokens: 1000, sinceVersionMs: 9000, createdAt: new Date(), ...over,
});
const copy = (submissionId: string, status: CopyMeasure["status"], assignmentId = A): CopyMeasure => ({ assignmentId, submissionId, status });

describe("spread", () => {
  it("gives min, median and max, the median of an even count halfway", () => {
    expect(spread([5, 1, 3])).toEqual({ min: 1, median: 3, max: 5 });
    expect(spread([4, 1, 3, 2])).toEqual({ min: 1, median: 2.5, max: 4 });
    expect(spread([])).toBeNull();
  });
});

describe("buildReport", () => {
  const runs = [
    run({ submissionId: "s1", outcome: "failed", attempts: 3, attemptErrors: ["unavailable", "unavailable", "unavailable"], promptTokens: 9000, completionTokens: 0 }),
    run({ submissionId: "s1", sinceVersionMs: 60_000 }),
    run({ submissionId: "s2", sinceVersionMs: 8000 }),
    run({ submissionId: "s3", outcome: "not_assessable", attempts: 0, promptTokens: null, completionTokens: null }),
    run({ assignmentId: B, submissionId: "s4", provider: "simulator" }),
  ];
  const copies = [copy("s1", "to_review"), copy("s2", "to_review"), copy("s3", "not_assessable"), copy("s5", "evaluation_failed"), copy("s4", "to_review", B)];
  const [a, b] = buildReport(runs, copies);

  it("counts copies, runs, outcomes and attempts by assignment", () => {
    expect(a).toMatchObject({
      assignmentId: A, copies: 4, runs: 4,
      states: { to_review: 2, not_assessable: 1, evaluation_failed: 1 },
      outcomes: { proposed: 2, failed: 1, not_assessable: 1 },
      attempts: { 0: 1, 1: 2, 3: 1 },
    });
    expect(b).toMatchObject({ assignmentId: B, copies: 1, runs: 1 });
  });

  it("gives both failure rates: failed runs, and copies evaluation_failed now", () => {
    expect(a.failureRate).toEqual({ runs: 0.25, copies: 0.25 });
  });

  it("measures the delay to To review on the proposed runs only", () => {
    expect(a.toReviewMs).toEqual({ min: 8000, median: 34_000, max: 60_000 });
  });

  it("sums the tokens of every run of a copy, prices Anthropic's only", () => {
    const [anthropic] = a.usage;
    expect(anthropic).toMatchObject({ provider: "anthropic", copies: 3, promptTokens: { min: 0, median: 3000, max: 12_000 } });
    const s1 = estimateRunsCostUsd(12_000, 1000);
    const s2 = estimateRunsCostUsd(3000, 1000);
    expect(anthropic.costUsd).toEqual({ min: 0, median: s2, max: s1, total: s1 + s2 });
    expect(b.usage).toMatchObject([{ provider: "simulator", costUsd: null }]);
  });
});

describe("formatReport", () => {
  it("names assignments by identifier, never a copy, and gives the prices' source and date", () => {
    const text = formatReport(buildReport([run({ submissionId: "copy-key-xyz" })], [copy("copy-key-xyz", "to_review")]), "Heading.");
    expect(text).toContain(`## Assignment ${A}`);
    expect(text).toContain("read on 2026-10-19");
    expect(text).toContain("https://platform.claude.com/docs/en/about-claude/pricing");
    expect(text).not.toContain("copy-key-xyz");
  });

  it("says so when there is nothing", () => {
    expect(formatReport([], "Heading.")).toContain("No copy.");
  });
});
