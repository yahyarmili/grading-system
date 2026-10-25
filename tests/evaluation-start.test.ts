import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// E6 plan §2 (PRC-01 R2) and §6: a start that fails is logged by its kind
// only and leaves the submission received for the sweep; the sweep's route
// answers nothing without Vercel's CRON_SECRET. Workflows and the database
// are replaced: no run, no query.

const start = vi.fn();
const sweep = vi.fn();
vi.mock("workflow/api", () => ({ start }));
vi.mock("@/server/evaluation/workflow", () => ({ evaluateSubmissionWorkflow: () => {} }));
vi.mock("@/server/evaluation/sweep", () => ({ sweepEvaluations: sweep }));

const { startEvaluation, triggerEvaluation } = await import("@/server/evaluation/trigger");
const { GET } = await import("@/app/api/cron/evaluation-sweep/route");

const REF = { submissionId: "00000000-0000-4000-8000-000000000001", versionNumber: 1 };

beforeEach(() => {
  start.mockReset();
  sweep.mockReset().mockResolvedValue({ released: ["a"], restarted: [REF, REF], draftsDeleted: ["d"] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a start that fails (PRC-01 R2: the confirmation never depends on it)", () => {
  it("is logged by its kind only, never thrown; the sweep still runs", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    class WorkflowAPIError extends Error {
      override name = "WorkflowAPIError";
    }
    start.mockRejectedValue(new WorkflowAPIError(`queue refused ${REF.submissionId}: My town is small`));
    await expect(startEvaluation(REF)).resolves.toBeUndefined();
    await expect(triggerEvaluation(REF)).resolves.toBeUndefined();
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls.flat()).toEqual(["[evaluation] trigger failed: WorkflowAPIError", "[evaluation] trigger failed: WorkflowAPIError"]);
  });

  it("a failing sweep is logged by its kind too", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    start.mockResolvedValue(undefined);
    sweep.mockRejectedValue(new TypeError("connect ECONNREFUSED"));
    await expect(triggerEvaluation(REF)).resolves.toBeUndefined();
    expect(start).toHaveBeenCalledWith(expect.anything(), [REF]);
    expect(logged.mock.calls.flat()).toEqual(["[evaluation] sweep failed: TypeError"]);
  });
});

describe("the sweep's route (E6, PRC-01 CA4): Vercel's cron and its secret only", () => {
  const call = (authorization?: string) =>
    GET(new Request("http://localhost/api/cron/evaluation-sweep", { headers: authorization ? { authorization } : {} }));

  it("refuses everything when CRON_SECRET is not set, even an empty bearer", async () => {
    vi.stubEnv("CRON_SECRET", "");
    for (const header of [undefined, "Bearer ", "Bearer undefined"]) expect((await call(header)).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong secret; with it, sweeps and answers counts only", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    for (const header of [undefined, "Bearer wrong", "test-cron-secret", "Bearer test-cron-secret2", "Basic test-cron-secret"]) {
      expect((await call(header)).status).toBe(401);
    }
    expect(sweep).not.toHaveBeenCalled();
    const response = await call("Bearer test-cron-secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ released: 1, restarted: 2, draftsDeleted: 1 });
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});
