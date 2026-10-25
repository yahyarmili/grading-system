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
import type { EvaluationRef } from "@/lib/evaluation";
import type { EvaluationOutcome } from "./evaluate";
import { orchestrate, type OrchestrateDeps } from "./orchestrate";

// The workflow's body (E6, PRC-01 R3), with fake steps and a fake sleep;
// and the bounds that keep a step within one function.

const ref = { submissionId: "00000000-0000-4000-8000-000000000001", versionNumber: 1 };
const TOKEN = "wrun_test";
const done: EvaluationOutcome = { status: "to_review", attempts: 1, durationMs: 5, errors: [] };

const fakes = (evaluate: (r: EvaluationRef, t: string) => Promise<EvaluationOutcome>) => ({
  // A text or a checked version: never claimed for transcription.
  startTranscription: vi.fn<OrchestrateDeps["startTranscription"]>(async () => ({ status: "skipped" })),
  transcribePage: vi.fn<OrchestrateDeps["transcribePage"]>(async () => "read"),
  endTranscription: vi.fn<OrchestrateDeps["endTranscription"]>(async () => "assembled"),
  evaluate: vi.fn<OrchestrateDeps["evaluate"]>((r, t) => evaluate(r, t)),
  release: vi.fn<(r: EvaluationRef, t: string) => Promise<boolean>>(async () => true),
  abandon: vi.fn<(r: EvaluationRef) => Promise<boolean>>(async () => true),
  sleep: vi.fn<(ms: number) => Promise<void>>(async () => {}),
});

describe("orchestrate", () => {
  it("waits for a free place, then evaluates once, under the run's token", async () => {
    const outcomes: EvaluationOutcome[] = [{ status: "busy" }, { status: "busy" }, done];
    const deps = fakes(async () => outcomes.shift()!);
    expect(await orchestrate(ref, TOKEN, deps)).toEqual(done);
    expect(deps.evaluate.mock.calls).toEqual([[ref, TOKEN, false], [ref, TOKEN, false], [ref, TOKEN, false]]);
    expect(deps.sleep.mock.calls).toEqual([[EVALUATION_BUSY_WAIT_MS], [EVALUATION_BUSY_WAIT_MS]]);
    expect(deps.release).not.toHaveBeenCalled();
    // Never as a method: Workflows serializes the step's `this` with its arguments (E2E, E6.2).
    expect(deps.evaluate.mock.contexts).toEqual([undefined, undefined, undefined]);
  });

  it.each(["skipped", "stale", "evaluation_failed"] as const)("ends at once on %s", async (status) => {
    const outcome = status === "skipped" ? { status } : { ...done, status };
    const deps = fakes(async () => outcome);
    expect(await orchestrate(ref, TOKEN, deps)).toEqual(outcome);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it("gives up after EVALUATION_BUSY_MAX_WAITS waits: still received, left to the sweep", async () => {
    const deps = fakes(async () => ({ status: "busy" }));
    expect(await orchestrate(ref, TOKEN, deps)).toEqual({ status: "busy" });
    expect(deps.sleep).toHaveBeenCalledTimes(EVALUATION_BUSY_MAX_WAITS);
    expect(deps.evaluate).toHaveBeenCalledTimes(EVALUATION_BUSY_MAX_WAITS + 1);
    expect(deps.abandon).not.toHaveBeenCalled();
  });

  it.each(["retry", "relaunch"] as const)("E7.6: a teacher's %s that found no place is dropped once, after the last wait", async (origin) => {
    const asked = { ...ref, origin, request: "00000000-0000-4000-8000-000000000002" };
    const deps = fakes(async () => ({ status: "busy" }));
    expect(await orchestrate(asked, TOKEN, deps)).toEqual({ status: "busy" });
    expect(deps.abandon.mock.calls).toEqual([[asked]]);
    expect(deps.abandon.mock.contexts).toEqual([undefined]);
    expect(deps.evaluate).toHaveBeenCalledTimes(EVALUATION_BUSY_MAX_WAITS + 1);
  });

  it("E7.6: a teacher's request evaluated after a wait is not dropped", async () => {
    const outcomes: EvaluationOutcome[] = [{ status: "busy" }, done];
    const deps = fakes(async () => outcomes.shift()!);
    expect(await orchestrate({ ...ref, origin: "retry", request: "r" }, TOKEN, deps)).toEqual(done);
    expect(deps.abandon).not.toHaveBeenCalled();
  });

  it("releases its own claim when the step fails, then lets the error end the run", async () => {
    const deps = fakes(async () => {
      throw new Error("step failed");
    });
    await expect(orchestrate(ref, TOKEN, deps)).rejects.toThrow("step failed");
    expect(deps.release.mock.calls).toEqual([[ref, TOKEN]]);
    expect(deps.release.mock.contexts).toEqual([undefined]);
  });

  it("keeps the step's error when the release fails too (the sweep frees the claim)", async () => {
    const deps = fakes(async () => {
      throw new Error("step failed");
    });
    deps.release.mockRejectedValueOnce(new Error("release failed"));
    await expect(orchestrate(ref, TOKEN, deps)).rejects.toThrow("step failed");
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
