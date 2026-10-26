import { describe, expect, it } from "vitest";
import type { AiStatus } from "@/server/data/evaluation/measures";
import { formatStatus, parseSince } from "@/server/evaluation/status";

// Spec 0012, AC-11: the window of ai:status and its text, apart from the database.

const NOW = new Date("2026-10-26T12:00:00Z");

describe("parseSince", () => {
  it("reads a date as 00:00 UTC, and an ISO instant with its offset", () => {
    expect(parseSince("2026-10-26", NOW)).toEqual(new Date("2026-10-26T00:00:00Z"));
    expect(parseSince("2026-10-26T09:30:00Z", NOW)).toEqual(new Date("2026-10-26T09:30:00Z"));
    expect(parseSince("2026-10-26T10:30+01:00", NOW)).toEqual(new Date("2026-10-26T09:30:00Z"));
  });

  it("refuses the future, and what does not parse", () => {
    expect(parseSince("2026-10-27", NOW)).toBeNull();
    expect(parseSince("2026-10-26T12:00:01Z", NOW)).toBeNull();
    for (const value of ["", "yesterday", "10/26/2026", "2026-02-30", "2026-10-26T09:30:00", "2026-13-01"]) {
      expect(parseSince(value, NOW)).toBeNull();
    }
  });
});

const EMPTY: AiStatus = { windowStart: new Date("2026-10-25T12:00:00Z"), runs: [], runsLeftOut: 0, evaluationsPerVersion: [], readingsPerPage: [], requests: [] };
const PERIOD = { now: NOW, monthCostUsd: 0.25, capUsd: 5, requestsToday: 12, dailyLimit: 200 };

describe("formatStatus", () => {
  it("titles each part with its period and prints the effective window start", () => {
    const text = formatStatus(EMPTY, PERIOD);
    expect(text).toContain("Window start: 2026-10-25T12:00:00.000Z.");
    expect(text).toContain("## Runs since 2026-10-25T12:00:00.000Z");
    expect(text).toContain("## AI requests since 2026-10-25T12:00:00.000Z");
    expect(text).toContain("## This UTC month (2026-10) and this UTC day (2026-10-26)");
    expect(text).toContain("$0.250000 of the $5 cap (not reached)");
    expect(text).toContain("AI requests today: 12 of 200 (the commands' limit");
  });

  it("marks the cap reached at >=", () => {
    expect(formatStatus(EMPTY, { ...PERIOD, monthCostUsd: 5 })).toContain("(reached)");
    expect(formatStatus(EMPTY, { ...PERIOD, monthCostUsd: 4.999999 })).toContain("(not reached)");
  });

  it("shows an empty field as -, a duplicate as its count, and what the line cap left out", () => {
    const status: AiStatus = {
      ...EMPTY,
      runs: [
        { kind: "reading", createdAt: new Date("2026-10-26T10:00:00Z"), submissionId: null, draftId: "d-1", pageId: null, versionNumber: null, provider: "anthropic", modelAnswered: null, outcome: "failed", attempts: 3 },
      ],
      runsLeftOut: 7,
      evaluationsPerVersion: [{ submissionId: "s-1", versionNumber: 1, runs: 2 }],
      readingsPerPage: [{ submissionId: "s-1", pageId: "p-1", runs: 1 }],
      requests: [{ subjectId: null, label: "none", readingSubmissionId: null, readingDraftId: null, requests: 3 }],
    };
    const text = formatStatus(status, PERIOD);
    expect(text).toContain("| reading | 2026-10-26T10:00:00.000Z | - | d-1 | - | - | anthropic | - | failed | 3 |");
    expect(text).toContain("7 more runs in the window, not listed.");
    expect(text).toContain("| s-1 | 1 | 2 |");
    expect(text).toContain("| s-1 | p-1 | 1 |");
    expect(text).toContain("| - | none | - | - | 3 |");
  });
});
