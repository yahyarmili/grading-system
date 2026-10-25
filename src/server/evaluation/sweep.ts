import "server-only";
import { DRAFT_TTL_MS } from "@/config/decisions";
import { SWEEP_RESTART_LIMIT, TRIGGER_GRACE_MS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import { takeStaleReceived } from "@/server/data/evaluation/system";
import { deleteStaleDrafts } from "@/server/data/submissions/drafts";
import { releaseStuckSubmissions } from "@/server/evaluation/evaluate";

// The recovery of the automatic evaluation (PRC-01 CA4, PRC-02 R1): nothing
// is lost when a process stops, a start fails or a run gives up waiting.
// Run at each trigger (trigger.ts) and by the cron route
// (src/app/api/cron/evaluation-sweep/route.ts).

export type SweepResult = { released: string[]; restarted: EvaluationRef[]; draftsDeleted: string[] };

/**
 * 1. Releases to evaluation_failed what is evaluating for longer than any
 * step can last (EVALUATION_STUCK_AFTER_MS): its process stopped; the
 * teacher may retry it (E6.3). Its result, if it ever comes, is not current.
 * 2. Starts again, through `start`, the text submissions still received
 * TRIGGER_GRACE_MS after they were submitted, replaced or last started again,
 * SWEEP_RESTART_LIMIT at most, the longest waiting first. Each is dated as it
 * is taken (E6.6): the sweeps of the next submissions leave it to its new run
 * instead of starting one more each time. A start of one already started is
 * harmless: the claim lets one run evaluate.
 * 3. Deletes the students' drafts with no write for DRAFT_TTL_MS, with their
 * pages (E9, AC-18); their reading runs stay.
 */
export async function sweepEvaluations(start: (ref: EvaluationRef) => Promise<void>): Promise<SweepResult> {
  const released = await releaseStuckSubmissions();
  const restarted = await takeStaleReceived(TRIGGER_GRACE_MS, SWEEP_RESTART_LIMIT);
  for (const ref of restarted) await start(ref);
  const draftsDeleted = await deleteStaleDrafts(DRAFT_TTL_MS);
  return { released, restarted, draftsDeleted };
}
