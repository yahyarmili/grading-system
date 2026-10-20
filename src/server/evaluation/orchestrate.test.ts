import { describe, expect, it, vi } from "vitest";
import {
  AI_CALL_TIMEOUT_MS,
  EVALUATION_BUSY_MAX_WAITS,
  EVALUATION_BUSY_WAIT_MS,
  EVALUATION_STEP_MAX_MS,
  EVALUATION_STUCK_AFTER_MS,
  TRIGGER_GRACE_MS,
  VERCEL_FUNCTION_MAX_MS,
} from "@/config/provisional";
import type { EvaluationOutcome } from "./evaluate";
import { orchestrate } from "./orchestrate";

// The workflow's body (E6, PRC-01 R3), with a fake step and a fake sleep;
// and the bounds that keep a step within one function.

const ref = { submissionId: "00000000-0000-4000-8000-000000000001", versionNumber: 1 };
const done: EvaluationOutcome = { status: "to_review", attempts: 1, durationMs: 5, errors: [] };

describe("orchestrate", () => {
  it("waits for a free place, then evaluates once", async () => {
    const evaluate = vi.fn<(r: typeof ref) => Promise<EvaluationOutcome>>()
      .mockResolvedValueOnce({ status: "busy" })
      .mockResolvedValueOnce({ status: "busy" })
      .mockResolvedValueOnce(done);
    const sleep = vi.fn(async () => {});
    expect(await orchestrate(ref, { evaluate, sleep })).toEqual(done);
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[EVALUATION_BUSY_WAIT_MS], [EVALUATION_BUSY_WAIT_MS]]);
    // Never as a method: Workflows serializes the step's `this` with its arguments (E2E, E6.2).
    expect(evaluate.mock.contexts).toEqual([undefined, undefined, undefined]);
  });

  it.each(["skipped", "stale", "evaluation_failed"] as const)("ends at once on %s", async (status) => {
    const outcome = status === "skipped" ? { status } : { ...done, status };
    const evaluate = vi.fn(async () => outcome);
    const sleep = vi.fn(async () => {});
    expect(await orchestrate(ref, { evaluate, sleep })).toEqual(outcome);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after EVALUATION_BUSY_MAX_WAITS waits: still received, left to the sweep", async () => {
    const evaluate = vi.fn(async (): Promise<EvaluationOutcome> => ({ status: "busy" }));
    const sleep = vi.fn(async () => {});
    expect(await orchestrate(ref, { evaluate, sleep })).toEqual({ status: "busy" });
    expect(sleep).toHaveBeenCalledTimes(EVALUATION_BUSY_MAX_WAITS);
    expect(evaluate).toHaveBeenCalledTimes(EVALUATION_BUSY_MAX_WAITS + 1);
  });

  it("lets an error of the step end the run", async () => {
    const evaluate = vi.fn(async (): Promise<EvaluationOutcome> => {
      throw new Error("step failed");
    });
    await expect(orchestrate(ref, { evaluate, sleep: async () => {} })).rejects.toThrow("step failed");
  });
});

describe("the bounds of a step (plan of E6 §2, §9)", () => {
  it("one step, every attempt at its timeout, fits in a Vercel function", () => {
    expect(AI_CALL_TIMEOUT_MS).toBe(60_000);
    expect(EVALUATION_STEP_MAX_MS).toBeLessThan(VERCEL_FUNCTION_MAX_MS);
  });

  it("a step still running is never released as stuck, a run still waiting never started again", () => {
    expect(EVALUATION_STUCK_AFTER_MS).toBeGreaterThan(VERCEL_FUNCTION_MAX_MS);
    expect(TRIGGER_GRACE_MS).toBeGreaterThan(EVALUATION_BUSY_WAIT_MS * EVALUATION_BUSY_MAX_WAITS);
  });
});
