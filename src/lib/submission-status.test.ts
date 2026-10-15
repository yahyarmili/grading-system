import { describe, expect, it } from "vitest";
import {
  canTransition,
  sourcesOf,
  storedSubmissionStatuses,
  studentStatuses,
  submissionStatuses,
  toStudentStatus,
  TRANSITIONS,
  type SubmissionStatus,
  type TransitionId,
} from "./submission-status";

// §5.5, written out again by hand from fonctionnalites.md: the table in the
// code must match it exactly, move for move.
const SPEC: [TransitionId, SubmissionStatus, SubmissionStatus][] = [
  [1, "to_submit", "received"],
  [2, "received", "transcribing"],
  [2, "received", "evaluating"],
  [3, "transcribing", "evaluating"],
  [3, "transcribing", "transcription_failed"],
  [3, "transcribing", "not_assessable"],
  [4, "transcription_failed", "transcribing"],
  [4, "transcription_failed", "to_review"],
  [5, "evaluating", "to_review"],
  [5, "evaluating", "evaluation_failed"],
  [5, "evaluating", "not_assessable"],
  [6, "evaluation_failed", "evaluating"],
  [6, "evaluation_failed", "to_review"],
  [7, "not_assessable", "to_review"],
  [7, "not_assessable", "evaluating"],
  [8, "to_review", "validated"],
  [9, "validated", "published"],
  [10, "published", "validated"],
  [10, "validated", "to_review"],
  [10, "published", "to_review"],
  [11, "received", "received"],
  [11, "transcribing", "received"],
  [11, "transcription_failed", "received"],
  [11, "evaluating", "received"],
  [11, "evaluation_failed", "received"],
  [11, "not_assessable", "received"],
  [11, "to_review", "received"],
];

const IDS: TransitionId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const inSpec = (id: TransitionId, from: SubmissionStatus, to: SubmissionStatus) =>
  SPEC.some(([i, f, t]) => i === id && f === from && t === to);

describe("transition table (§5.5)", () => {
  it.each(SPEC)("accepts transition %i: %s → %s", (id, from, to) => {
    expect(canTransition(id, from, to)).toBe(true);
  });

  it("refuses every other move, under every transition number", () => {
    const accepted: string[] = [];
    for (const id of IDS)
      for (const from of submissionStatuses)
        for (const to of submissionStatuses)
          if (!inSpec(id, from, to) && canTransition(id, from, to)) accepted.push(`${id}: ${from} → ${to}`);
    expect(accepted).toEqual([]);
  });

  it("holds exactly the moves of §5.5, no more", () => {
    const table = TRANSITIONS.map((t) => `${t.id}:${t.from}>${t.to}`).sort();
    expect(table).toEqual(SPEC.map(([i, f, t]) => `${i}:${f}>${t}`).sort());
    expect(new Set(table).size).toBe(table.length);
  });

  it("reaches published only from validated", () => {
    for (const id of IDS)
      for (const from of submissionStatuses) {
        expect(canTransition(id, from, "published"), `${id}: ${from}`).toBe(id === 9 && from === "validated");
      }
  });

  it("never returns to to_submit: a submission row is never removed", () => {
    expect(TRANSITIONS.some((t) => (t.to as SubmissionStatus) === "to_submit")).toBe(false);
  });

  it("lets only the teacher validate and publish, only the student submit and replace", () => {
    const by = (id: TransitionId) => new Set(TRANSITIONS.filter((t) => t.id === id).map((t) => t.by));
    expect(by(8)).toEqual(new Set(["teacher"]));
    expect(by(9)).toEqual(new Set(["teacher"]));
    expect(by(1)).toEqual(new Set(["student"]));
    expect(by(11)).toEqual(new Set(["student"]));
  });

  it("gives the write guard its source states, stored states only", () => {
    expect(sourcesOf(11, "received").sort()).toEqual(
      ["received", "transcribing", "transcription_failed", "evaluating", "evaluation_failed", "not_assessable", "to_review"].sort(),
    );
    expect(sourcesOf(9, "published")).toEqual(["validated"]);
    expect(sourcesOf(10, "to_review").sort()).toEqual(["published", "validated"]);
    // Transition 1 is the insertion: no stored state to leave.
    expect(sourcesOf(1, "received")).toEqual([]);
    expect(sourcesOf(8, "published")).toEqual([]);
  });

  it("stores every state but to_submit", () => {
    expect([...storedSubmissionStatuses]).toEqual(submissionStatuses.filter((s) => s !== "to_submit"));
  });
});

// SUB-01 R3: the student sees a closed list of three states, never a technical one.

describe("toStudentStatus", () => {
  it.each([
    ["to_submit", "to_submit"],
    ["received", "being_marked"],
    ["transcribing", "being_marked"],
    ["transcription_failed", "being_marked"],
    ["evaluating", "being_marked"],
    ["evaluation_failed", "being_marked"],
    ["not_assessable", "being_marked"],
    ["to_review", "being_marked"],
    ["validated", "being_marked"],
    ["published", "marked"],
  ] as const)("%s → %s", (internal, seen) => {
    expect(toStudentStatus(internal)).toBe(seen);
  });

  it("covers every internal state and gives only the closed list", () => {
    const seen = new Set(submissionStatuses.map(toStudentStatus));
    expect([...seen].every((s) => (studentStatuses as readonly string[]).includes(s))).toBe(true);
    expect(seen.size).toBe(studentStatuses.length);
  });
});
