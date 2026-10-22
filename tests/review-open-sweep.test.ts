import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/access/actor";
import type { SweepContext } from "@/server/review/list";

// E7 plan §1.7: the sweep planned when a copy or the list is opened never
// makes the opening fail. The answer is computed and the journal written
// first; an after() that refuses the task (called outside a request scope,
// say) is logged by its kind only. The journal's writers are replaced: no
// query. The sweep itself, after the answer: tests/review-sweep-open.int.test.ts.

const recordCopyOpened = vi.fn();
const recordListOpened = vi.fn();
vi.mock("@/server/data/review/copy", () => ({ recordCopyOpened }));
vi.mock("@/server/data/review/list", () => ({ recordListOpened }));

const { openCopy } = await import("@/server/review/copy");
const { openReviewList } = await import("@/server/review/list");

const teacher: Actor = { kind: "user", userId: "00000000-0000-4000-8000-000000000009", role: "teacher" };
const seen = {
  submissionId: "00000000-0000-4000-8000-000000000001",
  versionNumber: 1,
  proposalId: null,
  revision: 0,
  status: "received",
} as const;
const assignmentId = "00000000-0000-4000-8000-000000000002";

/** after() refusing the task, as Next does outside a request scope. */
function refusingContext() {
  const sweep = vi.fn<SweepContext["sweep"]>();
  const later = vi.fn<SweepContext["later"]>(() => {
    throw new TypeError("`after` was called outside a request scope");
  });
  return { sweep, later, context: { sweep, later } satisfies SweepContext };
}

beforeEach(() => {
  recordCopyOpened.mockReset().mockResolvedValue({ versionNumber: 2, proposalId: null, revision: 0, status: "received" });
  recordListOpened.mockReset().mockResolvedValue({ stamp: "now" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a sweep that cannot be scheduled (E7 plan §1.7)", () => {
  it("opening a copy still answers its comparison, its journal written; the refusal logged by kind", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sweep, later, context } = refusingContext();
    // Version 2 seen as 1: the answer is the comparison's, not a fallback.
    await expect(openCopy(teacher, seen, context)).resolves.toEqual({ refresh: true });
    expect(recordCopyOpened).toHaveBeenCalledExactlyOnceWith(teacher, seen.submissionId);
    expect(later).toHaveBeenCalledOnce();
    expect(sweep).not.toHaveBeenCalled();
    expect(logged.mock.calls.flat()).toEqual(["[evaluation] sweep not scheduled: TypeError"]);
  });

  it("opening the list too", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sweep, later, context } = refusingContext();
    await expect(openReviewList(teacher, { assignmentId, stamp: "before" }, context)).resolves.toEqual({ refresh: true });
    await expect(openReviewList(teacher, { assignmentId, stamp: "now" }, context)).resolves.toEqual({ refresh: false });
    expect(recordListOpened).toHaveBeenCalledWith(teacher, assignmentId);
    expect(recordListOpened).toHaveBeenCalledTimes(2);
    expect(later).toHaveBeenCalledTimes(2);
    expect(sweep).not.toHaveBeenCalled();
    expect(logged.mock.calls.flat()).toEqual([
      "[evaluation] sweep not scheduled: TypeError",
      "[evaluation] sweep not scheduled: TypeError",
    ]);
  });

  it("the sweep is planned only once the journal is written: a failed write plans nothing", async () => {
    const { later, context } = refusingContext();
    recordCopyOpened.mockRejectedValue(new Error("connection lost"));
    recordListOpened.mockRejectedValue(new Error("connection lost"));
    await expect(openCopy(teacher, seen, context)).rejects.toThrow("connection lost");
    await expect(openReviewList(teacher, { assignmentId, stamp: "now" }, context)).rejects.toThrow("connection lost");
    expect(later).not.toHaveBeenCalled();
  });
});
